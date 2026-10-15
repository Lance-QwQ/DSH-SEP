// Same stopped-domain/P2 ownership contract as the captured attachment
// maintenance policy, with native APFS inventory, CAS unlink and full flush.
import {mkdir} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {boundedRead,hash} from '../business/bounded-read.mjs';
import {owned} from '../business/bundle-modules.mjs';
const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js'),{acquireOwnerFile}=await owned('modules/system-enhancement-package/src/owner-lease.mjs');
const fail=code=>{throw Object.assign(Error(code),{code});};
const json=value=>JSON.stringify(value),equal=(a,b)=>json(a)===json(b);
export function createAttachmentMaintenance(io){
 if(!io||['inventory','checkDirectory','removeFile','publishMetadata','syncDirectory'].some(k=>typeof io[k]!=='function'))fail('SEP_ATTACHMENT_CONFIG');
 function select(input){const {storageRoot,projectId}=input??{};if(typeof storageRoot!=='string'||!isAbsolute(storageRoot)||resolve(storageRoot)!==storageRoot||typeof projectId!=='string'||!projectId||projectId.length>128||io.lockPath!==join(storageRoot,'.attachment-native.lock'))fail('SEP_ATTACHMENT_CONFIG');return {storageRoot,projectId,home:join(storageRoot,'.suite-attachments')};}
 async function mkdirChecked(parent,name){const before=await io.checkDirectory(parent),target=join(parent,name);try{await mkdir(target,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}if((await io.checkDirectory(parent)).rootIdentity!==before.rootIdentity)fail('SEP_ATTACHMENT_PLAN_STALE');await io.checkDirectory(target);await io.syncDirectory(parent);return target;}
 async function readRow(home,row){if(row?.kind!=='file'||row.size>1048576)fail('SEP_ATTACHMENT_METADATA_INVALID');let value;try{value=JSON.parse((await boundedRead(join(home,row.path),{maxBytes:1048576,sha256:row.sha256})).toString('utf8'));}catch{fail('SEP_ATTACHMENT_METADATA_INVALID');}return value;}
 async function publish(home,path,value){const inventory=await io.inventory(home),row=inventory.entries.find(e=>e.path===path),text=json(value)+'\n';if(row){if(row.kind!=='file'||row.sha256!==hash(text))fail('SEP_ATTACHMENT_METADATA_INVALID');await readRow(home,row);return;}await io.publishMetadata(home,{path,text,expectedSha256:'absent',expectedVersion:'absent',expectedRootIdentity:inventory.rootIdentity});}
 async function audit(home,inventory){
  const intents=new Map(),complete=new Map();
  for(const row of inventory.entries.filter(e=>e.path.startsWith('purges/'))){
   const match=/^purges\/([a-f0-9]{64})\.(intent|complete)\.json$/.exec(row.path);if(!match)fail('SEP_ATTACHMENT_METADATA_INVALID');const value=await readRow(home,row);
   if(match[2]==='intent'){const {planHash,...body}=value;if(planHash!==match[1]||hash(json(body))!==planHash||value.schema!==1||value.kind!=='purge-all-native-attachment-copies'||value.home!==home||!Array.isArray(value.files)||!Array.isArray(value.pendingPurges))fail('SEP_ATTACHMENT_METADATA_INVALID');intents.set(planHash,value);}else complete.set(match[1],value);
  }
  for(const [id,value]of complete){const target=intents.get(value.planHash);if(!intents.has(id)||!target||value.status!=='pass'||value.remainingFiles!==0||value.deletedFiles!==target.files.length||value.supersededIntent!==id||value.planHash!==id&&!target.pendingPurges.includes(id))fail('SEP_ATTACHMENT_METADATA_INVALID');}
  return [...intents.keys()].filter(id=>!complete.has(id));
 }
 async function inventory(input){const {storageRoot,projectId,home}=select(input),parent=await io.checkDirectory(storageRoot),tree=await io.inventory(home),owner=await readRow(home,tree.entries.find(e=>e.path==='owner.json'));
  if(owner.schema!==1||owner.projectId!==projectId||owner.parent!==parent.rootIdentity||owner.retention!=='until-explicit-purge')fail('SEP_ATTACHMENT_OWNER_MISMATCH');
  const files=tree.entries.filter(e=>e.kind==='file'&&(e.path.startsWith('attachments/')||e.path.startsWith('cache/'))).map(({path,size,sha256,version})=>({path,size,sha256,version}));
  const body={schema:1,kind:'purge-all-native-attachment-copies',storageRoot,projectId,home,homeId:tree.rootIdentity,ownerSha256:hash(json(owner)),retention:owner.retention,pendingPurges:await audit(home,tree),files,totalBytes:files.reduce((n,e)=>n+e.size,0),effects:{sessions:'existing references may become unreadable',rag:'not deleted',sourceFiles:'not deleted',copies:'all normalized attachments, request variants and unfinished cache files in this owned domain'}};
  return {...body,planHash:hash(json(body))};
 }
 async function acquire(input){const selected=select(input);if(input.home!==undefined&&input.home!==selected.home)fail('SEP_ATTACHMENT_OWNER_MISMATCH');await io.checkDirectory(selected.home);await io.checkDirectory(selected.storageRoot);
  // Lease bookkeeping is outside the governed body-copy home. The captured
  // owner facility creates its own SQLite files; those are neither image
  // copies nor objects for this native private-file inventory to erase.
  try{return await acquireOwnerFile({path:join(selected.storageRoot,'.attachment-active.lock'),payload:{pid:process.pid,kind:'sep-native-attachments',projectId:selected.projectId,home:selected.home},validatePrior:value=>value.kind==='sep-native-attachments'&&value.projectId===selected.projectId&&value.home===selected.home});}catch(e){if(['OWNER_LEASE_BUSY','OWNER_ALIVE'].includes(e.code))fail('SEP_ATTACHMENT_IN_USE');throw e;}}
 async function controlled(input,work){const selected=select(input),control=await openControl({storageRoot:selected.storageRoot,initialize:false});let lease;try{await control.assertOwned();await control.checkpoint();control.assertReadable();lease=await acquire(selected);return await work(control);}finally{try{await lease?.release();}finally{await control.close();}}}
 async function initialize(input){const selected=select(input),control=await openControl({storageRoot:selected.storageRoot,initialize:false});let lease;try{
  await control.assertOwned();await control.checkpoint();control.assertReadable();const parent=await io.checkDirectory(selected.storageRoot),home=await mkdirChecked(selected.storageRoot,'.suite-attachments');lease=await acquire(selected);const tree=await io.inventory(home),row=tree.entries.find(e=>e.path==='owner.json'),expected={schema:1,projectId:selected.projectId,parent:parent.rootIdentity,retention:'until-explicit-purge'};
  if(row){if(!equal(await readRow(home,row),expected))fail('SEP_ATTACHMENT_OWNER_MISMATCH');}else{if(tree.entries.length)fail('SEP_ATTACHMENT_OWNER_MISMATCH');await publish(home,'owner.json',expected);}
  const current=await inventory(input);if(current.pendingPurges.length)fail('SEP_ATTACHMENT_PURGE_PENDING');return home;
 }finally{try{await lease?.release();}finally{await control.close();}}}
 const prepare=input=>controlled(input,()=>inventory(input));
 const apply=input=>controlled(input,async control=>{
  if(!input.plan||input.confirm!==input.plan.planHash)fail('SEP_ATTACHMENT_CONFIRMATION_REQUIRED');const current=await inventory(input);if(current.planHash!==input.plan.planHash)fail('SEP_ATTACHMENT_PLAN_STALE');
  await mkdirChecked(current.home,'purges');await publish(current.home,'purges/'+current.planHash+'.intent.json',current);input.onEvent?.('attachment-intent-durable');let deletedFiles=0;
  for(const row of current.files){await control.assertOwned();try{await io.removeFile(current.home,{path:row.path,expectedSha256:row.sha256,expectedVersion:row.version,expectedRootIdentity:current.homeId});}catch(e){if(e.code==='SEP_ATTACHMENT_STALE_FILE')fail('SEP_ATTACHMENT_PLAN_STALE');throw e;}deletedFiles++;input.onEvent?.('attachment-copy-unlinked');}
  const remaining=await inventory(input);if(remaining.files.length)fail('SEP_ATTACHMENT_PLAN_STALE');const receipt={status:'pass',planHash:current.planHash,deletedFiles,remainingFiles:0,retention:current.retention};
  for(const id of [...current.pendingPurges,current.planHash])await publish(current.home,'purges/'+id+'.complete.json',{...receipt,supersededIntent:id});input.onEvent?.('attachment-complete-durable');return receipt;
 });
 return Object.freeze({initialize,acquire,prepare,apply,async validate(input){const current=await inventory(input);if(current.pendingPurges.length)fail('SEP_ATTACHMENT_PURGE_PENDING');return current;}});
}
