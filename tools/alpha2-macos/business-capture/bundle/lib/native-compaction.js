import {z} from 'zod';
import {createHash} from 'node:crypto';
import {lstat,realpath} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';
import {symbols} from '@deepseek-ai/cordis';
import {createLosslessCompaction} from '../modules/plugin-group/source/lossless-compaction.mjs';
import * as CompactionGroup from './compaction-group.js';

export const name='dsh-sep-native-compaction';
export const inject=['loader','llm','tokenMeter','sessions'];
export const provide=['sepNativeCompaction'];
const fail=code=>{throw Object.assign(new Error(code),{code});};
const schema=z.object({
 nativeEntryId:z.string().min(1).max(256),
 projects:z.array(z.object({id:z.string().min(1).max(128),root:z.string()}).strict()).min(1).max(16),
 maxInputBytes:z.number().int().min(1024).max(8*1024*1024).default(8*1024*1024),
}).strict();
// This controller deliberately supports plain data only. Expressions, custom
// injection/isolation and arbitrary Loader topology need a separate review.
function ordered(value){
 if(value===undefined)return undefined;
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map(ordered);
 if(typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype||'__jsExpr' in value)fail('SEP_NATIVE_ROW_UNSUPPORTED');
 return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,ordered(value[key])]));
}
const key=value=>JSON.stringify(ordered(value));
const hash=value=>createHash('sha256').update(key(value)).digest('hex');

/** Trusted same-process, one-shot cold-start controller. No model tool, YAML
 * persistence, business admission or crash-restart recovery is supplied here.
 * Caller must own startup admission; an empty live Session list is a guard,
 * not a global lock on every possible caller or retained native reference. */
