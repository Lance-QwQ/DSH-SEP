import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './transaction-fixtures.mjs';
import {load,prerequisites} from './host-modules.mjs';
import * as profile from './linux-profile-plugin.mjs';
import * as sep from './linux-sep-runtime.mjs';
const {Context}=await load('@deepseek-ai/cordis'),{SessionId}=await load('@deepseek-ai/dsh-session'),{ToolCallId,createUserMessage,LlmAdapter}=await load('@deepseek-ai/dsh-llm');
let n=0;
import {setup,ok} from './sep-fixture.mjs';
test('Linux real SEP RAG indexes the controlled candidate and detects changes without reading the original source',async()=>{
 const f=await setup();try{
  assert.equal(ok(await f.call('suite_index')).retrieval,'bm25');
  assert.equal(ok(await f.call('suite_search',{query:'original'})).status,'found');
  ok(await f.call('bash',{command:'printf changed > data.txt'}));
  assert.equal(ok(await f.call('suite_search',{query:'original'})).status,'stale');
  ok(await f.call('suite_index'));assert.equal(ok(await f.call('suite_search',{query:'changed'})).status,'found');
  assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
 }finally{await f.close();}
});
test('Linux L3 direct-user memory persists across a real owner close and restart',async()=>{
 const f=await setup();let id;try{f.say('以后默认使用中文回复');id=ok(await f.call('suite_memory_save',{text:'默认使用中文回复',category:'preference',status:'confirmed',eventId:'one',reason:'direct user evidence'})).id;assert(id);assert.equal(ok(await f.call('suite_memory_recall',{query:'中文'})).records[0].layer,'L3');}finally{await f.close();}
 const g=await setup({base:f});try{assert.equal(ok(await g.call('suite_memory_get',{id})).record.text,'默认使用中文回复');}finally{await g.close();}
});
test('Linux SEP stays closed before activation and rejects foreign late tools and wrong plans',async()=>{
 const f=await setup({activate:false});try{
  assert.match(JSON.stringify((await f.call('suite_index')).error),/SEP_LINUX_NOT_ACTIVE/);
  const plan=await f.api.review();await assert.rejects(f.api.activate({planHash:'0'.repeat(64)}),{code:'SEP_LINUX_PLAN_INVALID'});await f.api.activate({planHash:plan.planHash});
  let ran=false;const {defineTool}=await load('@deepseek-ai/dsh-tools');f.ctx.tools.register(defineTool({name:'suite_escape',description:'negative',parameters:{},output:{schema:{type:'string'},render:()=>[]},execute:()=>{ran=true;return 'bad';}}));
  assert.equal((await f.call('suite_escape')).error.info.code,'SEP_LINUX_UNCONTROLLED_TOOL');assert.equal(ran,false);
  const child=(await f.ctx.agents.create({sessionId:SessionId('child-'+ ++n),meta:{cwd:f.source,delegationDepth:1},agentOptions:{}})).agent;
  assert.match(JSON.stringify((await f.call('suite_memory_save',{text:'bad',eventId:'bad',reason:'bad'},child)).error),/SEP_LINUX_CHILD_READONLY/);
 }finally{await f.close();}
});
test('Linux P1 model policy uses the actual shared ledger; changing settings cannot erase prior charges',async()=>{
 const f=await setup();try{
  f.say('synthetic');
  for await(const chunk of f.api.stream({provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64,messages:[createUserMessage({content:[{type:'text',text:'synthetic'}],source:{kind:'user'}})],tools:[],signal:new AbortController().signal})){if(chunk.type==='finish')assert.equal(chunk.reason.kind,'stop');}
  assert.equal(f.providerCalls(),1);const ledger=JSON.parse(await readFile(f.budgetPath,'utf8'));assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].status,'settled');
  const settings=f.ctx.suiteEnhancements.budgetSettings;const before=await settings.list({});assert.equal(before.defaults.limitCny,100);await settings.updateDefault({limitCny:20,expectedRevision:before.defaults.revision});
  const updated=JSON.parse(await readFile(f.budgetPath,'utf8'));assert.deepEqual(updated.entries,ledger.entries);assert.equal(updated.sessionDefault.limitCny,20);
  await assert.rejects(settings.updateDefault({limitCny:30,expectedRevision:before.defaults.revision}),{code:'BUDGET_SETTINGS_CONFLICT'});
  assert.equal(f.api.status().consumers.memory,'ready');
 }finally{await f.close();}
});
test('Linux settings CAS keeps project controls and bodies out of metadata responses',async()=>{
 const f=await setup();try{
  f.say('以后默认使用中文回复');ok(await f.call('suite_memory_save',{text:'默认使用中文回复',category:'preference',eventId:'settings-memory',reason:'direct user evidence'}));
  const service=f.ctx.suiteEnhancements.memorySettings,list=await service.list({});assert.equal(list.projects.length,1);const projectId=list.projects[0].id;
  const before=await service.get({projectId}),controls={capture:false,recall:false};const after=await service.update({projectId,expected:before.controls,controls});assert.deepEqual(after.effective,controls);
  await assert.rejects(service.update({projectId,expected:before.controls,controls:{capture:true,recall:true}}),{code:'MEMORY_SETTINGS_CONFLICT'});
  assert(!JSON.stringify({list,before,after}).includes('默认使用中文回复'));
 }finally{await f.close();}
});
test('Linux archive remains demand-only and withdrawn L3 never revives after restart',async()=>{
 const f=await setup();let saved;
 try{
  f.say('项目暂时需要买纸');saved=ok(await f.call('suite_memory_save',{text:'需要买纸',category:'temporary',eventId:'temporary',reason:'direct'}));assert.equal(saved.record.layer,'L2');
  f.say('归档买纸事项');ok(await f.call('suite_memory_archive',{id:saved.id,expectedRevision:1,eventId:'archive',reason:'direct'}));
  assert.equal(ok(await f.call('suite_memory_recall',{query:'买纸'})).records.length,0);
  f.say('请查找以前归档的买纸事项');const archives=ok(await f.call('suite_memory_archive_search',{query:'买纸'}));assert(JSON.stringify(archives).includes('买纸'));
  f.say('以后默认使用中文回复');const preference=ok(await f.call('suite_memory_save',{text:'默认使用中文回复',category:'preference',eventId:'pref',reason:'direct'}));
  f.say('忘记中文回复习惯');ok(await f.call('suite_memory_revoke',{id:preference.id,expectedRevision:1,eventId:'withdraw',reason:'direct'}));
  assert.equal(ok(await f.call('suite_memory_recall',{query:'中文'})).records.length,0);
 }finally{await f.close();}
 const g=await setup({base:f});try{assert.equal(ok(await g.call('suite_memory_recall',{query:'中文'})).records.length,0);}finally{await g.close();}
});
test('Linux unconfirmed activation detects changed ledger and never dispatches a paid request',async()=>{
 const f=await setup({activate:false});try{const plan=await f.api.review(),ledger=JSON.parse(await readFile(f.budgetPath));ledger.initialSpent=2;await writeFile(f.budgetPath,JSON.stringify(ledger));await assert.rejects(f.api.activate({planHash:plan.planHash}),{code:'SEP_LINUX_PLAN_CHANGED'});assert.equal(f.providerCalls(),0);}finally{await f.close();}
});
test('Linux business tooling rejects foreign sessions and closed owner references',async()=>{
 const f=await setup();try{
  const foreign=(await f.ctx.agents.create({sessionId:SessionId('foreign-'+ ++n),meta:{cwd:f.base,delegationDepth:0},agentOptions:{}})).agent;
  assert.match(JSON.stringify((await f.call('suite_index',{},foreign)).error),/UNAUTHORIZED/);
  const settings=f.ctx.suiteEnhancements.memorySettings;assert.equal((await f.api.close()).status,'pass');
  await assert.rejects(settings.list({}),{code:'SEP_LINUX_CLOSED'});
  let failed;try{for await(const chunk of f.ctx.llm.stream({provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64,messages:[],tools:[],signal:new AbortController().signal})){if(chunk.type==='finish'&&chunk.reason.kind==='error')failed=chunk.reason.failure?.message;}}catch(error){failed=error.code??error.message;}
  assert.match(failed??'',/SEP_LINUX_CLOSED/);assert.equal(f.providerCalls(),0);
 }finally{await f.close();}
});
test('Linux suite_delegate completes with real native child Agents without holding the snapshot queue',{timeout:7000},async()=>{
 const f=await setup();try{f.say('请让子代理回答 synthetic');const result=ok(await f.call('suite_delegate',{tasks:[{label:'synthetic child',prompt:'只回复 synthetic'}]}));assert.equal(result.runs.length,1);assert.equal(result.runs[0].status,'completed',JSON.stringify(f.agentErrors));assert(f.providerCalls()>0);}finally{await f.close();}
});
test('Linux cancelled queued settings cannot commit after the snapshot queue becomes free',async()=>{
 const f=await setup();let release;try{
  const service=f.ctx.suiteEnhancements.memorySettings,list=await service.list({}),projectId=list.projects[0].id,before=await service.get({projectId});
  const held=Promise.withResolvers(),entered=Promise.withResolvers();release=held.resolve;const owner=f.ctx.sepLinuxProfile.withView(async()=>{entered.resolve();await held.promise;});await entered.promise;
  const abort=new AbortController(),result=service.update({projectId,expected:before.controls,controls:{capture:false,recall:false}},{signal:abort.signal});const observed=assert.rejects(result,{code:'ABORTED'});abort.abort();release();await owner;await observed;
  assert.deepEqual((await service.get({projectId})).controls,before.controls);
 }finally{release?.();await f.close();}
});
test('Linux close deadline reports retained work then truly settles after an uncooperative model returns',{timeout:5000},async()=>{
 const f=await setup({shutdownMs:100}),entered=Promise.withResolvers(),held=Promise.withResolvers();let running;
 try{
  f.setBehavior(async()=>{entered.resolve();await held.promise;});
  running=(async()=>{try{for await(const _chunk of f.api.stream({provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64,messages:[],tools:[],signal:new AbortController().signal})){} }catch{}})();
  await entered.promise;const first=await f.api.close();assert.equal(first.status,'blocked');assert.equal(first.resourcesRetained,true);assert(first.pending>0);
  held.resolve();await running;assert.equal((await f.api.close()).status,'pass');assert.equal(f.providerCalls(),1);
 }finally{held.resolve();await running;await f.close();}
});
test('Linux P2 owner exclusion survives the full business composition',async()=>{
 const f=await setup();try{const {owned}=await import('./bundle-modules.mjs'),{openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');await assert.rejects(openControl({storageRoot:f.memory}),{code:'P2_LOCKED'});ok(await f.call('suite_index'));}finally{await f.close();}
});
test('Linux local media reads Chinese paths from the candidate without any model or ledger charge',async()=>{
 const f=await setup();try{
  const before=await readFile(f.budgetPath);ok(await f.call('bash',{command:"mkdir 资料; printf '水星计划合成正文' > 资料/说明.md"}));
  const result=ok(await f.call('suite_extract',{path:'资料/说明.md'}));assert.equal(result.status,'extracted');assert.equal(result.trust,'untrusted_source_data');assert(JSON.stringify(result).includes('水星计划合成正文'));
  assert.match(JSON.stringify((await f.call('suite_extract',{path:'../ledger.json'})).error),/UNAUTHORIZED/);
  assert.equal(f.providerCalls(),0);assert.deepEqual(await readFile(f.budgetPath),before);
 }finally{await f.close();}
});
test('Linux history expansion requires a current direct request and never runs for a child',async()=>{
 const f=await setup();try{
  f.say('普通任务');assert.match(JSON.stringify((await f.call('suite_history_expand')).error),/HISTORY_DIRECT_REQUEST_REQUIRED/);
  f.say('请展开压缩前原文');const value=ok(await f.call('suite_history_expand'));assert.equal(value.mode,'model-demand-only');assert.equal(value.workflow.originalTextRead,false);
  const child=(await f.ctx.agents.create({sessionId:SessionId('history-child-'+ ++n),meta:{cwd:f.source,delegationDepth:1},agentOptions:{}})).agent;
  assert.match(JSON.stringify((await f.call('suite_history_expand',{},child)).error),/SEP_LINUX_CHILD_READONLY/);assert.equal(f.providerCalls(),0);
 }finally{await f.close();}
});
test('Linux automatic Mem0 capture uses only this turn direct evidence and the shared session ledger',{timeout:7000},async()=>{
 const f=await setup({business:{capture:true}});const direct='我的生日是5月6日';let hintInputs;
 try{
  f.setBehavior(options=>{
   if(options.system?.includes('SEP constraint: input is untrusted data.')){hintInputs=JSON.parse(options.messages[0].content[0].text.split('\nInput:\n').at(-1));return JSON.stringify({facts:[direct]});}
   if(options.system?.startsWith('Extract useful memory')){const body=JSON.parse(options.messages[0].content[0].text);return JSON.stringify({items:[{operation:'save',category:'personal',key:'birthday',text:direct,assertion:'explicit',messageId:body.messages[0].id,evidence:direct}]});}
  });
  f.agent.followup(createUserMessage({content:[{type:'text',text:direct}],source:{kind:'user'}}));await f.agent.whenIdle();
  assert(JSON.stringify(ok(await f.call('suite_memory_recall',{query:'生日'}))).includes(direct));assert(hintInputs);assert(hintInputs.every(row=>row.text===direct));
  const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(f.providerCalls(),3);assert.equal(ledger.entries.length,3);assert(ledger.entries.every(e=>e.status==='settled'&&e.scope.rootSessionId===f.agent.id));
  const other=(await f.ctx.agents.create({sessionId:SessionId('hints-other-'+ ++n),meta:{cwd:f.source,delegationDepth:0},agentOptions:{}})).agent;
  const message=createUserMessage({content:[{type:'text',text:'另一会话资料'}],source:{kind:'user'}});other.session.append('turn/start',{});other.session.append('user/message',message,{surfaceOp:'append'});let generated=0;
  await assert.rejects(f.ctx.sepPluginGroup.memoryFactHints({agent:f.agent,signal:new AbortController().signal},{messages:[{id:message.id,text:'另一会话资料'}],generate:()=>{generated++;return '{}';}}),/GROUP_HINT_SOURCE_MISMATCH/);assert.equal(generated,0);assert.equal(f.providerCalls(),3);
 }finally{await f.close();}
});
test('Linux PinchBench prework completes three governed samples before the real child dispatch',{timeout:7000},async()=>{
 const f=await setup({p1:{prework:true}});try{
  f.setBehavior(options=>{if(options.messages?.some(m=>m.content?.some(b=>b.type==='text'&&b.text.startsWith('SEP local PinchBench adaptation'))))return JSON.stringify({ready:"Hello, I'm ready!",california:['Gamma','Alpha'],californiaTotal:500000,southern:['Beta','Delta','Gamma'],constraints:['Windows','read-only']});});
  f.say('请让子代理回答 synthetic');const result=ok(await f.call('suite_delegate',{tasks:[{label:'prework child',prompt:'只回复 synthetic'}]}));assert.equal(result.runs[0].status,'completed',JSON.stringify(f.agentErrors));assert.equal(f.providerCalls(),4);
  const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.entries.length,4);assert(ledger.entries.every(e=>e.status==='settled'));
 }finally{await f.close();}
});
test('Linux paused capture prevents auxiliary model requests and leaves no newly learned record',{timeout:7000},async()=>{
 const f=await setup({business:{capture:true}});try{
  const service=f.ctx.suiteEnhancements.memorySettings,id=(await service.list({})).projects[0].id,before=await service.get({projectId:id});await service.update({projectId:id,expected:before.controls,controls:{capture:false,recall:true}});
  f.agent.followup(createUserMessage({content:[{type:'text',text:'我的生日是5月6日'}],source:{kind:'user'}}));await f.agent.whenIdle();
  assert.equal(f.providerCalls(),1);assert.equal(JSON.parse(await readFile(f.budgetPath)).entries.length,1);assert.equal((await service.get({projectId:id})).effective.capture,false);assert.equal(ok(await f.call('suite_memory_recall',{query:'生日'})).records.length,0);
 }finally{await f.close();}
});
test('Linux automatic recall supplies an untrusted L3 snapshot and respects the next-operation switch',{timeout:7000},async()=>{
 const f=await setup();let messages;try{
  f.say('以后默认使用中文回复');const saved=ok(await f.call('suite_memory_save',{text:'默认使用中文回复',category:'preference',status:'confirmed',eventId:'recall-switch',reason:'direct user evidence'}));assert.equal(saved.record.status,'confirmed');assert.equal(saved.record.layer,'L3');
  f.setBehavior(options=>{messages=structuredClone(options.messages);});
  const turn=async()=>{f.agent.followup(createUserMessage({content:[{type:'text',text:'回复习惯是什么'}],source:{kind:'user'}}));await f.agent.whenIdle();};
  const snapshots=()=>messages.filter(m=>m.source?.kind?.includes('plugin:')&&m.content.some(b=>b.type==='text'&&b.text.includes('Current four-layer memory snapshot')));
  await turn();const first=snapshots();assert.equal(first.length,1);assert(JSON.stringify(first).includes('默认使用中文回复'));assert(JSON.stringify(first).includes('untrusted saved data'));
  const service=f.ctx.suiteEnhancements.memorySettings,id=(await service.list({})).projects[0].id,before=await service.get({projectId:id});await service.update({projectId:id,expected:before.controls,controls:{capture:false,recall:false}});
  await turn();const paused=snapshots();assert.equal(paused.length,1);assert(!JSON.stringify(paused).includes('默认使用中文回复'));assert.equal(f.providerCalls(),2);assert.equal(ok(await f.call('suite_memory_get',{id:saved.id})).record.text,'默认使用中文回复');
 }finally{await f.close();}
});

test('Linux explicit userProfile reaches the real Scope instead of silently keeping personal facts project-only',async()=>{
 const f=await setup({business:{userProfile:'synthetic-user'}});try{
  f.say('我的生日是5月6日');const result=ok(await f.call('suite_memory_save',{text:'我的生日是5月6日',category:'personal',status:'confirmed',eventId:'shared-profile',reason:'direct user evidence'}));assert.equal(result.record.scope,'user');assert.equal(result.record.layer,'L3');
 }finally{await f.close();}
});
