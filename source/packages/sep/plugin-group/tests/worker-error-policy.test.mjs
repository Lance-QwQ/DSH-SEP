import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
const workerUrl=new URL('../source/lcm-worker.mjs',import.meta.url),storeUrl=new URL('../vendor/lossless-claw/store/conversation-store.js',import.meta.url);
async function run(t,{fault=false}={}){
 const secret='SYNTHETIC_SECRET_DO_NOT_EXPOSE_917';
 const bootstrap=`const {ConversationStore}=await import(${JSON.stringify(storeUrl.href)});ConversationStore.prototype.createMessage=async()=>{throw new Error(${JSON.stringify(secret)})};await import(${JSON.stringify(workerUrl.href)});`;
 const worker=new Worker(fault?new URL('data:text/javascript,'+encodeURIComponent(bootstrap)):workerUrl,{workerData:{projectId:'synthetic-project',messages:[{text:'synthetic content'}]},resourceLimits:{maxOldGenerationSizeMb:64}});t.after(()=>worker.terminate());
 const value=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code)reject(Error('worker exited '+code));});});return {value,secret};
}
test('actual worker redacts vendor exception text while retaining a stable failure code',async t=>{const {value,secret}=await run(t,{fault:true});assert.equal(value.ok,false);assert.equal(JSON.stringify(value).includes(secret),false);assert.deepEqual(value,{ok:false,code:'GROUP_LCM_CORE'});});
test('actual worker success output remains an extractive round trip',async t=>{const {value}=await run(t);assert.equal(value.ok,true);assert.equal(value.result.status,'pass');assert.deepEqual(value.result.recoveredMessages,['synthetic content']);assert.equal(value.result.persisted,false);});
