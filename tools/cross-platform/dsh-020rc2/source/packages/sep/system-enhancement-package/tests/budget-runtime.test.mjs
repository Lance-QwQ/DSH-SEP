import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {installP1,p1Config}=await import(pathToFileURL(join(root,'src/p1.js')));
const {Budget,callDeepSeek}=await import(pathToFileURL(join(root,'src/deepseek.js')));
async function setup(overrides={}){
 const directory=await mkdtemp(join(tmpdir(),'sep-budget-runtime-')),budgetPath=join(directory,'budget.json'),listeners=new Map(),agents=new Map();
 const effects=[];const ctx={get:name=>name==='sessions'?{list:()=>[...agents.values()].map(a=>a.session)}:{},agents:{get:id=>agents.get(id)},llm:{},subagents:{getProvider:()=>({})},tools:{guard:()=>{}},effect:fn=>effects.push(fn()),on:(name,fn)=>{const a=listeners.get(name)??[];a.push(fn);listeners.set(name,a);}};
 const api=await installP1(ctx,{config:p1Config.parse({enabled:true,budgetPath,...overrides}),scope:{projects:[]},store:{},signal:new AbortController().signal,track:f=>f});
 const events=[];const agent={id:'session-main',status:'running',session:{id:'session-main',header:{id:'session-main',origin:'user'},snapshotEvents:()=>events}};agents.set(agent.id,agent);
 const signal=new AbortController().signal;
 const capture=async(turn=1,turnSignal=signal)=>{for(const fn of listeners.get('agent/request')??[])await fn({agent,turn,step:1,signal:turnSignal},async()=>({}));};
 const req={provider:'deepseek-official',model:'deepseek-flash',maxTokens:32,sessionId:agent.id,signal,messages:[{role:'user',content:[{type:'text',text:'Synthetic task'}]}],tools:[]};
 const invoke=async(next,request=req)=>{const chunks=[];for await(const c of listeners.get('llm/stream')[0](request,next))chunks.push(c);return chunks;};
 return {listeners,api,agent,events,capture,invoke,req,budgetPath,dispose:()=>effects.forEach(fn=>fn()),read:async()=>JSON.parse(await readFile(budgetPath,'utf8'))};
}
test('native stream binds a task, persists dispatch, and accounts cache separately',async()=>{const r=await setup();await r.capture();await r.invoke(async function*(){const [e]=(await r.read()).entries;assert.equal(e.phase,'dispatched');yield {type:'usage',usage:{inputTokens:100,cacheReadTokens:9000,cacheWriteTokens:0,outputTokens:10}};yield {type:'finish',reason:{kind:'stop'}};});const [e]=(await r.read()).entries;assert.equal(e.scope.kind,'task');assert.equal(e.scope.rootTurn,1);assert.equal(e.chargeCeilingCny,.00064);assert.equal(e.accounting.usageDetail.cacheReadTokens,9000);});
test('after-dispatch stream exception retains an unknown reservation without retry',async()=>{const r=await setup();await r.capture();let calls=0;await assert.rejects(r.invoke(async function*(){calls++;throw Error('synthetic transport loss');}),/transport loss/);const [e]=(await r.read()).entries;assert.equal(calls,1);assert.equal(e.phase,'unknown');assert.equal(e.status,'reserved');});
test('abort after reserve but before dispatch releases the prepared request',async()=>{const r=await setup();const c=new AbortController();const old=Budget.prototype.reserve;Budget.prototype.reserve=async function(...args){const value=await old.apply(this,args);c.abort();return value;};let calls=0;try{await assert.rejects(r.invoke(async function*(){calls++;},{...r.req,signal:c.signal}),{code:'ABORTED'});}finally{Budget.prototype.reserve=old;}assert.equal(calls,0);assert.equal((await r.read()).entries[0].status,'released');});
test('Chat Completions helper uses reported cache hits and retains old result fields',async()=>{const r=await setup();const b=new Budget(r.budgetPath,{limit:100});const result=await callDeepSeek({model:'deepseek-flash',max_tokens:32,messages:[{role:'user',content:'synthetic'}]},{budget:b,resolveKey:async()=>({value:'synthetic-key'}),transport:async()=>new Response(JSON.stringify({model:'deepseek-flash',choices:[{message:{content:'done'},finish_reason:'stop'}],usage:{prompt_tokens:2000,prompt_cache_hit_tokens:1900,prompt_cache_miss_tokens:100,completion_tokens:10}}))});assert.equal(result.chargeCeilingCny,.000356);assert.equal(result.usage.prompt_tokens,2000);assert.equal((await r.read()).entries[0].accounting.usageDetail.cacheReadTokens,1900);});
test('caller abort before helper dispatch creates no reservation',async()=>{const r=await setup();const b=new Budget(r.budgetPath,{limit:100});const c=new AbortController();let calls=0;await assert.rejects(callDeepSeek({model:'deepseek-flash',max_tokens:32,messages:[{role:'user',content:'synthetic'}]},{budget:b,signal:c.signal,resolveKey:async()=>{c.abort();return {value:'synthetic-key'};},transport:async()=>{calls++;}}),{code:'ABORTED'});assert.equal(calls,0);assert.equal((await r.read()).entries.length,0);});
test('configured per-task cap is enforced before model dispatch',async()=>{const r=await setup({taskLimitCny:.001});await r.capture();let calls=0;await assert.rejects(r.invoke(async function*(){calls++;}),{code:'TASK_BUDGET_EXCEEDED'});assert.equal(calls,0);});
test('plugin shutdown while dispatch marker persists prevents entering the provider',async()=>{const r=await setup();const old=Budget.prototype.markDispatched;Budget.prototype.markDispatched=async function(...args){await old.apply(this,args);r.dispose();};let calls=0;try{await assert.rejects(r.invoke(async function*(){calls++;yield {type:'finish'};}),{code:'ABORTED'});}finally{Budget.prototype.markDispatched=old;}assert.equal(calls,0);assert.equal((await r.read()).entries[0].phase,'unknown');});
test('helper cancellation during dispatch marker prevents HTTP',async()=>{const r=await setup();const c=new AbortController();const old=Budget.prototype.markDispatched;Budget.prototype.markDispatched=async function(...args){await old.apply(this,args);c.abort();};let calls=0;try{await assert.rejects(callDeepSeek({model:'deepseek-flash',max_tokens:32,messages:[{role:'user',content:'synthetic'}]},{budget:new Budget(r.budgetPath,{limit:100}),resolveKey:async()=>({value:'synthetic'}),signal:c.signal,transport:async()=>{calls++;throw Error('must not send');}}),{code:'ABORTED'});}finally{Budget.prototype.markDispatched=old;}assert.equal(calls,0);});
test('known tool and memory-turn calls freeze the original task before asynchronous work',async()=>{const r=await setup();await r.capture();r.events.push({type:'tool/call',data:{turn:1,callId:'owned-call'}});const tool=r.api.scopeForExecution({agent:r.agent,callId:'owned-call',signal:r.req.signal}),memory=r.api.scopeForTurn({agent:r.agent,turn:1});assert.equal(tool.kind,'task');assert.equal(tool.taskId,memory.taskId);assert.equal(r.api.scopeForExecution({agent:r.agent,callId:'unrelated',signal:r.req.signal}).kind,'background');});

