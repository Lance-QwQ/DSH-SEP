import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openFixture,isolation,text} from './transaction-fixtures.mjs';
import {runIsolated} from './linux-isolation.mjs';
import {spawn} from 'node:child_process';
async function blocked(){
 const f=await openFixture(),kill=process.kill;let group;
 const terminate=async()=>{if(group)try{kill(group,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}await new Promise(r=>setTimeout(r,100));};
 try{
  process.kill=(pid,signal)=>{if(pid<0&&signal==='SIGKILL'){group=pid;throw Object.assign(Error('synthetic EPERM'),{code:'EPERM'});}return kill(pid,signal);};
  const result=await f.project.run({command:['/usr/bin/python3','-c',"import time;open('/work/started','w').write('synthetic');time.sleep(10)"],timeoutMs:400});assert.equal(result.status,'blocked');
 }catch(error){await terminate();await f.project.close();throw error;}finally{process.kill=kill;}
 f.terminate=terminate;
 f.finish=async()=>{await f.terminate();await f.project.close();};return f;
}
test('sandbox identity is durably handed to the owner before any task code runs',async()=>{
 const f=await openFixture();try{
  const current=await f.project.current(),scratch=join(f.base,'handshake');await (await import('node:fs/promises')).mkdir(scratch,{mode:0o700});let observed;
  const result=await runIsolated({...isolation,source:current.path,scratch,command:['/usr/bin/python3','-c',"open('/work/dispatched','w').write('done')"],onSpawn:async record=>{observed=record;await assert.rejects(access(join(scratch,'dispatched')),{code:'ENOENT'});}});
  assert.equal(result.code,0,result.stderr);assert(observed?.leader?.birth);assert(observed?.init?.namespace);assert.equal(observed.init.namespacePid,1);assert.notEqual(observed.init.namespace,observed.hostNamespace);assert.deepEqual(result.owner,observed);
 }finally{await f.project.close();}
});
test('an unrelated undumpable process cannot prevent reconciliation of a proven dead PID-1 namespace',{timeout:10000},async()=>{
 const child=spawn('/usr/bin/python3',['-c',"import ctypes,time;assert ctypes.CDLL(None).prctl(4,0,0,0,0)==0;print('ready',flush=True);time.sleep(30)"],{stdio:['ignore','pipe','ignore']});
 const exit=new Promise(resolve=>child.once('exit',resolve));
 let f;
 try{
  await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.once('data',resolve);});
  f=await blocked();await f.terminate();
  const plan=await f.project.reviewCleanup();assert.equal(plan.status,'pass',JSON.stringify(plan));
  assert.equal((await f.project.resolveCleanup({planHash:plan.planHash})).status,'pass');
 }finally{child.kill('SIGKILL');await exit;await f?.finish();}
});

