import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const load=name=>import(pathToFileURL(require.resolve(name)));
const owned=name=>import(pathToFileURL(join(root,'bundle',name)));
const {boot}=await load('@deepseek-ai/dsh-app-boot');
const {SessionId}=await load('@deepseek-ai/dsh-session');
const {LlmAdapter,createUserMessage}=await load('@deepseek-ai/dsh-llm');
const deferred=()=>Promise.withResolvers();let sequence=0;
async function setup({p1={},checks=[],shutdownMs=100,budget='valid',activate=true}={}){
 const url=pathToFileURL(join(root,'bundle/lib/p1-runtime.js')).href;
 try{await import(url);}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('SEP_P1_RUNTIME_MISSING');throw error;}
 const base=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'p1-'));
 const dirs=Object.fromEntries(['project','sessions','memory','locks','backups','budget'].map(name=>[name,join(base,name)]));for(const dir of Object.values(dirs))await mkdir(dir);
 const file=join(base,'cordis.yml');await writeFile(file,'[]\n');
 const budgetPath=join(dirs.budget,'ledger.json');const bytes=Buffer.from(JSON.stringify({version:3,currency:'CNY',limit:100,initialSpent:1,entries:[],taskLimits:{},childBindings:{},reconciliations:[],legacyInitialSpent:false,sessionDefault:{limitCny:100,revision:1},sessionLimits:{}})+'\n');
 if(budget!=='missing')await writeFile(budgetPath,budget==='invalid'?'{}':bytes);
 const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');const seed=await openControl({storageRoot:dirs.memory,initialize:true});await seed.close();
 const f={base,dirs,budgetPath,bytes,openControl,requests:[],behavior:undefined};
 const id='00000000-0000-4000-8000-000000000013';
 const nativeUrl=pathToFileURL(require.resolve('@deepseek-ai/dsh-compaction-basic')).href;
 try{
 f.ctx=await boot('dsh',file,[{insert:[{id:'native',name:nativeUrl,config:{auto:true,thresholdRatio:.63,retainRatio:.21,maxTokens:64,compactionRetries:0,maxOverflowRetries:2}}]}],async ctx=>{
  for(const name of ['@deepseek-ai/dsh-llm','@deepseek-ai/dsh-session-projection','@deepseek-ai/dsh-session','@deepseek-ai/dsh-token-meter','@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-agent'])await ctx.plugin((await load(name)).default);
  await ctx.plugin((await load('@deepseek-ai/dsh-agent-loop')).default,{agents:[]});
  for(const name of ['@deepseek-ai/dsh-subagent','@deepseek-ai/dsh-subagent-spawn-in-process','@deepseek-ai/dsh-user-approval']){const module=await load(name);await ctx.plugin(module.default??module);}
  await ctx.plugin((await load('@deepseek-ai/dsh-sandbox-policy')).default,{mode:'workspace-write',workspaceRoot:dirs.project});
  await ctx.plugin(await owned('lib/recovery-authority.js'),{controlRoot:join(base,'authority')});await ctx.recoveryHost.registerProject({id,root:dirs.project});
  await ctx.plugin((await load('@deepseek-ai/dsh-storage')).default);await ctx.plugin(await load('@deepseek-ai/dsh-storage-json'),{root:dirs.memory});await ctx.plugin(await load('@deepseek-ai/dsh-storage-domain'),{backend:'json'});
  class Adapter extends LlmAdapter{
   async resolveModel(provider,model){return {provider,id:model,name:model,context:{contextWindow:100000}};}
   async *stream(options){f.requests.push(options);await f.behavior?.(options);options.signal?.throwIfAborted();if(f.customStream&&await f.customStream(options)){yield* f.customChunks;return;}yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'checkpoint'};yield {type:'block-end',index:0,block:{type:'text',text:'checkpoint'}};yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:'stop'}};}
  }
  ctx.llm.registerAdapter(['deepseek-official','synthetic'],new Adapter());
 });
 f.entry=[...f.ctx.loader.entries()].find(e=>e.options.id==='native');f.raw=structuredClone(f.entry.options);
 f.input={profile:{selection:{projectId:id,roots:{sessions:dirs.sessions,memory:dirs.memory,locks:dirs.locks,backups:dirs.backups},budgetPath,credentialRef:'DEEPSEEK_API_KEY'},recovery:{maxFileBytes:65536,maxTotalBytes:1048576,maxEntries:64,retentionMs:86400000}},p1:{enabled:true,budgetPath,...checks.length?{standards:[{root:dirs.project,checks}]}:{},...p1},compaction:{nativeEntryId:f.entry.id,maxInputBytes:65536},shutdownMs};
 const runtime=await import(url);let mountError;f.fiber=f.ctx.plugin({...runtime,async apply(ctx,input){try{return await runtime.apply(ctx,input);}catch(error){mountError=error;throw error;}}},f.input);await f.fiber;if(mountError)throw mountError;f.api=f.ctx.sepP1Runtime;assert(f.api,'SEP_P1_RUNTIME_MISSING');
 if(activate){const plan=await f.api.review();await f.api.activate({planHash:plan.planHash});}
 return f;
 }catch(error){await f.ctx?.fiber.dispose();throw error;}
}
async function close(f){await f.api.close();await f.fiber.dispose();await f.ctx.fiber.dispose();}
async function agent(f){return (await f.ctx.agents.create({sessionId:SessionId('p1-'+(++sequence)),meta:{cwd:f.dirs.project,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64}})).agent;}
async function model(f,extra={}){const options={provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64,messages:[createUserMessage({content:[{type:'text',text:'synthetic'}],source:{kind:'user'}})],tools:[],signal:new AbortController().signal,...extra};for await(const chunk of f.api.stream(options)){if(chunk.type==="finish"&&["error","aborted"].includes(chunk.reason.kind))throw Error(chunk.reason.failure?.message??chunk.reason.kind);}return options;}
const code=expected=>error=>error.code===expected||error.cause?.code===expected||error.message.includes(expected);

