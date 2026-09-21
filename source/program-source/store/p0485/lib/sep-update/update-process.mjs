import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readlink,mkdir,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {durableJson,sign,verify} from './update-admission.mjs';
import {jsonFile} from './update-inventory.mjs';
const exec=promisify(execFile);
export const cleanEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>['SYSTEMROOT','WINDIR','PATH','COMSPEC','PATHEXT','TEMP','TMP'].includes(k.toUpperCase())));
export async function processIdentity(pid){
 if(!Number.isSafeInteger(pid)||pid<1)throw Error('UPDATE_PROCESS_IDENTITY_INVALID');
 if(process.platform==='win32'){
  const command=`$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($null -eq $p){'null'}else{[pscustomobject]@{pid=$p.Id;birth=$p.StartTime.ToUniversalTime().ToString('o');exe=$p.Path}|ConvertTo-Json -Compress}`;
  const {stdout}=await exec(join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:5000,maxBuffer:32768,env:cleanEnv()});
  const p=JSON.parse(stdout.trim());if(p&&(!p.birth||!p.exe))throw Error('UPDATE_PROCESS_IDENTITY_UNKNOWN');return p;
 }
 try{const body=await readFile(`/proc/${pid}/stat`,'utf8');return {pid,birth:body.slice(body.lastIndexOf(')')+2).split(' ')[19],exe:await readlink(`/proc/${pid}/exe`)};}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function isProcessAlive(identity){if(!identity?.birth||!identity.exe)throw Error('UPDATE_PROCESS_IDENTITY_UNKNOWN');const p=await processIdentity(identity.pid);return !!p&&p.birth===identity.birth&&p.exe===identity.exe;}
export async function acquireWorkerLease(directory,key){
 const path=join(directory,'worker-lease'),owner={token:randomUUID(),identity:await processIdentity(process.pid)};
 for(let attempt=0;attempt<2;attempt++){
  try{await mkdir(path);}catch(e){if(e.code!=='EEXIST')throw e;const prior=verify(await jsonFile(join(path,'owner.json')),key);if(await isProcessAlive(prior.identity))throw Error('UPDATE_WORKER_BUSY');
   // Exclusive retirement guard prevents two observers from renaming a replacement lease.
   const guard=join(directory,'worker-retirement');await mkdir(guard);
   try{const again=verify(await jsonFile(join(path,'owner.json')),key);if(again.token!==prior.token)throw Error('UPDATE_WORKER_CHANGED');await rename(path,join(directory,'orphan-worker-'+prior.token));}finally{await rm(guard,{recursive:true});}continue;
  }
  await durableJson(path,'owner.json',sign(owner,key));return async()=>{const p=verify(await jsonFile(join(path,'owner.json')),key);if(p.token!==owner.token)throw Error('UPDATE_WORKER_CHANGED');await rm(path,{recursive:true});};
 }
 throw Error('UPDATE_WORKER_BUSY');
}
/** Timeouts preserve uncertain effects. Output is drained, but only byte counts,
 * hashes and exit metadata are retained, never arbitrary plugin output/secrets. */
export async function runPublisher({file,args,onStarted,record,timeoutMs=120000}){
 const started=Date.now(),digest=createHash('sha256');let bytes=0;
 const child=spawn(file,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:cleanEnv()});
 const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});completion.catch(()=>{});
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{bytes+=b.length;digest.update(b);});
 let timer;
 try{
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  const identity=await processIdentity(child.pid);await onStarted(identity??{pid:child.pid,birth:'exited-before-inspection',exe:file});
  const result=await Promise.race([completion,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('UPDATE_PUBLISH_TIMEOUT_OUTCOME_UNKNOWN')),timeoutMs);})]);
  await record({elapsedMs:Date.now()-started,bytes,outputHash:digest.copy().digest('hex'),...result});
  if(result.code!==0)throw Error('UPDATE_P2_FAILED_'+result.code);return result;
 }catch(e){await record({elapsedMs:Date.now()-started,bytes,outputHash:digest.copy().digest('hex'),status:'blocked',code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'UPDATE_PUBLISH_ERROR'});throw e;}finally{clearTimeout(timer);}
}
