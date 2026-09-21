import {digest,fail} from './errors.js';
import {sessionEvents} from './session-events.js';
const validRef=r=>r&&Object.keys(r).every(k=>['sessionId','messageId','textHash'].includes(k))&&typeof r.sessionId==='string'&&r.sessionId.length>0&&typeof r.messageId==='string'&&r.messageId.length>0&&/^[a-f0-9]{64}$/.test(r.textHash??'');
export const provenanceShape=p=>p?.version===1&&Object.keys(p).every(k=>['version','complete','refs'].includes(k))&&typeof p.complete==='boolean'&&Array.isArray(p.refs)&&p.refs.length<=512&&p.refs.every(validRef)&&(!p.complete||p.refs.length>0);
export const validProvenance=p=>provenanceShape(p)&&p.complete;
export function messageProvenance(exec,messageId){
 const session=exec.agent?.session,found=sessionEvents(session).filter(e=>e.type==='user/message'&&e.data.id===messageId&&e.data.source?.kind==='user'&&e.data.role==='user');
 if(!session?.header?.id||session.header.isSeeded||session.header.origin==='subagent'||found.length!==1||!found[0].data.content?.length||!found[0].data.content.every(b=>b.type==='text'&&typeof b.text==='string'))return {version:1,complete:false,refs:[]};
 return {version:1,complete:true,refs:[{sessionId:session.header.id,messageId,textHash:digest(found[0].data.content.map(b=>b.text).join('\n'))}]};
}
export function mergeProvenance(...items){
 const refs=[...new Map(items.flatMap(p=>Array.isArray(p?.refs)?p.refs.filter(validRef):[]).map(r=>[JSON.stringify(r),r])).values()];
 if(refs.length>512)fail('MEMORY_PROVENANCE_LIMIT');
 return {version:1,complete:items.length>0&&items.every(validProvenance),refs};
}
export function assertSourceOutside(provenances,source){
 if(provenances.some(p=>!validProvenance(p)))fail('HISTORY_GOVERNANCE_UNRESOLVED');
 if(source?.metadata===true)return;
 if(!source){if(provenances.length)fail('HISTORY_GOVERNANCE_UNRESOLVED');return;}
 if(!validRef({sessionId:source.sessionId,messageId:source.messageId,textHash:source.textHash}))fail('HISTORY_SOURCE_RECEIPT_INVALID');
 for(const p of provenances)for(const r of p.refs){
  if(r.sessionId===source.sessionId&&r.messageId===source.messageId){
   if(r.textHash!==source.textHash)fail('HISTORY_SOURCE_CHANGED');fail('HISTORY_SOURCE_BLOCKED');
  }
 }
}
