import {z} from 'zod';
import {lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import SepSessionPersistence from './session-persistence.js';
import * as ProtectedFileTools from './protected-file-tools.js';
import * as ProjectBinding from './project-binding.js';
import {openControl} from '../modules/system-enhancement-package/src/p2/control.js';
import {bindStorage} from '../modules/system-enhancement-package/src/p2/storage.js';

export const name='dsh-sep-protected-profile';
export const inject=['tools','systemPrompt','sessions','storageDomain','recoveryHost'];
export const provide=['sepProtectedProfile','sepGovernedStorage'];
const fail=code=>{throw Object.assign(new Error(code),{code});};
const configSchema=z.object({
 selection:z.object({projectId:z.string().uuid(),roots:z.object({sessions:z.string(),memory:z.string(),locks:z.string(),backups:z.string()}).strict(),budgetPath:z.string(),credentialRef:z.literal('DEEPSEEK_API_KEY'),configuration:z.unknown().optional()}).strict(),
 recovery:z.object({maxFileBytes:z.number().int().positive(),maxTotalBytes:z.number().int().positive(),maxEntries:z.number().int().positive(),retentionMs:z.number().int().positive()}).strict(),
 session:z.object({compression:z.enum(['none','zstd']).default('none')}).strict().default({compression:'none'}),
 tools:z.record(z.string(),z.unknown()).optional(),
}).strict();

/** Explicit cold-start Profile provider group. Existing native providers must
 * be removed only by a reviewed host composition before this entry starts.
 * This module refuses live replacement, opens already-governed storage only,
 * and does not activate the complete SEP business entry or native compaction.
 * File/Session capabilities remain governed by their existing providers;
 * binding confirmation authorizes only the read-only Session handoff. */
export async function apply(ctx,input){
 let config;try{config=configSchema.parse(input);}catch{fail('SEP_PROFILE_INPUT_INVALID');}
 for(const service of ['fs','sessionPersistence','sepStorageControl','sepProjectBinding','sepGovernedStorage','sepProtectedProfile'])if(ctx.get(service))fail('SEP_PROFILE_PROVIDER_CONFLICT');
 if(!ctx.get('sandboxPolicy'))fail('SEP_FS_SANDBOX_REQUIRED');
 const children=[],domains=new Set(),pending=new Set();let control,closed=false,closing;
 const assertOpen=()=>{if(closed)fail('SEP_PROFILE_CLOSED');};
 async function tracked(work){
  assertOpen();const task=Promise.resolve().then(work);pending.add(task);
  try{return await task;}finally{pending.delete(task);}
 }
 function close(){
  if(closing)return closing;closed=true;
  closing=(async()=>{
   await Promise.allSettled([...pending]);const failures=[];
   for(const child of [...children].reverse())try{await child.dispose();}catch(error){failures.push(error);}
   for(const domain of [...domains])try{await domain.close();}catch(error){failures.push(error);}
   try{await control?.close();}catch(error){failures.push(error);}
   if(failures.length)fail('SEP_PROFILE_CLEANUP_FAILED');
  })();return closing;
 }
 ctx.effect(()=>close);
 async function mount(plugin,options){const fiber=ctx.plugin(plugin,options);children.push(fiber);await fiber;return fiber;}
 try{
  const project=await ctx.recoveryHost.projectById({id:config.selection.projectId});
  // openControl owns its normal metadata/lease setup. Refuse a missing root or
  // journal before invoking it so an unknown selected directory is not adopted
  // or populated by this startup composition. Actual authority is checked only
  // by the exclusively owned P2 coordinator, not inferred from this marker.
  const memory=config.selection.roots.memory;
  try{const info=await lstat(memory);if(!info.isDirectory()||info.isSymbolicLink()||resolve(await realpath(memory)).toLowerCase()!==resolve(memory).toLowerCase())fail('SEP_BINDING_PATH_INVALID');}
  catch{fail('SEP_BINDING_PATH_INVALID');}
  try{const info=await lstat(join(memory,'.suite-memory','p2','journal.jsonl'));if(!info.isFile()||info.isSymbolicLink())fail('P2_UNINITIALIZED');}
  catch{fail('P2_UNINITIALIZED');}
  control=await openControl({storageRoot:config.selection.roots.memory,initialize:false});
  await control.assertOwned();await control.checkpoint();control.assertReadable();
  const raw=await bindStorage({facility:ctx.storageDomain,storageRoot:config.selection.roots.memory,control});
  await mount({name:'dsh-sep-profile-storage-owner',apply(inner){inner.provide('sepStorageControl',control);}});
  await mount(SepSessionPersistence,{root:config.selection.roots.sessions,compression:config.session.compression});
  await mount(ProtectedFileTools,{files:{cwd:project.root,projectId:project.id,recovery:{root:config.selection.roots.backups,...config.recovery}},tools:config.tools??{}});
  await mount(ProjectBinding);
  const binding=ctx.get('sepProjectBinding');await binding.review(config.selection);
  const storage={
   withAccess:work=>tracked(()=>raw.withAccess(work)),
   documentDeletion:(...args)=>tracked(()=>raw.documentDeletion(...args)),
   documentDeletions:()=>{assertOpen();return raw.documentDeletions();},
   applyDocumentDeletion:marker=>tracked(()=>raw.applyDocumentDeletion(marker)),
   finishDeletion:input=>tracked(()=>raw.finishDeletion(input)),
   open:spec=>tracked(async()=>{
    const original=await raw.open(spec);let ended=false,closingDomain;const tables=new Map();
    const live=()=>{assertOpen();if(ended)fail('SEP_PROFILE_DOMAIN_CLOSED');};
    const domain={name:original.name,close(){
     if(closingDomain)return closingDomain;ended=true;
     const task=Promise.resolve().then(()=>original.close());pending.add(task);
     closingDomain=task.then(value=>{pending.delete(task);domains.delete(domain);return value;},error=>{pending.delete(task);closingDomain=undefined;throw error;});
     return closingDomain;
    },table(name){
     live();if(tables.has(name))return tables.get(name);const table=original.table(name);
     const wrapped={get:key=>{live();return table.get(key);},entries:()=>{live();return table.entries();},keys:()=>{live();return table.keys();},get size(){live();return table.size;},put:(key,value)=>tracked(()=>{live();return table.put(key,value);}),delete:key=>tracked(()=>{live();return table.delete(key);})};tables.set(name,wrapped);return wrapped;
    }};domains.add(domain);return domain;
   }),
  };
  ctx.provide('sepGovernedStorage',storage);
  ctx.provide('sepProtectedProfile',{
   review:()=>tracked(()=>binding.review(config.selection)),
   confirm:input=>tracked(()=>binding.confirm(input)),
   reviewSession:session=>tracked(()=>binding.reviewSession(session)),
  });
 }catch(error){try{await close();}catch{fail('SEP_PROFILE_CLEANUP_FAILED');}throw error;}
}