export function apply(ctx,input){
 let config;try{config=schema.parse(input);}catch{fail('SEP_NATIVE_INPUT_INVALID');}
 if(ctx.get('sepNativeCompaction'))fail('SEP_NATIVE_PROVIDER_CONFLICT');
 const loader=ctx.loader,sessions=ctx.sessions;
 let phase='ready',closed=false,busy,closing,plan,saved,child,lastError,reloadFence;
 function entry(){try{const target=loader.resolve(config.nativeEntryId);if(!target)fail('SEP_NATIVE_ROW_UNSUPPORTED');return target;}catch{fail('SEP_NATIVE_ROW_UNSUPPORTED');}}
 function row(){
  const target=entry(),options=target.options,engine=ctx.get('compaction');
  if(Object.keys(options).some(k=>!['id','name','config','disabled'].includes(k))||target.disabled||!target.fiber?.uid||target.fiber.runtime.callback!==BasicCompactionEngine||target.moduleNamespace?.default!==BasicCompactionEngine)fail('SEP_NATIVE_ROW_UNSUPPORTED');
  ordered(options);
  // Traceable service.ctx is deliberately the *calling* context. Resolve the
  // exported original symbol before checking the actual provider owner.
  const original=engine?.[symbols.original]??engine;
  if(!(original instanceof BasicCompactionEngine)||original.ctx.fiber.uid!==target.fiber.uid)fail('SEP_NATIVE_ROW_UNSUPPORTED');
  return {target,options:structuredClone(options),native:structuredClone(engine.config),uid:target.fiber.uid};
 }
 async function projects(){
  try{
   // The factory validates duplicates, nesting, canonical paths and limits.
   await createLosslessCompaction(BasicCompactionEngine,config);
   return await Promise.all(config.projects.map(async p=>{
    if(!isAbsolute(p.root))fail('SEP_NATIVE_PROJECT_INVALID');
    const canonical=await realpath(p.root),before=await lstat(p.root,{bigint:true});
    if(!before.isDirectory()||before.isSymbolicLink()||before.ino===0n||resolve(canonical).toLowerCase()!==resolve(p.root).toLowerCase())fail('SEP_NATIVE_PROJECT_INVALID');
    const after=await lstat(p.root,{bigint:true});
    if(before.dev!==after.dev||before.ino!==after.ino||await realpath(p.root)!==canonical)fail('SEP_NATIVE_PROJECT_INVALID');
    return {id:p.id,root:canonical,dev:String(before.dev),ino:String(before.ino)};
   }));
  }catch{fail('SEP_NATIVE_PROJECT_INVALID');}
 }
 function idle(){if(sessions.list().length)fail('SEP_NATIVE_NOT_IDLE');}
 async function serial(work){
  if(closed)fail('SEP_NATIVE_CLOSED');if(busy)fail('SEP_NATIVE_BUSY');
  const task=Promise.resolve().then(work);busy=task;
  return task.finally(()=>{if(busy===task)busy=undefined;});
 }
 function pausedUnchanged(){return entry()===saved.target&&saved.target.parent===saved.parent&&key(saved.target.options)===key(saved.paused)&&(!reloadFence||saved.target.update===reloadFence.wrapped);}
 function fenceUnchangedReload(){
  const target=saved.target,original=target.update;
  // Include reconciles a complete source generation with create/force=true.
  // An identical raw row must not re-enable the native provider while this
  // controller owns its temporary pause. Keep the source data unmodified;
  // changed rows, direct updates and a different parent retain native behavior.
  const wrapped=async function(options,create=false,force=false){
   if(this===target&&create===true&&force===true&&['activating','active'].includes(phase)&&pausedUnchanged()&&key(options)===key(saved.options))return;
   return original.call(this,options,create,force);
  };
  reloadFence={original,wrapped};target.update=wrapped;
 }
 function releaseReloadFence(){if(reloadFence&&saved.target.update===reloadFence.wrapped)saved.target.update=reloadFence.original;reloadFence=undefined;}
 async function restore(){
  if(!saved||phase==='restored')return;
  phase='restoring';
  try{
   // The group's original thenable disposer drains accepted work before it
   // removes the owned engine. Never overlap native restoration with that work.
   await child?.dispose();
   if(!pausedUnchanged()||ctx.get('compaction'))fail('SEP_NATIVE_RESTORE_BLOCKED');
   await saved.target.update({disabled:saved.options.disabled??null});
   await saved.target.fiber?.await();
   const current=row();
   if(current.target!==saved.target||key(current.options)!==key(saved.options)||key(current.native)!==key(saved.native))fail('SEP_NATIVE_RESTORE_BLOCKED');
   releaseReloadFence();phase='restored';lastError=undefined;
  }catch{
   // Entry.init can log and swallow an import error. Reinstate our paused
   // fence only if the row still exactly matches our own restored options;
   // never overwrite a user's concurrent change or a foreign provider.
   try{if(entry()===saved.target&&key(saved.target.options)===key(saved.options)&&!ctx.get('compaction'))await saved.target.update({disabled:true});}catch{/* Preserve the blocked receipt if the row itself disappeared. */}
   phase='restore-blocked';lastError='SEP_NATIVE_RESTORE_BLOCKED';fail(lastError);
  }
 }
 function shutdown(){
  closed=true;if(closing)return closing;
  closing=(async()=>{await Promise.allSettled(busy?[busy]:[]);try{await restore();}catch{ctx.logger.warn('SEP_NATIVE_RESTORE_BLOCKED');}})();return closing;
 }
 ctx.effect(()=>shutdown);
 ctx.provide('sepNativeCompaction',{
  status:()=>({phase,closed,busy:!!busy,lastError,businessEnabled:false,completeProfileStatus:'blocked',wholeApplicationDeadlineVerified:false}),
  review:()=>serial(async()=>{
   if(phase!=='ready')fail('SEP_NATIVE_STATE');const current=row(),identities=await projects();
   if(closed)fail('SEP_NATIVE_CLOSED');const latest=row();
   if(current.target!==latest.target||key(current.options)!==key(latest.options)||current.uid!==latest.uid||key(current.native)!==key(latest.native))fail('SEP_NATIVE_PLAN_STALE');
   // Hash only detached plain data, never Loader/Context objects.
   const data={nativeEntryId:config.nativeEntryId,options:current.options,native:current.native,uid:current.uid,projects:identities,maxInputBytes:config.maxInputBytes};
   plan={data,planHash:hash(data),target:current.target};
   return {planHash:plan.planHash,nativeEntryId:config.nativeEntryId,nativeConfig:structuredClone(current.native),scope:'one-shot cold-start; no live Sessions; no persistent config write'};
  }),
  activate:input=>serial(async()=>{
   if(phase!=='ready')fail('SEP_NATIVE_STATE');
   if(!plan||!input||Object.keys(input).length!==1||typeof input.planHash!=='string'||input.planHash!==plan.planHash)fail('SEP_NATIVE_PLAN_INVALID');
   let current,identities;
   try{current=row();identities=await projects();}catch{fail('SEP_NATIVE_PLAN_STALE');}
   const data={nativeEntryId:config.nativeEntryId,options:current.options,native:current.native,uid:current.uid,projects:identities,maxInputBytes:config.maxInputBytes};
   if(closed)fail('SEP_NATIVE_CLOSED');if(current.target!==plan.target||hash(data)!==plan.planHash)fail('SEP_NATIVE_PLAN_STALE');
   // Re-read synchronously after all preparation awaits, then cut over without
   // another await between owner/config/idle checks and marking the row paused.
   const latest=row();if(latest.target!==current.target||key(latest.options)!==key(current.options)||latest.uid!==current.uid||key(latest.native)!==key(current.native))fail('SEP_NATIVE_PLAN_STALE');
   idle();saved={...current,parent:current.target.parent,paused:{...structuredClone(current.options),disabled:true}};phase='activating';fenceUnchangedReload();
   try{
    const oldFiber=current.target.fiber;
    await current.target.update({disabled:true});await oldFiber.await();
    if(closed)fail('SEP_NATIVE_CLOSED');if(!pausedUnchanged()||ctx.get('compaction'))fail('SEP_NATIVE_PLAN_STALE');idle();
    if(key(await projects())!==key(identities))fail('SEP_NATIVE_PLAN_STALE');
    if(closed)fail('SEP_NATIVE_CLOSED');if(!pausedUnchanged()||ctx.get('compaction'))fail('SEP_NATIVE_PLAN_STALE');idle();
    ctx.effect(function*(){
     child=ctx.plugin(CompactionGroup,{projects:config.projects,maxInputBytes:config.maxInputBytes,native:saved.native});
     yield child.dispose;yield shutdown;
    });
    await child;
    if(closed)fail('SEP_NATIVE_CLOSED');idle();
    if(!pausedUnchanged()||key(ctx.get('compaction')?.config)!==key(saved.native)||key(await projects())!==key(identities))fail('SEP_NATIVE_PLAN_STALE');
    if(closed)fail('SEP_NATIVE_CLOSED');idle();if(!pausedUnchanged())fail('SEP_NATIVE_PLAN_STALE');
    phase='active';lastError=undefined;return {phase};
   }catch{await restore();fail('SEP_NATIVE_ACTIVATION_FAILED');}
  }),
  restore:()=>serial(restore),
 });
}
