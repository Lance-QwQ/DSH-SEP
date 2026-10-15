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
async function setup({activate=true,base,shutdownMs=5000,business={},p1={},onEvent,imageCapable=false,imagePricing,agentMaxTokens=64,files,adapterFactory,runtimeOptions={}}={}){
 const f=base??await fixture(),ctx=new Context();
 const memory=join(f.base,'memory'),locks=join(f.base,'locks'),budgetPath=join(f.base,'budget/ledger.json');for(const p of [memory,locks,join(f.base,'budget')])await mkdir(p,{recursive:true,mode:0o700});
 let attachmentFiber;
 if(business.vision)attachmentFiber=await (await import('./attachment-fixture.mjs')).coldAttachments(ctx,{source:f.source,storageRoot:memory,files});
 await prerequisites(ctx);await ctx.plugin((await load('@deepseek-ai/dsh-working-directory')).default,{defaultDirectory:f.source});
 for(const name of ['@deepseek-ai/dsh-token-meter','@deepseek-ai/dsh-subagent','@deepseek-ai/dsh-subagent-spawn-in-process','@deepseek-ai/dsh-user-approval','@deepseek-ai/dsh-storage']){const m=await load(name);await ctx.plugin(m.default??m);}
 await ctx.plugin(await load('@deepseek-ai/dsh-storage-json'),{root:memory});await ctx.plugin(await load('@deepseek-ai/dsh-storage-domain'),{backend:'json'});
 const carrier=ctx.plugin(profile,{...f,servers:{},onEvent});await carrier;
 const agentErrors=[];ctx.on('agent/error',payload=>{agentErrors.push({code:payload.error?.code,message:payload.error?.message,stack:payload.error?.stack});});
 let providerCalls=0,behavior;
 class Adapter extends LlmAdapter{async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:100000},...imageCapable?{inputModalities:['text','image']}:{}};}imageRequestPricing(provider,model){return imagePricing?.(provider,model);}async *stream(options){providerCalls++;const response=await behavior?.(options),text=typeof response==='string'?response:'synthetic';options.signal?.throwIfAborted();yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text};yield {type:'block-end',index:0,block:{type:'text',text}};yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:'stop'}};}}
 ctx.llm.registerAdapter(['deepseek-official'],adapterFactory?adapterFactory():new Adapter());
 let fiber;
 try{fiber=ctx.plugin(sep,{source:f.source,memory,locks,budgetPath,initialize:true,business:{sources:['.'],capture:false,recall:true,pluginGroup:true,media:true,...business},p1:{enabled:true,budgetPath,...p1},shutdownMs,...runtimeOptions});await fiber;
  const api=ctx.sepLinuxRuntime;assert(api,'missing runtime prerequisites: '+sep.inject.filter(key=>!ctx.get(key)).join(','));if(activate){const plan=await api.review();await api.activate({planHash:plan.planHash});}
  const a=(await ctx.agents.create({sessionId:SessionId('linux-sep-'+ ++n),meta:{cwd:f.source,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',...agentMaxTokens===null?{}:{maxTokens:agentMaxTokens}}})).agent;
  assert.equal(a.session.header.cwd,f.source);
  const call=(name,args={},agent=a)=>ctx.tools.execute({name,arguments:args,agent,signal:new AbortController().signal,callId:ToolCallId('sep-'+ ++n)});
  const say=text=>{a.session.append('turn/start',{});const m=createUserMessage({content:[{type:'text',text}],source:{kind:'user'}});a.session.append('user/message',m,{surfaceOp:'append'});return m;};
  return {...f,ctx,fiber,api,call,say,agent:a,memory,budgetPath,attachmentFiber,agentErrors,providerCalls:()=>providerCalls,setBehavior:fn=>{behavior=fn;},setImageCapability:value=>{imageCapable=value;},setImagePricing:value=>{imagePricing=value;},close:async()=>{await api.close();await ctx.fiber.dispose();}};
 }catch(error){await ctx.fiber.dispose();throw error;}
}
const ok=v=>{assert.equal(v.isError,false,JSON.stringify(v.error));return v.value;};

export {setup,ok};
