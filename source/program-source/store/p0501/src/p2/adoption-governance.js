import {lstat,readdir,realpath} from 'node:fs/promises';
import {isAbsolute,resolve,join,dirname} from 'node:path';
import {openAdoptionCopies} from './adoption-copies.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail=suffix=>{const code='P2_ADOPTION_GOVERNANCE_'+suffix;throw Object.assign(new Error(code),{code});};
const identity=info=>`${info.dev}:${info.ino}`;
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const bounded=error=>/^(?:ADOPTION_|P2_ADOPTION_GOVERNANCE_)[A-Z_]+$/.test(error?.code??'')&&error.code.length<100?error.code:'P2_ADOPTION_GOVERNANCE_IO';
async function directory(path){
  let info;try{info=await lstat(path,{bigint:true});}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(!info.isDirectory()||info.isSymbolicLink()||info.ino===0n||!samePath(await realpath(path),path))fail('PATH');
  return identity(info);
}
async function perimeter(storageRoot){
  for(let path=storageRoot;;path=dirname(path)){
    const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())fail('PATH');if(dirname(path)===path)break;
  }
  const paths=[storageRoot,join(storageRoot,'.suite-memory'),join(storageRoot,'.suite-memory','p2'),join(storageRoot,'.suite-memory','p2','adoptions')],identities=[];
  for(const path of paths){const id=await directory(path);if(id===null)return null;identities.push([path,id]);}
  return identities;
}
async function verifyPerimeter(identities){for(const [path,id]of identities)if(await directory(path)!==id)fail('CHANGED');}
async function inventory(base){
  const result=[];
  for(const name of (await readdir(base)).sort()){
    const info=await lstat(join(base,name),{bigint:true});
    result.push({name,directory:info.isDirectory(),link:info.isSymbolicLink(),identity:identity(info)});
  }
  return result;
}

/** Clean only registered process-created adoption bodies. Retained source
 * libraries, preparation metadata and control journals are never removed.
 * Caller owns the shared storage/deletion authority and must fence admission
 * of new copy transactions through business opening; a scan is not that lease.
 * exceptTransactionId is for the caller's currently held transaction, whose
 * cleanup remains the caller's responsibility. Never force-recover another lock.
 * @param {{storageRoot:string,exceptTransactionId?:string,reason:'superseded'|'deleted'}} input
 * @returns {Promise<{complete:boolean,results:Array<{directory:string,transactionId?:string,status:'cleaned'|'incomplete',code?:string}>}>}
 */
export async function cleanupAdoptionTransactions({storageRoot,exceptTransactionId,reason}={}){
  if(!isAbsolute(storageRoot??'')||!['superseded','deleted'].includes(reason)||exceptTransactionId!==undefined&&!UUID.test(exceptTransactionId))fail('INPUT');
  storageRoot=resolve(storageRoot);const base=join(storageRoot,'.suite-memory','p2','adoptions'),results=[];
  const incomplete=(directory,code,transactionId)=>({directory,...transactionId?{transactionId}:{},status:'incomplete',code});
  try{
    const identities=await perimeter(storageRoot);if(identities===null)return {complete:true,results};
    const before=await inventory(base);
    for(const item of before){
      if(!UUID.test(item.name)||!item.directory||item.link){
        // Unknown names may themselves contain private text; do not echo them.
        results.push(incomplete(base,'P2_ADOPTION_GOVERNANCE_UNKNOWN_ENTRY'));continue;
      }
      if(item.name===exceptTransactionId)continue;
      const path=join(base,item.name);let copies,result;
      try{
        await verifyPerimeter(identities);if(await directory(path)!==item.identity)fail('CHANGED');
        copies=await openAdoptionCopies({storageRoot,transactionId:item.name,allowBlocked:true});
        await copies.invalidate(reason);
        const cleaned=await copies.cleanup({recoveryRequired:false});
        result=cleaned.complete?{directory:path,transactionId:item.name,status:'cleaned'}:incomplete(path,bounded({code:cleaned.code??'P2_ADOPTION_GOVERNANCE_CLEANUP_PENDING'}),item.name);
      }catch(error){result=incomplete(path,bounded(error),item.name);}
      finally{try{await copies?.close();}catch{result=incomplete(path,'P2_ADOPTION_GOVERNANCE_RELEASE_PENDING',item.name);}}
      results.push(result);
    }
    await verifyPerimeter(identities);if(JSON.stringify(before)!==JSON.stringify(await inventory(base)))fail('CHANGED');
  }catch(error){results.push(incomplete(base,bounded(error)));}
  return {complete:results.every(result=>result.status==='cleaned'),results};
}
