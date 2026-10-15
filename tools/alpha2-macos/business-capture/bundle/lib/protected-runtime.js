import {z} from 'zod';
import * as ProtectedProfile from './protected-profile.js';
import * as CompactionGroup from './compaction-group.js';

export const name='dsh-sep-protected-runtime';
export const inject=['tools','systemPrompt','sessions','storageDomain','recoveryHost','llm','tokenMeter'];
export const provide=['sepProtectedRuntime'];
const fail=code=>{throw Object.assign(new Error(code),{code});};
const schema=z.object({
 profile:z.record(z.string(),z.unknown()),
 compaction:z.object({native:z.record(z.string(),z.unknown()),maxInputBytes:z.number().int().min(1024).max(8*1024*1024).optional()}).strict(),
}).strict();

/** Explicit cold-start provider group, not the complete SEP business entry.
 * Mounts the previously reviewed protected Profile first, then the compaction
 * owner for its registered project. Reverse cleanup drains compression before
 * closing Session and P2. Deliberately disabled native rows remain disabled;
 * activation failure removes only this group's children and never edits YAML. */
export async function apply(ctx,input){
 let config;try{config=schema.parse(input);}catch{fail('SEP_RUNTIME_INPUT_INVALID');}
 if(ctx.get('compaction')||ctx.get('sepProtectedRuntime'))fail('SEP_COMPACTION_PROVIDER_CONFLICT');
 const children=[];let closing;
 function close(){
  if(closing)return closing;
  closing=(async()=>{for(const child of [...children].reverse())await child.dispose();})();return closing;
 }
 try{
  const profile=ctx.plugin(ProtectedProfile,config.profile);children.push(profile);await profile;
  const project=await ctx.recoveryHost.projectById({id:config.profile.selection.projectId});
  const compaction=ctx.plugin(CompactionGroup,{...config.compaction,projects:[{id:project.id,root:project.root}]});children.push(compaction);
  // These disposers are thenable functions. A synchronous generator must yield
  // the original functions: an async generator unwraps them, leaving their
  // automatic disposers registered separately and allowing concurrent cleanup.
  ctx.effect(function*(){for(const child of children)yield child.dispose;yield close;});
  await compaction;
  ctx.provide('sepProtectedRuntime',{status:()=>({phase:'cold-start-protected-runtime',completeProfileStatus:'blocked',businessEnabled:false,compaction:ctx.get('sepCompactionGroup')?.status()})});
 }catch(error){try{await close();}catch{fail('SEP_RUNTIME_CLEANUP_FAILED');}throw error;}
}
