import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Budget} from '../src/budget-ledger.js';
const mod=await import('../src/budget-settings-service.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
async function setup(extra={}){
 assert.equal(typeof mod.createBudgetSettingsService,'function','settings service must be implemented');
 const path=join(await mkdtemp(join(tmpdir(),'sep-session-settings-')),'budget.json');
 const budget=new Budget(path,{limit:100});await budget.init();
 const controller=new AbortController(),records=[{header:{id:'root',origin:'user'}},{header:{id:'child',origin:'subagent',parentSession:'root'}}];
 const ctx={get:key=>key==='sessionQuery'?{listSessions:async()=>records}:undefined};
 const service=mod.createBudgetSettingsService({ctx,budget,signal:controller.signal,taskLimitCny:5,...extra});
 return {budget,path,service,records,controller};
}
test('settings metadata includes default, shared and turn budgets, excludes child sessions and bodies',async()=>{
 const f=await setup();const x=await f.service.list({});assert.equal(x.available,true);assert.equal(x.defaults.limitCny,100);assert.equal(x.taskLimitCny,5);assert.equal(x.shared.remainingCny,100);assert.deepEqual(x.sessions,[{id:'root',label:'root'}]);assert.equal(x.entries,undefined);
});
test('session update persists through fresh settings service and preserves existing spend',async()=>{
 const f=await setup();await f.budget.reserve('spent',2,{scope:{kind:'task',taskId:'task1',rootSessionId:'root',rootTurn:1}});await f.budget.settle('spent',1,{prompt_tokens:1,completion_tokens:1});
 const before=JSON.parse(await readFile(f.path));const result=await f.service.update({sessionId:'root',limitCny:12,expectedRevision:0});assert.equal(result.accountedUpperBoundCny,1);assert.equal(result.remainingCny,11);assert.deepEqual(JSON.parse(await readFile(f.path)).entries,before.entries);
 const again=mod.createBudgetSettingsService({ctx:{get:()=>({listSessions:async()=>f.records})},budget:new Budget(f.path,{limit:100}),signal:new AbortController().signal,taskLimitCny:5});
 assert.equal((await again.get({sessionId:'root'})).limitCny,12);
});
test('unknown and child session edits reject without budget mutation',async()=>{
 const f=await setup();const before=await readFile(f.path,'utf8');for(const id of ['missing','child'])await assert.rejects(f.service.update({sessionId:id,limitCny:10,expectedRevision:0}),{code:'BUDGET_SETTINGS_SESSION'});assert.equal(await readFile(f.path,'utf8'),before);
});
test('malformed edits and stale revisions return bounded settings errors',async()=>{
 const f=await setup();for(const limitCny of [0,-1,NaN,1.001,'4'])await assert.rejects(f.service.update({sessionId:'root',limitCny,expectedRevision:0}),{code:'BUDGET_SETTINGS_INPUT'});
 await f.service.update({sessionId:'root',limitCny:20,expectedRevision:0});
 await assert.rejects(f.service.update({sessionId:'root',limitCny:30,expectedRevision:0}),{code:'BUDGET_SETTINGS_CONFLICT'});
});
test('defaults apply to sessions without overrides, do not change explicit session limits',async()=>{
 const f=await setup();await f.service.updateDefault({limitCny:25,expectedRevision:0});assert.equal((await f.service.get({sessionId:'root'})).limitCny,25);await f.service.update({sessionId:'root',limitCny:9,expectedRevision:1});await f.service.updateDefault({limitCny:40,expectedRevision:1});assert.equal((await f.service.get({sessionId:'root'})).limitCny,9);
});
test('cancellation while queued prevents settings writes',async()=>{
 let release;const gate=new Promise(r=>release=r);const f=await setup({runAccess:async fn=>{await gate;return fn();}});const abort=new AbortController();const before=await readFile(f.path,'utf8');const work=f.service.update({sessionId:'root',limitCny:20,expectedRevision:0},{signal:abort.signal});abort.abort();release();await assert.rejects(work,{code:'ABORTED'});assert.equal(await readFile(f.path,'utf8'),before);
});
test('disabled P1 yields unavailable list and rejects writes',async()=>{
 assert.equal(typeof mod.createBudgetSettingsService,'function');
 const service=mod.createBudgetSettingsService({ctx:{get:()=>null}});const list=await service.list({});assert.equal(list.available,false);await assert.rejects(service.updateDefault({limitCny:20,expectedRevision:0}),{code:'BUDGET_SETTINGS_UNAVAILABLE'});
});

test('live session titles identify windows without loading persisted message bodies',async()=>{
 const f=await setup();const live={id:'root',header:{id:'root',origin:'user'}};
 const ctx={get:key=>key==='sessions'?{list:()=>[live],get:id=>id==='root'?live:undefined}:key==='sessionTitle'?{get:session=>{assert.equal(session,live);return {title:'合成测试任务'};}}:undefined};
 const service=mod.createBudgetSettingsService({ctx,budget:f.budget,taskLimitCny:5});
 assert.deepEqual((await service.list({})).sessions,[{id:'root',label:'合成测试任务 · root'}]);
});

