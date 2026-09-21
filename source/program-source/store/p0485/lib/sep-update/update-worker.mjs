import {readFile,open} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {loadAdmission,durableJson,verify,sign} from './update-admission.mjs';
import {inventory,jsonFile,preservationBlocks} from './update-inventory.mjs';
import {hash} from './update-core.mjs';
import {reconcileUpdate} from './update-transaction.mjs';
import {readP2Decision} from './update-p2.mjs';
import {isProcessAlive,processIdentity,acquireWorkerLease,runPublisher,cleanEnv} from './update-process.mjs';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&resolve(a).toLowerCase()===resolve(b).toLowerCase();
export async function runtimeAdapter({directory,id,key,admission,request}){
 const operator=await jsonFile(admission.operatorPath),plan=await jsonFile(admission.planPath);
 const deployment=operator.publicFiles?.find(f=>f.path.endsWith('deployment-rc2.json'));if(!deployment)throw Error('UPDATE_RESTART_ENTRY_MISSING');
 const dailyRoot=dirname(deployment.path),target={root:admission.targetRoot,version:admission.targetVersion,graphHash:admission.targetGraphHash};
 const readState=async()=>{try{return verify(await jsonFile(join(directory,'state-'+id+'.json')),key);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const readDecision=()=>readP2Decision(operator.storageRoot,plan);
 const client=async()=>{const active=await jsonFile(deployment.path);if(!same(active.releaseRoot,target.root)||active.graphHash!==target.graphHash||!same(active.storageRoot,operator.storageRoot))throw Error('UPDATE_SELECTOR_NOT_COMMITTED');
  const connection=await jsonFile(join(dirname(active.controlRoot),'recovery-connection.json'));
  const {recoveryClient}=await import(pathToFileURL(join(target.root,'node_modules/@deepseek-ai/dsh-recovery/src/client.mjs')).href);return {active,client:recoveryClient({...connection,timeoutMs:3000})};};
 return {target,io:{readState,readDecision,isProcessAlive,
  async writeState(state){await durableJson(directory,'state-'+id+'.json',sign(state,key));await durableJson(directory,'last-update-result.json',{...state,target:target.version,decision:request.decision});},
  async execute(mode,onStarted){
   const a=await loadAdmission(directory,request.release,request.currentBinding);if(hash(a)!==request.admissionHash)throw Error('UPDATE_ADMISSION_CHANGED');
   if(mode==='apply'){const [current,candidate]=await Promise.all([inventory(request.projectDir),inventory(target.root)]);if(current.binding!==request.currentBinding||candidate.binding!==a.targetBinding||current.hardBlocks.length||candidate.hardBlocks.length||preservationBlocks(current,candidate).length)throw Error('UPDATE_INVENTORY_CHANGED');}
   await runPublisher({file:process.execPath,args:[a.publisherPath,mode,a.operatorPath],onStarted,record:record=>durableJson(directory,`publisher-${id}-${mode}-${Date.now()}.json`,record)});
  },
  async launch(){const {releaseRoot,graphHash}=await jsonFile(deployment.path);if(!same(releaseRoot,target.root)||graphHash!==target.graphHash)throw Error('UPDATE_SELECTOR_NOT_COMMITTED');
   const child=spawn(process.execPath,[join(dailyRoot,'launch.mjs')],{cwd:dailyRoot,windowsHide:true,detached:true,stdio:'ignore',env:cleanEnv()});await new Promise((res,rej)=>{child.once('spawn',res);child.once('error',rej);});child.unref();return await processIdentity(child.pid);},
  async probe({wait}){const deadline=Date.now()+(wait?30000:0);do{try{
    const {client:c}=await client(),[status,desktop,p2]=await Promise.all([c.call('status'),c.call('desktopStatus'),readDecision()]);
    const host=desktop.guardian??status.guardian;
    if(!same(desktop.projectDir,target.root)||desktop.dshVersion!==target.version||desktop.protocolVersion!==4||host?.phase!=='running'||!await processIdentity(host.pid)||status.writerState!=='open'||status.recoveryState?.state!=='ready'||p2.decision!=='committed'||p2.closed||p2.pending)throw Error('UPDATE_RUNTIME_NOT_READY');
    return {...target,checkedAt:Date.now(),services:{'desktop-host':true,'recovery-control':true,'governed-storage':true},p2Head:p2.head,hostPid:host.pid};
   }catch{}if(Date.now()>=deadline)return null;await delay(500);}while(true);},
  async hold(){
   const gate={schema:1,planHash:plan.hash,planPath:plan.planPath,nativeState:{schemaVersion:1,operationId:plan.id,profile:'web',phase:'installing'}};
   for(const path of [plan.transactionPath,plan.markerPath]){let handle;try{handle=await open(path,'wx',0o600);await handle.writeFile(JSON.stringify(gate));await handle.sync();}catch(e){if(e.code!=='EEXIST')throw e;const prior=await jsonFile(path);if(prior.planHash!==plan.hash)throw Error('UPDATE_FOREIGN_MAINTENANCE');}finally{await handle?.close();}}
   try{const {client:c}=await client();await c.call('stopHost');}catch{}
   const {openControl}=await import(pathToFileURL(join(target.root,'node_modules/dsh-system-enhancement-package/src/p2/control.js')).href);
   const control=await openControl({storageRoot:operator.storageRoot,mode:'maintenance'});try{await control.setBarrier({closed:true,transactionId:plan.id,planHash:plan.hash});return (await control.checkpoint()).barrier.closed===true;}finally{await control.close();}
  }
 }};
}
export async function executeQueued(directory,id){
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('UPDATE_REQUEST_ID');
 const key=await readFile(join(directory,'control-key'));if(key.length!==32)throw Error('UPDATE_ADMISSION_KEY');
 const request=verify(await jsonFile(join(directory,'queued-request.json')),key);if(request.schema!==2||request.id!==id||!request.parentIdentity)throw Error('UPDATE_REQUEST_CHANGED');
 const release=await acquireWorkerLease(directory,key);
 try{
  let prior;try{prior=verify(await jsonFile(join(directory,'state-'+id+'.json')),key);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(['verified','rolled_back','runtime_failed'].includes(prior?.phase))return prior;
  const expires=Date.parse(request.queuedAt)+10800000;if(!Number.isFinite(expires))throw Error('UPDATE_REQUEST_INVALID');
  async function stillQueued(){const next=verify(await jsonFile(join(directory,'queued-request.json')),key);if(hash(next)!==hash(request))throw Error('UPDATE_SUPERSEDED');
   if(prior?.attempted)return;try{const cancel=await jsonFile(join(directory,'cancel-request.json'));if(Date.parse(cancel.cancelledAt)>=Date.parse(request.queuedAt))throw Error('UPDATE_CANCELLED');}catch(e){if(e.code!=='ENOENT')throw e;}if(Date.now()>=expires)throw Error('UPDATE_WAIT_EXPIRED');}
  while(await isProcessAlive(request.parentIdentity)){await stillQueued();await delay(1000);}await stillQueued();
  const admission=await loadAdmission(directory,request.release,request.currentBinding);if(!admission||hash(admission)!==request.admissionHash)throw Error('UPDATE_ADMISSION_CHANGED');
  const {target,io}=await runtimeAdapter({directory,id,key,admission,request});return await reconcileUpdate({id,target,io});
 }finally{await release();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){const [directory,id]=process.argv.slice(2);executeQueued(directory,id).catch(async e=>{if(e.message!=='UPDATE_WORKER_BUSY')await durableJson(directory,'last-update-result.json',{status:'blocked',id,message:String(e.message).slice(0,160),instruction:'保留事务记录；按原计划恢复，禁止盲目重试。'}).catch(()=>{});process.exitCode=1;});}