test('restarting a controller cannot bypass live sandbox verification through ordinary recover',{timeout:8000},async()=>{
 const f=await blocked();await f.project.close();
 const db=new DatabaseSync(join(f.root,'state.sqlite'));const row=db.prepare('SELECT id,value FROM transactions').get(),t=JSON.parse(row.value);t.state='running';db.prepare('UPDATE transactions SET value=? WHERE id=?').run(JSON.stringify(t),row.id);db.close();
 const p=await f.openManagedProject({root:f.root,isolation});try{
  await assert.rejects(p.recover(),{code:'SEP_PROJECT_CLEANUP_BLOCKED'});await access(join(f.root,'transactions',t.id,'work','started'));
  await f.terminate();assert.equal((await p.recover()).status,'pass');assert.equal(await text(p),'original');
 }finally{await p.close();await f.finish();}
});
test('an owner refusing the durable handshake prevents task dispatch and waits for exit',async()=>{
 const f=await openFixture();try{
  const scratch=join(f.base,'refused');await (await import('node:fs/promises')).mkdir(scratch,{mode:0o700});
  const result=await runIsolated({...isolation,source:(await f.project.current()).path,scratch,command:['/usr/bin/python3','-c',"open('/work/dispatched','w').write('bad')"],onSpawn:()=>{throw Error('owner persistence unavailable');}});
  assert.equal(result.reason,'handshake-failed');assert.equal(result.exited,true);await assert.rejects(access(join(scratch,'dispatched')),{code:'ENOENT'});
 }finally{await f.project.close();}
});
test('cleanup review refuses a still-live sandbox without signalling it',{timeout:8000},async()=>{
 const f=await blocked();try{
  assert.equal(typeof f.project.reviewCleanup,'function');const view=await f.project.reviewCleanup();assert.equal(view.status,'blocked');assert.equal(view.planHash,undefined);
  const rows=await readdir(join(f.root,'transactions'));assert.equal(await readFile(join(f.root,'transactions',rows[0],'work','started'),'utf8'),'synthetic');
 }finally{await f.finish();}
});
test('verified stopped namespace can be reconciled using a fresh bound cleanup plan',{timeout:8000},async()=>{
 const f=await blocked();await f.project.close();await f.terminate();
 const p=await f.openManagedProject({root:f.root,isolation});try{
  assert.equal(typeof p.reviewCleanup,'function');const plan=await p.reviewCleanup();assert.equal(plan.status,'pass');assert.match(plan.planHash,/^[a-f0-9]{64}$/);
  await assert.rejects(p.resolveCleanup({planHash:'0'.repeat(64)}),{code:'SEP_PROJECT_CLEANUP_PLAN_INVALID'});
  assert.equal((await p.resolveCleanup({planHash:plan.planHash})).status,'pass');assert.equal(await text(p),'original');
  for(const id of await readdir(join(f.root,'transactions')))assert.deepEqual(await readdir(join(f.root,'transactions',id)),[]);
 }finally{await p.close();await f.finish();}
});
test('legacy or unverifiable ownership never authorizes cleanup',{timeout:8000},async()=>{
 const f=await blocked();await f.project.close();await f.terminate();
 const db=new DatabaseSync(join(f.root,'state.sqlite'));const row=db.prepare('SELECT id,value FROM transactions').get(),t=JSON.parse(row.value);delete t.sandbox;delete t.launch;db.prepare('UPDATE transactions SET value=? WHERE id=?').run(JSON.stringify(t),row.id);db.close();
 let p=await f.openManagedProject({root:f.root,isolation});try{
  assert.equal(typeof p.reviewCleanup,'function');assert.equal((await p.reviewCleanup()).status,'blocked');await assert.rejects(p.current(),{code:'SEP_PROJECT_RECOVERY_REQUIRED'});
  await p.close();const edit=new DatabaseSync(join(f.root,'state.sqlite'));t.state='running';edit.prepare('UPDATE transactions SET value=? WHERE id=?').run(JSON.stringify(t),row.id);edit.close();
  p=await f.openManagedProject({root:f.root,isolation});await assert.rejects(p.recover(),{code:'SEP_PROJECT_CLEANUP_BLOCKED'});await access(join(f.root,'transactions',t.id,'work','started'));
 }finally{await p.close();await f.finish();}
});
test('new ownership evidence invalidates an earlier cleanup confirmation',{timeout:8000},async()=>{
 const f=await blocked();await f.project.close();await f.terminate();const p=await f.openManagedProject({root:f.root,isolation});try{
  assert.equal(typeof p.reviewCleanup,'function');const plan=await p.reviewCleanup();assert.equal(plan.status,'pass');
  const db=new DatabaseSync(join(f.root,'state.sqlite'));const row=db.prepare('SELECT id,value FROM transactions').get(),t=JSON.parse(row.value);t.sandbox.init.birth='1';db.prepare('UPDATE transactions SET value=? WHERE id=?').run(JSON.stringify(t),row.id);db.close();
  await assert.rejects(p.resolveCleanup({planHash:plan.planHash}),{code:'SEP_PROJECT_CLEANUP_PLAN_INVALID'});await assert.rejects(p.current(),{code:'SEP_PROJECT_RECOVERY_REQUIRED'});
 }finally{await p.close();await f.finish();}
});
