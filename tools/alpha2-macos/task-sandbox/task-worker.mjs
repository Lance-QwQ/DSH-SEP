import {spawn,execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {release} from 'node:os';
import {posix} from 'node:path';
import {promisify} from 'node:util';
import {prepareTask,validateInput,buildPolicy,platformSupported} from './task-contract.mjs';

const exec=promisify(execFile),hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const publicReceipt=(status,code,fields={})=>Object.freeze({status,code,resourcesConfirmedReleased:false,workRetentionRequired:true,...fields});
async function platform(){
 if(process.platform!=='darwin'||process.arch!=='arm64')fail('SEP_MAC_TASK_PLATFORM_UNVERIFIED');
 const options={env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},timeout:3000,maxBuffer:4096};
 const version=(await exec('/usr/bin/sw_vers',['-productVersion'],options)).stdout.trim();
 const build=(await exec('/usr/bin/sw_vers',['-buildVersion'],options)).stdout.trim();
 const value={platform:process.platform,arch:process.arch,version,build,darwin:release()};
 if(!platformSupported(value))fail('SEP_MAC_TASK_PLATFORM_UNVERIFIED');return Object.freeze(value);
}
function trustedReceipt(bytes,input){
 if(bytes.length===0||bytes.length>4096)return undefined;
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return undefined;}
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!=='descendantsConfirmed,exitCode,mode,reason,sandboxApplied,signal,waited')return undefined;
 if(typeof value.waited!=='boolean'||!Number.isInteger(value.exitCode)||value.exitCode < -1||value.exitCode>255||!Number.isInteger(value.signal)||value.signal<0||value.signal>127||value.sandboxApplied!==true||value.descendantsConfirmed!==false||value.mode!==input.mode||!['exit','timeout','cancelled','parent_lost','wait_error','cleanup_deadline'].includes(value.reason))return undefined;
 if(value.waited&&(value.exitCode===-1?value.signal===0:value.signal!==0))return undefined;
 return value;
}
/** Trusted integration owns config/io and the fixed authority. No model input
 * can replace the executable, environment, policy, owner, or native IO. */
