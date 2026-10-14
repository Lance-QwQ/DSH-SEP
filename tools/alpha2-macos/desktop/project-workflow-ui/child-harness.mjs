import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {appendFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {binding,defer} from './portable-fixture.mjs';
import {createClient} from './transport.mjs';
import {createMainBridge} from './main.mjs';
export async function childFixture({native=false,confirm=async()=>({accepted:true,omissionsAcknowledged:false})}={}){
 await mkdir(process.env.SEP_UI_TEST_ROOT,{recursive:true});
 const allowed=['SystemRoot','WINDIR','PATH','TMP','TEMP','HOME','SEP_UI_TEST_ROOT','SEP_MAC_TREE_HELPER','SEP_MAC_TREE_HELPER_SHA256'];
 const env=Object.fromEntries(allowed.filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
 const child=spawn(process.execPath,[fileURLToPath(new URL('./child-worker.mjs',import.meta.url)),native?'native':'portable'],{stdio:['ignore','pipe','pipe',process.platform==='win32'?'overlapped':'pipe','ipc'],env});
 const ready=defer(),exited=defer(),waiters=new Map();let sequence=0,stdout='',stderr='',exit;
 child.stdout.on('data',b=>{stdout=(stdout+b).slice(-8192);});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-8192);});
 child.on('message',m=>{if(m.ready===true)ready.resolve(m);else {const p=waiters.get(m.id);if(p){waiters.delete(m.id);m.error?p.reject(Object.assign(Error(m.error),{code:m.error})):p.resolve(m.value);}}});
 child.on('error',e=>{for(const p of waiters.values())p.reject(e);ready.resolve({error:e.code});});
 child.on('close',(code,signal)=>{exit={code,signal};exited.resolve(exit);ready.resolve({exit});for(const p of waiters.values())p.reject(Error('test child exited'));waiters.clear();});
 const deadline=(promise,ms)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('SEP_PROJECT_UI_TEST_DEADLINE')),ms);promise.then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
 const command=(name)=>{const id=++sequence;return deadline(new Promise((resolve,reject)=>{waiters.set(id,{resolve,reject});child.send({id,command:name});}),10000);};
 const rpc=createClient(child.stdio[3],binding),frame={url:'dsh-app://app/index.html'},webContents={mainFrame:frame},window={id:17,webContents,isDestroyed:()=>false,isVisible:()=>true},event={sender:webContents,senderFrame:frame};
 const steps=[];let receivedBytes=0;child.stdio[3].on('data',b=>{receivedBytes+=b.length;});
 const main=createMainBridge({rpc:{request:async(method,value)=>{steps.push({method,phase:'start'});try{const result=await rpc.request(method,value);steps.push({method,phase:'done'});return result;}catch(e){steps.push({method,phase:'failed',code:e.code});throw e;}}},getWindow:()=>window,confirmNative:confirm,binding});
 let cleaned=false;
 async function cleanup(){
  if(cleaned)return;main.closeAdmission();let receipt,status='blocked';
  try{receipt=await command('close');assert.equal(receipt.status,'pass');assert.equal(receipt.resourcesConfirmedReleased,true);rpc.closeAdmission();child.stdio[3].end();const result=await deadline(exited.promise,10000);assert.deepEqual(result,{code:0,signal:null});status='pass';cleaned=true;}
  finally{await appendFile(join(process.env.SEP_UI_TEST_ROOT,'CHILD-CLEANUP.jsonl'),JSON.stringify({native,pid:child.pid,status,receipt,exit,steps,receivedBytes,stdout,stderr,forcedKill:false})+'\n');}
 }
 try{const ack=await deadline(ready.promise,10000);assert.equal(ack.ready,true);assert.equal(ack.pid,child.pid);assert.equal(ack.mode,native?'native':'portable');}
 catch(e){try{await cleanup();}catch{}throw e;}
 return {main,event,command,cleanup,rpc,child};
}
