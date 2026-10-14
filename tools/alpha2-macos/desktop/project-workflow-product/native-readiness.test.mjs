import test from 'node:test';import assert from 'node:assert/strict';import {setTimeout as delay} from 'node:timers/promises';
// RED mode replays the former immediate-read boundary, not a product override.
const observe=process.env.SEP_NATIVE_READINESS_RED==='1'?async({read})=>read():(await import('./native-readiness.mjs')).observeReady;
const fail=code=>Object.assign(Error(code),{code});
test('temporarily absent brand is observed again, then the original measurement is returned',async()=>{
 let reads=0;const samples=[],expected={width:32,height:14,gap:6,rounded:true,officialHarnessPreserved:true};
 const got=await observe({read:async()=>{if(++reads===1)throw fail('SEP_WORKSPACE_BRAND_UNAVAILABLE');return expected;},pendingCode:'SEP_WORKSPACE_BRAND_UNAVAILABLE',deadlineCode:'SEP_WORKSPACE_BRAND_DEADLINE',timeoutMs:100,intervalMs:1,onSample:r=>samples.push(r)});
 assert.equal(got,expected);assert.equal(reads,2);assert.deepEqual(samples.map(r=>r.classification),['SEP_WORKSPACE_BRAND_UNAVAILABLE','ready']);
});
test('document mismatch and invalid measurement assertion are never retried',async()=>{
 for(const code of ['SEP_WORKSPACE_DOCUMENT','SEP_WORKSPACE_WINDOW_CHANGED','ERR_ASSERTION']){let reads=0;await assert.rejects(observe({read:async()=>{reads++;throw fail(code);},pendingCode:'SEP_WORKSPACE_BRAND_UNAVAILABLE',deadlineCode:'SEP_WORKSPACE_BRAND_DEADLINE',timeoutMs:100,intervalMs:1}),{code});assert.equal(reads,1);}
});
test('a permanently absent widget stops at its own deadline with only safe technical samples',async()=>{
 const samples=[];await assert.rejects(observe({read:async()=>false,deadlineCode:'SEP_PROJECT_NATIVE_PANEL',timeoutMs:10,intervalMs:1,onSample:r=>samples.push(r)}),{code:'SEP_PROJECT_NATIVE_PANEL'});
 assert(samples.length>=2);assert.equal(samples.at(-1).classification,'deadline');for(const row of samples)assert.deepEqual(Object.keys(row).sort(),['attempt','classification','elapsedMs']);
});
test('a hung readonly sample cannot extend the observation deadline or later become a pass',async()=>{
 let release;const pending=new Promise(r=>{release=r;});const actual=observe({read:()=>pending,deadlineCode:'SEP_PROJECT_NATIVE_PANEL',timeoutMs:10,intervalMs:1});
 const outcome=await Promise.race([actual.then(()=>({kind:'pass'}),e=>({kind:'failure',code:e.code})),delay(80).then(()=>({kind:'unbounded'}))]);release(true);assert.deepEqual(outcome,{kind:'failure',code:'SEP_PROJECT_NATIVE_PANEL'});
});
test('cleanup abort ends admission before another DOM read',async()=>{
 const abort=new AbortController();let reads=0;await assert.rejects(observe({read:async()=>{reads++;abort.abort();return false;},signal:abort.signal,deadlineCode:'SEP_PROJECT_NATIVE_PANEL',timeoutMs:100,intervalMs:1}),{code:'SEP_WORKSPACE_CLEANUP_REQUESTED'});assert.equal(reads,1);
});
test('already cancelled observation performs no read and never returns a ready result',async()=>{
 const abort=new AbortController();abort.abort();let reads=0;await assert.rejects(observe({read:async()=>{reads++;return true;},signal:abort.signal,deadlineCode:'SEP_PROJECT_NATIVE_PANEL',timeoutMs:100,intervalMs:1}),{code:'SEP_WORKSPACE_CLEANUP_REQUESTED'});assert.equal(reads,0);
});
test('an acknowledged action result is consumed once without replaying the action',async()=>{
 let actions=0;assert.equal(await observe({read:async()=>{actions++;return 'opening';},deadlineCode:'SEP_PROJECT_NATIVE_SETTINGS_TRIGGER',timeoutMs:100,intervalMs:1}),'opening');assert.equal(actions,1);
});
