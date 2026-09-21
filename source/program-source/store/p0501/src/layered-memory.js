import {messageProvenance,mergeProvenance,assertSourceOutside} from './source-provenance.js';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {digest,fail,checkAbort} from './errors.js';
import {rankBm25,selectTokenizer} from './vendor/bm25.js';
import {classifyMemory,archiveReason} from './layer-policy.js';
import {commitMemoryWrite} from './memory-commit.js';
import {sessionEvents} from './session-events.js';

const category=z.enum(['preference','personal','goal','task','project','temporary']);
export const memoryLayersConfig=z.object({enabled:z.boolean().default(true),migrateLegacy:z.boolean().default(false)}).strict();
const short=z.string().trim().min(1).max(2000);
const evidence={messageId:short.optional(),evidence:short.optional()};
const fields={text:short,category:category.optional(),semanticKey:z.string().trim().min(1).max(128).optional(),status:z.enum(['candidate','confirmed']).optional(),pinned:z.boolean().optional(),dependsOn:z.array(short).max(16).optional(),dueAt:z.string().datetime().optional(),taskState:z.enum(['active','open','completed','cancelled']).optional()};
const change={id:short,expectedRevision:z.number().int().positive(),eventId:short,reason:short,...evidence};
export const layeredSchemas={
  save:z.object({...fields,eventId:short,reason:short,...evidence}).strict(),
  revise:z.object({...fields,...change}).strict(),revoke:z.object(change).strict(),
  archive:z.object(change).strict(),
  archive_search:z.object({query:z.string().trim().min(1).max(300),messageId:short.optional(),category:category.optional(),before:z.string().datetime().optional()}).strict(),
  archive_get:z.object({archiveId:short,messageId:short.optional(),offset:z.number().int().nonnegative().optional(),textOffset:z.number().int().nonnegative().optional()}).strict(),
  restore:z.object({archiveId:short,eventId:short,messageId:short.optional()}).strict(),
  purge:z.object({...change}).strict(),
};
const recordSchema=z.object({id:z.string(),owner:z.string(),scope:z.enum(['project','user']),layer:z.enum(['L2','L3']),category,text:z.string().max(2000),status:z.enum(['candidate','confirmed']),revision:z.number().int().positive(),createdAt:z.string(),updatedAt:z.string(),lastUsedAt:z.string().optional(),source:z.json(),automatic:z.json().optional(),semanticKey:z.string(),pinned:z.boolean(),dependsOn:z.array(z.string()),dueAt:z.string().optional(),taskState:z.enum(['active','open','completed','cancelled']),closedAt:z.string().optional(),historyRefs:z.array(z.string()),conflictsWith:z.array(z.string()).optional()}).strict();
const catalogSchema=z.object({version:z.literal(1),owners:z.record(z.string(),z.object({records:z.array(recordSchema).max(500),markers:z.array(z.json()).max(5000),events:z.record(z.string(),z.json()),lastMaintenanceAt:z.string().optional()}).strict()),archives:z.record(z.string(),z.json()),migrations:z.record(z.string(),z.json()),audits:z.array(z.json()).max(2000)}).strict();
const spec={name:'dsh_four_layer_memory_v1',version:1,tables:{active:{valueSchema:catalogSchema}}};
const coldSpec={name:'dsh_four_layer_archive_v1',version:1,tables:{archives:{valueSchema:z.json()},backups:{valueSchema:z.json()}}};
const normalized=v=>v.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const unsafe=v=>/sk-[a-z0-9_-]{16,}|\b(?:api[ _-]?key|password|access[ _-]?token)\b|密码|密钥|忽略.{0,8}(规则|指令)|ignore.{0,16}(rules|instructions)/i.test(v);
const correcting=v=>/更正|改为|改用|改成|取代|不再|以后|今后|instead|replace|correction|from now/i.test(v);
const withdrawing=v=>/忘记|撤回|不要再|不再记|删除|forget|withdraw|remove.{0,12}memor/i.test(v);
const completing=v=>/已(?:经)?完成|已取消|完成了|completed|cancelled|finished/i.test(v);
const historical=v=>/以前|之前|过去|历史|归档|旧版本|旧项目|旧任务|追溯|复盘|回滚|恢复|档案|archive|histor|previous|old (?:version|project|task)|restore|rollback/i.test(v);
const textOf=m=>m.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')??'';
const turnOf=agent=>`${agent.session.header.id}:${sessionEvents(agent.session).filter(e=>e.type==='turn/start').length}`;
const standing=v=>/以后|今后|默认|习惯|喜欢|通常|总是|一直|长期|prefer|always|default|from now/i.test(v);
const replyOnly=v=>!standing(v)&&v.split(/[，,。；;\n]/).filter(s=>s.trim()).every(s=>/只(?:需)?(?:回答|回复|确认)|仅(?:需)?(?:回答|回复|确认)|不(?:要)?调用.{0,12}工具|不要复述|回到普通任务|only (?:say|reply|answer)|do not (?:call tools|repeat)/i.test(s));
function birthdayPrecision(text,proof){
  if(!/生日|birthday|出生|born/i.test(proof))return;
  const numerals='[0-9〇零一二三四五六七八九十百两]+';
  const components=value=>[...value.normalize('NFKC').matchAll(new RegExp(`(${numerals})\\s*(年|月|日|号|岁)|(${numerals})\\s*(years? old)`, 'gi'))].map(m=>`${m[2]==='号'?'日':m[2]??'岁'}:${m[1]??m[3]}`);
  // Compare semantic units, not a bag of numbers: unrelated numbers, swapped
  // month/day, Chinese numerals and inferred age cannot acquire new precision.
  const allowed=new Set(components(proof));
  if(components(text).some(c=>!allowed.has(c)))fail('MEMORY_EVIDENCE_INVALID','Birthday extraction added unsupported date components');
  const dates=value=>value.match(/\b\d{1,4}[-/]\d{1,2}(?:[-/]\d{1,4})?\b/g)??[];
  if(dates(text).some(d=>!dates(proof).includes(d)))fail('MEMORY_EVIDENCE_INVALID','Birthday extraction changed date notation without direct evidence');
}
function boundedHistory(value,slots){
  const result=structuredClone(value);result.truncated=false;
  const targets=slots(result);const originals=targets.map(t=>t.text??'');
  for(const t of targets)t.text='';
  let remaining=1600-JSON.stringify(result).length-32;
  if(remaining<0)fail('ARCHIVE_OUTPUT_LIMIT');
  targets.forEach((t,i)=>{let n=Math.min(originals[i].length,Math.floor(remaining/(targets.length-i)));t.text=originals[i].slice(0,n);while(JSON.stringify(result).length>1600&&n>0)t.text=originals[i].slice(0,--n);remaining-=n;if(n<originals[i].length)result.truncated=true;});
  if(JSON.stringify(result).length>1600)fail('ARCHIVE_OUTPUT_LIMIT');return result;
}
const sourceRef=source=>Object.fromEntries(['sessionId','callId','path','sha256','locator'].filter(k=>source?.[k]!==undefined).map(k=>[k,source[k]]));

