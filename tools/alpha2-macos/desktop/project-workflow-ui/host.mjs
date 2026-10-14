// Private composition boundary: never install this object on an HTTP/model service.
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {openProjectWorkflow} from '../../project-workflow/workflow-adapter.mjs';
import {LIMITS,fail,exact,checkBinding,checkDocument,operations,sha} from './rules.mjs';

export async function openHostBridge({binding:input,projectId='current-project',source,controller,project,closeDeadlineMs=5000}={}){
 const binding=checkBinding(input),contexts=new WeakMap(),approvals=new WeakMap(),packets=new Map();
 let admission=true,document,review,pending=0,terminal;
 const available=()=>{if(!admission)fail('SEP_PROJECT_UI_CLOSED');};
 function current(ctx){available();const value=contexts.get(ctx);if(!document||document.ctx!==ctx||!value)fail('SEP_PROJECT_UI_DOCUMENT');return value;}
 const authority={assertDocument:async ctx=>current(ctx),consumeConfirmation:async(token,wanted,ctx)=>{
  current(ctx);const value=approvals.get(token);approvals.delete(token);
  if(!value||value.ctx!==ctx||!isDeepStrictEqual(value.binding,wanted))fail('SEP_PROJECT_UI_APPROVAL');
  return {accepted:true,omissionsAcknowledged:value.omissionsAcknowledged};
 }};
 const workflow=await openProjectWorkflow({projectId,ownerGeneration:binding.ownerGeneration,source,controller,project,authority,closeDeadlineMs});
 const invalidate=()=>{document=undefined;review=undefined;packets.clear();};
 function requireDocument(value){checkDocument(value);if(!document||!isDeepStrictEqual(value,document.public))fail('SEP_PROJECT_UI_DOCUMENT');current(document.ctx);return document.ctx;}
 function packet(value,ctx){
  current(ctx);const bytes=Buffer.from(JSON.stringify(value));if(bytes.length>LIMITS.maxReplyBytes)fail('SEP_PROJECT_UI_REPLY_LIMIT');
  while(packets.size>=LIMITS.retainedReplies)packets.delete(packets.keys().next().value);
  const packetId=randomUUID();packets.set(packetId,{bytes,ctx});return {packetId,bytes:bytes.length,sha256:sha(bytes),pages:Math.ceil(bytes.length/LIMITS.pageBytes)};
 }
 async function request(method,payload){
  available();if(pending>=LIMITS.maxPending)fail('SEP_PROJECT_UI_BUSY');pending++;
  try{
   if(method==='bind'){
    checkDocument(payload);invalidate();const ctx=Object.freeze({});contexts.set(ctx,{...payload,ownerGeneration:binding.ownerGeneration});document={ctx,public:{...payload}};
    return {status:'pass',programSha256:binding.programSha256,ownerGeneration:binding.ownerGeneration};
   }
   if(method==='revoke'){checkDocument(payload);if(document&&isDeepStrictEqual(document.public,payload))invalidate();return {status:'pass'};}
   if(method==='page'){
    exact(payload,['document','packetId','index']);const ctx=requireDocument(payload.document),record=packets.get(payload.packetId);
    if(!record||record.ctx!==ctx||!Number.isSafeInteger(payload.index)||payload.index<0||payload.index>=Math.ceil(record.bytes.length/LIMITS.pageBytes))fail('SEP_PROJECT_UI_PAGE');
    return {packetId:payload.packetId,index:payload.index,data:record.bytes.subarray(payload.index*LIMITS.pageBytes,(payload.index+1)*LIMITS.pageBytes).toString('base64')};
   }
   if(method==='confirmCommit'){
    exact(payload,['document','programSha256','binding','omissionsAcknowledged']);const ctx=requireDocument(payload.document),record=review;
    if(!record||record.ctx!==ctx||payload.programSha256!==binding.programSha256||typeof payload.omissionsAcknowledged!=='boolean'||!isDeepStrictEqual(payload.binding,record.binding))fail('SEP_PROJECT_UI_APPROVAL');
    const token=Object.freeze({});approvals.set(token,{ctx,binding:record.binding,omissionsAcknowledged:payload.omissionsAcknowledged});review=undefined;
    try{return packet(await workflow.commit({reviewId:record.binding.reviewId,planHash:record.binding.planHash,approval:token},ctx),ctx);}finally{approvals.delete(token);}
   }
   if(!operations.includes(method))fail('SEP_PROJECT_UI_OPERATION');exact(payload,['document','input']);const ctx=requireDocument(payload.document);
   if(['select','review','discard','restore','recover','cancel'].includes(method))review=undefined;
   const value=await workflow[method](payload.input,ctx);current(ctx);
   if(method==='review')review={ctx,binding:{...value.binding,reviewId:value.reviewId,reviewSha256:value.reviewSha256}};
   return packet(value,ctx);
  }finally{pending--;}
 }
 const closeAdmission=()=>{admission=false;invalidate();};
 const closed=workflow.whenClosed().then(receipt=>{if(receipt.status==='pass'&&receipt.resourcesConfirmedReleased===true)terminal=receipt;return receipt;});
 return Object.freeze({request,closeAdmission,async close(){closeAdmission();const receipt=await workflow.close();if(receipt.status==='pass'&&receipt.resourcesConfirmedReleased===true)terminal=receipt;return receipt;},whenClosed:()=>closed,inspectQuit:()=>({activeTasks:pending>0,scheduledTasks:false}),status:()=>({admissionOpen:admission,pending,resourcesConfirmedReleased:terminal?.resourcesConfirmedReleased===true})});
}
