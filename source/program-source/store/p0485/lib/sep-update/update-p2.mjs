import {readFile,lstat,stat,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {jsonFile} from './update-inventory.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function reduceDecision(body,head,identity,plan){
 if(!body.endsWith('\n'))throw Error('UPDATE_P2_JOURNAL_INVALID');
 const events=body.slice(0,-1).split('\n').map(JSON.parse);let previous=null,closed=true,decision='none';const pending=new Set();
 for(let i=0;i<events.length;i++){
  const {hash,...value}=events[i],p=value.payload;
  if(value.seq!==i+1||value.previous!==previous||value.identity!==identity||hash!==sha(JSON.stringify(value))||i>0&&['initialized','adoption_initialized'].includes(value.type))throw Error('UPDATE_P2_JOURNAL_INVALID');previous=hash;
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
  const identity=sha(`${process.platform==='win32'?canonical.toLowerCase():canonical}\n${s.dev}:${s.ino}`),root=join(canonical,'.suite-memory','p2');
  if(await realpath(root)!==root)throw Error('UPDATE_P2_REDIRECTED');
  const heads=[];for(const p of ['head.json','adoption-control/head.json','document-control/head.json'])try{await lstat(join(root,p));heads.push(join(root,p));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(heads.length!==1||await realpath(dirname(heads[0]))!==dirname(heads[0]))throw Error('UPDATE_P2_AUTHORITY_UNKNOWN');
  const before=await jsonFile(heads[0]),journal=join(root,'journal.jsonl'),st=await lstat(journal);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>64*1024*1024)throw Error('UPDATE_P2_JOURNAL_SCOPE');
  const body=await readFile(journal,'utf8'),after=await jsonFile(heads[0]);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('UPDATE_P2_BUSY');
  return reduceDecision(body,after,identity,plan);
 }catch(e){if(attempt===2)return {decision:'unknown',closed:true,reason:e.message};await delay(50);}
}
