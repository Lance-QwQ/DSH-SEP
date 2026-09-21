import {createHistoryExpansion} from './history-expansion.mjs';
import {resolveChildAgentOptions} from '@deepseek-ai/dsh-subagent';
import {createPreworkRegistry} from './prework.mjs';
import {realpath}from'node:fs/promises';import{resolve,relative,isAbsolute}from'node:path';import{z}from'zod';
import{contextPreview,memoryPreview}from'./adapters.mjs';import{assessment,admit,runtimeRequirements,predictions,selectProjectMessages}from'./policies.mjs';
export const name='dsh-sep-plugin-group';export const inject=['suiteEnhancements'];export const provide=['sepPluginGroup'];
const schema=z.object({enabled:z.boolean().default(false),projects:z.array(z.object({id:z.string().min(1).max(128),root:z.string().refine(isAbsolute)}).strict()).max(16).default([])}).strict();
const inside=(base,path)=>{const rel=relative(base,path);return rel===''||!rel.startsWith('..')&&!isAbsolute(rel);};
export async function apply(ctx,input={}){
 const config=schema.parse(input),lifetime=new AbortController(),active=new Set();if(!config.enabled){ctx.provide('sepPluginGroup',{status:()=>({phase:'disabled'})});return;}
 const projects=[];for(const p of config.projects){const root=await realpath(p.root);if(resolve(root).toLowerCase()!==resolve(p.root).toLowerCase()||projects.some(x=>x.id===p.id||inside(x.root,root)||inside(root,x.root)))throw Error('GROUP_PROJECT_SCOPE');projects.push({...p,root});}
 async function scope(exec){lifetime.signal.throwIfAborted();const session=exec?.agent?.session;if(session?.header?.origin==='subagent'||!isAbsolute(session?.header?.cwd??''))throw Error('GROUP_PROJECT_SCOPE');const cwd=await realpath(session.header.cwd).catch(()=>null),project=projects.find(p=>cwd&&inside(p.root,cwd));if(!project||await realpath(project.root)!==project.root)throw Error('GROUP_PROJECT_SCOPE');
  if(typeof session.snapshotEvents!=='function')throw Error('GROUP_SESSION_CONTRACT');const events=session.snapshotEvents();if(!Array.isArray(events))throw Error('GROUP_SESSION_CONTRACT');const start=events.findLastIndex(e=>e.type==='turn/start');if(start<0)throw Error('GROUP_CURRENT_TURN_REQUIRED');
  const turn=events.slice(start+1),pending=new Set();for(const e of turn){if(e.type==='tool/call')pending.add(e.data.callId);if(e.type==='tool/result')pending.delete(e.data.message?.source?.callId);}
  return {project,records:turn.filter(e=>e.type==='user/message').map(e=>({...e.data,projectId:project.id})),pendingToolCalls:pending.size,signal:AbortSignal.any([lifetime.signal,...(exec.signal?[exec.signal]:[])])};
 }
 const expandHistory=createHistoryExpansion({signal:lifetime.signal,authorize:async exec=>{
  const session=exec?.agent?.session;if(!session||ctx.get('agents')?.get(session.header.id)?.session!==session)throw Error('HISTORY_SESSION_SCOPE');
  if(!isAbsolute(session.header.cwd??''))throw Error('GROUP_PROJECT_SCOPE');const cwd=await realpath(session.header.cwd),project=projects.find(p=>inside(p.root,cwd));
  if(!project||await realpath(project.root)!==project.root)throw Error('GROUP_PROJECT_SCOPE');return project;
 }});
 const prework=createPreworkRegistry({signal:lifetime.signal,authorize:async exec=>{
  lifetime.signal.throwIfAborted();exec.signal?.throwIfAborted();const session=exec?.agent?.session;
  if(session?.header?.origin==='subagent'||!isAbsolute(session?.header?.cwd??''))throw Error('GROUP_PROJECT_SCOPE');
  const cwd=await realpath(session.header.cwd),project=projects.find(p=>inside(p.root,cwd));
  if(!project||await realpath(project.root)!==project.root)throw Error('GROUP_PROJECT_SCOPE');return project.id;
 }});
 ctx.effect(()=>()=>prework.clear());
 ctx.plugin({name:'sep-prework-human-command',inject:['commands'],apply(child){child.commands.register({name:'sep-prework-reset',description:'Clear this project’s cached prework assessments. The next suite_delegate reruns three paid samples under the shared budget.',recordInput:false,handler:async invocation=>{
  if(invocation.rawInput.trim()||invocation.attachments.length)return {kind:'error',text:'No arguments or attachments are accepted.'};
  const count=await prework.reset(invocation);return {kind:'success',text:`Cleared ${count} prework receipt(s) for this project. No model request was made; the next delegated request will reassess.`};
 }});}});

 const track=fn=>{const work=Promise.resolve().then(fn);active.add(work);return work.finally(()=>active.delete(work));};ctx.effect(()=>async()=>{lifetime.abort();await Promise.allSettled([...active]);});
 ctx.provide('sepPluginGroup',{
  status:()=>({phase:'isolated-memory-hints',memory:ctx.get('suiteEnhancements')?.memoryFactHintsProtocol===1?'host-governed-hints':'preview-only',context:ctx.get('compaction')?.losslessStatus?.().phase??'volatile-preview-only',historyReview:'human-cli-and-governed-model-expansion',pinchbench:'local-readiness-gate-available',sweBench:'blocked',sweRex:'blocked',automaticCompaction:ctx.get('compaction')?.losslessStatus?.().automaticCompaction??false,automaticMemoryWrites:false,installedModules:['lossless-context','project-memory','pre-work-assessment','swe-evaluation-bridge']}),
  contextPreview:exec=>track(async()=>{const s=await scope(exec);return contextPreview(s.project.id,s.records,s);}),
  memoryPreview:exec=>track(async()=>{const s=await scope(exec),model=ctx.get('sepSharedBudgetModel');if(!model?.generate)throw Error('GROUP_SHARED_MODEL_UNCONFIGURED');return memoryPreview(s.project.id,s.records,{signal:s.signal,generate:(messages,options)=>model.generate(messages,options)});}),
  supportsMemoryFactHints:async exec=>{
   lifetime.signal.throwIfAborted();const cwd=exec?.agent?.session?.header?.cwd;
   if(!isAbsolute(cwd??'')||exec.agent.session.header.origin==='subagent')return false;
   const canonical=await realpath(cwd).catch(()=>null);return !!canonical&&projects.some(p=>inside(p.root,canonical));
  },
  memoryFactHints:(exec,{messages,generate})=>track(async()=>{
   if(ctx.get('suiteEnhancements')?.memoryFactHintsProtocol!==1)throw Error('GROUP_HOST_MEMORY_PROTOCOL');
   const s=await scope(exec),eligible=selectProjectMessages(s.project.id,s.records);
   if(!Array.isArray(messages)||messages.length>4||new Set(messages.map(m=>m.id)).size!==messages.length)throw Error('GROUP_HINT_INPUT');
   for(const message of messages)if(!eligible.some(row=>row.id===message.id&&row.text===message.text))throw Error('GROUP_HINT_SOURCE_MISMATCH');
   const ids=new Set(messages.map(m=>m.id));
   const preview=await memoryPreview(s.project.id,s.records.filter(row=>ids.has(row.id)),{signal:s.signal,generate});
   return {engine:'mem0-fact-extraction',untrusted:true,facts:preview.proposals.map(p=>p.text)};
  }),
  preworkProtocol:1,resolvePreworkChildOptions:(parent,requested)=>resolveChildAgentOptions(parent,requested,1),ensurePrework:(exec,binding,run)=>track(()=>prework.ensure(exec,binding,run)),admitPrework:(exec,binding,id)=>prework.admit(exec,binding,id),
  historyExpansionProtocol:2,expandHistory:(exec,args,policy)=>track(()=>expandHistory(exec,args,policy)),validateHistoryReceipt:(exec,receipt)=>track(()=>expandHistory.validate(exec,receipt)),
  assessment,admit,runtimeRequirements,predictions,
 });
}