async function beforeTool(r, exec) {
  for (const fn of r.listeners.get('tools/pre-execute') ?? []) await fn(exec, async () => ({ kind: 'allow' }));
}
function afterTool(r, exec) {
  for (const fn of r.listeners.get('tools/result') ?? []) fn(exec, { isError: false });
}

test('reused provider callId in a new turn keeps the new explicit turn budget', async () => {
  const r = await setup(); await r.capture(1);
  r.events.push({ type: 'tool/call', data: { turn: 1, callId: 'repeat' } });
  const original = r.api.scopeForExecution({ agent: r.agent, callId: 'repeat', signal: r.req.signal });
  const secondSignal = new AbortController().signal; await r.capture(2, secondSignal);
  r.events.push({ type: 'tool/call', data: { turn: 2, callId: 'repeat' } });
  const second = r.api.scopeForExecution({ agent: r.agent, callId: 'repeat', signal: secondSignal });
  assert.equal(second.kind, 'task'); assert.equal(second.rootTurn, 2);
  assert.notEqual(second.taskId, original.taskId);
  const late = r.api.scopeForExecution({ agent: r.agent, callId: 'repeat', signal: r.req.signal });
  assert.equal(late.kind, 'task'); assert.equal(late.taskId, original.taskId);
});

test('an unknown execution signal cannot borrow the latest matching callId budget', async () => {
  const r = await setup(); await r.capture();
  r.events.push({ type: 'tool/call', data: { turn: 1, callId: 'same-id' } });
  const scope = r.api.scopeForExecution({ agent: r.agent, callId: 'same-id', signal: new AbortController().signal });
  assert.equal(scope.kind, 'background');
});

