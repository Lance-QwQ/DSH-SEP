import {createHash,randomUUID} from 'node:crypto';
import {lstat,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,parse,relative,resolve,sep} from 'node:path';
import {z} from 'zod';
import {Session} from '@deepseek-ai/dsh-session';
import SepSessionPersistence from './session-persistence.js';
import SepProtectedFileSystem from './file-protection.js';
import {readProtectedObservation} from '../host/protected-files/index.js';
import {normalizeBundleConfig} from './configuration.js';
import {reviewExistingBudget} from './configuration-budget.js';

export const name='dsh-sep-project-binding';
export const provide=['sepProjectBinding'];
export const inject=['recoveryHost'];
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key=path=>resolve(path).toLowerCase();
const same=(a,b)=>key(a)===key(b);
const inside=(root,path)=>{const part=relative(root,path);return part===''||part!=='..'&&!part.startsWith('..'+sep)&&!isAbsolute(part);};
const overlaps=(a,b)=>inside(a,b)||inside(b,a);
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const selectionSchema=z.object({projectId:z.string().uuid(),roots:z.object({sessions:z.string(),memory:z.string(),locks:z.string(),backups:z.string()}).strict(),budgetPath:z.string(),credentialRef:z.literal('DEEPSEEK_API_KEY'),configuration:z.unknown().optional()}).strict();

// Reject aliases at every ancestor. Identities deliberately omit directory
// mtime: ordinary Session/store writes must not invalidate their root binding.
async function identity(path){
 if(typeof path!=='string'||!isAbsolute(path)||path.startsWith('\\\\')||/[\x00-\x1f]/.test(path)||path.slice(2).includes(':')||same(path,parse(path).root))fail('SEP_BINDING_PATH_INVALID');
 const normalized=resolve(path),drive=parse(normalized).root;let current=drive;
 try{
  for(const part of relative(drive,normalized).split(sep)){
   current=resolve(current,part);const info=await lstat(current,{bigint:true});
   if(!info.isDirectory()||info.isSymbolicLink()||info.dev===0n||info.ino===0n||!same(await realpath(current),current))fail('SEP_BINDING_PATH_INVALID');
  }
  const info=await lstat(normalized,{bigint:true});return {path:normalized,dev:String(info.dev),ino:String(info.ino),birthtimeNs:String(info.birthtimeNs)};
 }catch{fail('SEP_BINDING_PATH_INVALID');}
}

/** Trusted same-process configuration review/handoff only. No RPC, tool,
 * credential resolution, data initialization, migration or business activation.
 * Existing live providers and governance must be composed before review. */
