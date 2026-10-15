import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,realpath,link} from 'node:fs/promises';
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
async function setup({p1={},checks=[],shutdownMs=5000,budget='valid',activate=true,business={}}={}){
 const url=pathToFileURL(join(root,'bundle/lib/controlled-installation.js')).href;
 try{await import(url);}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('SEP_CONTROLLED_INSTALLATION_MISSING');throw error;}
 const base=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'controlled-'));
 const dirs=Object.fromEntries(['project','sessions','memory','locks','backups','budget'].map(name=>[name,join(base,name)]));for(const dir of Object.values(dirs))await mkdir(dir);await mkdir(join(dirs.project,'资料'));await writeFile(join(dirs.project,'资料/说明.md'),'水星计划 synthetic-secret-body 用于检索测试');
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
  const {HostConnectionService}=await load('@deepseek-ai/dsh-client-connection');f.connection=new HostConnectionService(ctx,[],undefined);ctx.provide('webServer',{host:'127.0.0.1'});
  class Adapter extends LlmAdapter{
   async resolveModel(provider,model){return {provider,id:model,name:model,context:{contextWindow:100000}};}
   async *stream(options){f.requests.push(options);await f.behavior?.(options);options.signal?.throwIfAborted();if(f.customStream&&await f.customStream(options)){yield* f.customChunks;return;}yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'checkpoint'};yield {type:'block-end',index:0,block:{type:'text',text:'checkpoint'}};yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:'stop'}};}
  }
  ctx.llm.registerAdapter(['deepseek-official','synthetic'],new Adapter());
 });
 f.entry=[...f.ctx.loader.entries()].find(e=>e.options.id==='native');f.raw=structuredClone(f.entry.options);
 f.input={profile:{selection:{projectId:id,roots:{sessions:dirs.sessions,memory:dirs.memory,locks:dirs.locks,backups:dirs.backups},budgetPath,credentialRef:'DEEPSEEK_API_KEY'},recovery:{maxFileBytes:65536,maxTotalBytes:1048576,maxEntries:64,retentionMs:86400000}},p1:{enabled:true,budgetPath,...checks.length?{standards:[{root:dirs.project,checks}]}:{},...p1},business:{sources:['资料'],capture:false,...business},compaction:{nativeEntryId:f.entry.id,maxInputBytes:65536},shutdownMs};
 f.mount=async()=>{const runtime=await import(url);let mountError;f.fiber=f.ctx.plugin({...runtime,async apply(ctx,input){try{return await runtime.apply(ctx,input);}catch(error){mountError=error;throw error;}}},f.input);await f.fiber;if(mountError)throw mountError;f.api=f.ctx.sepControlledInstallation;assert(f.api,'SEP_CONTROLLED_INSTALLATION_MISSING');
 if(activate){const plan=await f.api.review();await f.api.activate({planHash:plan.planHash});}
 };f.input={runtime:f.input,ui:{enabled:true,requestTimeoutMs:5000}};await f.mount();
 return f;
 }catch(error){await f.ctx?.fiber.dispose();throw error;}
}
async function close(f){await f.api.close();await f.fiber.dispose();await f.ctx.fiber.dispose();}
async function agent(f){let agent;const owner=f.ctx.plugin({name:'synthetic-agent-owner-'+(++sequence),inject:['agents'],async apply(child){agent=(await child.agents.create({sessionId:SessionId('controlled-'+(++sequence)),meta:{cwd:f.dirs.project,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64}})).agent;}});await owner;(f.agentOwners??=new WeakMap()).set(agent,owner);return agent;}
async function model(f,extra={}){const options={provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64,messages:[createUserMessage({content:[{type:'text',text:'synthetic'}],source:{kind:'user'}})],tools:[],signal:new AbortController().signal,...extra};for await(const chunk of f.api.stream(options)){if(chunk.type==="finish"&&["error","aborted"].includes(chunk.reason.kind))throw Error(chunk.reason.failure?.message??chunk.reason.kind);}return options;}
const code=expected=>error=>error.code===expected||error.cause?.code===expected||error.message.includes(expected);


const exec=a=>({agent:a,signal:new AbortController().signal,callId:"business-"+(++sequence)});
const call=(f,a,name,args)=>f.ctx.tools.get("suite_"+name,a).execute(args,exec(a));
function say(a,text){a.session.append("turn/start",{});const m=createUserMessage({content:[{type:"text",text}],source:{kind:"user"}});a.session.append("user/message",m,{surfaceOp:"append"});return m;}
async function save(f,a,text,category){say(a,text);return call(f,a,"memory_save",{text,category,status:"confirmed",eventId:"save-"+(++sequence),reason:"explicit direct evidence"});}

export {setup,close,agent,model,exec,call,say,save,code,deferred,load,owned,require,root};
