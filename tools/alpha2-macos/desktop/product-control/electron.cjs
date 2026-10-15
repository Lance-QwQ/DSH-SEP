'use strict';
const {createProductChannel}=require('./transport.cjs');
const error=code=>Object.assign(Error(code),{code});
const exact=(v,keys)=>v&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
exports.openElectronControl=function(options){
 if(process.platform!=='darwin'||process.arch!=='arm64'||!process.versions.electron||!require('node:fs').fstatSync(3).isSocket())throw error('SEP_PRODUCT_CARRIER');
 const {programSha256}=require('./fixed-program.cjs').readElectronProgram({executable:process.execPath,physicalFs:require('original-fs')});
 const stream=new (require('node:net').Socket)({fd:3,readable:true,writable:true});
 return exports.createElectronEndpoint({...options,programSha256,stream});
};
exports.createElectronEndpoint=function({stream,programSha256,activate,requestQuit,isReady,canActivate,onFailure=()=>{}}){
 if([activate,requestQuit,isReady,canActivate,onFailure].some(f=>typeof f!=='function'))throw error('SEP_PRODUCT_CONFIG');
 let connected=false,quitting=false,failed=false,proof,activation,quit;const advertised=new Set();
 function failure(code){if(failed)return;failed=true;try{if(connected)channel.send('failure',{code});}catch{}try{onFailure(code);}catch{}}
 function flush(){if(!connected||quitting||failed||!proof||advertised.has(proof.surface))return;let valid=false;try{valid=isReady(proof)===true;}catch{}if(!valid)return;channel.send('ready',{surface:proof.surface});advertised.add(proof.surface);}
 const channel=createProductChannel({stream,role:'electron',programSha256,onFailure:failure,onEnd:()=>{if(!quitting)failure('SEP_PRODUCT_EOF');},onFrame(frame){
  if(failed||quitting)throw error('SEP_PRODUCT_PROTOCOL');
  if(frame.kind==='initialize'){connected=true;channel.send('connected',{replyTo:frame.requestId});flush();return;}
  if(frame.kind==='activate'){
   if(activation||!proof||!canActivate(proof))throw error('SEP_PRODUCT_NOT_READY');activation=frame.requestId;
   Promise.resolve().then(()=>activate()).then(restored=>{if(quitting||failed)return;if(restored!==true){failure('SEP_PRODUCT_NOT_READY');return;}channel.send('activated',{replyTo:activation});activation=undefined;}).catch(()=>failure('SEP_PRODUCT_ACTIVATE_FAILED'));return;
  }
  if(quit)throw error('SEP_PRODUCT_PROTOCOL');quit=frame.requestId;Promise.resolve().then(()=>requestQuit()).catch(()=>failure('SEP_PRODUCT_QUIT_FAILED'));
 }});
 function ready(receipt){const workspace=receipt?.surface==='workspace',required=['schema','surface','rootCommitted',workspace?'loaderCompleted':'handlersBound','windowId'];
  if(!exact(receipt,required)||receipt.schema!==1||!['welcome','workspace'].includes(receipt.surface)||receipt.rootCommitted!==true||receipt[workspace?'loaderCompleted':'handlersBound']!==true||!Number.isSafeInteger(receipt.windowId)||receipt.windowId<1)throw error('SEP_PRODUCT_READY_PROOF');
  if(quitting||failed)return false;proof=Object.freeze({...receipt});flush();return true;
 }
 return Object.freeze({ready,quitCancelled(){if(quitting||failed||!quit)throw error('SEP_PRODUCT_PROTOCOL');channel.send('quitCancelled',{replyTo:quit});quit=undefined;},quitting(){if(quitting||failed)return;quitting=true;activation=undefined;channel.send('quitting');},failed:failure,status:()=>Object.freeze({connected,quitting,failed,surface:proof?.surface??null})});
};
