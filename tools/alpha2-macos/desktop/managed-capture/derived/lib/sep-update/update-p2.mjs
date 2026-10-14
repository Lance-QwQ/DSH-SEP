import {readFile,lstat,stat,realpath} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {jsonFile} from './update-inventory.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const key=p=>process.platform==='win32'?resolve(p).toLowerCase():resolve(p);
/** Same offline rename receipt contract as SEP P2 storage-location.js. This
 * observer remains read-only and validates the full journal chain afterwards. */
async function storageIdentity(storageRoot,locationKey,root,body){
 const normal=sha(`${key(storageRoot)}\n${locationKey}`),path=join(root,'storage-location.json');let before;
 try{before=await lstat(path,{bigint:true});}catch(e){if(e.code==='ENOENT')return normal;throw e;}
 const invalid=()=>{throw Error('UPDATE_P2_RELOCATION_INVALID');};
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>16384n)invalid();
 const bytes=await readFile(path),after=await lstat(path,{bigint:true});
 if(['dev','ino','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]))invalid();
 const r=JSON.parse(bytes),keys=['schema','kind','fromRoot','toRoot','fileId','identity','approvedHead'];
 if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k))||r.schema!==1||r.kind!=='same-directory-rename'||!isAbsolute(r.fromRoot??'')||!isAbsolute(r.toRoot??'')||key(r.toRoot)!==key(storageRoot)||key(r.fromRoot)===key(r.toRoot)||r.fileId!==locationKey||!/^[a-f0-9]{64}$/.test(r.identity??'')||sha(`${key(r.fromRoot)}\n${locationKey}`)!==r.identity)invalid();
 if(!Number.isSafeInteger(r.approvedHead?.seq)||r.approvedHead.seq<1||!/^[a-f0-9]{64}$/.test(r.approvedHead.hash??''))invalid();
 const event=JSON.parse(body.trimEnd().split('\n')[r.approvedHead.seq-1]??'null');
 if(!event||event.seq!==r.approvedHead.seq||event.hash!==r.approvedHead.hash||event.identity!==r.identity)invalid();
 const {hash,...value}=event;if(sha(JSON.stringify(value))!==hash)invalid();return r.identity;
}
export function reduceDecision(body,head,identity,plan){
 if(!body.endsWith('\n'))throw Error('UPDATE_P2_JOURNAL_INVALID');
 const events=body.slice(0,-1).split('\n').map(JSON.parse);let previous=null,closed=true,decision='none';const pending=new Set();
 for(let i=0;i<events.length;i++){
  const {hash,...value}=events[i],p=value.payload;
  if(value.seq!==i+1||value.previous!==previous||value.identity!==identity||hash!==sha(JSON.stringify(value))||i>0&&['initialized','adoption_initialized'].includes(value.type))throw Error('UPDATE_P2_JOURNAL_INVALID');previous=hash;
  if(value.type==='initialized')closed=false;
  if(value.type==='barrier')closed=p.closed;
  if(['business_intent','maintenance_intent','adoption_intent'].includes(value.type))pending.add(p.operationId);
  if(['business_complete','maintenance_complete','adoption_complete'].includes(value.type))pending.delete(p.operationId);
  if(value.type==='recovered_intents')for(const id of p.operationIds)pending.delete(id);
  if(['committed','rolled_back'].includes(value.type)&&p.transactionId===plan.id){if(p.planHash!==plan.hash||decision!=='none')throw Error('UPDATE_P2_DECISION_CONFLICT');decision=value.type;}
 }
 if(head.identity!==identity||head.seq!==events.length||head.hash!==previous||!['initialized','adoption_initialized'].includes(events[0]?.type)||typeof closed!=='boolean')throw Error('UPDATE_P2_JOURNAL_INVALID');
 return {decision,closed,pending:pending.size,head,identity};
}
/** Read-only observation: never acquires or steals the live storage writer lock. */
export async function readP2Decision(storageRoot,plan){
 for(let attempt=0;attempt<3;attempt++)try{
  const canonical=await realpath(storageRoot),s=await stat(canonical,{bigint:true});if(s.ino===0n)throw Error('UPDATE_P2_IDENTITY_UNKNOWN');
  const root=join(canonical,'.suite-memory','p2');
  if(await realpath(root)!==root)throw Error('UPDATE_P2_REDIRECTED');
  const heads=[];for(const p of ['head.json','adoption-control/head.json','document-control/head.json'])try{await lstat(join(root,p));heads.push(join(root,p));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(heads.length!==1||await realpath(dirname(heads[0]))!==dirname(heads[0]))throw Error('UPDATE_P2_AUTHORITY_UNKNOWN');
  const before=await jsonFile(heads[0]),journal=join(root,'journal.jsonl'),st=await lstat(journal);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>64*1024*1024)throw Error('UPDATE_P2_JOURNAL_SCOPE');
  const body=await readFile(journal,'utf8'),after=await jsonFile(heads[0]);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('UPDATE_P2_BUSY');
  const identity=await storageIdentity(canonical,`${s.dev}:${s.ino}`,root,body),current=await stat(canonical,{bigint:true});
  if(current.dev!==s.dev||current.ino!==s.ino||await realpath(storageRoot)!==canonical)throw Error('UPDATE_P2_IDENTITY_CHANGED');
  return reduceDecision(body,after,identity,plan);
 }catch(e){if(attempt===2)return {decision:'unknown',closed:true,reason:e.message};await delay(50);}
}