export async function createTaskWorker(config,io){
 const system=await platform(),prepared=await prepareTask(config);
 if(!io||io.lockPath!==posix.join(prepared.authorityRoot,'.native.lock')||!['tree','applyFile'].every(k=>typeof io[k]==='function'))fail('SEP_MAC_TASK_AUTHORITY');
 let admitted=false,state='ready',result,closedResolve;
 const closed=new Promise(resolve=>{closedResolve=resolve;});
 const marker=hash(prepared.workRoot)+'.task.jsonl';
 async function run(raw={}){
  const input=validateInput(raw);if(admitted)fail('SEP_MAC_TASK_ALREADY_USED');
  // This closes admission synchronously, before any asynchronous preflight.
  admitted=true;state='preparing';
  if(input.signal?.aborted){result=publicReceipt('fail','SEP_MAC_TASK_CANCELLED',{resourcesConfirmedReleased:true});state='closed';closedResolve(result);return result;}
  let started;
  try{
   const checked=await prepareTask(config);
   if(['workIdentity','runtimeIdentity','authorityIdentity'].some(k=>checked[k]!==prepared[k]))fail('SEP_MAC_TASK_SCOPE_CHANGED');
   const tree=await io.tree(prepared.workRoot);
   started=JSON.stringify({schema:1,state:'started',mode:input.mode,workPathSha256:hash(prepared.workRoot),workIdentity:prepared.workIdentity,workSha256:tree.sha256,executableSha256:prepared.executableSha256,ownerSha256:prepared.ownerSha256,requestSha256:hash(JSON.stringify({args:input.args,stdin:input.stdin,timeoutMs:input.timeoutMs,graceMs:input.graceMs,maxOutputBytes:input.maxOutputBytes})),platform:system})+'\n';
   try{await io.applyFile(prepared.authorityRoot,{path:marker,expectedSha256:'absent',text:started});}
   catch(error){if(error?.code==='SEP_PROJECT_STALE_FILE')fail('SEP_MAC_TASK_ALREADY_USED');throw error;}
  }catch(error){state='blocked';throw error;}
  state='running';
  let owner,ownerExited=false,ownerClosed=false,spawnFailure=false,ioFailure=false,outputLimit=false,cancelled=false,receiptInvalid=false;
  let retained=0,receiptBytes=0,ownerExitCode,ownerExitSignal,timer,responseResolve,responseDone=false,finalizing=false;
  const output={stdout:[],stderr:[]},receiptChunks=[];
  const response=new Promise(resolve=>{responseResolve=resolve;});
  const respond=value=>{result=value;if(!responseDone){responseDone=true;responseResolve(value);}};
  function requestStop(){if(owner&&!ownerExited){try{owner.kill('SIGTERM');}catch{ioFailure=true;}}}
  function cancel(){cancelled=true;requestStop();}
  function retain(name,chunk){
   const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk),take=Math.min(bytes.length,input.maxOutputBytes-retained);
   if(take>0){output[name].push(Buffer.from(bytes.subarray(0,take)));retained+=take;}
   if(take<bytes.length&&!outputLimit){outputLimit=true;requestStop();}
  }
  function texts(){
   let invalid=false;const decode=chunks=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{invalid=true;return '';}};
   const stdout=decode(output.stdout),stderr=decode(output.stderr);return {stdout,stderr,invalid};
  }
  function blocked(code){const {stdout,stderr}=texts();return publicReceipt('blocked',code,{mode:input.mode,stdout,stderr});}
  async function finish(){
   if(finalizing||!ownerClosed)return;finalizing=true;clearTimeout(timer);input.signal?.removeEventListener('abort',cancel);
   const ack=!receiptInvalid&&trustedReceipt(Buffer.concat(receiptChunks),input),text=texts();
   let code,clean=false,status='blocked';
   if(input.mode==='family')code='SEP_MAC_TASK_FAMILY_CLEANUP_UNCONFIRMED';
   else if(!spawnFailure&&!ioFailure&&ownerExitCode===0&&!ownerExitSignal&&ack?.waited){
    clean=true;status='pass';code='SEP_MAC_TASK_COMPLETE';
    if(outputLimit){status='fail';code='SEP_MAC_TASK_OUTPUT_LIMIT';}
    else if(cancelled||ack.reason==='cancelled'){status='fail';code='SEP_MAC_TASK_CANCELLED';}
    else if(ack.reason==='timeout'){status='fail';code='SEP_MAC_TASK_TIMEOUT';}
    else if(ack.reason!=='exit'||ack.exitCode!==0||ack.signal!==0){status='fail';code='SEP_MAC_TASK_EXIT';}
    else if(text.invalid){status='fail';code='SEP_MAC_TASK_OUTPUT_ENCODING';}
   }else code='SEP_MAC_TASK_CLEANUP_UNCONFIRMED';
   let value=publicReceipt(status,code,{mode:input.mode,resourcesConfirmedReleased:clean,stdout:text.stdout,stderr:text.stderr});
   // Persist only classification, never task input/output. Failed completion
   // binding leaves the started marker and cannot authorize commit or reuse.
   try{await io.applyFile(prepared.authorityRoot,{path:marker,expectedSha256:hash(started),text:started+JSON.stringify({schema:1,state:clean?'closed':'blocked',status,code,resourcesConfirmedReleased:clean})+'\n'});}
   catch{clean=false;value=blocked('SEP_MAC_TASK_RECORD_UNCONFIRMED');}
   state=clean?'closed':'blocked';respond(value);if(clean)closedResolve(value);
  }
  try{
   owner=spawn(prepared.ownerPath,[input.mode,String(input.timeoutMs),String(input.graceMs),prepared.workRoot,'3',buildPolicy(prepared,input.mode),prepared.executable,...input.args],{cwd:prepared.workRoot,env:{HOME:prepared.workRoot,TMPDIR:prepared.workRoot,PATH:prepared.runtimeRoot,LANG:'C',LC_ALL:'C'},stdio:['pipe','pipe','pipe','pipe']});
   owner.stdout.on('data',chunk=>retain('stdout',chunk));owner.stderr.on('data',chunk=>retain('stderr',chunk));
   // FD 3 is closed in the native task before sandbox-exec. Task output is
   // never parsed as an ownership acknowledgement.
   owner.stdio[3].on('data',chunk=>{receiptBytes+=chunk.length;if(receiptBytes>4096){receiptInvalid=true;requestStop();}else receiptChunks.push(Buffer.from(chunk));});
   for(const stream of [owner.stdout,owner.stderr,owner.stdio[3]])stream.on('error',()=>{ioFailure=true;requestStop();});
   owner.stdin.on('error',()=>{if(!ownerExited)ioFailure=true;requestStop();});
   owner.once('error',()=>{spawnFailure=true;});
   owner.once('exit',(code,signal)=>{
    ownerExited=true;ownerExitCode=code;ownerExitSignal=signal;
    // Family children may hold pipes forever. Closing our endpoints bounds
    // transport resources; it is never descendant-cleanup evidence.
    if(input.mode==='family'){owner.stdout.destroy();owner.stderr.destroy();owner.stdin.destroy();}
   });
   owner.once('close',(code,signal)=>{ownerClosed=true;ownerExitCode=code;ownerExitSignal=signal;void finish();});
   input.signal?.addEventListener('abort',cancel,{once:true});if(input.signal?.aborted)cancel();
   owner.stdin.end(input.stdin);
   timer=setTimeout(()=>{state='blocked';requestStop();respond(blocked('SEP_MAC_TASK_CLEANUP_DEADLINE'));},input.timeoutMs+input.graceMs+3000);
  }catch{
   spawnFailure=true;state='blocked';respond(blocked('SEP_MAC_TASK_CLEANUP_UNCONFIRMED'));
  }
  return response;
 }
 return Object.freeze({run,whenClosed:()=>closed,status:()=>Object.freeze({state,admissionOpen:!admitted,result})});
}
