import {join,relative,isAbsolute} from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readdir,lstat} from 'node:fs/promises';
import {load} from './host-modules.mjs';
import {owned} from './bundle-modules.mjs';
import {directory,hash,fail} from './project-tree.mjs';
import {initializeAttachmentHome,acquireAttachmentOwner,validateAttachmentHome} from './linux-attachment-maintenance.mjs';
const {z}=await load('zod'),{openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');
const filePolicy=z.object({enabled:z.literal(true),maxFileBytes:z.number().int().min(1).max(4*1024*1024).default(4*1024*1024),maxDomainBytes:z.number().int().min(1024).max(64*1024*1024).default(64*1024*1024),maxFiles:z.number().int().min(4).max(256).default(128)}).strict();
const schema=z.object({source:z.string().min(1),storageRoot:z.string().min(1),initialize:z.boolean().default(false),files:filePolicy.optional()}).strict();
export const name='sep-linux-cold-attachments';
export const provide=['sepLinuxAttachmentBinding','sepAttachmentDomain','attachments'];
export async function apply(ctx,input){
 if(process.platform!=='linux'||process.arch!=='x64')fail('SEP_LINUX_PLATFORM');
 const config=schema.parse(input);
 if(ctx.get('llm',false)||ctx.get('attachments',false)||ctx.get('sepAttachmentDomain',false))fail('SEP_LINUX_ATTACHMENT_COLD_REQUIRED');
 for(const [path,privateRoot]of [[config.source,false],[config.storageRoot,true]]){const held=await directory(path,privateRoot);await held.close();}
 const outside=r=>r==='..'||r.startsWith('../')||isAbsolute(r),a=relative(config.source,config.storageRoot),b=relative(config.storageRoot,config.source);if(!outside(a)||!outside(b))fail('SEP_LINUX_STORAGE_SCOPE');
 const digest=hash(config.source),projectId=digest.slice(0,8)+'-'+digest.slice(8,12)+'-5'+digest.slice(13,16)+'-8'+digest.slice(17,20)+'-'+digest.slice(20,32),selected={storageRoot:config.storageRoot,projectId};
 const control=await openControl({storageRoot:config.storageRoot,initialize:config.initialize,recoverDocumentDeletion:true});let home;
 try{await control.assertOwned();await control.recoverDocumentDeletions();await control.checkpoint();control.assertReadable();home=await initializeAttachmentHome(selected);}finally{await control.close();}
 const lease=await acquireAttachmentOwner({...selected,home});let child,native,closed=false,bound=false,enter=()=>fail('SEP_LINUX_NOT_ACTIVE'),lifetime;const pending=new Set(),local=new AsyncLocalStorage();let tail=Promise.resolve(),queued=0;
 const {AttachmentError}=await load('@deepseek-ai/dsh-attachment');const fileFail=code=>{throw new AttachmentError(code,code);};
 async function lock(){if(++queued>4){queued--;fileFail('SEP_FILE_BUSY');}let done;const next=new Promise(r=>{done=r;}),before=tail;tail=before.then(()=>next);await before;return()=>{queued--;done();};}
 async function guarded(work,request=false){if(closed)fail('SEP_LINUX_CLOSED');const release=enter(),token={};pending.add(token);let unlock;try{if(config.files&&!local.getStore())unlock=await lock();lifetime?.throwIfAborted();await validateAttachmentHome(selected);return await local.run(true,work);}finally{try{if(request&&native)await Promise.allSettled([...native.requestInflight.values()].map(item=>item.promise));}finally{unlock?.();pending.delete(token);release();}}}
 ctx.effect(()=>async()=>{closed=true;while(pending.size||native?.requestInflight.size)await new Promise(r=>setTimeout(r,10));await child?.dispose();await lease.release();});
 const {LocalAttachmentStore}=config.files?await import('./linux-native-file-store.mjs'):await load('@deepseek-ai/dsh-attachment-local');
 async function quota(){let bytes=0,count=0;for(const name of await readdir(home,{recursive:true})){const stat=await lstat(join(home,name));if(stat.isFile()){bytes+=stat.size;count++;}}if(bytes+3*config.files.maxFileBytes>config.files.maxDomainBytes||count+3>config.files.maxFiles)fileFail('SEP_FILE_QUOTA');}
 const streamSignal=signal=>AbortSignal.any([...(signal?[signal]:[]),...(lifetime?[lifetime]:[]),AbortSignal.timeout(30000)]);
 const unsupported=()=>{throw new AttachmentError('This Linux Profile accepts image attachments only; other file attachments are not supported.','SEP_LINUX_FILE_ATTACHMENT_UNSUPPORTED');};
 class GovernedImages extends LocalAttachmentStore{
  admitPromptContent(content){return guarded(()=>super.admitPromptContent(content));}
  validateImage(input){return guarded(()=>super.validateImage(input));}
  saveImage(input){return guarded(()=>super.saveImage(input));}
  saveImages(input){return guarded(()=>super.saveImages(input));}
  readImage(ref,signal){return guarded(()=>super.readImage(ref,signal));}
  requestVersion(...args){return guarded(()=>super.requestVersion(...args),true);}
  async saveFile(input){if(!config.files)unsupported();return guarded(async()=>{if(!(input.data instanceof Uint8Array))fileFail('SEP_FILE_INPUT');if(input.data.byteLength>config.files.maxFileBytes)fileFail('SEP_FILE_TOO_LARGE');await quota();return super.saveFile(input);});}
  async saveFileStream(input){if(!config.files)unsupported();return guarded(async()=>{const signal=streamSignal(input.signal);signal.throwIfAborted();await quota();let count=0;const limit=config.files.maxFileBytes,data=(async function*(){for await(const chunk of input.data){signal.throwIfAborted();if(!(chunk instanceof Uint8Array))fileFail('SEP_FILE_INPUT');if(chunk.byteLength>65536|| (count+=chunk.byteLength)>limit)fileFail(chunk.byteLength>65536?'SEP_FILE_CHUNK_LIMIT':'SEP_FILE_TOO_LARGE');yield chunk;}signal.throwIfAborted();})();return super.saveFileStream({...input,data,signal});});}
  async *readFileStream(ref,signal){if(!config.files)unsupported();if(closed)fail('SEP_LINUX_CLOSED');const release=enter(),token={};pending.add(token);let unlock;try{unlock=await lock();lifetime?.throwIfAborted();await validateAttachmentHome(selected);if(!Number.isSafeInteger(ref.bytes)||ref.bytes<0||ref.bytes>config.files.maxFileBytes)fileFail('INVALID_ATTACHMENT_REF');yield* super.readFileStream(ref,streamSignal(signal));}finally{unlock?.();pending.delete(token);release();}}
  fileHostPath(ref){if(!config.files)unsupported();if(closed)fail('SEP_LINUX_CLOSED');const release=enter();try{return super.fileHostPath(ref);}finally{release();}}
 }
 child=ctx.plugin(GovernedImages,{dshHome:home,maxImageBytes:4*1024*1024,maxImagesPerMessage:1,maxMessageImageBytes:4*1024*1024});await child;native=ctx.get('attachments');
 if(ctx.get('attachments')?.root!==join(home,'attachments/v1'))fail('SEP_ATTACHMENT_PROVIDER_UNAVAILABLE');
 ctx.provide('sepAttachmentDomain',Object.freeze({...selected,home,retention:'until-explicit-purge'}));
 ctx.provide('sepLinuxAttachmentBinding',Object.freeze({...selected,source:config.source,files:config.files,bindRuntime(callback,signal){if(bound||closed||typeof callback!=='function')fail('SEP_LINUX_ATTACHMENT_BINDING');bound=true;enter=callback;lifetime=signal;}}));
}
