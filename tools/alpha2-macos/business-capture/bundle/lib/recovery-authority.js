import z from '@deepseek-ai/schemastery';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {realpath} from 'node:fs/promises';
import {openRecovery} from '../modules/recovery/src/controller.mjs';

export const name='dsh-sep-local-recovery-authority';
export const provide=['recoveryHost'];
export const Config=z.object({controlRoot:z.string().required()});
const fail=code=>{throw Object.assign(new Error(code),{code});};
const same=(a,b)=>resolve(a).toLowerCase()===resolve(b).toLowerCase();
const inside=(root,value)=>{const part=relative(root,value);return part===''||part!=='..'&&!part.startsWith('..'+sep)&&!isAbsolute(part);};

/** Provide a durable, explicitly registered local project authority. No HTTP
 * service, automatic discovery, model call or private-root adoption is started.
 * @param ctx - official Cordis context.
 * @param config - explicit local controller root. */
export async function apply(ctx,config){
 if(process.platform!=='win32'||process.arch!=='x64')fail('FS_PROTECTION_UNAVAILABLE');
 const controller=await openRecovery({controlRoot:config.controlRoot});
 let closed=false,tail=Promise.resolve();
 function serialized(work){
  if(closed)return Promise.reject(Object.assign(new Error('RECOVERY_UNAVAILABLE'),{code:'RECOVERY_UNAVAILABLE'}));
  const result=tail.then(()=>{if(closed)fail('RECOVERY_UNAVAILABLE');return work();});
  tail=result.catch(()=>{});return result;
 }
 async function byId(id){
  await controller.assertBusinessOpen();
  if(!controller.status().projects.some(project=>project.id===id))fail('RECOVERY_PROJECT_UNKNOWN');
  return controller.inspectProject(id);
 }
 ctx.effect(()=>async()=>{closed=true;await tail;await controller.close();});
 ctx.provide('recoveryHost',{
  registerProject:input=>serialized(()=>controller.addProject(input)),
  listProjects:()=>serialized(async()=>{await controller.assertBusinessOpen();const result=[];for(const project of controller.status().projects)result.push(await controller.inspectProject(project.id));return result;}),
  projectById:({id})=>serialized(()=>byId(id)),
  projectForPath:({cwd})=>serialized(async()=>{
   if(typeof cwd!=='string'||!isAbsolute(cwd))fail('RECOVERY_PROJECT_REQUIRED');
   await controller.assertBusinessOpen();
   const project=controller.status().projects.find(row=>inside(row.root,resolve(cwd)));
   if(!project)fail('RECOVERY_PROJECT_UNKNOWN');
   let canonical;try{canonical=await realpath(cwd);}catch{fail('RECOVERY_PROJECT_PAUSED');}
   if(!same(canonical,cwd))fail('RECOVERY_PATH_ALIAS');
   return byId(project.id);
  }),
  // Trusted same-process callback only; this operation is never a JSON/RPC tool.
  withProject:(id,work)=>serialized(async()=>{
   const project=await byId(id);if(project.state!=='ready')fail('RECOVERY_PROJECT_PAUSED');
   return work(project);
  }),
  beginMaintenance:input=>serialized(()=>controller.beginMaintenance(input)),
  planRebind:input=>serialized(()=>controller.planRebind(input)),
  commitRebind:input=>serialized(()=>controller.commitRebind(input)),
 });
}