export function apply(ctx){
 if(process.platform!=='win32'||process.arch!=='x64')fail('SEP_BINDING_PLATFORM_UNSUPPORTED');
 let closed=false,tail=Promise.resolve(),pending,active;
 const tokens=new WeakMap();
 const token=object=>{if(!object||typeof object!=='object')fail('SEP_BINDING_PROVIDER_REQUIRED');if(!tokens.has(object))tokens.set(object,randomUUID());return tokens.get(object);};
 function serial(work){
  if(closed)return Promise.reject(Object.assign(new Error('SEP_BINDING_CLOSED'),{code:'SEP_BINDING_CLOSED'}));
  const result=tail.then(()=>{if(closed)fail('SEP_BINDING_CLOSED');return work();});tail=result.catch(()=>{});return result;
 }
 function selection(input){
  let result;try{result=selectionSchema.parse(input);result.configuration=normalizeBundleConfig(result.configuration);}catch{fail('SEP_BINDING_INPUT_INVALID');}
  return freeze(result);
 }
 async function capture(input){
  const registered=await ctx.recoveryHost.listProjects();
  return ctx.recoveryHost.withProject(input.projectId,async project=>{
   const roots={};for(const [name,path] of Object.entries(input.roots))roots[name]=(await identity(path)).path;
   const budgetParent=await identity(dirname(input.budgetPath));
   if(!isAbsolute(input.budgetPath)||/[\x00-\x1f]/.test(input.budgetPath)||input.budgetPath.slice(2).includes(':'))fail('SEP_BINDING_PATH_INVALID');
   const budgetPath=resolve(input.budgetPath),paths=[...Object.values(roots),budgetParent.path];
   for(let i=0;i<paths.length;i++){
    if(registered.some(row=>overlaps(row.root,paths[i])))fail('SEP_BINDING_SCOPE_CONFLICT');
    if(paths.slice(0,i).some(path=>overlaps(path,paths[i])))fail('SEP_BINDING_SCOPE_CONFLICT');
   }
   const fs=ctx.get('fs'),persistence=ctx.get('sessionPersistence'),facility=ctx.get('storageDomain');
   if(!(fs instanceof SepProtectedFileSystem)||!(persistence instanceof SepSessionPersistence)||!facility)fail('SEP_BINDING_PROVIDER_REQUIRED');
   if(!same(fs.config.cwd,project.root)||fs.config.projectId!==project.id||!same(fs.config.recovery.root,roots.backups)||!same(persistence.root,roots.sessions))fail('SEP_BINDING_PROVIDER_MISMATCH');
   const backendIds=[];
   for(const domain of ['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1']){
    const backend=facility.ctx.storage.backend.get(facility.config.routes?.[domain]??facility.config.backend);
    if(backend?.constructor.name!=='JsonStorageBackend'||!backend.kv||!same(backend.root,roots.memory))fail('SEP_BINDING_PROVIDER_MISMATCH');
    backendIds.push(token(backend.kv));
   }
   const control=ctx.get('sepStorageControl');
   if(!control||typeof control.checkpoint!=='function'||!same(control.storageRoot,roots.memory))fail('SEP_BINDING_GOVERNANCE_REQUIRED');
   await control.assertOwned();const checkpoint=await control.checkpoint();control.assertReadable();
   if(control.mode!=='writer'||checkpoint.barrier.closed||checkpoint.pending.length||!['governed-empty-origin','governed-adoption-origin'].includes(checkpoint.coverage)||checkpoint.coverage==='governed-adoption-origin'&&(checkpoint.adoption?.status!=='adopted'||checkpoint.adoption.firstBaseline?.status!=='ready'))fail('SEP_BINDING_GOVERNANCE_CLOSED');
   let snapshot;try{snapshot=await readProtectedObservation({targetKey:budgetPath,displayPath:budgetPath},16*1024*1024,undefined,{});}catch(error){if(error.code==='FS_NOT_FOUND')fail('SEP_BINDING_LEDGER_REQUIRED');fail('SEP_BINDING_PATH_INVALID');}
   let ledger;try{new TextDecoder('utf-8',{fatal:true}).decode(snapshot.bytes);ledger=reviewExistingBudget(snapshot.bytes,input.configuration);}catch{fail('SEP_BINDING_LEDGER_INVALID');}
   if(ledger.migrationRequired)fail('SEP_BINDING_LEDGER_MIGRATION_REQUIRED');
   const boundProject={id:project.id,root:project.root,memoryKey:project.memoryKey,generation:project.generation,identity:project.identity};
   const identities={};for(const [name,path] of Object.entries(roots))identities[name]=await identity(path);identities.budget=budgetParent;
   const providers={fs:token(fs.config),sessions:token(persistence.tracker),backends:backendIds,governance:control.token};
   const contextHash=hash({project:boundProject,identities,providers,budgetPath,credentialRef:input.credentialRef});
   const result={project:boundProject,roots,paths:{sessionRoot:roots.sessions,memoryRoot:roots.memory,lockDirectory:roots.locks,recoveryRoot:roots.backups,budgetPath},ledger,credential:{reference:input.credentialRef,resolved:false},sourceProject:{root:project.root,sources:['.'],recoveryProjectId:project.id},businessEnabled:false,configurationApplied:false,contextHash};
   return freeze({...result,planHash:hash({contextHash,ledgerHash:ledger.ledgerSha256,storageHead:checkpoint.head,configuration:input.configuration})});
  });
 }
 ctx.effect(()=>async()=>{closed=true;await tail;pending=undefined;active=undefined;});
 ctx.provide('sepProjectBinding',{
  review:input=>serial(async()=>{const selected=selection(input),result=await capture(selected);pending={selected,result};return result;}),
  confirm:input=>serial(async()=>{
   if(!input||Object.keys(input).length!==1||typeof input.planHash!=='string'||!pending||input.planHash!==pending.result.planHash)fail('SEP_BINDING_CONFIRMATION_MISMATCH');
   let current;try{current=await capture(pending.selected);}catch{pending=undefined;active=undefined;fail('SEP_BINDING_PLAN_CHANGED');}
   if(current.planHash!==pending.result.planHash){pending=undefined;active=undefined;fail('SEP_BINDING_PLAN_CHANGED');}
   active={selected:pending.selected,result:current};pending=undefined;return freeze({...current,status:'confirmed'});
  }),
  reviewSession:session=>serial(async()=>{
   if(!active)fail('SEP_BINDING_CONFIRMATION_REQUIRED');
   if(!(session instanceof Session))fail('SEP_BINDING_SESSION_INVALID');
   if(typeof session.header.cwd!=='string'||!same(session.header.cwd,active.result.project.root))fail('SEP_BINDING_SESSION_SCOPE');
   let current;try{current=await capture(active.selected);}catch{fail('SEP_BINDING_CONTEXT_CHANGED');}
   if(current.contextHash!==active.result.contextHash)fail('SEP_BINDING_CONTEXT_CHANGED');
   // Updated ledger and governed data at unchanged roots remain authoritative.
   // This is a fresh read-only handoff, never authority to skip Budget/P2 guards.
   return freeze({...current,sessionId:session.header.id,status:'reviewed-session'});
  }),
 });
}
