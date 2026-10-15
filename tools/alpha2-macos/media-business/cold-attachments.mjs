import {join,relative,isAbsolute,resolve} from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {load} from '../business/host-modules.mjs';
import {owned} from '../business/bundle-modules.mjs';
import {hash} from '../business/bounded-read.mjs';
import {createMacAttachmentIO} from '../media/attachment-io.mjs';
import {createAttachmentMaintenance} from './attachment-maintenance.mjs';
const {z}=await load('zod'),{openControl}=await owned('modules/system-enhancement-package/src/p2/control.js'),{AttachmentError}=await load('@deepseek-ai/dsh-attachment'),{LocalAttachmentStore}=await load('@deepseek-ai/dsh-attachment-local');
const fail=code=>{throw Object.assign(Error(code),{code});};
const schema=z.object({source:z.string(),storageRoot:z.string(),initialize:z.boolean().default(false),helperPath:z.string(),helperSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const name='sep-mac-cold-attachments';
export const provide=['sepMacAttachmentBinding','sepAttachmentDomain','attachments'];
export async function apply(ctx,input){
 const config=schema.parse(input);if(ctx.get('llm',false)||ctx.get('attachments',false)||ctx.get('sepAttachmentDomain',false))fail('SEP_MAC_ATTACHMENT_COLD_REQUIRED');
 const outside=r=>r==='..'||r.startsWith('../')||isAbsolute(r);if(![config.source,config.storageRoot].every(p=>isAbsolute(p)&&resolve(p)===p)||!outside(relative(config.source,config.storageRoot))||!outside(relative(config.storageRoot,config.source)))fail('SEP_MAC_STORAGE_SCOPE');
 const io=createMacAttachmentIO({helperPath:config.helperPath,helperSha256:config.helperSha256,lockPath:join(config.storageRoot,'.attachment-native.lock')});await io.checkDirectory(config.storageRoot);
 const digest=hash(config.source),projectId=digest.slice(0,8)+'-'+digest.slice(8,12)+'-5'+digest.slice(13,16)+'-8'+digest.slice(17,20)+'-'+digest.slice(20,32),selection={storageRoot:config.storageRoot,projectId},maintenance=createAttachmentMaintenance(io);
 const control=await openControl({storageRoot:config.storageRoot,initialize:config.initialize,recoverDocumentDeletion:true});try{await control.recoverDocumentDeletions();await control.checkpoint();control.assertReadable();}finally{await control.close();}
 const home=await maintenance.initialize(selection),lease=await maintenance.acquire({...selection,home});let child,native,closed=false,bound=false,enter=()=>fail('SEP_MAC_NOT_ACTIVE'),lifetime,tail=Promise.resolve(),queued=0;const local=new AsyncLocalStorage(),pending=new Set();
 async function lock(){if(++queued>4){queued--;fail('SEP_MAC_ATTACHMENT_BUSY');}let release;const next=new Promise(r=>{release=r;}),prior=tail;tail=prior.then(()=>next);await prior;return()=>{queued--;release();};}
 async function guarded(work,{request=false,publish=false}={}){if(closed)fail('SEP_MAC_CLOSED');const release=enter(),token={};pending.add(token);let unlock;try{if(!local.getStore())unlock=await lock();lifetime?.throwIfAborted();const before=await maintenance.validate(selection);if(publish&&(before.totalBytes+3*4*1024*1024>64*1024*1024||before.files.length+3>128))fail('SEP_MAC_ATTACHMENT_QUOTA');return await local.run(true,work);}finally{try{if(request&&native)await Promise.allSettled([...native.requestInflight.values()].map(v=>v.promise));}finally{unlock?.();pending.delete(token);release();}}}
 const unsupported=()=>{throw new AttachmentError('This macOS Profile accepts image attachments only.','SEP_MAC_FILE_ATTACHMENT_UNSUPPORTED');};
 class GovernedImages extends LocalAttachmentStore{
  admitPromptContent(content){return guarded(()=>super.admitPromptContent(content),{publish:content.some(v=>v.type==='image')});}
  validateImage(input){return guarded(()=>super.validateImage(input));}
  saveImage(input){return guarded(()=>super.saveImage(input),{publish:true});}
  saveImages(input){return guarded(()=>super.saveImages(input),{publish:true});}
  readImage(ref,signal){return guarded(()=>super.readImage(ref,signal));}
  requestVersion(...args){return guarded(()=>super.requestVersion(...args),{request:true,publish:true});}
  async saveFile(){unsupported();}
  async saveFileStream(){unsupported();}
 }
 ctx.effect(()=>async()=>{closed=true;while(pending.size||native?.requestInflight.size)await new Promise(r=>setTimeout(r,10));await child?.dispose();await lease.release();});
 try{child=ctx.plugin(GovernedImages,{dshHome:home,maxImageBytes:4*1024*1024,maxImagesPerMessage:1,maxMessageImageBytes:4*1024*1024});await child;native=ctx.get('attachments');if(native?.root!==join(home,'attachments/v1'))fail('SEP_ATTACHMENT_PROVIDER_UNAVAILABLE');
  ctx.provide('sepAttachmentDomain',Object.freeze({...selection,home,retention:'until-explicit-purge'}));
  ctx.provide('sepMacAttachmentBinding',Object.freeze({...selection,home,source:config.source,validate:()=>maintenance.validate(selection),bindRuntime(callback,signal){if(bound||closed||typeof callback!=='function')fail('SEP_MAC_ATTACHMENT_BINDING');bound=true;enter=callback;lifetime=signal;}}));
 }catch(error){closed=true;try{await child?.dispose();}finally{await lease.release();}throw error;}
}
