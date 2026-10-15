// Test-only child: actual media Profile, Loader, HTTP carrier and persistent services.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openMacBusiness} from '../media-business/standalone.mjs';
import {openSettingsClient} from './transport.mjs';
let business;
process.on('message',async message=>{
 try{
  if(message.type==='open'){
   business=await openMacBusiness(message.input);const client=await openSettingsClient(business.ready.url);
   assert.equal(await client.unauthenticatedStatus(),401);
   const memory=await client.request('sep-memory/list',{}),budget=await client.request('sep-budget/list',{});assert.equal(memory.available,true);assert.equal(budget.available,true);assert.equal(memory.projects.length,1);
   const projectId=memory.projects[0].id,prior=await client.request('sep-memory/get',{projectId}),before=JSON.parse(await readFile(join(message.input.dataRoot,'budget/ledger.json')));
   if(message.round===1){
    assert.equal(prior.controls.recall,true);const changed=await client.request('sep-memory/update',{projectId,expected:prior.controls,controls:{...prior.controls,recall:false}});assert.equal(changed.controls.recall,false);
    assert.equal(await client.rejected('sep-memory/update',{projectId,expected:prior.controls,controls:prior.controls}),'MEMORY_SETTINGS_CONFLICT');
    const changedBudget=await client.request('sep-budget/updateDefault',{limitCny:75,expectedRevision:budget.defaults.revision});assert.equal(changedBudget.limitCny,75);assert.equal(changedBudget.revision,budget.defaults.revision+1);
    assert.equal(await client.rejected('sep-budget/updateDefault',{limitCny:200,expectedRevision:budget.defaults.revision}),'BUDGET_SETTINGS_CONFLICT');
    const after=JSON.parse(await readFile(join(message.input.dataRoot,'budget/ledger.json')));delete before.sessionDefault;delete after.sessionDefault;assert.deepEqual(after,before,'settings do not reset shared accounting, entries or reservations');
   }else{assert.equal(prior.controls.recall,false);assert.equal(budget.defaults.limitCny,75);assert.equal(budget.defaults.revision,1);}
   process.send({phase:'ready',settings:business.ready.settings,checks:{unauthenticatedRefused:true,memoryAvailable:true,budgetAvailable:true,settingsPersisted:message.round===2,casRefused:message.round===1,ledgerPreserved:true}});
  }else if(message.type==='close'){
   const receipt=await business.close();process.send({phase:'closed',receipt},()=>{if(receipt.status==='pass')process.disconnect();});
  }
 }catch(error){process.send({phase:'failed',code:error.code??error.name,diagnostic:String(error.stack)},()=>process.disconnect());process.exitCode=1;}
});