test('cold review does not rewrite existing ledger; activation preserves native options',async()=>{const f=await setup({activate:false});try{const plan=await f.api.review();assert.match(plan.planHash,/^[a-f0-9]{64}$/);assert.deepEqual(await readFile(f.budgetPath),f.bytes);assert.deepEqual(f.entry.options,f.raw);await f.api.activate({planHash:plan.planHash});assert.equal(f.ctx.compaction.config.thresholdRatio,.63);assert.equal(f.api.status().phase,'active');assert.equal(f.api.status().completeProfileStatus,'blocked');assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await close(f);}});
test('invalid confirmation refuses before native switch',async()=>{const f=await setup({activate:false});try{await f.api.review();await assert.rejects(f.api.activate({planHash:undefined}),code('SEP_P1_PLAN_INVALID'));await assert.rejects(f.api.activate({planHash:'0'.repeat(64)}),code('SEP_P1_PLAN_INVALID'));assert.deepEqual(f.entry.options,f.raw);}finally{await close(f);}});
test('P1 ledger must be exactly the reviewed Profile ledger',async()=>{await assert.rejects(setup({p1:{budgetPath:'D:\\other-ledger.json'}}),code('SEP_P1_BUDGET_MISMATCH'));});
test('missing and malformed ledgers cannot be initialized by P1 composition',async()=>{for(const budget of ['missing','invalid'])await assert.rejects(setup({budget}),error=>/BUDGET|BINDING/.test(error.message));});
test('model requests cannot run before activation',async()=>{const f=await setup({activate:false});try{await assert.rejects(model(f),code('SEP_P1_NOT_ACTIVE'));assert.equal(f.requests.length,0);assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await close(f);}});
test('actual native LLM stream settles a session-bound reservation without resetting previous consumption',async()=>{const f=await setup();try{const a=await agent(f);await model(f,{sessionId:a.id});const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.initialSpent,1);assert.equal(ledger.sessionDefault.limitCny,100);assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].scope.rootSessionId,a.id);assert.equal(ledger.entries[0].status,'settled');}finally{await close(f);}});
test('provider model output and input guards reject before adapter dispatch',async()=>{const f=await setup({p1:{profileLimits:{maxOutputTokens:64,maxInputBytes:4096}}});try{for(const [extra,c] of [[{provider:'synthetic'},'P1_MODEL_NOT_ALLOWED'],[{model:'other'},'P1_MODEL_NOT_ALLOWED'],[{maxTokens:65},'P1_OUTPUT_LIMIT'],[{messages:[{role:'user',content:[{type:'text',text:'x'.repeat(5000)}]}]},'P1_INPUT_LIMIT']])await assert.rejects(model(f,extra),code(c));assert.equal(f.requests.length,0);assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await close(f);}});
test('transport failure keeps a durable unknown reservation and does not stop future unrelated work',async()=>{const f=await setup();try{f.behavior=()=>{throw Error('synthetic transport failure');};await assert.rejects(model(f),/synthetic transport failure/);f.behavior=undefined;await model(f);const ledger=JSON.parse(await readFile(f.budgetPath));assert.deepEqual(ledger.entries.map(e=>[e.status,e.phase]),[['reserved','unknown'],['settled','dispatched']]);assert.equal(f.api.status().phase,'active');}finally{await close(f);}});
test('cooperative close cancels active model and restores native before releasing P2 lease',async()=>{const f=await setup(),entered=deferred();try{f.behavior=o=>{entered.resolve();return new Promise(resolve=>o.signal.addEventListener('abort',resolve,{once:true}));};const rejected=assert.rejects(model(f),error=>/abort|SEP_P1_CLOSED/i.test(error.message));await entered.promise;const receipt=await f.api.close();await rejected;assert.equal(receipt.status,'pass');assert.equal(receipt.phase,'closed');assert.deepEqual(f.entry.options,f.raw);const control=await f.openControl({storageRoot:f.dirs.memory});await control.close();await assert.rejects(model(f),code('SEP_P1_CLOSED'));}finally{await close(f);}});
test('noncooperative model deadline reports blocked and retains Session and P2 until real settlement',async()=>{const f=await setup(),entered=deferred(),release=deferred();try{const a=await agent(f);f.behavior=async()=>{entered.resolve();await release.promise;};const rejected=assert.rejects(model(f,{sessionId:a.id}),error=>/abort|SEP_P1_CLOSED/i.test(error.message));await entered.promise;const receipt=await f.api.close();assert.equal(receipt.status,'blocked');assert.equal(receipt.resourcesRetained,true);assert.equal(receipt.phase,'draining');assert.equal(f.ctx.sessions.get(a.id),a.session);await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});assert.equal(f.api.status().pending.model,1);release.resolve();await rejected;assert.equal((await f.api.close()).status,'pass');const control=await f.openControl({storageRoot:f.dirs.memory});await control.close();assert.equal(JSON.parse(await readFile(f.budgetPath)).entries[0].phase,'unknown');}finally{release.resolve();await close(f);}});
test('native restoration conflict retains protected resources and permits controlled retry',async()=>{const f=await setup();try{f.entry.options.config.thresholdRatio=.68;let receipt=await f.api.close();assert.equal(receipt.status,'blocked');assert.equal(receipt.phase,'restore-blocked');assert.equal(f.entry.options.config.thresholdRatio,.68);await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});f.entry.options.config=structuredClone(f.raw.config);receipt=await f.api.close();assert.equal(receipt.status,'pass');assert.deepEqual(f.entry.options,f.raw);}finally{await close(f);}});
test('real suite_delegate native spawn creates two bounded read-only tasks with retained reports',async()=>{const f=await setup();try{const a=await agent(f),tool=f.ctx.tools.get('suite_delegate',a);assert(tool);const exec={agent:a,signal:new AbortController().signal,callId:'synthetic-delegate'};const result=await tool.execute({tasks:[{label:'A',prompt:'Return A'},{label:'B',prompt:'Return B'}]},exec);assert.equal(result.publicationPersisted,true);assert.equal(result.runs.length,2);assert(result.runs.every(r=>r.status==='completed'&&r.childSessionId));const page=await f.ctx.tools.get('suite_tasks',a).execute({},exec);assert.equal(page.total,2);assert.equal(f.api.status().p1.active,0);}finally{await close(f);}});
test('third managed child is refused while two accepted children are actually in flight',async()=>{const f=await setup(),entered=deferred(),release=deferred();try{const a=await agent(f),tool=f.ctx.tools.get('suite_delegate',a),exec={agent:a,signal:new AbortController().signal,callId:'concurrent'};let count=0;f.behavior=async()=>{if(++count===2)entered.resolve();await release.promise;};const first=tool.execute({tasks:[{label:'A',prompt:'Return A'},{label:'B',prompt:'Return B'}]},exec);await entered.promise;await assert.rejects(tool.execute({tasks:[{label:'C',prompt:'Return C'}]},exec),code('P1_CONCURRENCY_LIMIT'));release.resolve();assert((await first).runs.every(r=>r.status==='completed'));}finally{release.resolve();await close(f);}});
test('controlled group unload restores native and leaves the original ledger intact',async()=>{const f=await setup();try{const old=f.api;await f.fiber.dispose();assert.equal(old.status().phase,'closed');assert.deepEqual(f.entry.options,f.raw);assert.deepEqual(await readFile(f.budgetPath),f.bytes);const control=await f.openControl({storageRoot:f.dirs.memory});await control.close();}finally{await f.ctx.fiber.dispose();}});

