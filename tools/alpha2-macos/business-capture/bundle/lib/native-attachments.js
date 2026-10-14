import {z} from 'zod';
import {join} from 'node:path';
import {openControl} from '../modules/system-enhancement-package/src/p2/control.js';
import {initializeAttachmentHome,acquireAttachmentOwner} from './attachment-maintenance.js';
export const name='dsh-sep-native-attachments';
export const provide=['sepAttachmentDomain','attachments'];
const schema=z.object({storageRoot:z.string().min(1),projectId:z.string().uuid()}).strict();
const fail=code=>{throw Object.assign(new Error(code),{code});};
// Cold prerequisite: mount before the native LLM, whose optional attachment
// injection would otherwise refresh an already-active controlled root.
export async function apply(ctx,input){
 const config=schema.parse(input);if(ctx.get('attachments',false)||ctx.get('sepAttachmentDomain',false))fail('SEP_ATTACHMENT_PROVIDER_CONFLICT');
 const control=await openControl({...config,initialize:false});let home;
 try{await control.assertOwned();await control.checkpoint();control.assertReadable();home=await initializeAttachmentHome(config);}finally{await control.close();}
 const lease=await acquireAttachmentOwner({...config,home});let child;
 ctx.effect(()=>async()=>{await child?.dispose();await lease.release();});
 const native=await import('@deepseek-ai/dsh-attachment-local');child=ctx.plugin(native.default,{dshHome:home,maxImageBytes:4*1024*1024,maxImagesPerMessage:1,maxMessageImageBytes:4*1024*1024});await child;
 if(!ctx.get('attachments')||ctx.get('attachments').root!==join(home,'attachments','v1'))fail('SEP_ATTACHMENT_PROVIDER_UNAVAILABLE');
 ctx.provide('sepAttachmentDomain',Object.freeze({...config,home,retention:'until-explicit-purge'}));
}
