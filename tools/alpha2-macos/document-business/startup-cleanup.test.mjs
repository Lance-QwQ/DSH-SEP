import test from 'node:test';
import assert from 'node:assert/strict';
import {frozen} from './derive.mjs';
const baseline=process.env.SEP_DOCUMENT_BASELINE==='1';
let cleanup;
if(baseline){const source=await frozen(new URL('../business/standalone.mjs',import.meta.url),'e4ad150db13d7cf173826923f2d047c61c8762ff959b403eeee73fe01e7911c6'),match=source.match(/\}catch\(error\)\{(if\(running\)[\s\S]*throw error;)\}\r?\n\}\r?\n$/);assert(match);const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;cleanup=new AsyncFunction('running','error',match[1]);}else cleanup=(await import('./startup-cleanup.mjs')).cleanupFailedStartup;
const pass={status:'pass',resourcesConfirmedReleased:true};
function fixture(runtimeReceipt,profileReceipt=pass){const calls=[],running={ctx:{get:name=>({close:async()=>{calls.push(name);const value=name==='sepMacRuntime'?runtimeReceipt:profileReceipt;return typeof value==='function'?value():value;}})},shutdown:{shutdown:async code=>{calls.push('shutdown:'+code);}}};return {running,calls,error:Object.assign(Error('SYNTHETIC_STARTUP_FAILURE'),{code:'SYNTHETIC_STARTUP_FAILURE'})};}
test('startup failure retains profile and host if parser/runtime cleanup is unconfirmed',async()=>{
 const f=fixture({status:'blocked',resourcesConfirmedReleased:false});await assert.rejects(()=>cleanup(f.running,f.error),{code:'SEP_MAC_BUSINESS_STARTUP_CLEANUP_BLOCKED'});assert.deepEqual(f.calls,['sepMacRuntime']);
});
test('startup failure retains host when project cleanup is unconfirmed',async()=>{
 const f=fixture(pass,{status:'blocked',resourcesConfirmedReleased:false});await assert.rejects(()=>cleanup(f.running,f.error),{code:'SEP_MAC_BUSINESS_STARTUP_CLEANUP_BLOCKED'});assert.deepEqual(f.calls,['sepMacRuntime','sepMacProfile']);
});
test('confirmed startup cleanup shuts down once and preserves the original failure',async()=>{
 const f=fixture(pass);await assert.rejects(()=>cleanup(f.running,f.error),error=>error===f.error);assert.deepEqual(f.calls,['sepMacRuntime','sepMacProfile','shutdown:1']);
});
test('blocked startup cleanup preserves diagnostics and supports an idempotent safe retry',async()=>{
 let released=false,blocked;const f=fixture(pass,()=>released?pass:{status:'blocked',resourcesConfirmedReleased:false});try{await cleanup(f.running,f.error);}catch(error){blocked=error;}
 assert.equal(blocked.cause,f.error);assert.equal(typeof blocked.retryCleanup,'function');released=true;assert.deepEqual(await blocked.retryCleanup(),pass);assert.deepEqual(await blocked.retryCleanup(),pass);assert.deepEqual(f.calls,['sepMacRuntime','sepMacProfile','sepMacProfile','shutdown:1']);
});
