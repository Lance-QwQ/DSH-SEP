import {fork,ChildProcess} from 'node:child_process';import {checkBinding} from '../project-workflow-ui/rules.mjs';import {openProjectRelay} from './relay.mjs';import {readFile,lstat,realpath} from 'node:fs/promises';import {isAbsolute} from 'node:path';import {createHash,randomBytes} from 'node:crypto';
const failure=code=>Object.assign(Error(code),{code});
function bound(promise,ms,code){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(failure(code)),ms);promise.then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});}
/** One real child per launch generation; blocked stop remains retryable. The
 * containing launcher must retain its native lease until whenStopped resolves. */
export function createHostOwner({nodeExecutable,modulePath,moduleSha256,input,projectBinding,env={},startDeadlineMs=40000,stopDeadlineMs=35000,onOutput=()=>{}}={}){
 if(!isAbsolute(nodeExecutable??'')||!isAbsolute(modulePath??'')||!/^[a-f0-9]{64}$/.test(moduleSha256??'')||[startDeadlineMs,stopDeadlineMs].some(v=>!Number.isSafeInteger(v)||v<1||v>60000)||typeof onOutput!=='function')throw failure('SEP_MAC_HOST_CONFIG');
 const binding=checkBinding(projectBinding);let relay;
 const serialized=JSON.stringify(input);if(serialized===undefined||Buffer.byteLength(serialized)>65536)throw failure('SEP_MAC_HOST_CONFIG');
 let child,phase='idle',starting,stopping,ready,readyResolve,readyReject,exit,exitResolve,closeReceipt,stoppedResolve;
 const waitingReady=new Promise((r,j)=>{readyResolve=r;readyReject=j;});waitingReady.catch(()=>{});const exited=new Promise(r=>{exitResolve=r;}),stopped=new Promise(r=>{stoppedResolve=r;}),pending=new Map();
 const status=()=>({phase,generation:1,pid:child?.pid??null,...(exit?{lastExit:{...exit,forced:false}}:{})});
 function maybeStopped(){if(exit?.code===0&&!exit.signal&&closeReceipt?.status==='pass'&&closeReceipt.resourcesConfirmedReleased===true){phase='stopped';stoppedResolve({status:'pass',resourcesConfirmedReleased:true});return true;}return false;}
 async function send(message){if(!child?.connected)throw failure('SEP_MAC_HOST_CHANNEL_CLOSED');await new Promise((r,j)=>child.send(message,e=>e?j(failure('SEP_MAC_HOST_CHANNEL_CLOSED')):r()));}
 async function request(type,ms){const id=randomBytes(12).toString('hex');let resolve;const reply=new Promise(r=>{resolve=r;});pending.set(id,resolve);try{await send({type,id});return await bound(reply,ms,'SEP_MAC_HOST_REQUEST_DEADLINE');}finally{pending.delete(id);}}
 async function start(){
  if(phase==='running')return status();if(starting)return starting;if(phase!=='idle')throw failure('SEP_MAC_HOST_CLOSED');phase='starting';
  starting=(async()=>{
   const before=await lstat(modulePath);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||await realpath(modulePath)!==modulePath)throw failure('SEP_MAC_HOST_MODULE_CHANGED');
   if(createHash('sha256').update(await readFile(modulePath)).digest('hex')!==moduleSha256)throw failure('SEP_MAC_HOST_MODULE_CHANGED');
   const after=await lstat(modulePath);if(before.dev!==after.dev||before.ino!==after.ino||before.mtimeMs!==after.mtimeMs||before.size!==after.size)throw failure('SEP_MAC_HOST_MODULE_CHANGED');
   if(phase!=='starting')throw failure('SEP_MAC_HOST_CLOSED');
   child=fork(new URL('./business-host.mjs',import.meta.url),[],{execPath:nodeExecutable,execArgv:[],env:Object.fromEntries(Object.entries(env).filter(([,v])=>v!==undefined)),stdio:['ignore','pipe','pipe','ipc',process.platform==='win32'?'overlapped':'pipe']});
   child.stdout.on('data',b=>onOutput('stdout',b));child.stderr.on('data',b=>onOutput('stderr',b));
   child.once('error',()=>{phase='blocked';readyReject(failure('SEP_MAC_HOST_SPAWN_FAILED'));});
   child.on('message',m=>{if(m?.type==='ready'){ready=m.ready;if(phase==='starting'){phase='running';readyResolve(ready);}}else if(m?.type==='failed'){readyReject(failure(/^(SEP_|P2_|P1_|BUDGET_|OWNER_|FS_)[A-Z0-9_]{1,90}$/.test(m.code??'')?m.code:'SEP_MAC_HOST_START_FAILED'));phase='blocked';}else if(m?.type==='reply'&&typeof m.id==='string'){if(m.operation==='stop'){closeReceipt=m.receipt;maybeStopped();}pending.get(m.id)?.(m);}});
   child.once('exit',(code,signal)=>{exit={code,signal};exitResolve(exit);if(!maybeStopped()){phase='blocked';readyReject(failure('SEP_MAC_HOST_EXIT_UNCONFIRMED'));}});
   await send({type:'initialize',modulePath,moduleSha256,input:JSON.parse(serialized),projectBinding:binding});await bound(waitingReady,startDeadlineMs,'SEP_MAC_HOST_START_DEADLINE');return status();
  })().catch(e=>{phase='blocked';throw e;}).finally(()=>{starting=undefined;});return starting;
 }
 async function stop(){
  if(phase==='stopped')return status();if(stopping)return stopping;
  stopping=(async()=>{
   if(starting&&!child){phase='stopping';await starting.catch(()=>{});}
   if(!child){phase='stopped';exit={code:0,signal:null};const r={status:'pass',resourcesConfirmedReleased:true};stoppedResolve(r);return status();}
   if(exit){phase='blocked';return status();}phase='stopping';
   try{const response=await request('stop',stopDeadlineMs);if(response.receipt?.status!=='pass'||response.receipt.resourcesConfirmedReleased!==true){phase='blocked';return status();}closeReceipt=response.receipt;child.stdio[4].end();await bound(exited,stopDeadlineMs,'SEP_MAC_HOST_EXIT_DEADLINE');return status();}
   catch{phase='blocked';return status();}
  })().finally(()=>{stopping=undefined;});return stopping;
 }
 function attachProjectDesktop(desktop){if(phase!=='running'||relay||!(desktop instanceof ChildProcess)||!Number.isSafeInteger(desktop.pid)||desktop.pid<1||desktop.exitCode!==null||desktop.signalCode!==null||!desktop.stdio[4])throw failure('SEP_PROJECT_UI_OWNER');relay=openProjectRelay({hostPort:child.stdio[4],desktopPort:desktop.stdio[4],binding});return relay;}
 return Object.freeze({status,start,attachProjectDesktop,ready:async()=>{if(phase!=='running')throw failure('SEP_MAC_HOST_NOT_RUNNING');return ready;},inspect:async()=>{if(phase!=='running')throw failure('SEP_MAC_HOST_NOT_RUNNING');const r=await request('inspect',3000);if(r.error||typeof r.inspection?.activeTasks!=='boolean'||typeof r.inspection?.scheduledTasks!=='boolean')throw failure('SEP_MAC_HOST_INSPECTION_UNKNOWN');return r.inspection;},stop,whenStopped:()=>stopped});
}
