import {lstat,readdir,realpath,readFile} from 'node:fs/promises';
import {isAbsolute,resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {openAdoptionCopies} from './adoption-copies.js';
import {acquireAdoptionAdmission} from './adoption-admission.js';
import {openControl,DATA_DOMAINS} from './control.js';
import {verifySnapshot} from './backups.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DAY=86400000,MAX_BODY=32*1024*1024;
const fail=suffix=>{const code='P2_ADOPTION_RETENTION_'+suffix;throw Object.assign(new Error(code),{code});};
const bounded=e=>/^(?:ADOPTION_|P2_)[A-Z_]{1,90}$/.test(e?.code??'')?e.code:'P2_ADOPTION_RETENTION_IO';
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const identity=s=>`${s.dev}:${s.ino}`;
const hash=b=>createHash('sha256').update(b).digest('hex');
async function maybe(path){try{return await lstat(path,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function directory(path){const s=await maybe(path);if(!s)return null;if(!s.isDirectory()||s.isSymbolicLink()||s.ino===0n||!samePath(await realpath(path),path))fail('PATH');return identity(s);}
async function fingerprints(storageRoot){
  const result={};
  for(const name of DATA_DOMAINS){
    const path=join(storageRoot,name+'.json'),before=await maybe(path);if(!before){result[name]=null;continue;}
    if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>BigInt(MAX_BODY)||!samePath(await realpath(path),path))fail('RECOVERY_REQUIRED');
    const bytes=await readFile(path),after=await lstat(path,{bigint:true});
    if(identity(after)!==identity(before)||after.nlink!==1n||after.size!==before.size||after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs||bytes.length>MAX_BODY)fail('CHANGED');
    result[name]=hash(bytes);
  }
  return result;
}
async function safeCheckpoint(storageRoot,transactionId,cp){
  if(cp.pending.length)return false;
  const actual=await fingerprints(storageRoot);if(!isDeepStrictEqual(actual,cp.dataFingerprints))return false;
  if(!cp.barrier.closed)return true;
  const a=cp.adoption;
  // Publication itself cleans copies after accepting the baseline and before
  // opening business. Requiring an open barrier here would create a cycle.
  if(a?.origin.transactionId!==transactionId||a.status!=='adopted'||a.firstBaseline?.status!=='ready'||cp.businessSeq!==a.commit.businessSeq||cp.deletionSeq!==a.commit.deletionSeq||!isDeepStrictEqual(actual,a.commit.dataFingerprints))return false;
  const directory=join(storageRoot,'.suite-memory','p2','backups',cp.epoch);
  if(a.firstBaseline.id!==cp.epoch||!samePath(a.firstBaseline.directory,directory))return false;
  const snapshot=await verifySnapshot(directory),prior=snapshot.baseline.deletionCheckpoint;
  return snapshot.checksum===a.firstBaseline.checksum&&prior?.identity===cp.identity&&prior.epoch===cp.epoch&&isDeepStrictEqual(prior.adoption?.commit,a.commit);
}

/** Caller already holds this transaction's copies lease. All additional leases
 * are fail-fast and live through fn. A borrowed writer needs withCheckpoint so
 * same-process business cannot start between this proof and the last unlink.
 * No stale owner is reclaimed, no source ACL changed, no P2 record appended. */
export async function withAdoptionRecoveryGuard({storageRoot,transactionId,control:borrowed}={},fn){
  if(!isAbsolute(storageRoot??'')||!UUID.test(transactionId??'')||typeof fn!=='function')fail('INPUT');
  storageRoot=resolve(storageRoot);let admission,control;
  try{
    admission=await acquireAdoptionAdmission({storageRoot,transactionId});await admission.assertOwned();
    const execute=async cp=>{
      const safe=await safeCheckpoint(storageRoot,transactionId,cp);await admission.assertOwned();
      // Importing/verifying origins seed already-known restrictions before
      // publishing domains. Those are not new withdrawals of the live plan.
      const revoked=cp.adoption?cp.adoption.status==='adopted'&&cp.deletionSeq>cp.adoption.commit.deletionSeq:cp.deletionSeq>0;
      const result=await fn({recoveryRequired:!safe,revoked});await admission.assertOwned();return result;
    };
    if(borrowed){
      if(!samePath(borrowed.storageRoot??'',storageRoot)||typeof borrowed.withCheckpoint!=='function'||typeof borrowed.assertOwned!=='function')fail('GUARD');
      await borrowed.assertOwned();return await borrowed.withCheckpoint(execute);
    }
    const root=join(storageRoot,'.suite-memory','p2'),journal=await maybe(join(root,'journal.jsonl'));
    if(!journal){
      const remnants=['head.json','adoption-control','document-control','owner.lock','recovery.guard'];
      const uncertain=(await Promise.all(remnants.map(n=>maybe(join(root,n))))).some(Boolean)||(await Promise.all(DATA_DOMAINS.map(n=>maybe(join(storageRoot,n+'.json'))))).some(Boolean);
      await admission.assertOwned();const result=await fn({recoveryRequired:uncertain});await admission.assertOwned();return result;
    }
    if(!journal.isFile()||journal.isSymbolicLink()||journal.nlink!==1n)fail('RECOVERY_REQUIRED');
    control=await openControl({storageRoot,mode:'maintenance'});
    const result=await execute(await control.checkpoint());await control.assertOwned();return result;
  }finally{try{await control?.close();}finally{await admission?.close();}}
}

/** Runs only inside the explicit storageRoot. start() awaits startup inspection;
 * callers must await it before admitting new work. Subsequent ticks are serial,
 * and stop() waits for an already running sweep without cancelling its journal
 * protocol. A shutdown does not promise physical deletion while powered off. */
export function createAdoptionRetention({storageRoot,clock=Date.now,intervalMs=60000,withRecoveryGuard=withAdoptionRecoveryGuard,afterRun}={}){
  if(!isAbsolute(storageRoot??'')||storageRoot.includes('\0')||typeof clock!=='function'||typeof withRecoveryGuard!=='function'||afterRun!==undefined&&typeof afterRun!=='function'||!Number.isSafeInteger(intervalMs)||intervalMs<10||intervalMs>DAY)fail('INPUT');
  storageRoot=resolve(storageRoot);const base=join(storageRoot,'.suite-memory','p2','adoptions'),bindings=new Map();
  let tail=Promise.resolve(),running=false,timer,generation=0,lastResult=null,lastTime=0;
  const now=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<lastTime||n<0)fail('CLOCK');lastTime=n;return n;};
  async function perimeter(){
    // Like admission, inspect ancestors for links without asking Windows to
    // resolve each user's parent directory. The managed root is canonicalized.
    for(let p=storageRoot;;p=dirname(p)){const s=await maybe(p);if(!s?.isDirectory()||s.isSymbolicLink())fail('PATH');if(dirname(p)===p)break;}
    for(const [p,id]of bindings)if(await directory(p)!==id)fail('CHANGED');
    for(const p of [storageRoot,join(storageRoot,'.suite-memory'),join(storageRoot,'.suite-memory','p2'),base]){const id=await directory(p);if(id===null)return false;bindings.set(p,id);}
    return true;
  }
  function pending(transactionId,code,details={}){return {...transactionId?{transactionId}:{},status:'cleanup_pending',code,...details};}
  async function inspectTransaction(transactionId,id){
    let copies,result;
    try{
      await perimeter();const path=join(base,transactionId);if(await directory(path)!==id)fail('CHANGED');
      copies=await openAdoptionCopies({storageRoot,transactionId,clock:now,allowBlocked:true});if(await directory(path)!==id)fail('CHANGED');
      result=await (async()=>{
      const cp=await copies.inspect();if(cp.expiresAt===undefined)fail('RECOVERY_REQUIRED');
      const timing={expiresAt:cp.expiresAt,expired:cp.expired};
      const wasUsable=!cp.expired&&!cp.invalidated;
      if(cp.expired&&!cp.invalidated)await copies.invalidate('expired');
      if(cp.cleanup==='complete'&&!cp.blocked)return {transactionId,status:'cleaned',...timing};
      let invoked=false;
      try{
        await withRecoveryGuard({storageRoot,transactionId},async proof=>{
          if(invoked||typeof proof?.recoveryRequired!=='boolean')fail('GUARD');invoked=true;
          if(wasUsable&&!proof.revoked){result=cp.blocked?pending(transactionId,bounded(cp),timing):{transactionId,status:'active',...timing};return;}
          if(wasUsable)await copies.invalidate('deleted');
          const clean=await copies.cleanup({recoveryRequired:proof.recoveryRequired});
          result=clean.complete?{transactionId,status:'cleaned',...timing}:pending(transactionId,clean.code??'P2_ADOPTION_RETENTION_CLEANUP_PENDING',{...timing,recoveryRequired:proof.recoveryRequired});
        });
        if(!invoked)fail('GUARD');
      }catch(e){
        // Invalidated first; uncertainty must not discard recovery evidence.
        await copies.cleanup({recoveryRequired:true});
        result=pending(transactionId,bounded(e),{...timing,recoveryRequired:true});
      }
      return result;
      })();
      await perimeter();
    }catch(e){result=pending(transactionId,bounded(e));}
    finally{try{await copies?.close();}catch(e){result=pending(transactionId,bounded(e));}}
    return result;
  }
  async function transactions(){
    const entries=await readdir(base);if(entries.length>4096)fail('LIMIT');const result=[];
    for(const name of entries.sort()){const s=await lstat(join(base,name),{bigint:true});result.push({name,directory:s.isDirectory(),link:s.isSymbolicLink(),identity:identity(s)});}
    return result;
  }
  async function sweep(){
    const results=[];let checkedAt;
    try{
      checkedAt=now();if(await perimeter()){
        const entries=await transactions();
        for(const entry of entries){
          if(!UUID.test(entry.name)||!entry.directory||entry.link){results.push(pending(undefined,'P2_ADOPTION_RETENTION_UNKNOWN_ENTRY'));continue;}
          results.push(await inspectTransaction(entry.name,entry.identity));
        }
        await perimeter();if(!isDeepStrictEqual(entries,await transactions()))fail('CHANGED');
      }
    }catch(e){results.push(pending(undefined,bounded(e)));}
    return {version:1,storageRoot,...checkedAt===undefined?{}:{checkedAt},complete:results.every(r=>r.status!=='cleanup_pending'),results,sourceFiles:'retained',sourcePermissions:'unchanged',modelCalls:0};
  }
  function run(){
    const work=tail.then(sweep).then(async r=>{
      // Trusted metadata governance runs after every copies/storage lease has
      // been released, but before a following body sweep or stop can complete.
      if(afterRun)try{
        const metadata=await afterRun(structuredClone(r));if(typeof metadata?.complete!=='boolean')fail('HOOK');
        r={...r,complete:r.complete&&metadata.complete,metadata:structuredClone(metadata)};
      }catch(e){r={...r,complete:false,metadata:{complete:false,code:bounded(e)}};}
      lastResult=r;return r;
    });tail=work.catch(()=>{});return work;
  }
  function schedule(token){if(!running||token!==generation)return;timer=setTimeout(async()=>{try{await run();}finally{schedule(token);}},intervalMs);}
  return {
    storageRoot,run,
    async start(){if(running){await tail;return lastResult;}running=true;const token=++generation;const first=await run();schedule(token);return first;},
    async stop(){running=false;generation++;clearTimeout(timer);await tail;return lastResult;},
    status:()=>({running,lastResult:structuredClone(lastResult)})
  };
}