test('registry token preserves the original task across tool timeout signal replacement', async () => {
  const r = await setup(); await r.capture();
  const exec = { agent: r.agent, callId: 'outer', rootCallId: 'outer', token: Symbol('outer'), signal: r.req.signal };
  await beforeTool(r, exec);
  r.events.push({ type: 'tool/call', data: { turn: 1, callId: 'outer' } });
  const changed = { ...exec, signal: new AbortController().signal };
  const result = r.api.scopeForExecution(changed);
  assert.equal(result.kind, 'task'); assert.equal(result.rootTurn, 1);
  afterTool(r, exec);
  assert.equal(r.api.scopeForExecution(changed).kind, 'background');
  assert.equal(r.api.scopeForExecution(exec).kind, 'background');
});

test('PTC nested tool uses its live parent token and rootCallId without a fake native call event', async () => {
  const r = await setup(); await r.capture();
  const outer = { agent: r.agent, callId: 'run-code', rootCallId: 'run-code', token: Symbol('outer'), signal: r.req.signal };
  await beforeTool(r, outer);
  r.events.push({ type: 'tool/call', data: { turn: 1, callId: 'run-code' } });
  const inner = { agent: r.agent, callId: 'run-code:ptc:1', rootCallId: 'run-code', token: Symbol('inner'), parent: outer.token, signal: new AbortController().signal };
  await beforeTool(r, inner);
  assert.equal(r.api.scopeForExecution(inner).taskId, r.api.scopeForExecution(outer).taskId);
  assert.equal(r.api.scopeForExecution(inner).kind, 'task');
  assert.equal(r.api.scopeForExecution({ ...inner, token: Symbol('other'), rootCallId: 'other-root' }).kind, 'background');
  afterTool(r, inner);
  assert.equal(r.api.scopeForExecution(inner).kind, 'background');
  afterTool(r, outer);
  const nextSignal = new AbortController().signal; await r.capture(2, nextSignal);
  r.events.push({ type: 'tool/call', data: { turn: 2, callId: 'run-code' } });
  assert.equal(r.api.scopeForExecution({ ...inner, token: Symbol('late') }).kind, 'background');
});


test('P1 exposes owner settings and enforces lowered session cap before provider dispatch',async()=>{
 const r=await setup();assert.ok(r.api.budgetSettings,'P1 settings API is required');
 await r.api.budgetSettings.update({sessionId:r.agent.id,limitCny:.01,expectedRevision:0});await r.capture();
 let requests=0;await assert.rejects(r.invoke(async function*(){requests++;}),{code:'SESSION_BUDGET_EXCEEDED'});
 assert.equal(requests,0);assert.equal((await r.read()).entries.length,0);
});
test('session guard blocks later turns but raising cap does not erase previous spend',async()=>{
 const r=await setup();assert.ok(r.api.budgetSettings);
 await r.capture(1);await r.invoke(async function*(){yield {type:'usage',usage:{inputTokens:100,cacheReadTokens:0,cacheWriteTokens:0,outputTokens:10}};yield {type:'finish',reason:{kind:'stop'}};});
 await r.api.budgetSettings.update({sessionId:r.agent.id,limitCny:.01,expectedRevision:0});
 const signal=new AbortController().signal;await r.capture(2,signal);let sent=0;
 await assert.rejects(r.invoke(async function*(){sent++;},{...r.req,signal}),{code:'SESSION_BUDGET_EXCEEDED'});assert.equal(sent,0);
 await r.api.budgetSettings.update({sessionId:r.agent.id,limitCny:20,expectedRevision:1});
 const view=await r.api.budgetSettings.get({sessionId:r.agent.id});assert.equal(view.accountedUpperBoundCny,.00028);
 await r.invoke(async function*(){sent++;yield {type:'usage',usage:{inputTokens:1,cacheReadTokens:0,cacheWriteTokens:0,outputTokens:1}};yield {type:'finish',reason:{kind:'stop'}};},{...r.req,signal});assert.equal(sent,1);
});
