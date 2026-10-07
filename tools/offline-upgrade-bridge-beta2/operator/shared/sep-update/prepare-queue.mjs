import {readFile,open,mkdir,lstat} from 'node:fs/promises';import {join,dirname,resolve,isAbsolute} from 'node:path';import {fileURLToPath} from 'node:url';import {randomBytes,randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';
import {durableJson,sign,verify} from './update-admission.mjs';import {jsonFile,fileHash} from './update-inventory.mjs';import {processIdentity,cleanEnv,acquireWorkerLease,isProcessAlive} from './update-process.mjs';
const demand=(v,c)=>{if(!v)throw Error(c);};
export async function ensureControlKey(directory){await mkdir(directory,{recursive:true});const path=join(directory,'control-key');try{const f=await open(path,'wx',0o600);try{await f.writeFile(randomBytes(32));await f.sync();}finally{await f.close();}}catch(e){if(e.code!=='EEXIST')throw e;}const s=await lstat(path);demand(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size===32,'SEP_PREPARATION_KEY');return readFile(path);}
export async function loadInstallation({nodeExecutable,projectDir,userData}){
 demand([nodeExecutable,projectDir,userData].every(p=>typeof p==='string'&&isAbsolute(p)),'SEP_PREPARATION_INSTALLATION');
 const dailyRoot=resolve(dirname(nodeExecutable),'../..'),path=join(dailyRoot,'deployment-rc2.json'),c=await jsonFile(path);
 demand(c.kind==='dsh-sep-managed-daily'&&c.dailyRoot===dailyRoot&&c.releaseRoot===projectDir&&c.electronUserData===userData&&c.nodeExecutable===nodeExecutable,'SEP_PREPARATION_INSTALLATION');
 demand(await fileHash(join(c.releaseRoot,'graph.json'))===c.graphHash,'SEP_PREPARATION_GRAPH');return c;
}
async function spawnWorker(directory,request){const child=spawn(request.installation.nodeExecutable,[fileURLToPath(new URL('./prepare-worker.mjs',import.meta.url)),directory,request.id],{windowsHide:true,detached:true,stdio:'ignore',env:cleanEnv()});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();return child.pid;}
/** Do not supersede unresolved publication even when preparation reported an error. */
export async function assertPreparationSlot(directory,key){let prior,queued;
 try{queued=verify(await jsonFile(join(directory,'queued-request.json')),key);}catch(e){if(e.code!=='ENOENT')throw e;}
 let finalPublication=false;
 if(queued){let state;try{state=verify(await jsonFile(join(directory,'state-'+queued.id+'.json')),key);}catch(e){if(e.code!=='ENOENT')throw e;}
  finalPublication=['verified','rolled_back'].includes(state?.phase);if(!finalPublication)throw Error('SEP_PREPARATION_ALREADY_PENDING');
 }
 try{prior=verify(await jsonFile(join(directory,'auto-request.json')),key);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(prior){let state;try{state=verify(await jsonFile(join(prior.workRoot,'preparation-state.json')),key);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(state?.status==='publication-queued'&&finalPublication&&queued.id===prior.id)return;
  if(!['blocked','cancelled','verified','rolled_back'].includes(state?.status))throw Error('SEP_PREPARATION_ALREADY_PENDING');
 }
}
/** Queue preparation only. The separate offline review grants installation consent. */
export async function queuePreparation({directory,release,nodeExecutable,projectDir,userData}){
 const installation=await loadInstallation({nodeExecutable,projectDir,userData}),key=await ensureControlKey(directory),releaseLease=await acquireWorkerLease(directory,key);let request;
 try{await assertPreparationSlot(directory,key);
 const id=randomUUID(),workRoot=join(directory,'preparations',id);await mkdir(workRoot,{recursive:true});
 request={schema:1,kind:'sep-automatic-preparation',id,release,installation,workRoot,queuedAt:new Date().toISOString(),parentIdentity:await processIdentity(process.pid),selectorHash:await fileHash(join(installation.dailyRoot,'deployment-rc2.json'))};
 await durableJson(directory,'auto-request.json',sign(request,key));await durableJson(workRoot,'preparation-state.json',sign({schema:1,id,status:'waiting-exit',at:new Date().toISOString()},key));
 }finally{await releaseLease();}
 await spawnWorker(directory,request);return {id:request.id,status:'waiting-exit'};
}
/** Resume waiting only; incomplete attempts remain visible and are never silently repeated. */
export async function resumePreparation(directory){let request,key;try{key=await readFile(join(directory,'control-key'));request=verify(await jsonFile(join(directory,'auto-request.json')),key);}catch(e){if(e.code==='ENOENT')return;throw e;}
 const state=verify(await jsonFile(join(request.workRoot,'preparation-state.json')),key);if(state.status==='waiting-exit')await spawnWorker(directory,request);
 else if(['preparing','awaiting-review'].includes(state.status)){
  try{const owner=verify(await jsonFile(join(directory,'worker-lease/owner.json')),key);if(await isProcessAlive(owner.identity))return;}catch(e){if(e.code!=='ENOENT')throw e;}
  await durableJson(request.workRoot,'preparation-state.json',sign({...state,status:'blocked',code:'SEP_PREPARATION_INTERRUPTED',at:new Date().toISOString()},key));throw Error('SEP_PREPARATION_INTERRUPTED');
 }
}
