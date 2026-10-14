import {createHash} from 'node:crypto';
import {lstat,realpath,mkdir,open,readFile,readdir,unlink} from 'node:fs/promises';
import {join,resolve,relative,sep} from 'node:path';
import {acquireOwnerFile} from '../modules/system-enhancement-package/src/owner-lease.mjs';
import {openControl} from '../modules/system-enhancement-package/src/p2/control.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hash=value=>createHash('sha256').update(value).digest('hex');
const key=value=>JSON.stringify(value);
const identity=s=>({dev:String(s.dev),ino:String(s.ino)});
const equal=(a,b)=>key(a)===key(b);
async function directory(path){const stat=await lstat(path,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink()||stat.ino===0n||resolve(await realpath(path))!==resolve(path))fail('SEP_ATTACHMENT_PATH_INVALID');return identity(stat);}
async function ancestors(root,path){const rel=relative(root,path);if(rel.startsWith('..')||resolve(root,path)!==path)fail('SEP_ATTACHMENT_PATH_INVALID');let current=root;await directory(current);for(const part of rel.split(sep).filter(Boolean)){current=join(current,part);await directory(current);}}
async function jsonFile(path){const s=await lstat(path,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.size>1024n*1024n)fail('SEP_ATTACHMENT_METADATA_INVALID');const text=await readFile(path);const next=await lstat(path,{bigint:true});if(!equal(identity(s),identity(next))||s.mtimeNs!==next.mtimeNs||s.ctimeNs!==next.ctimeNs)fail('SEP_ATTACHMENT_METADATA_INVALID');return JSON.parse(text);}
async function publish(path,value){const file=await open(path,'wx',0o600);try{await file.writeFile(key(value)+'\n');await file.sync();}finally{await file.close();}}
export async function initializeAttachmentHome({storageRoot,projectId}){
 const parent=await directory(storageRoot),home=join(storageRoot,'.suite-attachments'),owner={schema:1,projectId,parent,retention:'until-explicit-purge'};let fresh=false;
 try{await mkdir(home,{mode:0o700});fresh=true;}catch(e){if(e.code!=='EEXIST')throw e;}
 await directory(home);const file=join(home,'owner.json');if(fresh)await publish(file,owner);else if(!equal(await jsonFile(file),owner))fail('SEP_ATTACHMENT_OWNER_MISMATCH');
 const pending=await pendingPurges(home);if(pending.length)fail('SEP_ATTACHMENT_PURGE_PENDING');return home;
}
async function pendingPurges(home){
 let names;try{await directory(join(home,'purges'));names=await readdir(join(home,'purges'));}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const plans=new Map(),completed=new Map(),owner=await jsonFile(join(home,'owner.json'));
 for(const name of names.sort()){
  const match=/^([a-f0-9]{64})\.(intent|complete)\.json$/.exec(name);if(!match)fail('SEP_ATTACHMENT_METADATA_INVALID');const value=await jsonFile(join(home,'purges',name));
  if(match[2]==='intent'){const {planHash,...body}=value;if(planHash!==match[1]||hash(key(body))!==planHash||value.schema!==1||value.kind!=='purge-all-native-attachment-copies'||value.home!==home||value.projectId!==owner.projectId||!Array.isArray(value.files)||!Array.isArray(value.pendingPurges))fail('SEP_ATTACHMENT_METADATA_INVALID');plans.set(match[1],value);}
  else completed.set(match[1],value);
 }
 for(const [id,value] of completed){const target=plans.get(value.planHash);if(!plans.has(id)||!target||value.status!=='pass'||value.remainingFiles!==0||value.deletedFiles!==target.files.length||value.supersededIntent!==id||value.planHash!==id&&!target.pendingPurges.includes(id))fail('SEP_ATTACHMENT_METADATA_INVALID');}
 return [...plans.keys()].filter(id=>!completed.has(id));
}
async function inventory(storageRoot,projectId){
 const parent=await directory(storageRoot),home=join(storageRoot,'.suite-attachments'),homeId=await directory(home),owner=await jsonFile(join(home,'owner.json'));if(owner.projectId!==projectId||!equal(owner.parent,parent)||owner.schema!==1||owner.retention!=='until-explicit-purge')fail('SEP_ATTACHMENT_OWNER_MISMATCH');
 const files=[];let totalBytes=0;
 async function walk(path){await ancestors(home,path);for(const name of (await readdir(path)).sort()){
  const file=join(path,name),s=await lstat(file,{bigint:true});if(s.isSymbolicLink())fail('SEP_ATTACHMENT_PATH_INVALID');if(s.isDirectory()){await walk(file);continue;}if(!s.isFile()||s.nlink!==1n||s.ino===0n||s.size>20n*1024n*1024n)fail('SEP_ATTACHMENT_FILE_INVALID');
  totalBytes+=Number(s.size);if(files.length>=2000||totalBytes>256*1024*1024)fail('SEP_ATTACHMENT_INVENTORY_LIMIT');const bytes=await readFile(file),after=await lstat(file,{bigint:true});if(!equal(identity(s),identity(after))||s.size!==after.size||s.mtimeNs!==after.mtimeNs||s.ctimeNs!==after.ctimeNs)fail('SEP_ATTACHMENT_PLAN_STALE');files.push({path:relative(home,file),...identity(s),size:Number(s.size),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs),sha256:hash(bytes)});
 }}
 for(const relativePath of ['attachments','cache']){const path=join(home,relativePath);try{await directory(path);}catch(e){if(e.code==='ENOENT')continue;throw e;}await walk(path);}
 const body={schema:1,kind:'purge-all-native-attachment-copies',storageRoot:resolve(storageRoot),projectId,home,homeId,ownerSha256:hash(key(owner)),retention:owner.retention,pendingPurges:await pendingPurges(home),files,totalBytes,effects:{sessions:'existing references may become unreadable',rag:'not deleted',sourceFiles:'not deleted',copies:'all normalized attachments, request variants and unfinished cache files in this owned domain'}};return {...body,planHash:hash(key(body))};
}
export async function acquireAttachmentOwner({home,projectId}){
 try{return await acquireOwnerFile({path:join(home,'active.lock'),payload:{pid:process.pid,kind:'sep-native-attachments',projectId},validatePrior:value=>value.kind==='sep-native-attachments'&&value.projectId===projectId});}catch(e){if(['OWNER_LEASE_BUSY','OWNER_ALIVE'].includes(e.code))fail('SEP_ATTACHMENT_IN_USE');throw e;}
}
async function owned(input,fn){const control=await openControl({storageRoot:input.storageRoot,initialize:false});let lease;try{await control.assertOwned();await control.checkpoint();control.assertReadable();const current=await inventory(input.storageRoot,input.projectId);lease=await acquireAttachmentOwner({...input,home:current.home});return await fn(control);}finally{try{await lease?.release();}finally{await control.close();}}}
export const prepareAttachmentPurge=input=>owned(input,()=>inventory(input.storageRoot,input.projectId));
export const applyAttachmentPurge=input=>owned(input,async control=>{
 if(!input.plan||input.confirm!==input.plan.planHash)fail('SEP_ATTACHMENT_CONFIRMATION_REQUIRED');const current=await inventory(input.storageRoot,input.projectId);if(current.planHash!==input.plan.planHash)fail('SEP_ATTACHMENT_PLAN_STALE');
 const audit=join(current.home,'purges');await mkdir(audit,{recursive:true,mode:0o700});await ancestors(current.home,audit);const intent=join(audit,current.planHash+'.intent.json');try{await publish(intent,current);}catch(e){if(e.code!=='EEXIST'||!equal(await jsonFile(intent),current))throw e;}
 let deletedFiles=0;for(const row of current.files){await control.assertOwned();const file=join(current.home,row.path);await ancestors(current.home,resolve(file,'..'));const s=await lstat(file,{bigint:true}),bytes=await readFile(file),after=await lstat(file,{bigint:true});if(!equal(identity(s),identity(after))||s.nlink!==1n||after.nlink!==1n||s.isSymbolicLink()||s.size!==BigInt(row.size)||String(s.mtimeNs)!==row.mtimeNs||String(s.ctimeNs)!==row.ctimeNs||!equal(identity(s),{dev:row.dev,ino:row.ino})||hash(bytes)!==row.sha256)fail('SEP_ATTACHMENT_PLAN_STALE');await unlink(file);deletedFiles++;}
 const remaining=await inventory(input.storageRoot,input.projectId);if(remaining.files.length)fail('SEP_ATTACHMENT_PLAN_STALE');const receipt={status:'pass',planHash:current.planHash,deletedFiles,remainingFiles:0,retention:current.retention};
 for(const id of [...current.pendingPurges,current.planHash]){const file=join(audit,id+'.complete.json');try{await publish(file,{...receipt,supersededIntent:id});}catch(e){if(e.code!=='EEXIST')throw e;await jsonFile(file);}}
 return receipt;
});
