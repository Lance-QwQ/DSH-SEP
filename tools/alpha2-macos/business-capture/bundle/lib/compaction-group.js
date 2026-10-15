import {z} from 'zod';
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';
import {createLosslessCompaction} from '../modules/plugin-group/source/lossless-compaction.mjs';

export const name='dsh-sep-compaction-group';
export const inject=['llm','tokenMeter','sessions'];
export const provide=['compaction','sepCompactionGroup'];
const fail=code=>{throw Object.assign(new Error(code),{code});};
const schema=z.object({
 projects:z.array(z.object({id:z.string().min(1).max(128),root:z.string()}).strict()).min(1).max(16),
 maxInputBytes:z.number().int().min(1024).max(8*1024*1024).default(8*1024*1024),
 native:z.record(z.string(),z.unknown()),
}).strict();

/** Cold-start owner for one native compaction subclass. Copy the reviewed
 * native row's complete config into `native` and disable that row before
 * loading this group. A live provider is never disposed or overwritten.
 * Native selection, pairing, retries and durable commit remain unchanged.
 * Closing blocks admission, cancels accepted operations, waits for actual
 * settlement, then disposes its engine. An adapter ignoring cancellation can
 * delay closure; no whole-application deadline or automatic row restore is
 * promised. No persistent lossless graph or extra model request is added. */
export async function apply(ctx,input){
 let config;try{config=schema.parse(input);}catch{fail('SEP_COMPACTION_INPUT_INVALID');}
 if(ctx.get('compaction')||ctx.get('sepCompactionGroup'))fail('SEP_COMPACTION_PROVIDER_CONFLICT');
 const Enhanced=await createLosslessCompaction(BasicCompactionEngine,config);
 const lifetime=new AbortController(),pending=new Set();let child,engine,closed=false,closing;
 const signal=external=>external?AbortSignal.any([lifetime.signal,external]):lifetime.signal;
 function tracked(work){
  if(closed)return Promise.reject(Object.assign(new Error('SEP_COMPACTION_CLOSED'),{code:'SEP_COMPACTION_CLOSED'}));
  // Native compactNow reserves its idle maintenance slot before returning.
  // Invoke synchronously; tracking must not defer that reservation to a microtask.
  const task=Promise.resolve(work());pending.add(task);
  return task.finally(()=>pending.delete(task));
 }
 function close(){
  if(closing)return closing;closed=true;lifetime.abort(Object.assign(new Error('SEP_COMPACTION_CLOSED'),{code:'SEP_COMPACTION_CLOSED'}));
  closing=(async()=>{await Promise.allSettled([...pending]);await child?.dispose();})();return closing;
 }
 class OwnedEngine extends Enhanced{
  compactIfNeeded(agent,trigger,external){return tracked(()=>super.compactIfNeeded(agent,trigger,signal(external)));}
  compactRegion(start,end,agent,external){return tracked(()=>super.compactRegion(start,end,agent,signal(external)));}
  compactNow(agent,external,command){return tracked(()=>super.compactNow(agent,signal(external),command));}
  summarize(input,agent,external){return tracked(()=>super.summarize(input,agent,signal(external)));}
 }
 try{
  ctx.effect(function*(){
   child=ctx.plugin(OwnedEngine,config.native);
   // Fiber unload otherwise runs registered effects concurrently. Own the
   // child's disposer in this one reverse-ordered effect so close drains first.
   yield child.dispose;
   yield close;
  });
  await child;engine=ctx.get('compaction');
  ctx.provide('sepCompactionGroup',{status:()=>({...engine.losslessStatus(),closed,acceptedOperations:pending.size,wholeApplicationDeadlineVerified:false})});
 }catch(error){await close();throw error;}
}
