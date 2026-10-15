import {Socket} from 'node:net';import {createRequire} from 'node:module';
import {checkBinding,exact,fail,digest} from '../project-workflow-ui/rules.mjs';
import {createClient} from '../project-workflow-ui/transport.mjs';
import {createMainBridge} from '../project-workflow-ui/main.mjs';
import {installMainHandlers} from '../project-workflow-ui/electron-adapter.mjs';
import {createNativeConfirmation} from '../project-workflow-ui/native-confirmation.mjs';
async function initialize(port,programSha256){
 if(!digest(programSha256))fail('SEP_PROJECT_UI_BINDING');
 return new Promise((resolve,reject)=>{
  let bytes=Buffer.alloc(0),settled=false;const timer=setTimeout(()=>finish(Object.assign(Error('SEP_PROJECT_UI_CHANNEL'),{code:'SEP_PROJECT_UI_CHANNEL'})),5000);
  function finish(error,value){if(settled)return;settled=true;clearTimeout(timer);port.pause();for(const [name,fn]of [['data',data],['end',broken],['error',broken],['close',broken]])port.removeListener(name,fn);error?reject(error):resolve(value);}
  const broken=()=>finish(Object.assign(Error('SEP_PROJECT_UI_CHANNEL'),{code:'SEP_PROJECT_UI_CHANNEL'}));
  function data(chunk){if(bytes.length+chunk.length>1024){broken();return;}bytes=Buffer.concat([bytes,chunk]);const nl=bytes.indexOf(10);if(nl<0)return;try{if(nl!==bytes.length-1)fail('SEP_PROJECT_UI_CHANNEL');const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,-1)),value=JSON.parse(text);if(JSON.stringify(value)!==text)fail('SEP_PROJECT_UI_CHANNEL');exact(value,['schema','type','nonce','programSha256','ownerGeneration']);if(value.schema!==1||value.type!=='initialize'||value.programSha256!==programSha256)fail('SEP_PROJECT_UI_BINDING');const {schema,type,...binding}=value;finish(null,checkBinding(binding));}catch(e){finish(e);}}
  port.on('data',data);for(const name of ['end','error','close'])port.on(name,broken);
 });
}
// Dependency composition is private module code. No renderer/HTTP caller can
// provide these capabilities or obtain the binding.
export async function openOwnedEndpoint({port,programSha256,getWindow,ipcMain,confirmNative,onFailure=()=>{}}){
 const binding=await initialize(port,programSha256),rpc=createClient(port,binding);let admission=true,bridge,attached,dispose,closing=false;
 function broken(){if(closing)return;closing=true;admission=false;dispose?.();rpc.closeAdmission();try{onFailure('SEP_PROJECT_UI_CHANNEL');}catch{}}
 for(const name of ['end','close','error'])port.on(name,broken);port.resume();
 return Object.freeze({
  attachWindow(window){if(!admission)fail('SEP_PROJECT_UI_CLOSED');if(!window||window!==getWindow()||window.isDestroyed())fail('SEP_PROJECT_UI_SENDER');if(window===attached)return;dispose?.();bridge=createMainBridge({rpc,getWindow,confirmNative,binding});dispose=installMainHandlers({ipcMain,webContents:window.webContents,bridge});attached=window;},
  inspectQuit:()=>({activeTasks:bridge?.inspectQuit().activeTasks===true||rpc.status().pending>0,scheduledTasks:false}),
  closeAdmission(){if(!admission)return;admission=false;closing=true;dispose?.();rpc.closeAdmission();port.end();},
  status:()=>({admissionOpen:admission,channelOpen:rpc.status().admissionOpen}),
 });
}
export async function openCurrentProjectEndpoint({getWindow,onFailure}){
 if(process.platform!=='darwin'||process.arch!=='arm64'||!process.versions.electron)fail('SEP_PROJECT_UI_PLATFORM');
 const require=createRequire(import.meta.url),{ipcMain,dialog}=require('electron'),physicalFs=require('original-fs');
 const {readElectronProgram}=require('../sep-product-control/fixed-program.cjs');
 const {programSha256}=readElectronProgram({executable:process.execPath,physicalFs});
 const port=new Socket({fd:4,readable:true,writable:true});port.on('error',()=>{});
 return openOwnedEndpoint({port,programSha256,getWindow,ipcMain,confirmNative:createNativeConfirmation(dialog),onFailure});
}