test('ordinary accepted tool is drained through final registry result before Profile release',async()=>{
 const f=await setup(),entered=deferred(),release=deferred();try{
  const a=await agent(f);f.ctx.tools.register({name:'synthetic_wait',description:'Synthetic gate',parameters:{type:'object'},output:{schema:{type:'object'},render:()=>[]},async execute(){entered.resolve();await release.promise;return {done:true};}});
  const work=f.ctx.tools.execute({name:'synthetic_wait',arguments:{},agent:a,signal:new AbortController().signal,callId:'wait-1'});await entered.promise;
  const receipt=await f.api.close();assert.equal(receipt.status,'blocked');assert.equal(receipt.resourcesRetained,true);assert.equal(receipt.pending.tool,1);await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});
  release.resolve();await work;assert.equal((await f.api.close()).status,'pass');
 }finally{release.resolve();await close(f);}
});
test('actual parent Agent loop attributes spawned children to the same durable root turn',async()=>{
 const f=await setup();try{
  const a=await agent(f);let offered=false;
  f.customStream=options=>{if(options.sessionId!==a.id||offered)return false;offered=true;const args=JSON.stringify({tasks:[{label:'A',prompt:'Return A'},{label:'B',prompt:'Return B'}]});f.customChunks=[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id:'delegate-1',name:'suite_delegate',argumentsDelta:args},{type:'block-end',index:0,block:{type:'tool-call',id:'delegate-1',name:'suite_delegate',arguments:args}},{type:'usage',usage:{inputTokens:10,outputTokens:2}},{type:'finish',reason:{kind:'tool-calls'}}];return true;};
  a.followup(createUserMessage({content:[{type:'text',text:'Run synthetic delegation'}],source:{kind:'user'}}));await a.whenIdle();
  const ledger=JSON.parse(await readFile(f.budgetPath)),bindings=Object.values(ledger.childBindings);
  assert.equal(bindings.length,2);assert(bindings.every(v=>v.rootSessionId===a.id&&v.rootTurn===1&&v.taskId===bindings[0].taskId));assert.equal(ledger.entries.length,4);assert(ledger.entries.every(e=>e.scope.taskId===bindings[0].taskId&&e.status==='settled'));
 }finally{await close(f);}
});
test('suite child tool filter denies mutation while an independent trusted child keeps native permissions',async()=>{
 const f=await setup();try{
  const a=await agent(f);let mutations=0;const denied=[];
  f.ctx.tools.register({name:'synthetic_mutate',description:'Synthetic mutation counter',parameters:{type:'object'},output:{schema:{type:'object'},render:()=>[]},async execute(){mutations++;return {done:true};}});
  f.behavior=async options=>{const child=f.ctx.agents.get(options.sessionId);if(child?.session.header.origin==='subagent')denied.push(await f.ctx.tools.execute({name:'synthetic_mutate',arguments:{},agent:child,signal:options.signal,callId:'managed-mutation'}));};
  const exec={agent:a,signal:new AbortController().signal,callId:'readonly'};const result=await f.ctx.tools.get('suite_delegate',a).execute({tasks:[{label:'A',prompt:'Return A'}]},exec);assert.equal(result.runs[0].status,'completed');assert.equal(denied.length,1);assert.equal(denied[0].isError,true);assert.equal(mutations,0);
  const trusted=(await f.ctx.agents.create({sessionId:SessionId('trusted-'+(++sequence)),meta:{cwd:f.dirs.project,origin:'subagent',parentSession:a.id,delegationDepth:1},agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64}})).agent;
  const allowed=await f.ctx.tools.execute({name:'synthetic_mutate',arguments:{},agent:trusted,signal:new AbortController().signal,callId:'trusted-mutation'});assert.equal(allowed.isError,false);assert.equal(mutations,1);
 }finally{await close(f);}
});
test('managed timeout persists timed_out and conservative unknown model accounting',async()=>{
 const f=await setup({p1:{timeoutMs:100}});try{const a=await agent(f);f.behavior=options=>new Promise(resolve=>options.signal.addEventListener('abort',resolve,{once:true}));const result=await f.ctx.tools.get('suite_delegate',a).execute({tasks:[{label:'timeout',prompt:'Wait'}]},{agent:a,signal:new AbortController().signal,callId:'timeout'});assert.equal(result.runs[0].status,'timed_out');assert.equal(result.publicationPersisted,true);assert.equal(JSON.parse(await readFile(f.budgetPath)).entries[0].phase,'unknown');}finally{await close(f);}
});
test('native compaction model call uses the same preserved shared ledger',async()=>{
 const f=await setup();try{const a=await agent(f);await f.ctx.compaction.summarize({messages:[createUserMessage({content:[{type:'text',text:'history '.repeat(300)}],source:{kind:'user'}})]},a);const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.initialSpent,1);assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].status,'settled');assert.equal(ledger.entries[0].scope.category,'compaction');}finally{await close(f);}
});
test('frozen delivery standard permits only two reworks in a real Agent turn',async()=>{
 const f=await setup({checks:[{id:'answer',kind:'answer_contains',text:'required text absent'}]});try{const a=await agent(f);a.followup(createUserMessage({content:[{type:'text',text:'Produce deliverable'}],source:{kind:'user'}}));await a.whenIdle().catch(()=>{});const page=await f.ctx.tools.get('suite_review',a).execute({},{agent:a,signal:new AbortController().signal,callId:'review'});assert.equal(page.status,'fail');assert.equal(f.requests.length,3);const session=a.session.events??a.session;const memory=JSON.parse(await readFile(join(f.dirs.memory,'dsh_enhancement_suite_v1.json')));const reviews=Object.values(memory.tables.projects)[0].workflow.reviews;assert.equal(reviews.filter(r=>r.gate).length,3);assert.equal(new Set(reviews.map(r=>r.standardSha256)).size,1);}finally{await close(f);}
});
