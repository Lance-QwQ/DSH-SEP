import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,link,symlink,lstat,readdir,access} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {openFixture,fixture,isolation,edit,text,crash} from './transaction-fixtures.mjs';

test('checkout edits independent copies and only a confirmed plan publishes a new generation',async()=>{
 const f=await openFixture();try{
  const before=await f.project.current();const plan=await f.project.run({command:edit()});
  assert.equal(plan.status,'ready');assert.equal(await text(f.project),'original');
  const review=await f.project.review(plan.planHash);assert(review.changes.some(x=>x.path==='data.txt'&&x.kind==='modified'));
  await assert.rejects(f.project.commit({planHash:'0'.repeat(64)}),{code:'SEP_PROJECT_PLAN_INVALID'});
  const receipt=await f.project.commit({planHash:plan.planHash});assert.equal(receipt.status,'committed');
  assert.equal(await text(f.project),'candidate');assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
  assert.equal(await readFile(join((await f.project.current()).path,'中文目录','note.txt'),'utf8'),'保留');
  assert.equal((await f.project.current()).sequence,before.sequence+1);
 }finally{await f.project.close();}
});
test('restore is a new transaction and preserves the increasing write sequence',async()=>{
 const f=await openFixture();try{
  const plan=await f.project.run({command:edit()});await f.project.commit(plan);
  const restore=await f.project.planRestore(1);assert.equal(await text(f.project),'candidate');
  await f.project.commit(restore);assert.equal(await text(f.project),'original');assert.equal((await f.project.current()).sequence,2);
 }finally{await f.project.close();}
});
test('a later business commit invalidates an older ready plan',async()=>{
 const f=await openFixture();try{
  const first=await f.project.run({command:edit('first')}),second=await f.project.run({command:edit('second')});
  await f.project.commit(second);await assert.rejects(f.project.commit(first),{code:'SEP_PROJECT_STALE_PLAN'});assert.equal(await text(f.project),'second');
 }finally{await f.project.close();}
});
test('candidate replacement after review refuses publication',async()=>{
 const f=await openFixture();try{
  const plan=await f.project.run({command:edit()});await f.project.review(plan.planHash);
  const dirs=await readdir(join(f.root,'transactions'));assert.equal(dirs.length,1);
  await writeFile(join(f.root,'transactions',dirs[0],'candidate','data.txt'),'substituted');
  await assert.rejects(f.project.commit(plan),{code:'SEP_PROJECT_CANDIDATE_CHANGED'});assert.equal(await text(f.project),'original');
 }finally{await f.project.close();}
});
test('native owner lease rejects another controller and releases on close',async()=>{
 const f=await openFixture();try{await assert.rejects(f.openManagedProject({root:f.root,isolation}),{code:'SEP_PROJECT_LOCKED'});}finally{await f.project.close();}
 const reopened=await f.openManagedProject({root:f.root,isolation});assert.equal(await text(reopened),'original');await reopened.close();
});
test('source aliases and hard links are refused without changing the source',async()=>{
 const {openManagedProject}=await import('./managed-project.mjs');const f=await fixture();
 await link(join(f.source,'data.txt'),join(f.source,'alias'));
 await assert.rejects(openManagedProject(f),{code:'SEP_PROJECT_UNSAFE_TREE'});assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
 const g=await fixture();const alias=join(g.base,'alias');await symlink(g.root,alias);
 await assert.rejects(openManagedProject({...g,root:alias}),{code:'SEP_PROJECT_PATH'});
});
test('symlinks created by a tool are rejected and transient body copies are removed',async()=>{
 const f=await openFixture();try{
  await assert.rejects(f.project.run({command:['/usr/bin/python3','-c','import os;os.symlink("/source/data.txt","/work/escape")']}),{code:'SEP_PROJECT_UNSAFE_TREE'});
  assert.equal(await text(f.project),'original');for(const id of await readdir(join(f.root,'transactions')))assert.deepEqual(await readdir(join(f.root,'transactions',id)),[]);
 }finally{await f.project.close();}
});
test('ordinary sandbox shell cannot alter live generations or the transaction authority',async()=>{
 const f=await openFixture();try{
  const plan=await f.project.run({command:['/usr/bin/python3','-c',`import os,errno\nassert not os.path.exists(${JSON.stringify(f.root)})\ntry:\n open('/source/data.txt','w').write('bad');raise Exception('writable')\nexcept OSError as e:assert e.errno==errno.EROFS\nopen('/work/data.txt','w').write('safe')`]});
  await f.project.commit(plan);assert.equal(await text(f.project),'safe');
 }finally{await f.project.close();}
});
test('user cancellation waits for the sandbox and cannot produce a committable plan',{timeout:6000},async()=>{
 const f=await openFixture();try{
  const abort=new AbortController();const pending=f.project.run({command:['/usr/bin/python3','-c',"import time;time.sleep(1);open('/work/data.txt','w').write('late')"],signal:abort.signal});
  setTimeout(()=>abort.abort(),150);const result=await pending;assert.equal(result.status,'aborted');assert.equal(result.reason,'cancelled');assert.equal(result.planHash,undefined);assert.equal(await text(f.project),'original');
  await new Promise(r=>setTimeout(r,1200));assert.equal(await text(f.project),'original');
 }finally{await f.project.close();}
});
test('pre-cancelled work never dispatches',async()=>{
 const f=await openFixture();try{const abort=new AbortController();abort.abort();const result=await f.project.run({command:edit(),signal:abort.signal});assert.equal(result.status,'aborted');assert.equal(await text(f.project),'original');}finally{await f.project.close();}
});
test('deadline and nonzero tools retain the live generation and remove transient copies',async()=>{
 const f=await openFixture();try{
  const timeout=await f.project.run({command:['/usr/bin/python3','-c','import time;time.sleep(5)'],timeoutMs:150});assert.equal(timeout.reason,'timeout');
  const failed=await f.project.run({command:['/usr/bin/python3','-c',"open('/work/data.txt','w').write('failed');raise SystemExit(7)"]});assert.equal(failed.status,'aborted');assert.equal(failed.reason,'tool-failed');assert.equal(await text(f.project),'original');
 }finally{await f.project.close();}
});
test('oversized candidate refuses before publication',async()=>{
 const f=await openFixture();try{await assert.rejects(f.project.run({command:['/usr/bin/python3','-c',"open('/work/big','wb').truncate(4194305)"]}),{code:'SEP_PROJECT_LIMIT'});assert.equal(await text(f.project),'original');}finally{await f.project.close();}
});
for(const phase of ['intent-durable','published-durable','health-passed','committed-durable'])test(`real process death at ${phase} recovers with commit-record authority`,{timeout:10000},async()=>{
 const f=await openFixture();await f.project.close();await crash(f,phase);
 const recovered=await f.openManagedProject({root:f.root,isolation});try{
  if(phase!=='committed-durable')await assert.rejects(recovered.current(),{code:'SEP_PROJECT_RECOVERY_REQUIRED'});
  const result=await recovered.recover();assert.equal(result.status,'pass');assert.equal(await text(recovered),phase==='committed-durable'?'child-candidate':'original');
  assert.equal((await recovered.current()).sequence,phase==='committed-durable'?1:0);
 }finally{await recovered.close();}
});
test('interrupted restore returns to its newer baseline instead of rolling write sequence backward',async()=>{
 const f=await openFixture();const plan=await f.project.run({command:edit()});await f.project.commit(plan);await f.project.close();await crash(f,'health-passed','restore');
 const project=await f.openManagedProject({root:f.root,isolation});try{await project.recover();assert.equal(await text(project),'candidate');assert.equal((await project.current()).sequence,1);}finally{await project.close();}
});
test('lost recovery preimage blocks recovery without opening write admission',async()=>{
 const f=await openFixture();await f.project.close();await crash(f,'published-durable');
 await writeFile(join(f.root,'generations','1','data','data.txt'),'broken-baseline');
 const project=await f.openManagedProject({root:f.root,isolation});try{await assert.rejects(project.recover(),{code:'SEP_PROJECT_BASELINE_CHANGED'});await assert.rejects(project.current(),{code:'SEP_PROJECT_RECOVERY_REQUIRED'});}finally{await project.close();}
});
test('close cancels active work and releases only after its owned sandbox has exited',async()=>{
 const f=await openFixture();const pending=f.project.run({command:['/usr/bin/python3','-c','import time;time.sleep(5)']});
 await new Promise(r=>setTimeout(r,150));const receipt=await f.project.close();assert.equal(receipt.status,'pass');assert.equal((await pending).status,'aborted');
 const project=await f.openManagedProject({root:f.root,isolation});assert.equal(await text(project),'original');await project.close();
});
test('file creation, removal and rename publish together while case-distinct paths stay distinct',async()=>{
 const f=await openFixture();try{
  const plan=await f.project.run({command:['/usr/bin/python3','-c',"import os;os.rename('/work/data.txt','/work/moved.txt');os.unlink('/work/中文目录/note.txt');open('/work/A','w').write('upper');open('/work/a','w').write('lower')"]});
  const review=await f.project.review(plan.planHash);assert(review.changes.some(x=>x.path==='data.txt'&&x.kind==='deleted'));
  await f.project.commit(plan);const current=await f.project.current();
  await assert.rejects(access(join(current.path,'data.txt')),{code:'ENOENT'});assert.equal(await readFile(join(current.path,'moved.txt'),'utf8'),'original');assert.equal(await readFile(join(current.path,'A'),'utf8'),'upper');assert.equal(await readFile(join(current.path,'a'),'utf8'),'lower');
  const restore=await f.project.planRestore(1);await f.project.commit(restore);assert.equal(await text(f.project),'original');
 }finally{await f.project.close();}
});
test('hard links made by a tool cannot enter a published generation',async()=>{
 const f=await openFixture();try{await assert.rejects(f.project.run({command:['/usr/bin/python3','-c',"import os;os.link('/work/data.txt','/work/alias')"]}),{code:'SEP_PROJECT_UNSAFE_TREE'});assert.equal(await text(f.project),'original');}finally{await f.project.close();}
});
test('cancelled commit stays closed until its pending transaction is recovered',async()=>{
 const abort=new AbortController(),f=await openFixture({onEvent:event=>{if(event==='health-passed')abort.abort();}});try{
  const plan=await f.project.run({command:edit()});await assert.rejects(f.project.commit({...plan,signal:abort.signal}),{code:'SEP_PROJECT_CANCELLED'});
  await assert.rejects(f.project.current(),{code:'SEP_PROJECT_RECOVERY_REQUIRED'});await f.project.recover();assert.equal(await text(f.project),'original');
 }finally{await f.project.close();}
});
test('discard invalidates the plan and removes its candidate body copy',async()=>{
 const f=await openFixture();try{const plan=await f.project.run({command:edit()});assert.equal((await f.project.discard(plan.planHash)).status,'pass');await assert.rejects(f.project.commit(plan),{code:'SEP_PROJECT_PLAN_INVALID'});for(const id of await readdir(join(f.root,'transactions')))assert.deepEqual(await readdir(join(f.root,'transactions',id)),[]);}finally{await f.project.close();}
});
test('expired confirmation cannot publish and explicit reconciliation removes its copy',async()=>{
 const f=await openFixture(),plan=await f.project.run({command:edit()});await f.project.close();
 const db=new DatabaseSync(join(f.root,'state.sqlite'));const row=db.prepare('SELECT id,value FROM transactions').get(),value=JSON.parse(row.value);value.createdAt=Date.now()-86400001;db.prepare('UPDATE transactions SET value=? WHERE id=?').run(JSON.stringify(value),row.id);db.close();
 const project=await f.openManagedProject({root:f.root,isolation});try{await assert.rejects(project.commit(plan),{code:'SEP_PROJECT_PLAN_EXPIRED'});await project.recover();for(const id of await readdir(join(f.root,'transactions')))assert.deepEqual(await readdir(join(f.root,'transactions',id)),[]);assert.equal(await text(project),'original');}finally{await project.close();}
});
test('newer persistent business sequence prevents automatic rollback',async()=>{
 const f=await openFixture();await f.project.close();await crash(f,'published-durable');
 const db=new DatabaseSync(join(f.root,'state.sqlite'));const value=JSON.parse(db.prepare('SELECT value FROM metadata').get().value);value.sequence=1;db.prepare('UPDATE metadata SET value=?').run(JSON.stringify(value));db.close();
 const project=await f.openManagedProject({root:f.root,isolation});try{await assert.rejects(project.recover(),{code:'SEP_PROJECT_RECOVERY_BLOCKED'});await assert.rejects(project.current(),{code:'SEP_PROJECT_RECOVERY_REQUIRED'});}finally{await project.close();}
});
test('durably undispatched interruption before the transaction folder exists can be reconciled',async()=>{
 const f=await openFixture();await f.project.close();const db=new DatabaseSync(join(f.root,'state.sqlite'));
 db.prepare('INSERT INTO transactions(id,value) VALUES(?,?)').run('00000000-0000-4000-8000-000000000000',JSON.stringify({id:'00000000-0000-4000-8000-000000000000',state:'running',launch:'not-dispatched'}));db.close();
 const project=await f.openManagedProject({root:f.root,isolation});try{assert.equal((await project.recover()).status,'pass');assert.equal(await text(project),'original');}finally{await project.close();}
});
test('journal and review metadata do not retain task body text',async()=>{
 const secret='SYNTHETIC-BODY-8c37d629-PRIVATE';const f=await openFixture();try{
  const plan=await f.project.run({command:edit(secret)});assert(!JSON.stringify(await f.project.review(plan.planHash)).includes(secret));await f.project.commit(plan);
  assert(!(await readFile(join(f.root,'state.sqlite'))).includes(Buffer.from(secret)));
 }finally{await f.project.close();}
});
test('real controller death during sandbox work leaves no late writer before recovery',{timeout:10000},async()=>{
 const f=await openFixture();await f.project.close();
 const child=spawn(process.execPath,[new URL('./transaction-worker.mjs',import.meta.url).pathname,JSON.stringify({root:f.root,isolation,operation:'running'})],{env:{PATH:'/usr/bin:/bin'},stdio:['ignore','ignore','pipe']});
 let stderr='';child.stderr.on('data',x=>stderr+=x);const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 let folder;
 try{const deadline=Date.now()+4000;while(Date.now()<deadline){for(const id of await readdir(join(f.root,'transactions'))){const candidate=join(f.root,'transactions',id,'work');if(await access(join(candidate,'started')).then(()=>true,()=>false)){folder=candidate;break;}}if(folder)break;await new Promise(r=>setTimeout(r,25));}assert(folder,stderr);}
 finally{child.kill('SIGKILL');await ended;}
 await new Promise(r=>setTimeout(r,1300));await assert.rejects(access(join(folder,'late')),{code:'ENOENT'});
 const project=await f.openManagedProject({root:f.root,isolation});try{await assert.rejects(project.current(),{code:'SEP_PROJECT_RECOVERY_REQUIRED'});await project.recover();assert.equal(await text(project),'original');await assert.rejects(access(folder),{code:'ENOENT'});}finally{await project.close();}
});
test('an unconfirmed sandbox stop preserves copies and leaves admission blocked',{timeout:8000},async()=>{
 const f=await openFixture(),kill=process.kill;let group;
 try{
  // Fault injection is confined to the OS signalling boundary; the actual
  // namespace child, controller, SQLite journal and workspace remain real.
  process.kill=(pid,signal)=>{if(pid<0&&signal==='SIGKILL'){group=pid;throw Object.assign(Error('synthetic EPERM'),{code:'EPERM'});}return kill(pid,signal);};
  const result=await f.project.run({command:['/usr/bin/python3','-c',"import time;open('/work/running','w').write('body');time.sleep(10)"],timeoutMs:200});
  assert.equal(result.status,'blocked');await assert.rejects(f.project.current(),{code:'SEP_PROJECT_RECOVERY_REQUIRED'});
  const folders=await readdir(join(f.root,'transactions'));assert.equal(await readFile(join(f.root,'transactions',folders[0],'work','running'),'utf8'),'body');
  assert.equal((await f.project.close()).status,'blocked');
  assert.equal((await f.project.close()).status,'blocked');
 }finally{process.kill=kill;if(group)try{kill(group,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}await f.project.close();}
 const reopened=await f.openManagedProject({root:f.root,isolation});try{await assert.rejects(reopened.recover(),{code:'SEP_PROJECT_CLEANUP_BLOCKED'});}finally{await reopened.close();}
});
test('concurrent close calls share one cleanup and keep the same receipt',async()=>{
 const f=await openFixture();const work=f.project.run({command:['/usr/bin/python3','-c','import time;time.sleep(5)']});
 await new Promise(r=>setTimeout(r,150));const receipts=await Promise.all([f.project.close(),f.project.close()]);assert.deepEqual(receipts,[{status:'pass'},{status:'pass'}]);assert.equal((await work).status,'aborted');
});
