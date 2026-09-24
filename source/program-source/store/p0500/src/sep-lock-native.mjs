import {lstat,realpath} from 'node:fs/promises';
import {join,isAbsolute,resolve} from 'node:path';
import {ChildProcess} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {acquireOwnerFile} from './owner-lease.mjs';

const fault=code=>Object.assign(new Error(code),{code});
const key=p=>resolve(p).toLowerCase();
const validOwner=p=>Number.isSafeInteger(p?.pid)&&p.pid>0&&Number.isFinite(Date.parse(p.createdAt));
async function directory(path){
 if(typeof path!=='string'||!isAbsolute(path))throw fault('SEP_NATIVE_SCOPE_INVALID');
 const s=await lstat(path,{bigint:true});
 if(!s.isDirectory()||s.isSymbolicLink()||!s.dev||!s.ino||key(await realpath(path))!==key(path))throw fault('SEP_DIRECTORY_UNVERIFIED');
 return {path,dev:String(s.dev),ino:String(s.ino),birthtimeNs:String(s.birthtimeNs)};
}
function safeCheckpoint(cp){
 if(!cp||!Array.isArray(cp.pending)||cp.pending.length||cp.barrier?.closed!==false||!Array.isArray(cp.deletions)||cp.deletions.some(x=>x.cleanup!=='complete'))throw fault('SEP_PENDING_WORK');
}

/** Per-center, non-serializable authority. No RPC grants arbitrary lock deletion. */
export function createNativeSepLifecycle({suiteLockDirectory,storageRoot,openControl}={}){
 if(typeof openControl!=='function')throw fault('SEP_CONTROL_REQUIRED');
 let identity,observedChild;
 const scope=async()=>{
  const current={suite:await directory(suiteLockDirectory),storage:await directory(storageRoot)};
  if(identity&&!isDeepStrictEqual(identity,current))throw fault('SEP_DIRECTORY_CHANGED');
  identity??=current;return current;
 };
 async function reconcile(){
  let control,suite,result;
  try{
   await scope();
   // P2 is acquired before suite, matching host initialization. Kernel leases
   // and stale-process proof handle either missing or dead-owner metadata.
   control=await openControl({storageRoot,mode:'maintenance',initialize:false});
   const before=await control.checkpoint();safeCheckpoint(before);await control.withAccess(async()=>{});
   suite=await acquireOwnerFile({path:join(suiteLockDirectory,'dsh-system-enhancement-package-v1.lock'),payload:{pid:process.pid,createdAt:new Date().toISOString()},validatePrior:validOwner});
   await scope();await suite.assertOwned();await control.withAccess(async()=>{});
   const after=await control.checkpoint();safeCheckpoint(after);
   if(!isDeepStrictEqual(before.head,after.head)||!isDeepStrictEqual(before.dataFingerprints,after.dataFingerprints))throw fault('SEP_CHECKPOINT_CHANGED');
   result={status:'pass',ownership:'native',dataReplayed:false,checkpoint:{head:after.head,businessSeq:after.businessSeq,deletionSeq:after.deletionSeq}};
  }catch(error){result={status:'blocked',reason:error.code??'SEP_NATIVE_RECOVERY_FAILED',dataReplayed:false};}
  finally{
   try{await suite?.release();}catch(error){result={status:'blocked',reason:error.code??'SEP_SUITE_CLOSE_FAILED',dataReplayed:false};}
   try{await control?.close();}catch(error){result={status:'blocked',reason:error.code??'SEP_CONTROL_CLOSE_FAILED',dataReplayed:false};}
  }
  return result;
 }
 return {
  async beforeStart(){
   if(observedChild&&!observedChild.exit)return {status:'blocked',reason:'SEP_CHILD_STILL_OWNED',dataReplayed:false};
   const result=await reconcile();if(result.status==='pass')observedChild=null;return result;
  },
  observeChild({child,generation}){
   if(observedChild||!(child instanceof ChildProcess)||!Number.isSafeInteger(generation)||generation<1)throw fault('SEP_CHILD_UNPROVEN');
   const record=observedChild={child,generation,exit:null};
   child.once('close',(code,signal)=>{record.exit={code,signal};});
  },
  async afterExit(exit){
   const record=observedChild;
   if(!record||!record.exit||exit?.generation!==record.generation||exit.code!==record.exit.code||exit.signal!==record.exit.signal||(record.child.exitCode===null&&record.child.signalCode===null))return {status:'blocked',reason:'SEP_EXIT_UNPROVEN',dataReplayed:false};
   return reconcile();
  },
 };
}
