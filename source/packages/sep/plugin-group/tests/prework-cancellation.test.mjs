import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreworkRegistry} from '../source/prework.mjs';
const binding={projectId:'synthetic',model:'synthetic',reasoning:'off',runtimeHash:'runtime',toolsHash:'tools',promptHash:'prompt'};
const answer=JSON.stringify({ready:"Hello, I'm ready!",california:['Gamma','Alpha'],californiaTotal:500000,southern:['Beta','Delta','Gamma'],constraints:['Windows','read-only']});
const make=()=>createPreworkRegistry({authorize:async()=>binding.projectId,signal:new AbortController().signal,now:()=>1000});
test('ordinary user cancellation does not cache a blocked assessment for a later request',async()=>{
 const registry=make(),abort=new AbortController();
 await assert.rejects(registry.ensure({signal:abort.signal},binding,async()=>{abort.abort();return answer;}),{name:'AbortError'});
 let calls=0;const next=await registry.ensure({signal:new AbortController().signal},binding,async()=>{calls++;return answer;});
 assert.equal(calls,3);assert.equal(next.status,'pass');
});
test('non-cancellation execution failure remains blocked and cached',async()=>{
 const registry=make();let calls=0;
 const first=await registry.ensure({},binding,async()=>{calls++;throw Error('synthetic provider failure');});
 assert.equal(first.status,'blocked');assert.equal(calls,1);
 const replay=await registry.ensure({},binding,async()=>{calls++;return answer;});
 assert.equal(replay.id,first.id);assert.equal(calls,1);
});
test('cancellation releases the pending owner so an immediate retry can assess again',async()=>{
 const registry=make(),abort=new AbortController();let entered;const ready=new Promise(r=>entered=r);let finish;
 const first=registry.ensure({signal:abort.signal},binding,async()=>{entered();await new Promise(r=>finish=r);return answer;});
 await ready;abort.abort();finish();await assert.rejects(first,{name:'AbortError'});
 assert.equal(await registry.reset({}),0,'Cancelled assessments must not be published into the cache');
 assert.equal((await registry.ensure({},binding,async()=>answer)).status,'pass');
});