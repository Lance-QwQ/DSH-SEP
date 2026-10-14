import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
import {openTrustedProject} from '../transactions/transaction-store.mjs';
import {openMacManagedProject} from '../transactions/mac-managed-project.mjs';
import {wrapManagedProject} from '../lifecycle/managed-project-lifecycle.mjs';
import {load,prerequisites,require} from './host-modules.mjs';
import {createProfilePlugin} from './profile-plugin.mjs';
import * as runtime from './runtime.mjs';
const {Context}=await load('@deepseek-ai/cordis'),{SessionId}=await load('@deepseek-ai/dsh-session'),{ToolCallId,createUserMessage,LlmAdapter}=await load('@deepseek-ai/dsh-llm');
let n=0;const sha=b=>createHash('sha256').update(b).digest('hex');
export async function setup({activate=true,base:prior,shutdownMs=5000,business={},p1={},runtimeOptions={},loader=false}={}){
 assert(process.env.SEP_MAC_BUSINESS_TEST_ROOT);assert(process.env.SEP_MAC_TREE_HELPER);const baseRoot=resolve(process.env.SEP_MAC_BUSINESS_TEST_ROOT);await mkdir(baseRoot,{recursive:true,mode:0o700});
 const base=prior?.base??await mkdtemp(join(baseRoot,'business-')),root=join(base,'managed'),source=join(base,'source'),memory=join(base,'memory'),locks=join(base,'locks'),budgetPath=join(base,'budget/ledger.json');
 for(const path of[root,source,memory,locks,join(base,'budget')])await mkdir(path,{recursive:true,mode:0o700});if(!prior)await writeFile(join(source,'data.txt'),'original',{mode:0o600});
 const helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=sha(await readFile(helperPath));let ctx;
 if(loader){const {boot}=await load('@deepseek-ai/dsh-app-boot'),file=join(base,'cordis.yml');await writeFile(file,'[]\n');ctx=await boot('dsh',file,[],prerequisites);}else{ctx=new Context();await prerequisites(ctx);}
 await ctx.plugin((await load('@deepseek-ai/dsh-working-directory')).default,{defaultDirectory:source});
 for(const name of ['@deepseek-ai/dsh-token-meter','@deepseek-ai/dsh-subagent','@deepseek-ai/dsh-subagent-spawn-in-process','@deepseek-ai/dsh-user-approval','@deepseek-ai/dsh-storage']){const m=await load(name);await ctx.plugin(m.default??m);}
 await ctx.plugin(await load('@deepseek-ai/dsh-storage-json'),{root:memory});await ctx.plugin(await load('@deepseek-ai/dsh-storage-domain'),{backend:'json'});
 const native=createProjectTree({helperPath,helperSha256,lockPath:join(root,'.native.lock')});
 const plugin=createProfilePlugin(async input=>wrapManagedProject(await(process.platform==='darwin'?openMacManagedProject(input):openTrustedProject({...input,io:native}))));
 await ctx.plugin(plugin,{root,source,helperPath,helperSha256});
 let providerCalls=0,behavior;const agentErrors=[];ctx.on('agent/error',payload=>{agentErrors.push({code:payload.error?.code,message:payload.error?.message});});
 class Adapter extends LlmAdapter{async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:100000}};}async *stream(options){providerCalls++;const response=await behavior?.(options),text=typeof response==='string'?response:'synthetic';options.signal?.throwIfAborted();yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text};yield {type:'block-end',index:0,block:{type:'text',text}};yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:'stop'}};}}
 ctx.llm.registerAdapter(['deepseek-official'],new Adapter());
 try{if(loader){await ctx.loader.create({id:'compaction-basic',name:pathToFileURL(require.resolve('@deepseek-ai/dsh-compaction-basic')).href,config:{auto:true,thresholdRatio:0.8,retainRatio:0.4,maxTokens:64,compactionRetries:0,maxOverflowRetries:1}});await ctx.loader.await();}
  const input={source,memory,locks,budgetPath,initialize:!prior,business:{sources:['.'],capture:false,recall:true,pluginGroup:true,media:false,...business},p1:{enabled:true,budgetPath,...p1},helperPath,helperSha256,nativeLockPath:join(root,'.native.lock'),shutdownMs,...loader?{compaction:{nativeEntryId:'compaction-basic'}}:{},...runtimeOptions};let fiber;
  if(loader){const id=await ctx.loader.create({id:'mac-business',name:new URL('./runtime.mjs',import.meta.url).href,config:input});await ctx.loader.await();fiber=ctx.loader.resolve(id).fiber;}else{fiber=ctx.plugin(runtime,input);await fiber;}
  const api=ctx.sepMacRuntime;assert(api);if(activate){const plan=await api.review();await api.activate({planHash:plan.planHash});}
  const agent=(await ctx.agents.create({sessionId:SessionId('mac-business-'+ ++n),meta:{cwd:source,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64}})).agent;
  const call=(name,args={},who=agent)=>ctx.tools.execute({name,arguments:args,agent:who,signal:new AbortController().signal,callId:ToolCallId('mac-'+ ++n)});
  const say=text=>{agent.session.append('turn/start',{});const m=createUserMessage({content:[{type:'text',text}],source:{kind:'user'}});agent.session.append('user/message',m,{surfaceOp:'append'});return m;};
  return {base,root,source,memory,locks,budgetPath,ctx,fiber,api,agent,call,say,agentErrors,providerCalls:()=>providerCalls,setBehavior:fn=>{behavior=fn;},async close(){await api.close();await ctx.fiber.dispose();}};
 }catch(e){await ctx.fiber.dispose();throw e;}
}
export const ok=result=>{assert.equal(result.isError,false,JSON.stringify(result.error));return result.value;};
