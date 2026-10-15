import {readFile,lstat,realpath} from 'node:fs/promises';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
let initialized=false,opening,runtime,closing,cleanupOwner,keepAlive=setInterval(()=>{},1000),disconnected=false;
const code=e=>/^(SEP_|P2_|P1_|BUDGET_|OWNER_|FS_)[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_MAC_HOST_OPERATION_FAILED';
const send=m=>new Promise(resolve=>{if(!process.connected){resolve(false);return;}process.send(m,e=>resolve(!e));});
function cleanupReceipt(receipt){
 if(receipt?.status==='pass'&&receipt.resourcesConfirmedReleased===true)return {status:'pass',resourcesConfirmedReleased:true};
 return {status:'blocked',resourcesConfirmedReleased:false,...['sepMacRuntime','sepMacProfile','host'].includes(receipt?.owner)?{owner:receipt.owner}:{},...receipt?.code?{code:code(receipt)}:{}};
}
async function close(id){
 if(closing)return closing;
 closing=(async()=>{
  try{
   if(!runtime&&!cleanupOwner){try{runtime=await opening;}catch(e){if(!cleanupOwner)throw e;}}
   const receipt=cleanupOwner?cleanupReceipt(await cleanupOwner()):await runtime.close();
   await send({type:'reply',operation:'stop',id,receipt});if(receipt?.status==='pass'&&receipt.resourcesConfirmedReleased===true){if(cleanupOwner)process.exitCode=0;clearInterval(keepAlive);if(process.connected)process.disconnect();}return receipt;
  }
  catch(e){const receipt={status:'blocked',code:code(e),resourcesConfirmedReleased:false};await send({type:'reply',operation:'stop',id,receipt});return receipt;}
 })().finally(()=>{closing=undefined;});return closing;
}
process.on('message',message=>{void (async()=>{
 if(message?.type==='initialize'){
  if(initialized)throw Error('duplicate initialize');initialized=true;
  opening=(async()=>{const {modulePath,moduleSha256,input}=message,before=await lstat(modulePath);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||await realpath(modulePath)!==modulePath||createHash('sha256').update(await readFile(modulePath)).digest('hex')!==moduleSha256)throw Error('module changed');const {openMacBusiness}=await import(pathToFileURL(modulePath));
   // Only a rejection from this verified factory may supply a cleanup capability.
   try{return await openMacBusiness(input);}catch(e){if(e?.code==='SEP_MAC_BUSINESS_STARTUP_CLEANUP_BLOCKED'&&typeof e.retryCleanup==='function')cleanupOwner=e.retryCleanup.bind(e);throw e;}
  })();
  runtime=await opening;if(disconnected){await close('parent-disconnected');return;}await send({type:'ready',ready:runtime.ready});return;
 }
 if(typeof message?.id!=='string'||!/^[a-f0-9]{24}$/.test(message.id)||!initialized)return;
 if(message.type==='stop'){await close(message.id);return;}
 if(message.type==='inspect'){try{runtime??=await opening;const inspection=await runtime.inspectQuit();await send({type:'reply',operation:'inspect',id:message.id,inspection});}catch(e){await send({type:'reply',operation:'inspect',id:message.id,error:code(e)});}}
 })().catch(async e=>{await send({type:'failed',code:code(e)});if(!runtime&&!cleanupOwner){clearInterval(keepAlive);process.exitCode=1;if(process.connected)process.disconnect();}});});
process.once('disconnect',()=>{disconnected=true;if(initialized)void close('parent-disconnected');else{clearInterval(keepAlive);process.exitCode=1;}});
