import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setImmediate as yieldToLoop} from 'node:timers/promises';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const load=name=>import(pathToFileURL(require.resolve(name)));
const owned=name=>import(pathToFileURL(join(root,'bundle',name)));
const {Context}=await load('@deepseek-ai/cordis');
const {SessionId}=await load('@deepseek-ai/dsh-session');
const {LlmAdapter,createUserMessage,createMessage}=await load('@deepseek-ai/dsh-llm');
const native={auto:true,thresholdRatio:0.63,retainRatio:0.21,headroomTokens:128,maxTokens:64,compactionRetries:0,maxOverflowRetries:2,modelPolicies:[{provider:'synthetic',model:'small',thresholdRatio:0.7,retainTokens:100}]};
const projectId='00000000-0000-4000-8000-000000000001';let seq=0;
const deferred=()=>Promise.withResolvers();
async function plugin(file){try{return await owned('lib/'+file+'.js');}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('SEP_COMPACTION_GROUP_MISSING');throw error;}}
async function input(){
 const base=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'compaction-'));
 const dirs=Object.fromEntries(['project','sessions','memory','locks','backups','budget','outside'].map(name=>[name,join(base,name)]));for(const path of Object.values(dirs))await mkdir(path);
 return {base,dirs,config:{projects:[{id:projectId,root:dirs.project}],native:structuredClone(native),maxInputBytes:65536},requests:[],behavior:undefined};
}
async function prerequisites(ctx,f){
 for(const name of ['@deepseek-ai/dsh-llm','@deepseek-ai/dsh-session-projection','@deepseek-ai/dsh-session','@deepseek-ai/dsh-token-meter'])await ctx.plugin((await load(name)).default);
 class Adapter extends LlmAdapter{
  async resolveModel(provider,model){return {provider,id:model,name:model,context:{contextWindow:100000}};}
  async *stream(options){f.requests.push(options);await f.behavior?.(options);options.signal?.throwIfAborted();yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text:'checkpoint'}};yield {type:'finish',reason:{kind:'stop'}};}
 }
 ctx.llm.registerAdapter(['synthetic'],new Adapter());
}
function agent(f,cwd=f.dirs.project,origin){const session=f.ctx.sessions.create(SessionId('compact-'+(++seq)),{meta:{cwd,...(origin?{origin}:{}),delegationDepth:0}});return {session,options:{provider:'synthetic',model:'large'}};}
const prefix=()=>({messages:[createUserMessage({content:[{type:'text',text:'history '.repeat(300)}],source:{kind:'user'}})]});
async function setup(options={}){
 const f=await input();f.ctx=new Context();try{await prerequisites(f.ctx,f);await options.before?.(f);f.module=await plugin('compaction-group');f.fiber=f.ctx.plugin(f.module,options.config?.(f)??f.config);await f.fiber;f.engine=f.ctx.compaction;f.agent=agent(f);return f;}
 catch(error){await options.failed?.(f,error);await f.ctx.fiber.dispose();throw error;}
}
async function close(f){await f.ctx.fiber.dispose();}
function history(session){
 session.append('turn/start',{turn:1});const start=session.append('user/message',createUserMessage({content:[{type:'text',text:'history '.repeat(300)}],source:{kind:'user'}}),{surfaceOp:'append'}).seq;
 session.append('step/start',{turn:1,step:1});session.append('request/header',{header:{config:{provider:'synthetic',model:'large',maxTokens:64}},reason:'initial'});
 const end=session.append('assistant/message',{stream:[],turn:1,step:1,message:createMessage({role:'assistant',content:[{type:'text',text:'answer '.repeat(300)}],source:{kind:'model',provider:'synthetic',model:'large'}})},{surfaceOp:'append'}).seq;
 session.append('step/end',{turn:1,step:1});session.append('turn/end',{turn:1,reason:{kind:'completed'}});session.append('turn/start',{turn:2});return [start,end];
}
test('cold group retains explicit nondefault native pressure, retention and model policies',async()=>{
 const f=await setup();try{const config=f.engine.config;for(const key of Object.keys(native))assert.deepEqual(config[key],native[key]);assert.equal(f.ctx.sepCompactionGroup.status().persistentGraph,false);assert.equal(f.requests.length,0);}finally{await close(f);}
});
test('real native region transaction commits exactly one integrity-checked summary without extra model calls',async()=>{
 const f=await setup();try{const result=await f.engine.compactRegion(...history(f.agent.session),f.agent);const events=f.agent.session.snapshotEvents();assert.deepEqual(events.filter(e=>e.type.startsWith('compaction/')).map(e=>e.type),['compaction/start','compaction/summary','compaction/end']);assert(result.summary);assert.equal(f.requests.length,1);assert.equal(f.requests[0].purpose,'compaction');assert.equal(f.ctx.sepCompactionGroup.status().verified,1);assert.equal(f.ctx.sepCompactionGroup.status().activeWorkers,0);assert.equal(f.agent.session.deriveMessages().length,1);}finally{await close(f);}
});
test('out-of-project summary keeps native behavior and creates no integrity receipt',async()=>{
 const f=await setup();try{await f.engine.summarize(prefix(),agent(f,f.dirs.outside));assert.equal(f.requests.length,1);assert.equal(f.ctx.sepCompactionGroup.status().verified,0);}finally{await close(f);}
});
test('native subagent summary keeps its original path without project receipt',async()=>{
 const f=await setup();try{await f.engine.summarize(prefix(),agent(f,f.dirs.project,'subagent'));assert.equal(f.requests.length,1);assert.equal(f.ctx.sepCompactionGroup.status().verified,0);}finally{await close(f);}
});
test('selected input byte limit refuses before a model request or summary commit',async()=>{
 const f=await setup({config:f=>({...f.config,maxInputBytes:1024})});try{await assert.rejects(f.engine.compactRegion(...history(f.agent.session),f.agent),/LOSSLESS_INPUT_LIMIT/);assert.equal(f.requests.length,0);assert.equal(f.agent.session.snapshotEvents().some(e=>e.type==='compaction/summary'),false);assert.equal(f.agent.session.snapshotEvents().at(-1).type,'compaction/end');}finally{await close(f);}
});
test('source mutation while the synthetic model runs is rejected without an integrity receipt',async()=>{
 const f=await setup();try{const selected=prefix();f.behavior=()=>{selected.messages[0]={...selected.messages[0],content:[{type:'text',text:'changed'}]};};await assert.rejects(f.engine.summarize(selected,f.agent),/LOSSLESS_INPUT_CHANGED/);assert.equal(f.ctx.sepCompactionGroup.status().verified,0);}finally{await close(f);}
});
test('native model failure leaves original surface and records a failed transaction end',async()=>{
 const f=await setup();try{f.behavior=()=>{throw Error('synthetic provider failed');};await assert.rejects(f.engine.compactRegion(...history(f.agent.session),f.agent),/synthetic provider failed/);assert.equal(f.agent.session.deriveMessages().length,2);assert.equal(f.agent.session.snapshotEvents().at(-1).type,'compaction/end');assert.equal(f.ctx.sepCompactionGroup.status().verified,0);}finally{await close(f);}
});
test('explicit cancellation reaches the native summarizer and prevents a late summary',async()=>{
 const f=await setup();try{const controller=new AbortController(),reason=Error('synthetic cancel');f.behavior=options=>{assert.equal(options.signal.aborted,false);controller.abort(reason);};await assert.rejects(f.engine.compactRegion(...history(f.agent.session),f.agent,controller.signal),error=>error.name==='LlmError'&&error.code==='UNKNOWN'&&error.message==='synthetic cancel');assert.equal(f.agent.session.snapshotEvents().some(e=>e.type==='compaction/summary'),false);}finally{await close(f);}
});
test('unload cancels accepted summarization, drains its transaction, and retained engine references refuse',async()=>{
 const f=await setup();try{const entered=deferred();f.behavior=options=>new Promise((resolve,reject)=>{entered.resolve();options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});const accepted=f.engine.compactRegion(...history(f.agent.session),f.agent);const rejected=assert.rejects(accepted,error=>error.name==='LlmError'&&error.message==='SEP_COMPACTION_CLOSED');await entered.promise;await f.fiber.dispose();await rejected;assert.equal(f.ctx.get('compaction'),undefined);assert.equal(f.ctx.get('sepCompactionGroup'),undefined);assert.equal(f.agent.session.snapshotEvents().at(-1).type,'compaction/end');assert.equal(f.engine.losslessStatus().activeWorkers,0);await assert.rejects(f.engine.summarize(prefix(),f.agent),{code:'SEP_COMPACTION_CLOSED'});}finally{await close(f);}
});
test('unload does not claim completion before a noncooperative accepted adapter actually settles',async()=>{
 const f=await setup(),entered=deferred(),release=deferred();try{f.behavior=async()=>{entered.resolve();await release.promise;};const accepted=f.engine.summarize(prefix(),f.agent),rejected=assert.rejects(accepted,error=>error.name==='LlmError'&&error.message==='SEP_COMPACTION_CLOSED');await entered.promise;let ended=false;const unloading=Promise.resolve(f.fiber.dispose()).then(()=>{ended=true;});await yieldToLoop();assert.equal(ended,false);release.resolve();await unloading;await rejected;assert.equal(f.engine.losslessStatus().verified,0);}finally{release.resolve();await close(f);}
});
test('a live native compaction engine is refused and retains its object and config',async()=>{
 let nativeConfig;await assert.rejects(setup({before:async f=>{await f.ctx.plugin((await load('@deepseek-ai/dsh-compaction-basic')).default,native);nativeConfig=f.ctx.compaction.config;},failed:async f=>{assert.equal(f.ctx.compaction.config,nativeConfig);assert.equal(f.ctx.get('sepCompactionGroup'),undefined);assert.equal(f.ctx.compaction.config.thresholdRatio,0.63);}}),{code:'SEP_COMPACTION_PROVIDER_CONFLICT'});
});
test('invalid native options roll back the owned service without changing another user plugin',async()=>{
 await assert.rejects(setup({before:f=>f.ctx.provide('syntheticUserPlugin',{value:7}),config:f=>({...f.config,native:{...native,thresholdRatio:0.1}}),failed:async f=>{assert.equal(f.ctx.get('compaction'),undefined);assert.equal(f.ctx.get('sepCompactionGroup'),undefined);assert.equal(f.ctx.syntheticUserPlugin.value,7);}}),/retainRatio/);
});
test('group refuses missing native config and unsupported reset flags before mounting',async()=>{
 for(const change of [f=>({projects:f.config.projects}),f=>({...f.config,reset:true})])await assert.rejects(setup({config:change,failed:f=>assert.equal(f.ctx.get('compaction'),undefined)}),{code:'SEP_COMPACTION_INPUT_INVALID'});
});
test('unload removes owned automatic listener and allows deliberate native remount',async()=>{
 const f=await setup();try{let calls=0;f.engine.compactIfNeeded=async()=>{calls++;return null;};const invoke=()=>f.ctx.waterfall('agent/pre-step',{agent:f.agent,signal:new AbortController().signal},()=>({action:'continue'}));await invoke();assert.equal(calls,1);await f.fiber.dispose();await invoke();assert.equal(calls,1);await f.ctx.plugin((await load('@deepseek-ai/dsh-compaction-basic')).default,native);assert.equal(f.ctx.compaction.config.retainRatio,0.21);}finally{await close(f);}
});
test('official boot Loader cold-replaces the reviewed native row with one group and keeps user rows',async()=>{
 const f=await input();let ctx;try{const {boot}=await load('@deepseek-ai/dsh-app-boot'),file=join(f.base,'cordis.yml');await writeFile(file,'[]\n');
  ctx=await boot('dsh',file,[{insert:[{id:'native-compression',name:pathToFileURL(require.resolve('@deepseek-ai/dsh-compaction-basic')).href,config:native,disabled:true},{id:'sep-compression',name:pathToFileURL(join(root,'bundle/lib/compaction-group.js')).href,config:f.config}]}],async inner=>{await prerequisites(inner,f);inner.provide('syntheticUserPlugin',{value:9});});f.ctx=ctx;f.engine=ctx.compaction;f.agent=agent(f);
  assert(f.engine,'SEP_COMPACTION_GROUP_MISSING');await f.engine.compactRegion(...history(f.agent.session),f.agent);assert.equal(ctx.sepCompactionGroup.status().verified,1);const entries=[...ctx.loader.entries()];assert.equal(entries.find(e=>e.options.id==='native-compression').fiber,undefined);await entries.find(e=>e.options.id==='sep-compression').fiber.dispose();assert.equal(ctx.get('compaction'),undefined);assert.equal(ctx.syntheticUserPlugin.value,9);assert.equal(entries.find(e=>e.options.id==='native-compression').options.disabled,true);
 }finally{await ctx?.fiber.dispose();}
});
async function runtimeInput(){const f=await input();const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');const control=await openControl({storageRoot:f.dirs.memory,initialize:true});await control.close();f.openControl=openControl;f.budgetPath=join(f.dirs.budget,'ledger.json');f.bytes=Buffer.from(JSON.stringify({version:3,currency:'CNY',limit:100,initialSpent:1,entries:[],taskLimits:{},childBindings:{},reconciliations:[],legacyInitialSpent:false,sessionDefault:{limitCny:100,revision:1},sessionLimits:{}})+'\n');await writeFile(f.budgetPath,f.bytes);
 f.runtimeConfig={profile:{selection:{projectId,roots:{sessions:f.dirs.sessions,memory:f.dirs.memory,locks:f.dirs.locks,backups:f.dirs.backups},budgetPath:f.budgetPath,credentialRef:'DEEPSEEK_API_KEY'},recovery:{maxFileBytes:65536,maxTotalBytes:1048576,maxEntries:64,retentionMs:86400000}},compaction:{native:structuredClone(native),maxInputBytes:65536}};return f;}