export async function createLayeredMemory({facility,scope,legacy,config:input={},now=()=>Date.now()}){
  const config=memoryLayersConfig.parse(input);
  const domain=await facility.open(spec);let coldDomain;
  try{coldDomain=await facility.open(coldSpec);}catch(error){await domain.close();throw error;}
  const activeTable=domain.table('active'),archiveTable=coldDomain.table('archives'),backups=coldDomain.table('backups');
  let tail=Promise.resolve(),closed=false;
  const stamp=()=>new Date(now()).toISOString();
  const catalog=()=>structuredClone(activeTable.get('catalog')??{version:1,owners:{},archives:{},migrations:{},audits:[]});
  const owner=(state,key)=>state.owners[key]??={records:[],markers:[],events:{}};
  function keys(project){
    if(!scope.projects.some(p=>p===project))fail('UNAUTHORIZED');
    return [`project:${project.key}`,...project.userProfile?[`user:${digest(project.userProfile)}`]:[]];
  }
  const visible=(state,project)=>keys(project).flatMap(key=>state.owners[key]?.records??[]);
  const ownerFor=(project,scopeName)=>scopeName==='user'?`user:${digest(project.userProfile)}`:`project:${project.key}`;
  const locate=(state,project,id)=>visible(state,project).find(r=>r.id===id)??fail('NOT_FOUND');
  const locateGoverned=(state,project,id)=>{
    const current=visible(state,project).find(r=>r.id===id);if(current)return current;
    const permitted=new Set(keys(project));
    const meta=Object.values(state.archives).filter(m=>permitted.has(m.owner)&&m.recordId===id&&m.sourceType==='memory').sort((a,b)=>b.revision-a.revision)[0];
    // Governance of an exact ID is not model-facing historical retrieval.
    return meta&&archiveTable.get(meta.archiveId)?.record||fail('NOT_FOUND');
  };
  function transact(fn,signal){
    if(closed)return Promise.reject(new Error('DISPOSED'));
    const run=(facility.withAccess?fn=>facility.withAccess(fn):fn=>tail.then(fn))(async()=>{
      checkAbort(signal);const state=catalog(),writes=[];const result=await fn(state,writes);checkAbort(signal);
      catalogSchema.parse(state);
      if(Buffer.byteLength(JSON.stringify(state))>16000000)fail('MEMORY_CATALOG_LIMIT');
      // Cold payloads commit first. Unreferenced writes after a failure are never
      // returned: only the atomic active catalog publishes an archive reference.
      for(const [id,payload] of writes){checkAbort(signal);await commitMemoryWrite(()=>archiveTable.put(id,payload),signal);}
      checkAbort(signal);await commitMemoryWrite(()=>activeTable.put('catalog',state),signal);return structuredClone(result);
    });tail=run.catch(()=>{});return run;
  }
  function archive(state,writes,record,reason,validity='historical'){
    if(Object.keys(state.archives).length>=5000)fail('ARCHIVE_LIMIT');
    const archiveId=digest(`${record.owner}:${record.id}:${record.revision}:${reason}`);
    const meta={archiveId,owner:record.owner,recordId:record.id,revision:record.revision,layer:'L4',originalLayer:record.layer,category:record.category,archivedAt:stamp(),reason,validity,keyHash:digest(record.semanticKey),textHash:digest(normalized(record.text)),sourceType:'memory',historyProvenance:structuredClone(record.source?.historyProvenance??{version:1,complete:false,refs:[]})};
    state.archives[archiveId]=meta;writes.push([archiveId,{...meta,record:structuredClone(record)}]);return archiveId;
  }
  const cleanView=r=>{const view={...structuredClone(r),history:[],historyTotal:r.historyRefs.length};if(view.source)delete view.source.historyProvenance;return view;};
  const mark=(state,record,status)=>{
    const related=Object.values(state.archives).filter(meta=>meta.recordId===record.id||meta.owner===record.owner&&meta.keyHash===digest(record.semanticKey));
    const provenance=mergeProvenance(record.source?.historyProvenance,...related.map(meta=>meta.historyProvenance));
    const o=owner(state,record.owner);o.markers.push({id:record.id,keyHash:digest(record.semanticKey),textHash:digest(normalized(record.text)),status,at:stamp(),historyProvenance:provenance});
    for(const meta of related){
      meta.validity='withdrawn';
      if(meta.owner!==record.owner)owner(state,meta.owner).markers.push({id:record.id,keyHash:meta.keyHash,textHash:meta.textHash,status,at:stamp(),historyProvenance:provenance});
    }
    o.records=o.records.filter(r=>r.id!==record.id);
  };
  function directMessage(exec,messageId){
    if(exec.agent?.session?.header?.origin==='subagent')fail('DIRECT_USER_REQUIRED');
    const events=sessionEvents(exec.agent?.session);
    const start=events.findLastIndex(e=>e.type==='turn/start');
    const messages=events.slice(start+1).filter(e=>e.type==='user/message'&&e.data.role==='user'&&e.data.source?.kind==='user');
    const latest=messages.at(-1)?.data;
    if(!latest||messageId&&latest.id!==messageId)fail('DIRECT_USER_REQUIRED');
    const text=textOf(latest);if(text.length>6000)fail('DIRECT_USER_REQUIRED');return {id:latest.id,text};
  }
  function manualEvidence(exec,args,operation){
    const m=directMessage(exec,args.messageId);const quote=args.evidence??m.text;
    if(!quote||!m.text.includes(quote)||unsafe(quote))fail('MEMORY_EVIDENCE_INVALID');
    if(operation==='revoke'&&!withdrawing(m.text))fail('MEMORY_CHANGE_NOT_EXPLICIT');
    if(operation==='revise'&&!correcting(m.text)&&!/确认|confirm/i.test(m.text))fail('MEMORY_CHANGE_NOT_EXPLICIT');
    if(operation==='archive'&&!/归档|archive/i.test(m.text))fail('MEMORY_CHANGE_NOT_EXPLICIT');
    if(operation==='purge'&&!/彻底删除|永久删除|permanently (?:delete|erase)/i.test(m.text))fail('PERMANENT_DELETE_REQUIRED');
    return {messageId:m.id,evidence:quote};
  }
  function putRecord(state,writes,project,args,exec,operation='save',automatic){
    const classify=classifyMemory(args,project);const time=stamp();
    const eventKey=digest(args.eventId),fingerprint=digest(JSON.stringify({operation,...args}));
    for(const key of keys(project)){
      const prior=state.owners[key]?.events[eventKey];
      if(prior){if(prior.fingerprint!==fingerprint)fail('EVENT_CONFLICT');const record=visible(state,project).find(r=>r.id===prior.id);return {status:'replayed',id:prior.id,...record?{record:cleanView(record)}:{}};}
    }
    const target=operation==='save'?null:['revoke','purge'].includes(operation)?locateGoverned(state,project,args.id):locate(state,project,args.id);
    const targetOwner=target?.owner??ownerFor(project,classify.scope),o=owner(state,targetOwner);
    if(Object.keys(o.events).length>=5000)fail('MEMORY_EVENT_LIMIT');
    if(target&&target.revision!==args.expectedRevision)fail('REVISION_CONFLICT');
    let record=target;
    if(operation==='save'){
      if(o.records.length>=500)fail('MEMORY_LIMIT');
      const key=normalized(args.semanticKey??(automatic?.key||`${classify.category}:${args.text}`));
      if(o.markers.some(m=>m.keyHash===digest(key)||m.textHash===digest(normalized(args.text))))fail('REVOKED');
      const duplicate=o.records.find(r=>normalized(r.text)===normalized(args.text));
      if(duplicate){duplicate.source.historyProvenance=mergeProvenance(duplicate.source.historyProvenance,messageProvenance(exec,automatic?.messageId));duplicate.lastUsedAt=time;o.events[eventKey]={fingerprint,id:duplicate.id};return {status:'deduplicated',record:cleanView(duplicate)};}
      const conflict=o.records.find(r=>r.semanticKey===key);
      record={id:randomUUID(),owner:targetOwner,...classify,text:args.text,status:conflict?'candidate':args.status??'candidate',revision:1,createdAt:time,updatedAt:time,lastUsedAt:time,source:{sessionId:exec.agent.session.header.id,callId:exec.callId??`automatic:${automatic?.messageId}`,reason:args.reason,historyProvenance:messageProvenance(exec,automatic?.messageId)},semanticKey:key,pinned:args.pinned??false,dependsOn:args.dependsOn??[],taskState:args.taskState??(classify.category==='task'?'open':'active'),historyRefs:[],...args.dueAt?{dueAt:args.dueAt}:{},...automatic?{automatic}:{},...conflict?{conflictsWith:[conflict.id]}:{}};
      if(['completed','cancelled'].includes(record.taskState))record.closedAt=time;
      o.records.push(record);
    }else if(operation==='revoke'||operation==='purge'){
      if(operation==='revoke')archive(state,writes,record,'withdrawn','withdrawn');
      mark(state,record,operation==='purge'?'purged':'withdrawn');
    }else if(operation==='archive'){
      archive(state,writes,record,'user_requested');o.records=o.records.filter(r=>r.id!==record.id);
    }else{
      const old=archive(state,writes,record,'superseded','superseded');
      if(record.conflictsWith?.length&&args.status==='confirmed'){
        for(const id of record.conflictsWith){const previous=locate(state,project,id);archive(state,writes,previous,'superseded','superseded');owner(state,previous.owner).records=owner(state,previous.owner).records.filter(r=>r.id!==id);}
        delete record.conflictsWith;
      }
      const nextProvenance=messageProvenance(exec,automatic?.messageId);
      record.historyRefs.push(old);record.text=args.text;record.status=args.status??record.status;record.revision++;
      record.updatedAt=time;record.lastUsedAt=time;record.source={sessionId:exec.agent.session.header.id,callId:exec.callId??`automatic:${automatic?.messageId}`,reason:args.reason,historyProvenance:nextProvenance};
      if(automatic)record.automatic=automatic;
      for(const field of ['taskState','pinned','dependsOn','dueAt'])if(args[field]!==undefined)record[field]=args[field];
      if(['completed','cancelled'].includes(record.taskState))record.closedAt=time;
      else delete record.closedAt;
      if(args.category&&args.category!==record.category){
        const proof=automatic?.evidence??'';
        if(classify.category==='preference'&&!standing(proof)||classify.category==='personal'&&!/我的|我本人|my |I was/i.test(proof)||classify.category==='goal'&&!/总目标|最终目标|总体目标|overall goal/i.test(proof))fail('MEMORY_PROMOTION_NOT_EXPLICIT');
        const nextOwner=ownerFor(project,classify.scope),destination=owner(state,nextOwner);
        if(destination.records.some(r=>r.id!==record.id&&r.semanticKey===record.semanticKey))fail('MEMORY_PROMOTION_CONFLICT');
        if(nextOwner!==record.owner){o.records=o.records.filter(r=>r.id!==record.id);destination.records.push(record);}
        Object.assign(record,classify,{owner:nextOwner});
        destination.events[eventKey]={fingerprint,id:record.id};
      }
    }
    o.events[eventKey]={fingerprint,id:record.id};
    return {status:'saved',id:record.id,...['revoke','purge','archive'].includes(operation)?{}:{record:cleanView(record)}};
  }
  async function manual(operation,project,args,exec){
    const proof=manualEvidence(exec,args,operation);
    if(args.text&&unsafe(args.text))fail('MEMORY_EVIDENCE_INVALID');
    if(args.text)birthdayPrecision(args.text,proof.evidence);
    if(['completed','cancelled'].includes(args.taskState)&&!completing(proof.evidence))fail('MEMORY_CHANGE_NOT_EXPLICIT');
    const automatic={kind:args.category??'project',key:args.semanticKey??'',...proof,origin:'manual-revision'};
    const result=await transact((state,writes)=>putRecord(state,writes,project,args,exec,operation,automatic),exec.signal);
    if(operation==='purge'){
      const state=catalog();
      // The ID was authorized above. Follow its own promotion history across
      // owners without exposing unrelated project contents to the caller.
      for(const meta of Object.values(state.archives))if(meta.recordId===args.id){await commitMemoryWrite(()=>archiveTable.delete(meta.archiveId),exec.signal);}
      for(const [key,backup] of backups.entries())if(backup.snapshot.memories.some(r=>r.id===args.id)){
        const next=structuredClone(backup);next.snapshot.memories=next.snapshot.memories.filter(r=>r.id!==args.id);next.purgedIds=[...(next.purgedIds??[]),args.id];await commitMemoryWrite(()=>backups.put(key,next),exec.signal);
      }
      for(const p of scope.projects)if(legacy.read(p).memories.some(r=>r.id===args.id))await legacy.transaction(p,state=>{state.memories=state.memories.filter(r=>r.id!==args.id);});
      if(facility.finishDeletion){const cleanup=await facility.finishDeletion({id:args.id});return {...result,status:cleanup.complete?'purged':'cleanup_pending',cleanup};}
    }
    return result;
  }
  function need(exec,args,restore=false){
    const m=directMessage(exec,args.messageId);
    const request=m.text.replace(/```[\s\S]*?```/g,'').replace(/[“「『‘"'][^”」』’"']*[”」』’"']/g,'').split('\n').filter(line=>!/^\s*>/.test(line)).join('\n');
    const clauses=request.split(/[，,。；;\n]/);
    const positive=clauses.some(clause=>historical(clause)&&/查|找|看|调取|对比|比较|复盘|追溯|回滚|恢复|继续|导出|search|find|show|compare|review|trace|restore|resume|export/i.test(clause)&&!/不要|别|不必|无需|勿|do not|don't|without|禁止/i.test(clause));
    if(!positive)fail('ARCHIVE_NEED_REQUIRED');
    if(restore&&!/恢复|重新启用|restore|reactivate/i.test(request))fail('RESTORE_NEED_REQUIRED');
    return {...m,turn:turnOf(exec.agent)};
  }
  async function eligibleArchives(project,args,exec){
    const intent=need(exec,args);return transact(state=>{
      if(state.audits.filter(a=>a.turn===intent.turn&&a.operation==='read').length>=2)fail('ARCHIVE_QUERY_LIMIT');
      if(state.audits.length>=2000)fail('ARCHIVE_AUDIT_LIMIT');
      const permitted=new Set(keys(project));
      const sourceIndex=legacy.read(project).index;
      const metas=Object.values(state.archives).filter(m=>permitted.has(m.owner)&&m.validity!=='withdrawn'&&!(m.sourceType==='document'&&scope.isDocumentExcluded(project,m.path))&&(!args.category||m.category===args.category)&&(!args.before||m.archivedAt<args.before)&&(!args.archiveId||m.archiveId===args.archiveId)&&!(m.sourceType==='document'&&sourceIndex?.sources.some(s=>s.path===m.path&&s.sha256===m.sha256)));
      const selected=metas.sort((a,b)=>b.archivedAt.localeCompare(a.archivedAt)).slice(0,64);
      state.audits.push({operation:'read',turn:intent.turn,messageId:intent.id,requestHash:digest(intent.text),query:args.query??args.archiveId,at:stamp(),reservedContextChars:1600,eligibleIds:selected.map(m=>m.archiveId)});
      return selected;
    },exec.signal);
  }
  const manager={
    // Unknown historical coverage still fails closed; complete new origins
    // only restrict their exact source messages, including every duplicate.
    assertHistoryReadable(project,source){
      if(closed)fail('DISPOSED');const state=catalog(),permitted=new Set(keys(project));
      if(legacy.read(project).memories.length)fail('HISTORY_GOVERNANCE_UNRESOLVED');
      const active=visible(state,project),blocked=[];
      for(const key of permitted)for(const marker of state.owners[key]?.markers??[])blocked.push(marker.historyProvenance);
      for(const meta of Object.values(state.archives))if(permitted.has(meta.owner))blocked.push(meta.historyProvenance);
      for(const record of active)if(archiveReason(record,{now:now(),active}))blocked.push(record.source?.historyProvenance);
      assertSourceOutside(blocked,source);
    },
    read(project){return visible(catalog(),project).map(cleanView);},
    select(project,query,{agent}={}){
      const all=manager.read(project),rows=all.filter(r=>r.status==='confirmed');
      const pinned=[...rows.filter(r=>r.category==='goal'&&r.taskState==='active').slice(0,1),...rows.filter(r=>r.category==='preference').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,2)];
      const ranked=rankBm25(rows,query,6,selectTokenizer(query)).map(h=>rows.find(r=>r.id===h.id));
      const reserved=agent?catalog().audits.filter(a=>a.turn===turnOf(agent)&&a.operation==='read').reduce((n,a)=>n+(a.reservedContextChars??1600),0):0;
      let bytes=0;const records=[...new Map([...pinned,...ranked].map(r=>[r.id,r])).values()].slice(0,6).flatMap(r=>{const item={id:r.id,revision:r.revision,text:r.text,layer:r.layer,category:r.category,scope:r.scope};const n=JSON.stringify(item).length;if(bytes+n>Math.max(0,4200-reserved))return [];bytes+=n;return [item];});
      const pending=rankBm25(all.filter(r=>r.status==='candidate'&&r.conflictsWith?.length),query,2,selectTokenizer(query)).map(h=>({id:h.id,status:'needs_confirmation'}));
      return {records,pending};
    },
    observeUserQuery(project,text,{signal}={}){
      if(!/\?|？|查询|查一下|在哪里|是什么|记下|记住|记得|沿用|继续使用|还用|where|what|remember|recall/i.test(text))return Promise.resolve({touched:[]});
      return transact(state=>{const rows=visible(state,project).filter(r=>r.status==='confirmed');const hits=rankBm25(rows,text,5,selectTokenizer(text));for(const hit of hits)rows.find(r=>r.id===hit.id).lastUsedAt=stamp();return {touched:hits.map(h=>h.id)};},signal);
    },
    maintain(project,{signal}={}){return transact((state,writes)=>{
      const time=stamp(),changes=[];
      for(const key of keys(project)){
        const o=owner(state,key);if(o.lastMaintenanceAt&&now()-Date.parse(o.lastMaintenanceAt)<86400000)continue;
        for(const record of [...o.records]){
          const relatedProjects=key.startsWith('user:')?scope.projects.filter(p=>p.userProfile&&ownerFor(p,'user')===key):[project];
          const active=[...new Map(relatedProjects.flatMap(p=>visible(state,p)).map(r=>[r.id,r])).values()];
          const reason=archiveReason(record,{now:now(),active});if(!reason)continue;
          const id=archive(state,writes,record,reason);o.records=o.records.filter(r=>r.id!==record.id);changes.push({id:record.id,archiveId:id,reason});
        }o.lastMaintenanceAt=time;
      }return {changes};
    },signal);},
    async applyExtracted(project,{items,messages,existing,sessionId},exec){
      return transact((state,writes)=>{
        const changes=[];
        for(const item of items){
          const m=messages.find(m=>m.id===item.messageId);
          if(!m||!item.evidence||!m.text.includes(item.evidence)||unsafe(item.evidence)||unsafe(item.text??''))fail('MEMORY_EVIDENCE_INVALID');
          if(item.operation==='save'&&replyOnly(item.evidence))continue;
          birthdayPrecision(item.text??'',item.evidence);
          let cat=item.category??classifyMemory({kind:item.kind},project).category;
          if(cat==='preference'&&!/以后|今后|默认|习惯|喜欢|通常|总是|一直|长期|prefer|always|default|from now/i.test(item.evidence))cat='temporary';
          if(cat==='goal'&&!/总目标|最终目标|长期目标|总体目标|overall goal|project.{0,12}goal/i.test(item.evidence))cat='project';
          const target=item.targetId?visible(state,project).find(r=>r.id===item.targetId):undefined;
          let operation=item.operation==='replace'?'revise':item.operation;
          const complete=['complete','cancel'].includes(operation);
          if(operation!=='save'){
            const prior=existing.find(r=>r.id===item.targetId);
            if(!target||!prior||target.revision!==prior.revision)fail('REVISION_CONFLICT');
            if(item.assertion!=='explicit'||!(operation==='revoke'?withdrawing(item.evidence):complete?completing(item.evidence):correcting(item.evidence)))fail('MEMORY_CHANGE_NOT_EXPLICIT');
          }
          const key=normalized(item.key),automatic={kind:cat,key,evidence:item.evidence,messageId:item.messageId,origin:'user-message-extraction'};
          const args={eventId:`extract:${sessionId}:${item.messageId}:${digest(JSON.stringify(item))}`,text:complete?target.text:item.text,category:cat,semanticKey:key,status:item.assertion==='explicit'?'confirmed':'candidate',reason:'Direct user statement',...target?{id:target.id,expectedRevision:target.revision}:{},...complete?{taskState:operation==='complete'?'completed':'cancelled'}:{}};
          const out=putRecord(state,writes,project,args,exec,complete?'revise':operation,automatic);changes.push({id:out.id??out.record.id,operation:item.operation,status:out.record?.status??'withdrawn',layer:out.record?.layer??'L4'});
        }return changes;
      },exec.signal);
    },
    status(project){const all=manager.read(project);return {architecture:4,L1:'native_context_window',L2:all.filter(r=>r.layer==='L2').length,L3:all.filter(r=>r.layer==='L3').length,L4:'on_demand',sharedUserProfile:Boolean(project.userProfile)};},
    archiveSources(project,{previous,current},exec){return transact((state,writes)=>{
      const changes=[];
      for(const source of previous){
        if(scope.isDocumentExcluded(project,source.path))continue;
        if(current.some(s=>s.path===source.path&&s.sha256===source.sha256))continue;
        const id=digest(`${project.key}:source:${source.path}:${source.sha256}`);
        if(state.archives[id])continue;if(Object.keys(state.archives).length>=5000)fail('ARCHIVE_LIMIT');
        const meta={archiveId:id,owner:`project:${project.key}`,recordId:id,revision:1,layer:'L4',originalLayer:'L2',category:'project',archivedAt:stamp(),reason:current.some(s=>s.path===source.path)?'source_superseded':'source_removed',validity:'superseded',sourceType:'document',path:source.path,sha256:source.sha256};
        state.archives[id]=meta;writes.push([id,{...meta,document:structuredClone(source)}]);changes.push({archiveId:id,path:source.path});
      }return {changes};
    },exec.signal);},
    migrationPreview(project){
      keys(project);const rows=legacy.read(project).memories;
      const withdrawn=rows.filter(r=>r.status==='revoked').length;
      const expired=rows.filter(r=>r.status!=='revoked'&&r.automatic?.expiresAt&&Date.parse(r.automatic.expiresAt)<=now()).length;
      return {status:catalog().migrations[project.key]?'migrated':'preview',active:rows.length-withdrawn-expired,withdrawn,expired,total:rows.length,sourceSha256:digest(JSON.stringify(rows)),sharing:'retain_legacy_project_scope'};
    },
    async migrateLegacy(project,{signal}={}){
      keys(project);checkAbort(signal);const before=legacy.read(project),hash=digest(JSON.stringify(before.memories)),backupId=`migration:${project.key}:${hash}`;
      if(catalog().migrations[project.key])return {status:'replayed',backupId:catalog().migrations[project.key].backupId};
      const backup={projectKey:project.key,createdAt:stamp(),sourceSha256:hash,snapshot:before};await commitMemoryWrite(()=>backups.put(backupId,backup),signal);
      return transact((state,writes)=>{
        if(state.migrations[project.key])return {status:'replayed',backupId};
        if(hash!==digest(JSON.stringify(legacy.read(project).memories)))fail('MIGRATION_SOURCE_CHANGED');
        const o=owner(state,`project:${project.key}`);if(o.records.length)fail('MIGRATION_TARGET_NOT_EMPTY');
        for(const old of before.memories){
          const classification=classifyMemory({kind:old.automatic?.kind},{});
          const record={id:old.id,owner:`project:${project.key}`,...classification,text:old.text,status:old.status==='candidate'?'candidate':'confirmed',revision:old.revision,createdAt:old.createdAt,updatedAt:old.updatedAt,lastUsedAt:old.updatedAt,source:old.source,semanticKey:normalized(old.automatic?.key??`${classification.category}:${old.text}`),pinned:false,dependsOn:[],taskState:classification.category==='task'?'open':'active',historyRefs:[]};
          if(old.automatic){const {expiresAt,...automatic}=old.automatic;record.automatic=automatic;}
          for(const revision of old.history){const id=archive(state,writes,{...record,...revision,historyRefs:[]},'legacy_revision',old.status==='revoked'?'withdrawn':'superseded');record.historyRefs.push(id);}
          if(old.status==='revoked'){archive(state,writes,record,'legacy_withdrawn','withdrawn');mark(state,record,'withdrawn');}
          else if(old.automatic?.expiresAt&&Date.parse(old.automatic.expiresAt)<=now())archive(state,writes,record,'legacy_expired');
          else o.records.push(record);
        }
        state.migrations[project.key]={backupId,sourceSha256:hash,at:stamp()};return {status:'migrated',backupId,active:o.records.length};
      },signal);
    },
    tools:{
      save:(p,a,e)=>manual('save',p,a,e),revise:(p,a,e)=>manual('revise',p,a,e),revoke:(p,a,e)=>manual('revoke',p,a,e),archive:(p,a,e)=>manual('archive',p,a,e),purge:(p,a,e)=>manual('purge',p,a,e),
      async recall(p,{query,limit=5}){const rows=manager.read(p).filter(r=>r.status==='confirmed');return {records:rankBm25(rows,query,limit,selectTokenizer(query)).map(h=>rows.find(r=>r.id===h.id)),trust:'untrusted_memory_data'};},
      async get(p,{id}){return {record:cleanView(locate(catalog(),p,id)),trust:'untrusted_memory_data'};},
      async export(p,{offset=0}={}){const rows=manager.read(p);return {schemaVersion:4,records:rows.slice(offset,offset+1),totalRecords:rows.length,nextOffset:offset+1<rows.length?offset+1:null,trust:'untrusted_memory_data'};},
      async archive_search(p,args,exec){
        const metas=await eligibleArchives(p,args,exec);const rows=[];
        let scanned=0;
        for(const meta of metas){checkAbort(exec.signal);const payload=archiveTable.get(meta.archiveId);if(!payload)continue;
          const parts=payload.document?.parts??[{text:payload.record.text,locator:null}];
          for(const [i,part] of parts.entries()){scanned+=part.text.length;if(scanned>256000)break;rows.push({...meta,id:`${meta.archiveId}:${i}`,text:part.text,source:payload.document?{path:meta.path,sha256:meta.sha256,locator:part.locator}:payload.record.source});}if(scanned>256000)break;
        }
        const records=rankBm25(rows,args.query,2,selectTokenizer(args.query)).map(h=>{const r=rows.find(r=>r.id===h.id);return {archiveId:r.archiveId,layer:'L4',originalLayer:r.originalLayer,category:r.category,text:r.text,validity:r.validity,reason:r.reason,archivedAt:r.archivedAt,source:sourceRef(r.source),revision:r.revision};});
        return boundedHistory({records,status:records.length?'found':'not_found',trust:'untrusted_historical_data',restored:false,window:{maxArchives:64,maxScannedChars:256000,oldestSelectedAt:metas.at(-1)?.archivedAt??null}},r=>r.records);
      },
      async archive_get(p,args,exec){
        const metas=await eligibleArchives(p,args,exec);const meta=metas.find(m=>m.archiveId===args.archiveId);if(!meta)fail('NOT_FOUND');const payload=archiveTable.get(meta.archiveId);if(!payload)fail('NOT_FOUND');
        const {owner,keyHash,textHash,historyProvenance,...publicMeta}=meta;const offset=args.offset??0,textOffset=args.textOffset??0;
        const archive={...publicMeta,...payload.document?{parts:payload.document.parts.slice(offset,offset+1).map(p=>({text:p.text.slice(textOffset),locator:p.locator})),partOffset:offset,totalParts:payload.document.parts.length}:{record:{id:payload.record.id,text:payload.record.text.slice(textOffset),revision:payload.record.revision,source:sourceRef(payload.record.source)}}};
        return boundedHistory({archive,textOffset,trust:'untrusted_historical_data'},r=>r.archive.parts??[r.archive.record]);
      },
      async restore(p,args,exec){
        need(exec,args,true);return transact(state=>{
          const meta=state.archives[args.archiveId];if(!meta||!keys(p).includes(meta.owner)||meta.validity==='withdrawn')fail('NOT_FOUND');
          const o=owner(state,meta.owner),eventKey=digest(args.eventId);
          if(o.events[eventKey])return {status:'replayed'};
          const payload=archiveTable.get(meta.archiveId);if(!payload)fail('NOT_FOUND');if(!payload.record)fail('RESTORE_SOURCE_MANUALLY','Historical documents must be restored to a user-selected file');const r=payload.record;
          if(o.records.some(existing=>existing.id===r.id||existing.semanticKey===r.semanticKey)||o.markers.some(m=>m.id===r.id||m.keyHash===meta.keyHash))fail('RESTORE_CONFLICT');
          if(r.status!=='confirmed'||meta.validity==='superseded')fail('RESTORE_CONFLICT');
          const restored={...structuredClone(r),revision:r.revision+1,updatedAt:stamp(),lastUsedAt:stamp(),historyRefs:[...r.historyRefs,meta.archiveId]};
          if(['task','goal'].includes(restored.category)){restored.taskState=restored.category==='task'?'open':'active';delete restored.closedAt;}
          o.records.push(restored);o.events[eventKey]={id:r.id,fingerprint:digest(JSON.stringify(args))};return {status:'restored',record:cleanView(restored)};
        },exec.signal);
      },
    },
    async close(){if(closed)return;closed=true;await tail;await coldDomain.close();await domain.close();},
  };
  try{for(const project of scope.projects){if(legacy.read(project).memories.length&&!catalog().migrations[project.key]){if(!config.migrateLegacy)fail('MEMORY_MIGRATION_REQUIRED');await manager.migrateLegacy(project,{});}}}
  catch(error){await manager.close();throw error;}
  return manager;
}
