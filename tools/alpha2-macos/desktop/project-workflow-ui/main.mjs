import {randomUUID} from 'node:crypto';
import {LIMITS,fail,exact,checkBinding,operations,sha,digest} from './rules.mjs';

export function createMainBridge({rpc,getWindow,confirmNative,binding:input}={}){
 const binding=checkBinding(input);if(typeof rpc?.request!=='function'||typeof getWindow!=='function'||typeof confirmNative!=='function')fail('SEP_PROJECT_UI_CONFIG');
 let admission=true,current,review,presented=false,pending=0,dialog,epoch=0,revocation=Promise.resolve();
 function sender(event){
  if(!admission)fail('SEP_PROJECT_UI_CLOSED');const w=getWindow();
  if(!w||w.isDestroyed()||event?.sender!==w.webContents||event.senderFrame!==w.webContents.mainFrame)fail('SEP_PROJECT_UI_SENDER');
  let url;try{url=new URL(event.senderFrame.url);}catch{fail('SEP_PROJECT_UI_SENDER');}
  if(url.protocol!=='dsh-app:'||url.hostname!=='app'||url.username||url.password||url.port)fail('SEP_PROJECT_UI_SENDER');return w;
 }
 function document(event){const w=sender(event);if(!current||current.window!==w||current.frame!==event.senderFrame)fail('SEP_PROJECT_UI_DOCUMENT');return current;}
 const recheck=(event,record)=>{if(document(event)!==record)fail('SEP_PROJECT_UI_DOCUMENT');};
 async function counted(work){if(pending>=LIMITS.maxPending)fail('SEP_PROJECT_UI_BUSY');pending++;try{return await work();}finally{pending--;}}
 function invalidate(){epoch++;const prior=current;current=undefined;review=undefined;presented=false;dialog?.abort();if(prior)revocation=revocation.then(()=>rpc.request('revoke',prior.public));revocation.catch(()=>{});}
 async function unpack(descriptor,record,event){
  exact(descriptor,['packetId','bytes','sha256','pages']);
  if(typeof descriptor.packetId!=='string'||descriptor.packetId.length>128||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||descriptor.bytes>LIMITS.maxReplyBytes||!digest(descriptor.sha256)||descriptor.pages!==Math.ceil(descriptor.bytes/LIMITS.pageBytes))fail('SEP_PROJECT_UI_PAGE');
  const parts=[];
  for(let index=0;index<descriptor.pages;index++){
   recheck(event,record);const page=await rpc.request('page',{document:record.public,packetId:descriptor.packetId,index});recheck(event,record);exact(page,['packetId','index','data']);
   if(page.packetId!==descriptor.packetId||page.index!==index||typeof page.data!=='string'||page.data.length>Math.ceil(LIMITS.pageBytes/3)*4)fail('SEP_PROJECT_UI_PAGE');
   const bytes=Buffer.from(page.data,'base64');if(bytes.toString('base64')!==page.data||bytes.length!==Math.min(LIMITS.pageBytes,descriptor.bytes-index*LIMITS.pageBytes))fail('SEP_PROJECT_UI_PAGE');parts.push(bytes);
  }
  const bytes=Buffer.concat(parts);if(sha(bytes)!==descriptor.sha256)fail('SEP_PROJECT_UI_PAGE');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('SEP_PROJECT_UI_PAGE');}
 }
 async function begin(event){return counted(async()=>{
  const w=sender(event);invalidate();const start=epoch;await revocation;sender(event);if(start!==epoch)fail('SEP_PROJECT_UI_DOCUMENT');const record={window:w,frame:event.senderFrame,public:{windowId:w.id,documentGeneration:randomUUID()}};current=record;
  const ack=await rpc.request('bind',record.public);recheck(event,record);exact(ack,['status','programSha256','ownerGeneration']);if(ack.status!=='pass'||ack.programSha256!==binding.programSha256||ack.ownerGeneration!==binding.ownerGeneration){invalidate();fail('SEP_PROJECT_UI_BINDING');}return {status:'pass'};
 });}
 async function call(event,method,value){return counted(async()=>{
  if(!operations.includes(method))fail('SEP_PROJECT_UI_OPERATION');const record=document(event);
  if(['select','review','discard','restore','recover','cancel'].includes(method)){review=undefined;presented=false;dialog?.abort();}
  const result=await unpack(await rpc.request(method,{document:record.public,input:value}),record,event);recheck(event,record);
  if(method==='review'){
   const original={...result};delete original.reviewSha256;
   if(sha(Buffer.from(JSON.stringify(original)))!==result.reviewSha256||result.binding?.ownerGeneration!==binding.ownerGeneration||result.binding?.windowId!==record.public.windowId||result.binding?.documentGeneration!==record.public.documentGeneration)fail('SEP_PROJECT_UI_REVIEW');
   review=structuredClone(result);
  }return result;
 });}
 async function markPresented(event,value){exact(value,['reviewId','reviewSha256']);document(event);if(!review||value.reviewId!==review.reviewId||value.reviewSha256!==review.reviewSha256)fail('SEP_PROJECT_UI_REVIEW');presented=true;return {status:'pass'};}
 async function commit(event,value){return counted(async()=>{
  exact(value,['reviewId']);const record=document(event),retained=review;
  if(dialog||!presented||!retained||value.reviewId!==retained.reviewId||Date.now()>=retained.binding.expiresAt||!record.window.isVisible())fail('SEP_PROJECT_UI_REVIEW');
  const abort=new AbortController();dialog=abort;let choice;
  try{choice=await confirmNative({window:record.window,review:structuredClone(retained),signal:abort.signal});recheck(event,record);if(abort.signal.aborted||review!==retained)fail('SEP_PROJECT_UI_DOCUMENT');exact(choice,['accepted','omissionsAcknowledged']);if(typeof choice.accepted!=='boolean'||typeof choice.omissionsAcknowledged!=='boolean')fail('SEP_PROJECT_UI_CONFIRMATION');}
  finally{if(dialog===abort)dialog=undefined;}
  if(!choice.accepted)return {status:'cancelled'};if(Date.now()>=retained.binding.expiresAt)fail('SEP_PROJECT_UI_REVIEW');
  review=undefined;presented=false;
  const descriptor=await rpc.request('confirmCommit',{document:record.public,programSha256:binding.programSha256,binding:{...retained.binding,reviewId:retained.reviewId,reviewSha256:retained.reviewSha256},omissionsAcknowledged:choice.omissionsAcknowledged});
  return unpack(descriptor,record,event);
 });}
 return Object.freeze({begin,call,presented:markPresented,commit,navigate:invalidate,closeAdmission(){admission=false;invalidate();},inspectQuit:()=>({activeTasks:pending>0||dialog!==undefined,scheduledTasks:false})});
}