async function runtimePrerequisites(ctx,f){await prerequisites(ctx,f);for(const name of ['@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-agent'])await ctx.plugin((await load(name)).default);await ctx.plugin((await load('@deepseek-ai/dsh-agent-loop')).default,{agents:[]});await ctx.plugin((await load('@deepseek-ai/dsh-sandbox-policy')).default,{mode:'workspace-write',workspaceRoot:f.dirs.project});await ctx.plugin(await owned('lib/recovery-authority.js'),{controlRoot:join(f.base,'authority')});await ctx.recoveryHost.registerProject({id:projectId,root:f.dirs.project});await ctx.plugin((await load('@deepseek-ai/dsh-storage')).default);await ctx.plugin(await load('@deepseek-ai/dsh-storage-json'),{root:f.dirs.memory});await ctx.plugin(await load('@deepseek-ai/dsh-storage-domain'),{backend:'json'});}
async function runtimeSetup(f){f.ctx=new Context();await runtimePrerequisites(f.ctx,f);f.module=await plugin('protected-runtime');f.fiber=f.ctx.plugin(f.module,f.runtimeConfig);await f.fiber;f.agent=(await f.ctx.agents.create({sessionId:SessionId('runtime-'+(++seq)),meta:{cwd:f.dirs.project,delegationDepth:0},agentOptions:{provider:'synthetic',model:'large'}})).agent;f.engine=f.ctx.compaction;return f;}
test('grouped protected runtime keeps an integrity-checked native summary durable after cold provider reload',async()=>{
 const f=await runtimeInput();try{await runtimeSetup(f);const plan=await f.ctx.sepProtectedProfile.review();await f.ctx.sepProtectedProfile.confirm({planHash:plan.planHash});await f.engine.compactRegion(...history(f.agent.session),f.agent);await f.ctx.sessions.flush(f.agent.session);assert.equal(f.ctx.sepCompactionGroup.status().verified,1);await f.fiber.dispose();f.fiber=f.ctx.plugin(f.module,f.runtimeConfig);await f.fiber;const handle=await f.ctx.sessionPersistence.open(f.agent.session.id,'read');try{const records=await handle.read();assert.equal(records.events.filter(e=>e.type==='compaction/summary').length,1);assert.equal(records.events.at(-1).type,'compaction/end');}finally{await handle.close();}assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await f.ctx?.fiber.dispose();}
});
test('failed compaction child rolls back the whole owned profile and releases its governance lease',async()=>{
 const f=await runtimeInput();f.runtimeConfig.compaction.native={...native,thresholdRatio:0.1};try{await assert.rejects(runtimeSetup(f),/retainRatio/);for(const name of ['compaction','fs','sessionPersistence','sepStorageControl','sepProtectedProfile','sepProtectedRuntime'])assert.equal(f.ctx.get(name),undefined,name);assert(f.ctx.sessions);const control=await f.openControl({storageRoot:f.dirs.memory});await control.close();assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await f.ctx?.fiber.dispose();}
});
test('whole group unload drains compaction before Session and P2 ownership are released',async()=>{
 const f=await runtimeInput(),entered=deferred(),release=deferred();try{await runtimeSetup(f);const persistence=f.ctx.sessionPersistence;f.behavior=async()=>{entered.resolve();await release.promise;};const accepted=f.engine.compactRegion(...history(f.agent.session),f.agent),rejected=assert.rejects(accepted,error=>error.name==='LlmError'&&error.message==='SEP_COMPACTION_CLOSED');await entered.promise;let ended=false;const unloading=Promise.resolve(f.fiber.dispose()).then(()=>{ended=true;});await yieldToLoop();assert.equal(ended,false);const handle=await persistence.open(f.agent.session.id,'read');await handle.close();await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});release.resolve();await unloading;await rejected;for(const name of ['compaction','fs','sessionPersistence','sepStorageControl','sepProtectedRuntime'])assert.equal(f.ctx.get(name),undefined,name);const control=await f.openControl({storageRoot:f.dirs.memory});await control.close();assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{release.resolve();await f.ctx?.fiber.dispose();}
});
test('manual compaction reserves native maintenance synchronously before returning its promise',async()=>{
 const f=await setup();try{let entered=false;const explicit={...f.agent,runMaintenance:work=>{entered=true;return work(new AbortController().signal);}};const result=f.engine.compactNow(explicit,new AbortController().signal);assert.equal(entered,true,'Native maintenance reservation was deferred');assert.equal(await result,null);assert.equal(f.requests.length,0);}finally{await close(f);}
});
test('official boot Loader composes one protected runtime row and preserves disabled native configs',async()=>{
 const f=await runtimeInput();let ctx;try{const {boot}=await load('@deepseek-ai/dsh-app-boot'),file=join(f.base,'cordis.yml');await writeFile(file,'[]\n');const rows=[
  {id:'native-files',name:pathToFileURL(require.resolve('@deepseek-ai/dsh-fs-local')).href,config:{cwd:f.dirs.project},disabled:true},
  {id:'native-sessions',name:pathToFileURL(require.resolve('@deepseek-ai/dsh-session-persistence-jsonl')).href,config:{root:f.dirs.sessions,compression:'none'},disabled:true},
  {id:'native-compaction',name:pathToFileURL(require.resolve('@deepseek-ai/dsh-compaction-basic')).href,config:structuredClone(native),disabled:true},
  {id:'sep-runtime',name:pathToFileURL(join(root,'bundle/lib/protected-runtime.js')).href,config:f.runtimeConfig}];
  ctx=await boot('dsh',file,[{insert:rows}],async inner=>{await runtimePrerequisites(inner,f);inner.provide('syntheticUserPlugin',{value:11});});f.ctx=ctx;assert(ctx.get('sepProtectedRuntime'),'SEP_RUNTIME_MISSING');f.agent=(await ctx.agents.create({sessionId:SessionId('loader-runtime-'+(++seq)),meta:{cwd:f.dirs.project,delegationDepth:0},agentOptions:{provider:'synthetic',model:'large'}})).agent;f.engine=ctx.compaction;
  await f.engine.compactRegion(...history(f.agent.session),f.agent);await ctx.sessions.flush(f.agent.session);assert.equal(ctx.sepCompactionGroup.status().verified,1);const entries=[...ctx.loader.entries()];assert.deepEqual(entries.find(e=>e.options.id==='native-compaction').options.config,native);assert.equal(entries.find(e=>e.options.id==='native-sessions').fiber,undefined);await entries.find(e=>e.options.id==='sep-runtime').fiber.dispose();for(const name of ['compaction','fs','sessionPersistence','sepStorageControl','sepProtectedRuntime'])assert.equal(ctx.get(name),undefined,name);assert.equal(ctx.syntheticUserPlugin.value,11);assert.equal(entries.find(e=>e.options.id==='native-compaction').options.disabled,true);const control=await f.openControl({storageRoot:f.dirs.memory});await control.close();assert.deepEqual(await readFile(f.budgetPath),f.bytes);
 }finally{await ctx?.fiber.dispose();}
});
