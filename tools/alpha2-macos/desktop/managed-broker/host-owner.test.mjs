import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {createHostOwner} from './host-owner.mjs';
import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const modulePath=fileURLToPath(new URL('./fixture-business.mjs',import.meta.url)),moduleSha256=createHash('sha256').update(await readFile(modulePath)).digest('hex');
function owner(input={}){return createHostOwner({nodeExecutable:process.execPath,modulePath,moduleSha256,input,env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH},startDeadlineMs:3000,stopDeadlineMs:3000});}
test('real independent child ready, correlated inspection, same owner and acknowledged stop',async()=>{
 const o=owner({active:true});try{const s=await o.start();assert.equal(s.phase,'running');assert.notEqual(s.pid,process.pid);assert.deepEqual(await o.start(),s);assert.equal((await o.ready()).injections.length,0);assert.deepEqual(await o.inspect(),{activeTasks:true,scheduledTasks:false});const closed=await o.stop();assert.equal(closed.phase,'stopped');assert.equal(closed.lastExit.code,0);assert.equal(closed.lastExit.forced,false);assert.equal(o.status().phase,'stopped');await assert.rejects(o.start(),{code:'SEP_MAC_HOST_CLOSED'});}finally{await o.stop();}
});
test('blocked business close retains child and retry performs a new close attempt',async()=>{
 const o=owner({blockFirst:true});try{const s=await o.start();assert.equal((await o.stop()).phase,'blocked');assert.equal(o.status().pid,s.pid);assert.equal((await o.stop()).phase,'stopped');}finally{await o.stop();}
});
test('wrong business module hash refuses before a child is spawned',async()=>{
 const o=createHostOwner({nodeExecutable:process.execPath,modulePath,moduleSha256:'0'.repeat(64),input:{},startDeadlineMs:3000,stopDeadlineMs:3000});await assert.rejects(o.start(),{code:'SEP_MAC_HOST_MODULE_CHANGED'});assert.equal(o.status().pid,null);assert.equal((await o.stop()).phase,'stopped');
});
test('stop accepted during source validation prevents late child creation',async()=>{
 const o=owner();const start=o.start().catch(e=>e);const stop=await o.stop();assert.equal((await start).code,'SEP_MAC_HOST_CLOSED');assert.equal(stop.phase,'stopped');assert.equal(o.status().pid,null);
});
test('real child exit preceding delayed stop receipt converges to confirmed stopped',async t=>{
 const original=cp.fork,events=[];t.mock.method(cp,'fork',(...args)=>{const child=original(...args),emit=child.emit;child.emit=function(kind,...values){if(kind==='message'&&values[0]?.operation==='stop'){setTimeout(()=>{events.push('receipt');Reflect.apply(emit,this,[kind,...values]);},100);return true;}if(kind==='exit')events.push('exit');return Reflect.apply(emit,this,[kind,...values]);};return child;});syncBuiltinESMExports();
 const o=owner();try{await o.start();assert.equal((await o.stop()).phase,'stopped');assert.deepEqual(events,['exit','receipt']);assert.equal(o.status().lastExit.code,0);}finally{await o.stop();t.mock.restoreAll();syncBuiltinESMExports();}
});
test('classified startup cause survives child transport while unknown text does not',async()=>{for(const [input,expected]of [[{failCode:'SEP_MAC_FIXTURE_START_FAILURE'},'SEP_MAC_FIXTURE_START_FAILURE'],[{failCode:'secret-private-value'},'SEP_MAC_HOST_OPERATION_FAILED']]){const o=owner(input);await assert.rejects(o.start(),{code:expected});await o.stop();}});
