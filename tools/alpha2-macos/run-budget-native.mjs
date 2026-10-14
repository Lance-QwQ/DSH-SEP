// Native synthetic receipts for unchanged SEP accounting. No paid request.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rename,lstat,readdir,realpath} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
if(process.platform!=='darwin'||process.arch!=='arm64'){
  console.log(JSON.stringify({status:'not_run',code:'SEP_MACOS_NATIVE_REQUIRED'}));process.exit(78);
}
const root=process.argv[2];assert(root&&resolve(root)===root&&await realpath(dirname(root))===dirname(root));
process.umask(0o077);await mkdir(root,{mode:0o700});
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs=JSON.parse(await readFile(new URL('INPUTS.json',import.meta.url)));
for(const f of inputs.files)assert.equal(sha(await readFile(new URL(f.path,import.meta.url))),f.sha256,f.path);
const {Budget}=await import('./captured/budget-ledger.js');
const rows=[],cleanup=[],active=new Set(),scope=(taskId='task',rootSessionId='session')=>({kind:'task',taskId,rootSessionId,rootTurn:0});
function child(action,path,id){
  const c=spawn(process.execPath,[new URL('./budget-worker.mjs',import.meta.url).pathname,action,path,...id?[id]:[]],{env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,LANG:'C'},stdio:['pipe','pipe','pipe']});
  active.add(c);let out='',err='',bytes=0,readyResolve,readyReject,doneResolve,doneReject;
  const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;}),done=new Promise((r,j)=>{doneResolve=r;doneReject=j;});ready.catch(()=>{});done.catch(()=>{});
  c.once('error',error=>{active.delete(c);readyReject(error);doneReject(error);});
  c.stdout.on('data',b=>{bytes+=b.length;if(bytes>8192){c.kill('SIGKILL');return;}out+=b;const line=out.split('\n')[0];try{const v=JSON.parse(line);if(v.status==='ready'&&v.pid===c.pid)readyResolve(v);}catch{}});
  c.stderr.on('data',b=>{bytes+=b.length;if(bytes>8192)c.kill('SIGKILL');else err+=b;});
  c.once('close',(code,signal)=>{active.delete(c);const value={code,signal,stdout:out,stderr:err};doneResolve(value);readyReject(Error('WORKER_CLOSED_BEFORE_READY'));});
  return {c,ready,done};
}
async function bounded(promise,ms=10000){let timer;try{return await Promise.race([promise,new Promise((_,j)=>{timer=setTimeout(()=>j(Error('NATIVE_BUDGET_DEADLINE')),ms);})]);}finally{clearTimeout(timer);}}
for(const round of [1,2,3]){
  async function check(name,fn){const dir=join(root,'round-'+round+'-'+name);await mkdir(dir,{mode:0o700});const row={round,name};rows.push(row);try{await fn(dir);row.status='pass';}catch(e){row.status='fail';row.code=e.code??e.message;}}
  await check('defaults-and-cancel',async dir=>{
    const b=new Budget(join(dir,'budget.json'),{limit:100});await b.init();
    assert.equal((await b.sessionSnapshot('session')).limitCny,100);
    await b.reserve('r1',1,{scope:scope()});assert.equal((await b.snapshot()).reservedCny,1);
    await b.releasePrepared('r1','synthetic-cancel');const s=await b.snapshot();assert.equal(s.reservedCny,0);assert.equal(s.entries.length,1);assert.equal(s.entries[0].status,'released');
  });
  await check('unknown-outcome',async dir=>{
    const b=new Budget(join(dir,'budget.json'),{limit:100});await b.init();await b.reserve('r1',1,{scope:scope()});await b.markDispatched('r1');await b.markUnknown('r1');
    await assert.rejects(b.releasePrepared('r1','cancelled'),{code:'BUDGET_OUTCOME_UNKNOWN'});
    assert.equal((await b.snapshot()).reservedCny,1);await b.settle('r1',.1,{prompt_tokens:1,completion_tokens:1});assert.equal((await b.snapshot()).settledCny,.1);
  });
  await check('settings-preserve-accounting',async dir=>{
    const path=join(dir,'budget.json'),b=new Budget(path,{limit:100});await b.init();await b.reserve('r1',1,{scope:scope()});await b.settle('r1',.1,{prompt_tokens:1,completion_tokens:1});
    await b.setSessionLimit('session',.5,{expectedRevision:0});await assert.rejects(b.setSessionLimit('session',1,{expectedRevision:0}),{code:'BUDGET_SETTINGS_CONFLICT'});
    const reopened=new Budget(path,{limit:100});const s=await reopened.sessionSnapshot('session');assert.equal(s.revision,1);assert.equal(s.limitCny,.5);assert.equal(s.settledCny,.1);assert.equal(s.remainingCny,.4);assert.equal((await reopened.snapshot()).entries.length,1);
  });
  await check('three-independent-limits',async dir=>{
    const b=new Budget(join(dir,'budget.json'),{limit:100});await b.init();
    await assert.rejects(b.reserve('task-over',6,{scope:scope()}),{code:'TASK_BUDGET_EXCEEDED'});
    await b.setSessionLimit('session',.2,{expectedRevision:0});await assert.rejects(b.reserve('session-over',.3,{scope:scope()}),{code:'SESSION_BUDGET_EXCEEDED'});
    await assert.rejects(b.reserve('shared-over',101),{code:'BUDGET_EXCEEDED'});assert.equal((await b.snapshot()).entries.length,0);
  });
  await check('cross-process-writers',async dir=>{
    const path=join(dir,'budget.json'),b=new Budget(path,{limit:100});await b.init();const a=child('reserve',path,'a'),c=child('reserve',path,'b');
    const results=await bounded(Promise.all([a.done,c.done]));for(const r of results){assert.equal(r.code,0);assert.equal(JSON.parse(r.stdout).status,'pass');}
    const s=await b.snapshot();assert.equal(s.reservedCny,2);assert.deepEqual(s.entries.map(x=>x.id).sort(),['a','b']);
  });
  await check('crash-lock-recovery',async dir=>{
    const path=join(dir,'budget.json'),b=new Budget(path,{limit:100});await b.init();await b.reserve('before',.25,{scope:scope()});
    const worker=child('hold',path);await bounded(worker.ready);worker.c.kill('SIGKILL');const stopped=await bounded(worker.done);assert.equal(stopped.signal,'SIGKILL');
    const reopened=new Budget(path,{limit:100});await reopened.reserve('after',.25,{scope:scope()});assert.equal((await reopened.snapshot()).reservedCny,.5);
    assert.equal((await readdir(dir)).filter(x=>x.includes('.lock.abandoned-')).length,1);
  });
  await check('missing-ledger-does-not-reset',async dir=>{
    const path=join(dir,'budget.json'),b=new Budget(path,{limit:100});await b.init();await b.reserve('before',.25,{scope:scope()});const original=await readFile(path);await rename(path,path+'.synthetic-retained');
    const reopened=new Budget(path,{limit:100});await assert.rejects(reopened.init(),{code:'BUDGET_LEDGER_MISSING'});await assert.rejects(lstat(path),{code:'ENOENT'});
    await rename(path+'.synthetic-retained',path);assert.equal(sha(await readFile(path)),sha(original));assert.equal((await reopened.snapshot()).reservedCny,.25);
  });
  await check('corrupt-ledger-does-not-reset',async dir=>{
    const path=join(dir,'budget.json'),b=new Budget(path,{limit:100});await b.init();await writeFile(path,'{"version":');
    await assert.rejects(new Budget(path,{limit:100}).init(),{code:'BUDGET_CORRUPT'});assert.equal(await readFile(path,'utf8'),'{"version":');
  });
}
for(const c of active){cleanup.push({pid:c.pid,reason:'test-cleanup'});c.kill('SIGKILL');}
const result={status:rows.length===24&&rows.every(r=>r.status==='pass')&&!cleanup.length?'pass':'fail',platform:process.platform,arch:process.arch,node:process.version,sourceCommit:inputs.sourceCommit,uniqueScenarios:8,rounds:3,rows,cleanup,scope:'actual unchanged Budget and SQLite mutex on native macOS; synthetic ledger, no invoice or paid calls',notVerified:['P2 three-domain storage','memory','Alpha.2 host integration','desktop','production worker','whole-process-tree cleanup']};
await writeFile(join(root,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));if(result.status!=='pass')process.exitCode=1;
