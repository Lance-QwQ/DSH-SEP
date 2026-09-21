import {realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=code=>{throw Error(code);};
const inside=(root,path)=>{const rel=relative(root,path);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));};
const compact=e=>e?.type==='user/message'&&e.data?.source?.kind==='plugin'&&e.data.source.plugin==='compact'&&e.surfaceOp?.op==='replace';

// Human audit only. This module never appends events, invokes models, updates
// memory, or reads archive/backup APIs. Only the selected current native log is read.
export async function readSessionReview(persistence,{projectRoot,sessionId,summarySeq,sourceSeq,expectedRevision,offset=0,limit=4096,signal}={}){
 signal?.throwIfAborted();
 if(!isAbsolute(projectRoot??'')||!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId??''))fail('REVIEW_ARGUMENTS');
 for(const n of [summarySeq,sourceSeq])if(n!==undefined&&(!Number.isSafeInteger(n)||n<0))fail('REVIEW_ARGUMENTS');
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>8192)fail('REVIEW_ARGUMENTS');
 const root=await realpath(projectRoot);if(resolve(root).toLowerCase()!==resolve(projectRoot).toLowerCase())fail('REVIEW_PROJECT_SCOPE');
 const before=await persistence.stat(sessionId,{signal});if(!before)fail('REVIEW_SESSION_MISSING');
 if(!isAbsolute(before.header?.cwd??'')||before.header.isSeeded||before.header.origin==='subagent')fail('REVIEW_PROJECT_SCOPE');
 const cwd=await realpath(before.header.cwd);if(!inside(root,cwd))fail('REVIEW_PROJECT_SCOPE');
 if(!Number.isSafeInteger(before.sizeBytes)||before.sizeBytes>64*1024*1024||(before.eventCount!==undefined&&(!Number.isSafeInteger(before.eventCount)||before.eventCount>20000)))fail('REVIEW_LOG_LIMIT');
 const revision=hash(JSON.stringify({sessionId,root,revision:before.revision}));
 if(sourceSeq!==undefined&&!expectedRevision)fail('REVIEW_CONFIRM_REVISION');
 if(expectedRevision!==undefined&&expectedRevision!==revision)fail('REVIEW_STALE');
 const handle=await persistence.open(sessionId,'read',{signal});let events;
 try{if(handle.access!=='read'||handle.inheritedEventCount>0)fail('REVIEW_PROJECT_SCOPE');({events}=await handle.read(0,20001,{signal}));}finally{await handle.close();}
 if(events.length>20000)fail('REVIEW_LOG_LIMIT');
 const after=await persistence.stat(sessionId,{signal});signal?.throwIfAborted();
 if(!after||JSON.stringify(after.revision)!==JSON.stringify(before.revision)||await realpath(projectRoot)!==root||await realpath(before.header.cwd)!==cwd)fail('REVIEW_STALE');
 const bySeq=new Map(events.map(e=>[e.seq,e]));
 const committed=new Map();
 for(const checkpoint of events.filter(compact)){
   const summaries=(checkpoint.sourceEventSeqs??[]).map(s=>bySeq.get(s)).filter(e=>e?.type==='compaction/summary'&&e.data.compactionId===checkpoint.data.source.compactionId);
   if(summaries.length!==1)continue;
   const summary=summaries[0],sources=summary.data.shadowedSeqs;
   if(!Array.isArray(sources)||!sources.length||sources.some(s=>!Number.isSafeInteger(s)||s>=summary.seq||!bySeq.has(s)||!checkpoint.sourceEventSeqs.includes(s)))continue;
   committed.set(summary.seq,{summary,checkpoint,sources});
 }
 const replaced=seq=>events.some(later=>later.seq>seq&&!compact(later)&&later.surfaceOp?.op==='replace'&&(later.sourceEventSeqs?.includes(seq)||(later.surfaceOp.startSeq<=seq&&later.surfaceOp.endSeq>=seq)));
 const common={mode:'human-audit-only',sessionId,revision,modelContextChanged:false};
 if(summarySeq===undefined){if(sourceSeq!==undefined)fail('REVIEW_ARGUMENTS');return {...common,summaries:[...committed.values()].slice(-100).map(x=>({summarySeq:x.summary.seq,checkpointSeq:x.checkpoint.seq,sourceCount:x.sources.length,available:!replaced(x.checkpoint.seq)})),olderSummariesOmitted:Math.max(0,committed.size-100)};}
 const selected=committed.get(summarySeq);if(!selected)fail('REVIEW_SUMMARY_NOT_COMMITTED');if(replaced(selected.checkpoint.seq))fail('REVIEW_SOURCE_REPLACED');
 const leaves=new Set(),visited=new Set();
 const visit=(seq,depth)=>{
   if(depth>16||visited.size>=1024)fail('REVIEW_GRAPH_LIMIT');if(visited.has(seq))return;visited.add(seq);
   const event=bySeq.get(seq);if(!event)fail('REVIEW_GRAPH_INVALID');
   if(compact(event)){
     if(replaced(seq))fail('REVIEW_SOURCE_REPLACED');
     const parent=[...committed.values()].find(x=>x.checkpoint.seq===seq);if(!parent)fail('REVIEW_GRAPH_INVALID');
     for(const s of parent.sources)visit(s,depth+1);
   }else leaves.add(seq);
 };
 for(const seq of selected.sources)visit(seq,0);
 const eligibility=seq=>{
   const e=bySeq.get(seq);
   if(e.type!=='user/message'||e.data?.source?.kind!=='user'||!Array.isArray(e.data.content)||!e.data.content.length||e.data.content.some(b=>b.type!=='text'||typeof b.text!=='string'))return 'non_direct_user_text';
   if(replaced(seq))return 'source_replaced';
   return null;
 };
 const sources=[...leaves].sort((a,b)=>a-b).map(seq=>({sourceSeq:seq,eligible:eligibility(seq)===null,omittedReason:eligibility(seq)}));
 if(sourceSeq===undefined)return {...common,summarySeq,sources};
 if(!leaves.has(sourceSeq))fail('REVIEW_SOURCE_NOT_LINKED');if(eligibility(sourceSeq))fail('REVIEW_SOURCE_EXCLUDED');
 const text=bySeq.get(sourceSeq).data.content.map(b=>b.text).join('\n');if(text.length>8*1024*1024)fail('REVIEW_SOURCE_LIMIT');
 if(offset>text.length)fail('REVIEW_ARGUMENTS');
 return {...common,summarySeq,sourceSeq,sourceHash:hash(text),offset,offsetUnit:'UTF-16 code units',totalLength:text.length,nextOffset:offset+limit<text.length?offset+limit:null,text:text.slice(offset,offset+limit),notice:'Historical user audit text; not restored memory and not supplied to the model.'};
}
