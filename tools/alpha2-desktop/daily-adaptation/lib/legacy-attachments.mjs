import {lstat,realpath,readdir,readFile,mkdir,open} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,dirname,parse} from 'node:path';
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});},sha=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>resolve(a).toLowerCase()===resolve(b).toLowerCase();
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.nlink].map(String).join(':');
const inside=(a,b)=>{const p=relative(a,b);return !isAbsolute(p)&&p!=='..'&&!p.startsWith('..\\')&&!p.startsWith('../');};
async function directory(path){
 path=resolve(path);let at=parse(path).root;
 for(const part of relative(at,path).split(/[\\/]/).filter(Boolean)){at=join(at,part);const s=await lstat(at,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||!same(await realpath(at),at))fail('SEP_LEGACY_ATTACHMENT_PATH');}
 const s=await lstat(path,{bigint:true});return [s.dev,s.ino,s.birthtimeNs].map(String).join(':');
}
async function file(path,{single=true}={}){
 await directory(dirname(path));const s=await lstat(path,{bigint:true});
 if(!s.isFile()||s.isSymbolicLink()||s.ino===0n||single&&s.nlink!==1n||s.size>20n*1024n*1024n||!same(await realpath(path),path))fail('SEP_LEGACY_ATTACHMENT_FILE');
 const bytes=await readFile(path),after=await lstat(path,{bigint:true});if(stamp(s)!==stamp(after)||BigInt(bytes.length)!==s.size)fail('SEP_LEGACY_ATTACHMENT_CHANGED');
 return {bytes,stamp:stamp(s),group:[s.dev,s.ino].map(String).join(':'),links:Number(s.nlink)};
}
/** Read-only local review. Internal native attachment hardlinks are allowed
 * only when every link is accounted for inside the two enumerated domains.
 * No body is written to the plan or logs. This is not a RAG source exception. */
