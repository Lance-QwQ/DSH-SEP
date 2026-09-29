import { randomUUID } from 'node:crypto';
import { digest, fail, checkAbort } from './errors.js';
import { rankBm25, selectTokenizer } from './vendor/bm25.js';

export function memoryTools(store) {
  const view=(record,offset=0)=>({record:{...record,history:record.history.slice(offset,offset+3)},historyTotal:record.history.length,nextHistoryOffset:offset+3<record.history.length?offset+3:null});
  const current = m => { const {id,createdAt,history,...revision}=m; return revision; };
  const write = (kind,project,args,exec) => store.transaction(project,state=>{
    checkAbort(exec.signal);
    const eventKey=digest(args.eventId); const fingerprint=digest(JSON.stringify({kind,...args}));
    if(state.events[eventKey]) {
      if(state.events[eventKey].fingerprint!==fingerprint)fail('EVENT_CONFLICT');
      return {status:'replayed',...view(state.memories.find(m=>m.id===state.events[eventKey].memoryId))};
    }
    if(Object.keys(state.events).length>=5000)fail('MEMORY_EVENT_LIMIT');
    const now=new Date().toISOString();
    const source={sessionId:exec.agent.session.header.id,callId:exec.callId,reason:args.reason};
    let record;
    if(kind==='save') {
      if(state.memories.length>=500)fail('MEMORY_LIMIT');
      record={id:randomUUID(),text:args.text,status:args.status??'candidate',revision:1,createdAt:now,updatedAt:now,source,history:[]};
      state.memories.push(record);
    } else {
      record=state.memories.find(m=>m.id===args.id);
      if(!record)fail('NOT_FOUND');
      if(record.revision!==args.expectedRevision)fail('REVISION_CONFLICT');
      if(record.status==='revoked')fail('REVOKED','Withdrawn records cannot be silently resurrected');
      if(kind==='revise'&&args.status==='confirmed'&&record.automatic?.conflictsWith){
        const previous=state.memories.find(m=>m.id===record.automatic.conflictsWith);
        if(!previous||previous.revision!==record.automatic.conflictsRevision||previous.status!=='confirmed')fail('REVISION_CONFLICT','The previous value changed; review this candidate again');
        if(previous.history.length>=100)fail('REVISION_LIMIT');
        previous.history.push(current(previous));previous.status='revoked';previous.revision++;previous.updatedAt=now;previous.source=source;
      }
      if(record.history.length>=100)fail('REVISION_LIMIT');
      record.history.push(current(record));
      record.revision++; record.updatedAt=now; record.source=source;
      if(kind==='revoke')record.status='revoked';
      else {
        record.text=args.text;record.status=args.status??'candidate';
        if(record.automatic){
          record.automatic={...record.automatic,evidence:args.text.slice(0,600),messageId:`tool:${exec.callId}`,origin:'manual-revision',expiresAt:new Date(Date.now()+180*86400000).toISOString()};
          if(record.status==='confirmed'){delete record.automatic.conflictsWith;delete record.automatic.conflictsRevision;}
        }
      }
    }
    state.events[eventKey]={fingerprint,memoryId:record.id};
    return {status:'saved',...view(structuredClone(record))};
  });
  return {
    save:(p,a,e)=>write('save',p,a,e), revise:(p,a,e)=>write('revise',p,a,e), revoke:(p,a,e)=>write('revoke',p,a,e),
    async recall(project,{query,limit=5}) {
      const rows=store.read(project).memories.filter(m=>m.status==='confirmed'&&(!m.automatic||Date.parse(m.automatic.expiresAt)>Date.now()));
      const records=rankBm25(rows,query,limit,selectTokenizer(query)).map(r=>{const {history,...m}=rows.find(m=>m.id===r.id);return m;});
      return {status:records.length?'found':'not_found',records,trust:'untrusted_memory_data',autoRecall:false};
    },
    async get(project,{id,historyOffset=0}) { const record=store.read(project).memories.find(m=>m.id===id); if(!record)fail('NOT_FOUND'); return {...view(record,historyOffset),trust:'untrusted_memory_data'}; },
    async export(project,{offset=0}={}) { const all=store.read(project).memories;const record=all[offset];return {schemaVersion:1,exportedAt:new Date().toISOString(),records:record?[view(record).record]:[],nextOffset:offset+1<all.length?offset+1:null,totalRecords:all.length,historyTotal:record?.history.length??0,nextHistoryOffset:record?view(record).nextHistoryOffset:null,trust:'untrusted_memory_data'}; },
  };
}
