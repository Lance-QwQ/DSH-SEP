import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {owned} from './native-settings-fixture.mjs';
const cases=[['idle',false],['coalesced-idle',false],['cooperative-model',false],['cooperative-tool',false],['hung-model',true],['hung-tool',true],['pending-intent',true],['interrupt-model',true]];
for(const [name,forced] of cases)test('whole controlled application shutdown: '+name,{timeout:25000},async()=>{
 const dir=join(process.env.SEP_BUNDLE_TEST_ROOT,name);await mkdir(dir);const result=join(dir,'RESULT.json');
 const child=spawn(process.execPath,[fileURLToPath(new URL('./application-worker.mjs',import.meta.url))],{env:{...process.env,SEP_BUNDLE_TEST_ROOT:dir,SEP_APPLICATION_CASE:JSON.stringify({case:name,result,timeoutMs:700})},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
 let output='',stopping=false;child.stdout.on('data',b=>{output=(output+b).slice(-128000);});child.stderr.on('data',b=>{output=(output+b).slice(-128000);});child.on('message',v=>{if(v.kind==='stopping')stopping=true;});
 let timer;try{
  const exit=await Promise.race([new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('OWNED_CHILD_DEADLINE')),22000);})]);
  assert.equal(exit.signal,null,output);assert.equal(exit.code,name==='interrupt-model'?130:0,output);assert(stopping,output);
  const v=JSON.parse(await readFile(result));assert.equal(v.exitPath,forced?'official-controller-forced':'normal-disposal',output);assert.equal(v.newAdmissionRejected,true);assert.equal(v.requests,v.beforeRequests);assert.equal(v.ledger.initialSpent,1);assert.equal(v.ledger.sessionDefault.limitCny,100);
  assert.equal(v.application.status,forced?'blocked':'pass');assert.equal(v.application.phase,forced?'forced':'closed');assert.equal(v.application.resourcesConfirmedReleased,!forced);
  const lock=join(v.memory,'.suite-memory/p2/owner.lock');if(forced)await access(lock);else await assert.rejects(access(lock),{code:'ENOENT'});
  assert(v.elapsedMs<3500,'shutdown deadline excludes startup and post-exit ownership audit');
  if(forced&&name!=='interrupt-model')assert(v.elapsedMs>=650);
  const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');
  if(name==='pending-intent')await assert.rejects(openControl({storageRoot:v.memory}),{code:'P2_RECOVERY_REQUIRED'});
  const control=await openControl({storageRoot:v.memory,...name==='pending-intent'?{mode:'maintenance'}:{}});
  try{const cp=await control.checkpoint();assert.equal(cp.pending.length,name==='pending-intent'?1:0);if(name==='pending-intent')assert.throws(()=>control.assertReadable(),{code:'P2_RECOVERY_REQUIRED'});else control.assertReadable();}finally{await control.close();}
  const after=JSON.parse(await readFile(v.budgetPath));assert.deepEqual(after,v.ledger);
  if(name.includes('model')){assert.equal(after.entries.length,1);assert.equal(after.entries[0].status,'reserved');assert.equal(after.entries[0].phase,forced?'dispatched':'unknown');}
  if(name.includes('tool')){assert.equal(after.entries.length,1);assert.equal(after.entries[0].status,'settled');}
  await assert.rejects(access(lock),{code:'ENOENT'});
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(r=>child.once('exit',r));}await writeFile(join(dir,'CHILD.log'),output);}
});
