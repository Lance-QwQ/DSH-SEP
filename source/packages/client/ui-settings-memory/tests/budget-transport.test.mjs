import test from 'node:test';
import assert from 'node:assert/strict';
import {apply} from '../src/index.ts';
function setup(service, transport={kind:'electron-owned-pipe'}, web){
 const routes=new Map(); const ctx={get:key=>({connection:{fetch:{register:r=>routes.set(r.path,r)}},suiteEnhancements:{budgetSettings:service},sepDesktopTransport:transport,webServer:web})[key]}; apply(ctx); return routes;
}
async function call(routes,method,payload={},options={}){
 const path='/api/sep-budget/'+method; const route=routes.get(path); assert.ok(route,'budget route must be registered');
 const request=new Request((options.url??'dsh-app://app')+path,{method:'POST',headers:{'content-type':'application/json',...options.headers},body:options.body??JSON.stringify({type:'client-request',rpcId:'r1',method:'sep-budget/'+method,payload}),...(options.signal?{signal:options.signal}:{})});
 return route.fetch(request);
}
test('budget defaults edit is routed to the owned service with exact CAS payload',async()=>{
 let seen;const routes=setup({updateDefault:async p=>{seen=p;return {limitCny:p.limitCny,revision:4}}});
 const response=await call(routes,'updateDefault',{limitCny:200,expectedRevision:3}); const body=await response.json(); assert.deepEqual(seen,{limitCny:200,expectedRevision:3});assert.deepEqual(body.result,{ok:true,value:{limitCny:200,revision:4}});
});
test('missing budget service returns unavailable without breaking memory routes',async()=>{const routes=setup();assert.ok(routes.has('/api/sep-memory/list'));const b=await (await call(routes,'list')).json();assert.equal(b.result.value.available,false);assert.equal(b.result.value.reason,'BUDGET_SETTINGS_UNAVAILABLE');});
test('unowned desktop callers cannot edit a guard',async()=>{let calls=0;const routes=setup({update:async()=>calls++},null);assert.equal((await call(routes,'update')).status,403);assert.equal(calls,0);});
test('non-loopback web bind cannot edit a guard',async()=>{const routes=setup({},null,{host:'0.0.0.0'});assert.equal((await call(routes,'update',{}, {url:'http://127.0.0.1'})).status,403);});
test('loopback carrier delegates valid list',async()=>{const routes=setup({list:async()=>({available:true})},null,{host:'127.0.0.1'});const body=await (await call(routes,'list',{}, {url:'http://127.0.0.1'})).json();assert.equal(body.result.value.available,true);});
test('oversized envelope cannot reach budget service',async()=>{let calls=0;const routes=setup({update:async()=>calls++});assert.equal((await call(routes,'update',{}, {body:'x'.repeat(16385)})).status,413);assert.equal(calls,0);});
test('mismatched envelope cannot reach budget service',async()=>{let calls=0;const routes=setup({update:async()=>calls++});assert.equal((await call(routes,'update',{}, {body:JSON.stringify({type:'client-request',rpcId:'r',method:'sep-memory/update',payload:{}})})).status,400);assert.equal(calls,0);});
test('unsupported content type cannot change a guard',async()=>{assert.equal((await call(setup({}),'update',{}, {headers:{'content-type':'text/plain'}})).status,415);});
test('aborted request performs no settings mutation',async()=>{let calls=0;const routes=setup({update:async()=>calls++});const signal=AbortSignal.abort();const b=await (await call(routes,'update',{}, {signal})).json();assert.equal(b.result.error.message,'ABORTED');assert.equal(calls,0);});
test('budget conflict code is preserved but exception text is not exposed',async()=>{const routes=setup({update:async()=>{throw Object.assign(new Error('private body'),{code:'BUDGET_SETTINGS_CONFLICT'})}});const text=await (await call(routes,'update')).text();assert.match(text,/BUDGET_SETTINGS_CONFLICT/);assert.doesNotMatch(text,/private body/);});
test('unknown exception code and body are redacted',async()=>{const routes=setup({get:async()=>{throw Object.assign(new Error('secret'),{code:'PRIVATE_PATH'})}});const text=await (await call(routes,'get')).text();assert.match(text,/BUDGET_SETTINGS_UNAVAILABLE/);assert.doesNotMatch(text,/PRIVATE_PATH|secret/);});

test('missing ledger error crosses owned Host route without financial data or private exception',async()=>{const routes=setup({list:async()=>{throw Object.assign(new Error('synthetic private path'),{code:'BUDGET_LEDGER_MISSING'})}});const text=await(await call(routes,'list')).text();const result=JSON.parse(text).result;assert.equal(result.ok,false);assert.equal(result.error.message,'BUDGET_LEDGER_MISSING');assert.equal('value' in result,false);assert.doesNotMatch(text,/synthetic private path|remainingCny|limitCny/);});

test('changed ledger error crosses owned Host route with no exception text',async()=>{const routes=setup({updateDefault:async()=>{throw Object.assign(new Error('synthetic private path'),{code:'BUDGET_LEDGER_CHANGED'})}});const text=await(await call(routes,'updateDefault')).text();assert.equal(JSON.parse(text).result.error.message,'BUDGET_LEDGER_CHANGED');assert.doesNotMatch(text,/synthetic private path/);});
