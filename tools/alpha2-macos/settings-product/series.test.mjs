import test from'node:test';import assert from'node:assert/strict';import{runSeries}from'./series.mjs';
const result=i=>({status:'pass',roundNumber:i,workerExit:{code:0,signal:null},round:{status:'pass',cleanup:{status:'pass',resourcesConfirmedReleased:true},badge:{width:32,height:14,officialHarnessPreserved:true},workspaceReady:{surface:'workspace',ready:true,blocked:false},settings:{status:'pass',recallFalse:true,defaultLimitCny:80,dialogClosed:true,persistedFromPriorColdStart:i>1}}});
test('three predefined distinct rounds require later cold-start persistence receipts',async()=>{
 const seen=[];const value=await runSeries(async i=>{seen.push(i);return {receipt:result(i),exit:{code:0,signal:null}};});assert.deepEqual(seen,[1,2,3]);assert.equal(value.status,'pass');assert.deepEqual(value.rounds.map(r=>r.status),['pass','pass','pass']);
 const bad=await runSeries(async i=>{const receipt=result(i);if(i===2)receipt.round.settings.persistedFromPriorColdStart=false;return {receipt,exit:{code:0,signal:null}};});assert.deepEqual(bad.rounds.map(r=>r.status),['pass','fail','not_run']);
});
test('failed or unknown second round is retained without dispatching the third',async()=>{
 for(const status of ['fail','blocked']){const seen=[];const value=await runSeries(async i=>{seen.push(i);const receipt=result(i);if(i===2){receipt.status=status;receipt.round.status=status;if(status==='blocked')receipt.round.cleanup.resourcesConfirmedReleased=false;}return {receipt,exit:status==='blocked'&&i===2?null:{code:i===2?1:0,signal:null}};});assert.deepEqual(seen,[1,2]);assert.equal(value.status,status);assert.deepEqual(value.rounds.map(r=>r.status),['pass',status,'not_run']);}
});