export async function reviewLegacyAttachments({sourceHome,storageRoot,projectId}){
 if(!isAbsolute(sourceHome??'')||!isAbsolute(storageRoot??'')||!/^[-a-f0-9]{36}$/.test(projectId??''))fail('SEP_LEGACY_ATTACHMENT_INPUT');
 sourceHome=resolve(sourceHome);storageRoot=resolve(storageRoot);if(inside(sourceHome,storageRoot)||inside(storageRoot,sourceHome))fail('SEP_LEGACY_ATTACHMENT_PATH');
 const sourceIdentity=await directory(sourceHome),targetIdentity=await directory(storageRoot),files=[],groups=new Map();let totalBytes=0;
 async function walk(at){await directory(at);for(const name of (await readdir(at)).sort()){
  const path=join(at,name),s=await lstat(path);if(s.isSymbolicLink())fail('SEP_LEGACY_ATTACHMENT_PATH');if(s.isDirectory()){await walk(path);continue;}
  const value=await file(path,{single:false});totalBytes+=value.bytes.length;if(files.length>=2000||totalBytes>256*1024*1024)fail('SEP_LEGACY_ATTACHMENT_LIMIT');
  const group=groups.get(value.group)??{count:0,links:value.links};if(group.links!==value.links)fail('SEP_LEGACY_ATTACHMENT_CHANGED');group.count++;groups.set(value.group,group);
  files.push({path:relative(sourceHome,path).replaceAll('\\','/'),size:value.bytes.length,stamp:value.stamp,sha256:sha(value.bytes)});
 }}
 for(const part of ['attachments','cache/attachments'])try{await walk(join(sourceHome,part));}catch(error){if(error.code!=='ENOENT')throw error;}
 if([...groups.values()].some(group=>group.count!==group.links))fail('SEP_LEGACY_ATTACHMENT_EXTERNAL_LINK');
 const body={schema:1,kind:'sep-daily-legacy-attachment-copy',sourceHome,storageRoot,projectId,sourceIdentity,targetIdentity,files,totalBytes,sourceDisposition:'retained in original home for rollback; never deleted by this operation',copyRetention:'governed attachment domain, until explicit stopped-domain purge'};
 return {...body,planHash:sha(JSON.stringify(body))};
}
async function publish(path,value){
 const bytes=JSON.stringify(value)+'\n';let handle;
 try{handle=await open(path,'wx',0o600);await handle.writeFile(bytes);await handle.sync();}
 catch(error){if(error.code!=='EEXIST')throw error;const existing=await file(path);if(existing.bytes.toString()!==bytes)fail('SEP_LEGACY_ATTACHMENT_DESTINATION');}
 finally{await handle?.close();}
}
async function parentBelow(home,target){
 let current=home;await directory(current);
 for(const part of relative(home,dirname(target)).split(/[\\/]/).filter(Boolean)){
  const next=join(current,part);try{await mkdir(next,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  await directory(next);current=next;
 }
}
/** Trusted stopped-deployment operation only, never a tool/RPC. Caller owns
 * the global maintenance gate and has proved all old writers stopped. Partial
 * files are retained and refuse retries; no overwrite/cleanup guessing occurs.
 * A completion receipt is published only after every legacy copy is verified. */
export async function copyLegacyAttachments({plan,confirm,control,helpers,afterFile}){
 if(!plan||confirm!==plan.planHash||!control||!same(control.storageRoot,plan.storageRoot)||control.mode!=='writer'||typeof control.withCheckpoint!=='function')fail('SEP_LEGACY_ATTACHMENT_CONFIRMATION');
 if(JSON.stringify(await reviewLegacyAttachments(plan))!==JSON.stringify(plan))fail('SEP_LEGACY_ATTACHMENT_CHANGED');
 await control.assertOwned();return control.withCheckpoint(async checkpoint=>{
  if(checkpoint.pending.length||checkpoint.barrier.closed)fail('SEP_LEGACY_ATTACHMENT_GOVERNANCE');
  const home=await helpers.initializeAttachmentHome(plan),owner=await helpers.acquireAttachmentOwner({...plan,home});
  try{
   await publish(join(home,'legacy-import.intent.json'),{schema:1,planHash:plan.planHash,files:plan.files.length,totalBytes:plan.totalBytes,retention:plan.copyRetention});
   for(const [index,row] of plan.files.entries()){
    const source=join(plan.sourceHome,row.path),value=await file(source,{single:false});if(value.stamp!==row.stamp||sha(value.bytes)!==row.sha256)fail('SEP_LEGACY_ATTACHMENT_CHANGED');
    const target=join(home,row.path);if(!inside(home,target))fail('SEP_LEGACY_ATTACHMENT_PATH');
    await parentBelow(home,target);let writer;
    try{writer=await open(target,'wx',0o600);await writer.writeFile(value.bytes);await writer.sync();}
    catch(error){if(error.code!=='EEXIST')throw error;}
    finally{await writer?.close();}
    const copied=await file(target);if(copied.bytes.length!==row.size||sha(copied.bytes)!==row.sha256)fail('SEP_LEGACY_ATTACHMENT_DESTINATION');
    await control.assertOwned();await afterFile?.(index);
   }
   if(JSON.stringify(await reviewLegacyAttachments(plan))!==JSON.stringify(plan))fail('SEP_LEGACY_ATTACHMENT_CHANGED');
   for(const row of plan.files){const copied=await file(join(home,row.path));if(copied.bytes.length!==row.size||sha(copied.bytes)!==row.sha256)fail('SEP_LEGACY_ATTACHMENT_DESTINATION');}
   const receipt={schema:1,status:'pass',planHash:plan.planHash,copiedFiles:plan.files.length,totalBytes:plan.totalBytes,sourceRetained:true,retention:plan.copyRetention};
   await publish(join(home,'legacy-import.complete.json'),receipt);return receipt;
  }finally{await owner.release();}
 });
}
