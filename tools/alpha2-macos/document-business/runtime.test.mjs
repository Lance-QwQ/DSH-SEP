import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {setup,ok} from './fixture.mjs';
import {configure,calls,instances} from './test-services.mjs';
const prepare=async({base})=>{const runtimeRoot=join(base,'parser-runtime');await mkdir(runtimeRoot,{mode:0o700});return {parser:{runtimeRoot,manifestSha256:'1'.repeat(64),stateRoot:join(base,'parser-state')}};};
test('real official consumer extraction and RAG use the required parser with unchanged budget',async()=>{
 configure();const f=await setup({prepare,business:{media:true}});try{const before=await readFile(f.budgetPath,'utf8');assert.equal(ok(await f.call('suite_extract',{path:'data.txt'})).parts[0].text,'synthetic governed parser token');assert.equal(ok(await f.call('suite_index')).sources,1);assert.equal(ok(await f.call('suite_search',{query:'governed'})).hits[0].text,'synthetic governed parser token');assert.equal(calls.length,2);assert.equal(f.providerCalls(),0);assert.equal(await readFile(f.budgetPath,'utf8'),before);}finally{await f.close();}
});
test('parser refusal cannot fall back in real consumer routes or publish an index',async()=>{
 configure({parseDocument:async()=>{throw Object.assign(Error('SYNTHETIC_REFUSAL'),{code:'SYNTHETIC_REFUSAL'});}});const f=await setup({prepare,business:{media:true}});try{for(const [name,args]of [['suite_extract',{path:'data.txt'}],['suite_index',{}]]){const r=await f.call(name,args);assert.equal(r.isError,true);assert.equal(r.error.message,'SYNTHETIC_REFUSAL');}assert.equal(ok(await f.call('suite_search',{query:'original'})).status,'not_indexed');assert.equal(f.providerCalls(),0);}finally{await f.close();}
});
test('business close waits for parser confirmation before releasing store and P2',async()=>{
 configure({holdClose:true});const f=await setup({prepare,shutdownMs:100,business:{media:true}});try{const closing=await f.api.close();assert.equal(closing.status,'blocked');assert.equal(closing.resourcesConfirmedReleased,false);assert.equal(instances[0].status().admissionOpen,false);assert.equal(f.api.status().phase,'closing');assert.equal(f.api.status().consumers.rag,'ready');assert.equal((await f.call('suite_extract',{path:'data.txt'})).isError,true);instances[0].release();await f.api.whenClosed();assert.equal(f.api.status().resourcesConfirmedReleased,true);}finally{instances[0]?.release();await f.close();}
});
test('closing during a parser request aborts it and does not publish or charge',async()=>{
 let entered;const started=new Promise(r=>{entered=r;});configure({parseDocument:({signal})=>new Promise((_yes,no)=>{entered();const reject=()=>no(Object.assign(Error('ABORTED'),{code:'ABORTED'}));signal.addEventListener('abort',reject,{once:true});if(signal.aborted)reject();})});const f=await setup({prepare,business:{media:true}});const before=await readFile(f.budgetPath,'utf8');const work=f.call('suite_index');await started;await f.api.close();assert.equal((await work).isError,true);assert.equal(f.api.status().resourcesConfirmedReleased,true);assert.equal(f.providerCalls(),0);assert.equal(await readFile(f.budgetPath,'utf8'),before);await f.close();
});
