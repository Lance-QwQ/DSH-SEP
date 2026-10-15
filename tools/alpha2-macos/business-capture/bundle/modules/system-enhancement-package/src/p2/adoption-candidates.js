import {createHash} from 'node:crypto';
import {isAbsolute,resolve,relative,sep} from 'node:path';
import {z} from 'zod';
import {spec as legacySpec} from '../store.js';
import {adoptionCategory,adoptionRecordSchema,adoptionLifecycle,adoptionTimestamp} from './adoption-lifecycle.js';

const names=['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1'];
const ruleVersion='alpha6-adoption-candidates-v1';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>sha(JSON.stringify(stable(v)));
const normalized=v=>v.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const identity=r=>JSON.stringify([r.owner,r.id,r.revision]);
const hashSchema=z.string().regex(/^[a-f0-9]{64}$/),idSchema=z.string().min(1).max(256);
const map=s=>z.record(z.string(),s);
const markerSchema=z.object({id:idSchema,status:z.enum(['withdrawn','purged']),at:z.string().optional(),keyHash:hashSchema.optional(),textHash:hashSchema.optional()}).strict();
const eventSchema=z.object({id:idSchema,fingerprint:hashSchema}).strict();
const ownerSchema=z.object({records:z.array(adoptionRecordSchema).max(500),markers:z.array(markerSchema).max(5000),events:map(eventSchema),lastMaintenanceAt:z.string().optional()}).strict();
const metaFields={archiveId:idSchema,owner:z.string(),recordId:idSchema,revision:z.number().int().positive(),layer:z.literal('L4'),originalLayer:z.enum(['L2','L3']),category:adoptionCategory,
  archivedAt:z.string(),reason:z.string(),validity:z.enum(['historical','superseded','withdrawn']),keyHash:hashSchema.optional(),textHash:hashSchema.optional(),
  sourceType:z.enum(['memory','document']),path:z.string().optional(),sha256:hashSchema.optional()};
const metaSchema=z.object(metaFields).strict();
const locator=z.object({lineStart:z.number().int().positive().optional(),lineEnd:z.number().int().positive().optional(),page:z.number().int().positive().optional(),paragraph:z.number().int().positive().optional()}).strict();
const documentSchema=z.object({path:z.string(),sha256:hashSchema,parts:z.array(z.object({id:z.string(),text:z.string().max(1200),locator}).strict()),warnings:z.array(z.string())}).strict();
const payloadSchema=z.object({...metaFields,record:adoptionRecordSchema.optional(),document:documentSchema.optional()}).strict().refine(p=>p.sourceType==='memory'?!!p.record&&!p.document:!!p.document&&!p.record);
const migrationSchema=z.object({backupId:idSchema,sourceSha256:hashSchema,at:z.string()}).strict();
const auditSchema=z.object({operation:z.literal('read'),turn:z.string(),messageId:z.string(),requestHash:hashSchema,query:z.string(),at:z.string(),reservedContextChars:z.number().nonnegative(),eligibleIds:z.array(idSchema)}).strict();
const emptyCatalog=()=>({version:1,owners:{},archives:{},migrations:{},audits:[]});
const catalogSchema=z.object({version:z.literal(1),owners:map(ownerSchema),archives:map(metaSchema),migrations:map(migrationSchema),audits:z.array(auditSchema).max(2000)}).strict();
const backupSchema=z.object({projectKey:hashSchema,createdAt:z.string(),sourceSha256:hashSchema,snapshot:legacySpec.tables.projects.valueSchema,purgedIds:z.array(idSchema).optional()}).strict();
const envelopes=[
  {projects:map(legacySpec.tables.projects.valueSchema).default({}),media:map(legacySpec.tables.media.valueSchema).default({})},
  {active:z.object({catalog:catalogSchema.optional()}).strict().default({})},
  {archives:map(payloadSchema).default({}),backups:map(backupSchema).default({})}
].map((tables,i)=>z.object({unit:z.object({name:z.literal(names[i]),version:z.literal(1)}).strict(),global:z.null(),tables:z.object(tables).strict()}).strict());

function jsonOnly(value,depth=0,seen=new Set()){
  if(depth>64)fail('P2_ADOPTION_SCHEMA');
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
  if(!value||typeof value!=='object'||seen.has(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('P2_ADOPTION_SCHEMA');
  if(Object.getOwnPropertySymbols(value).length)fail('P2_ADOPTION_SCHEMA');
  if(Array.isArray(value)&&Object.keys(value).length!==value.length)fail('P2_ADOPTION_SCHEMA');
  seen.add(value);
  for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(value))){
    if(Array.isArray(value)&&key==='length')continue;
    if(['__proto__','constructor','prototype'].includes(key)||!descriptor.enumerable||!Object.hasOwn(descriptor,'value')||Array.isArray(value)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length))fail('P2_ADOPTION_SCHEMA');
    jsonOnly(descriptor.value,depth+1,seen);
  }
  seen.delete(value);
}

// JSON.parse would silently accept a later duplicate deletion/catalog key.
function rejectDuplicateKeys(text){
  let offset=0;
  const whitespace=()=>{while(/\s/.test(text[offset]??'')&&offset<text.length)offset++;};
  function string(){const from=offset++;while(offset<text.length){if(text[offset]==='\\'){offset+=2;continue;}if(text[offset++]==='"')return JSON.parse(text.slice(from,offset));}fail('P2_ADOPTION_SCHEMA');}
  function value(depth=0){
    if(depth>64)fail('P2_ADOPTION_SCHEMA');whitespace();const char=text[offset];
    if(char==='"'){string();return;}
    if(char==='{'){
      offset++;whitespace();const keys=new Set();if(text[offset]==='}'){offset++;return;}
      for(;;){whitespace();const key=string();if(keys.has(key))fail('P2_ADOPTION_SCHEMA');keys.add(key);whitespace();offset++;value(depth+1);whitespace();if(text[offset++]==='}')return;}
    }
    if(char==='['){offset++;whitespace();if(text[offset]===']'){offset++;return;}for(;;){value(depth+1);whitespace();if(text[offset++]===']')return;}}
    while(offset<text.length&&!/[\s,}\]]/.test(text[offset]))offset++;
  }
  value();
}

function parseDomains(input){
  if(!Array.isArray(input)||input.length!==3)fail('P2_ADOPTION_SCHEMA');
  const fingerprints=[];
  const domains=input.map((source,i)=>{
    let raw,object;
    try{
      if(Buffer.isBuffer(source)||source instanceof Uint8Array){raw=Buffer.from(source);if(raw.length>32*1024*1024)fail('P2_ADOPTION_SCHEMA');const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);object=JSON.parse(text);rejectDuplicateKeys(text);}
      else if(typeof source==='string'){raw=Buffer.from(source);if(raw.length>32*1024*1024)fail('P2_ADOPTION_SCHEMA');object=JSON.parse(source);rejectDuplicateKeys(source);}
      else{jsonOnly(source);raw=Buffer.from(JSON.stringify(stable(source)));if(raw.length>32*1024*1024)fail('P2_ADOPTION_SCHEMA');object=source;}
      jsonOnly(object);const parsed=envelopes[i].parse(object);fingerprints.push({name:names[i],sha256:sha(raw),size:raw.length});return parsed;
    }catch{fail('P2_ADOPTION_SCHEMA');}
  });
  return {domains,fingerprints,sourceHash:digest(fingerprints)};
}

function bindProjects(input){
  let projects;
  try{projects=z.array(z.object({root:z.string(),userProfile:z.string().trim().min(1).max(128).optional()}).strict()).min(1).max(16).parse(input);}catch{fail('P2_ADOPTION_SCOPE');}
  for(const p of projects){
    if(!isAbsolute(p.root)||resolve(p.root)!==p.root||p.root.split(/[\\/]/).includes('.suite-memory'))fail('P2_ADOPTION_SCOPE');
    p.key=sha(process.platform==='win32'?p.root.toLowerCase():p.root);p.owner='project:'+p.key;
    if(p.userProfile)p.userOwner='user:'+sha(p.userProfile);
  }
  for(let i=0;i<projects.length;i++)for(let j=i+1;j<projects.length;j++){
    const r=relative(projects[i].root,projects[j].root),reverse=relative(projects[j].root,projects[i].root);
    const inside=v=>v===''||!v.startsWith('..'+sep)&&v!=='..'&&!isAbsolute(v);if(inside(r)||inside(reverse))fail('P2_ADOPTION_SCOPE');
  }
  const owners=new Set(projects.flatMap(p=>[p.owner,...p.userOwner?[p.userOwner]:[]]));
  const contextOwners=owner=>owner.startsWith('user:')?new Set([owner,...projects.filter(p=>p.userOwner===owner).map(p=>p.owner)]):new Set(projects.filter(p=>p.owner===owner).flatMap(p=>[p.owner,...p.userOwner?[p.userOwner]:[]]));
  return {projects,owners,contextOwners,scopeHash:digest(projects.map(p=>({root:p.root,key:p.key,...p.userOwner?{userOwner:p.userOwner}:{}})))};
}

function inspect(input){
  const parsed=parseDomains(input.domains),scope=bindProjects(input.projects),[legacy,active,cold]=parsed.domains;
  const catalog=active.tables.active.catalog??emptyCatalog(),all=[],byId=new Map(),restrictions=[],excludedLegacy=[];
  const allow=owner=>{if(!scope.owners.has(owner))fail('P2_ADOPTION_SCOPE');};
  const projectFor=key=>{const p=scope.projects.find(p=>p.key===key);if(!p)fail('P2_ADOPTION_SCOPE');return p;};
  const restrict=(owner,record,reason,status)=>{
    allow(owner);const item={owner,id:record.id,status,reason};
    for(const f of ['keyHash','textHash','at'])if(record[f]!==undefined)item[f]=record[f];
    restrictions.push(item);
  };
  const checkProject=(key,p)=>{
    if(projectFor(key).root!==p.root)fail('P2_ADOPTION_SCOPE');
    if(new Set(p.memories.map(r=>r.id)).size!==p.memories.length)fail('P2_ADOPTION_ID_AMBIGUOUS');
    for(const receipt of Object.values(p.automation?.receipts??{}))if(['pending','failed'].includes(receipt.status))fail('P2_ADOPTION_RECEIPT_PENDING');
    for(const [key,receipt]of Object.entries(p.automation?.receipts??{}))if(!hashSchema.safeParse(key).success||!Number.isFinite(adoptionTimestamp(receipt.at))||adoptionTimestamp(receipt.at)>adoptionTimestamp(input.evaluatedAt))fail('P2_ADOPTION_METADATA');
    for(const [key,event]of Object.entries(p.events))if(!hashSchema.safeParse(key).success||!hashSchema.safeParse(event.fingerprint).success||!idSchema.safeParse(event.memoryId).success)fail('P2_ADOPTION_METADATA');
    if(p.memories.some(r=>!idSchema.safeParse(r.id).success))fail('P2_ADOPTION_METADATA');
  };
  for(const [key,p]of Object.entries(legacy.tables.projects))checkProject(key,p);
  for(const media of Object.values(legacy.tables.media))projectFor(media.projectKey);
  for(const [owner,o]of Object.entries(catalog.owners)){
    allow(owner);
    if(Object.keys(o.events).some(key=>!hashSchema.safeParse(key).success)||o.markers.some(m=>m.at!==undefined&&!Number.isFinite(adoptionTimestamp(m.at))))fail('P2_ADOPTION_METADATA');
    for(const r of o.records){
      if(r.owner!==owner||r.scope!==(owner.startsWith('user:')?'user':'project')||r.layer!==(['preference','personal','goal'].includes(r.category)?'L3':'L2')||owner.startsWith('user:')&&!['preference','personal'].includes(r.category))fail('P2_ADOPTION_SCOPE');
      if(byId.has(r.id))fail('P2_ADOPTION_ID_AMBIGUOUS');byId.set(r.id,r);all.push(r);
    }
    for(const marker of o.markers)restrict(owner,marker,'known_'+marker.status,marker.status);
  }
  const historicalOwner=(recordId,owner)=>{
    allow(owner);const current=byId.get(recordId);
    if(current&&current.owner!==owner&&!scope.contextOwners(current.owner).has(owner)&&!scope.contextOwners(owner).has(current.owner))fail('P2_ADOPTION_ID_AMBIGUOUS');
  };
  for(const [archiveId,meta]of Object.entries(catalog.archives)){
    if(archiveId!==meta.archiveId)fail('P2_ADOPTION_SCHEMA');historicalOwner(meta.recordId,meta.owner);
    if(meta.validity==='withdrawn')restrict(meta.owner,{...meta,id:meta.recordId},'known_archive_withdrawn','withdrawn');
  }
  for(const [archiveId,payload]of Object.entries(cold.tables.archives)){
    if(archiveId!==payload.archiveId||payload.record&&(payload.record.id!==payload.recordId||payload.record.owner!==payload.owner||payload.record.revision!==payload.revision))fail('P2_ADOPTION_SCHEMA');
    historicalOwner(payload.recordId,payload.owner);
    if(payload.validity==='withdrawn')restrict(payload.owner,{...payload,id:payload.recordId},'known_archive_withdrawn','withdrawn');
  }
  const revoked=(key,p,where)=>{for(const r of p.memories){
    historicalOwner(r.id,'project:'+key);
    const revokedHistory=r.history.filter(h=>h.status==='revoked');
    if(r.status==='revoked'||revokedHistory.length)for(const text of new Set([r.text,...revokedHistory.map(h=>h.text)])){
      restrict('project:'+key,{id:r.id,textHash:sha(normalized(text))},'known_'+where+'_revoked','withdrawn');
    }
  }};
  for(const [key,p]of Object.entries(legacy.tables.projects)){
    revoked(key,p,'legacy');
    for(const r of p.memories)if(!byId.has(r.id))excludedLegacy.push({owner:'project:'+key,id:r.id,revision:r.revision,reason:'legacy_only_not_imported',recordSha256:digest(r)});
  }
  for(const b of Object.values(cold.tables.backups)){
    checkProject(b.projectKey,b.snapshot);revoked(b.projectKey,b.snapshot,'backup');
    for(const id of b.purgedIds??[])restrict('project:'+b.projectKey,{id},'known_backup_purged','purged');
  }
  for(const [key,migration]of Object.entries(catalog.migrations)){
    projectFor(key);const b=cold.tables.backups[migration.backupId];
    if(!b||b.projectKey!==key||b.sourceSha256!==migration.sourceSha256)fail('P2_ADOPTION_REFERENCE');
  }
  const matches=(r,restriction)=>r.id===restriction.id||r.owner===restriction.owner&&(
    restriction.keyHash&&[sha(r.semanticKey),sha(normalized(r.semanticKey))].includes(restriction.keyHash)||restriction.textHash&&sha(normalized(r.text))===restriction.textHash);
  const decisions=all.map(r=>{
    const contexts=scope.contextOwners(r.owner),visible=all.filter(other=>contexts.has(other.owner));
    const lifecycle=adoptionLifecycle(r,{evaluatedAt:input.evaluatedAt,active:visible}),reasons=[...lifecycle.reasons];
    for(const restriction of restrictions)if(matches(r,restriction))reasons.push(restriction.reason);
    if(r.status!=='confirmed')reasons.push('unconfirmed');
    // The known alpha.6 write and migration paths preserve these origin fields.
    // Their presence is classification evidence only, never new-use authorization.
    if(!r.source||Array.isArray(r.source)||typeof r.source!=='object'||['sessionId','callId','reason'].some(k=>typeof r.source[k]!=='string'||!r.source[k].trim()))reasons.push('unknown_source');
    if(r.conflictsWith?.length||visible.some(other=>other.id!==r.id&&other.conflictsWith?.includes(r.id)))reasons.push('unresolved_conflict');
    if(r.dependsOn.some(id=>!visible.some(other=>other.id===id)))reasons.push('missing_dependency');
    for(const id of r.historyRefs){const meta=catalog.archives[id],payload=cold.tables.archives[id];
      if(!meta||!payload||meta.sourceType!=='memory'||meta.recordId!==r.id||payload.recordId!==r.id||meta.revision!==payload.revision||meta.owner!==payload.owner||meta.validity!==payload.validity||meta.revision>=r.revision)reasons.push('unresolved_history');}
    for(const p of Object.values(legacy.tables.projects))for(const old of p.memories)if(old.id===r.id&&(old.revision>r.revision||old.revision===r.revision&&old.text!==r.text))reasons.push('legacy_current_conflict');
    const independent=reasons.filter(x=>!lifecycle.reasons.includes(x));
    return {record:r,disposition:independent.length?'excluded':lifecycle.disposition,reasons:[...new Set(reasons)].sort(),timeIssues:lifecycle.timeIssues};
  });
  let changed=true;
  while(changed){changed=false;for(const d of decisions)if(d.disposition==='eligible'&&d.record.dependsOn.some(id=>decisions.find(other=>other.record.id===id)?.disposition!=='eligible')){
    d.disposition='excluded';d.reasons.push('dependency_unavailable');changed=true;
  }}
  return {...parsed,...scope,catalog,cold,legacy,decisions,restrictions,excludedLegacy};
}

function makeManifest(state,evaluatedAt){
  const entries=state.decisions.map(d=>({owner:d.record.owner,id:d.record.id,revision:d.record.revision,category:d.record.category,layer:d.record.layer,status:d.record.status,taskState:d.record.taskState,
    disposition:d.disposition,reasons:d.reasons,timeIssues:d.timeIssues,recordSha256:digest(d.record),textSha256:sha(d.record.text),textLength:d.record.text.length,
    omittedSourceSha256:digest(d.record.source),...d.record.automatic!==undefined?{omittedAutomaticSha256:digest(d.record.automatic)}:{},
    historyNotImported:true,omittedHistoryCount:d.record.historyRefs.length,omittedHistorySha256:digest(d.record.historyRefs)}));
  const decisionHash=digest({ruleVersion,scopeHash:state.scopeHash,entries:entries.map(({owner,id,revision,disposition,reasons})=>({owner,id,revision,disposition,reasons}))});
  const body={version:1,metadataOnly:true,kind:'adoption-candidate-manifest',historyCoverage:'unknown-before-adoption',ruleVersion,evaluatedAt,sourceHash:state.sourceHash,scopeHash:state.scopeHash,
    decisionHash,domainFingerprints:state.fingerprints,entries,excludedLegacy:state.excludedLegacy,
    omissions:{oldArchiveBodies:Object.keys(state.cold.tables.archives).length,oldBackups:Object.keys(state.cold.tables.backups).length,
      legacyRecords:Object.values(state.legacy.tables.projects).reduce((sum,p)=>sum+p.memories.length,0),legacyIndexAndCache:true,oldWorkflowAndAudits:true},
    knownRestrictions:{count:state.restrictions.length,sha256:digest(state.restrictions)}};
  return {...body,hash:digest(body)};
}

/** Pure parsing/filtering only. Canonical OS identities and configuration authority
 * must already be bound by the caller's capture/plan controller; no boolean grants scope. */
export function prepareAdoptionCandidates(input={}){
  if(!Number.isFinite(adoptionTimestamp(input.evaluatedAt)))fail('P2_ADOPTION_TIME');
  return makeManifest(inspect(input),input.evaluatedAt);
}

/** Builds detached selected objects, never publishes or creates an adopted receipt.
 * Only metadata belongs in the persistent plan; returned domain bodies need the
 * controller's registered, governed staging location before any filesystem write. */
export function materializeAdoptionSelection(input={}){
  const {manifest,choices}=input;
  try{jsonOnly(manifest);const {hash,...body}=manifest;if(hash!==digest(body)||manifest.ruleVersion!==ruleVersion||manifest.metadataOnly!==true)fail('P2_PLAN_CHANGED');}catch{fail('P2_PLAN_CHANGED');}
  const state=inspect(input),current=makeManifest(state,input.evaluatedAt);
  if(!Number.isFinite(adoptionTimestamp(input.evaluatedAt))||adoptionTimestamp(input.evaluatedAt)<adoptionTimestamp(manifest.evaluatedAt)||
    ['sourceHash','scopeHash','ruleVersion','decisionHash'].some(k=>current[k]!==manifest[k]))fail('P2_PLAN_CHANGED');
  if(!Array.isArray(choices))fail('P2_ADOPTION_CHOICE_INVALID');
  const included=new Set(),seen=new Set();
  for(const choice of choices){
    if(!choice||Object.keys(choice).some(k=>!['owner','id','revision','action'].includes(k))||!['include','exclude'].includes(choice.action)||seen.has(identity(choice)))fail('P2_ADOPTION_CHOICE_INVALID');
    const d=state.decisions.find(d=>identity(d.record)===identity(choice));if(!d||choice.action==='include'&&d.disposition!=='eligible')fail('P2_ADOPTION_CHOICE_INVALID');
    seen.add(identity(choice));if(choice.action==='include')included.add(d.record.id);
  }
  for(const d of state.decisions)if(included.has(d.record.id)&&d.record.dependsOn.some(id=>!included.has(id)))fail('P2_ADOPTION_SELECTION_DEPENDENCY');
  const catalog=emptyCatalog(),projects={};
  for(const p of state.projects){
    const old=state.legacy.tables.projects[p.key];
    projects[p.key]={root:p.root,index:null,memories:[],events:structuredClone(old?.events??{}),...old?.automation?{automation:{capture:old.automation.capture,recall:old.automation.recall,
      receipts:Object.fromEntries(Object.entries(old.automation.receipts).map(([key,r])=>[key,{status:r.status,at:r.at}]))}}:{}};
  }
  for(const owner of state.owners)catalog.owners[owner]={records:[],markers:[],events:structuredClone(state.catalog.owners[owner]?.events??{})};
  for(const restriction of state.restrictions){
    const {reason,owner,...marker}=restriction,o=catalog.owners[owner];
    if(!o.markers.some(old=>digest(old)===digest(marker)))o.markers.push(marker);
  }
  const provenanceEntries=[];
  for(const d of state.decisions)if(included.has(d.record.id)){
    const record=structuredClone(d.record),meta=current.entries.find(e=>identity(e)===identity(record));
    record.source={kind:'adoption_selection',sourceHash:state.sourceHash,omittedSourceSha256:meta.omittedSourceSha256};
    if(record.automatic?.expiresAt!==undefined)record.automatic={expiresAt:record.automatic.expiresAt};else delete record.automatic;
    record.historyRefs=[];catalog.owners[record.owner].records.push(record);provenanceEntries.push(meta);
  }
  const domains=[{unit:{name:names[0],version:1},global:null,tables:{projects,media:{}}},{unit:{name:names[1],version:1},global:null,tables:{active:{catalog}}},
    {unit:{name:names[2],version:1},global:null,tables:{archives:{},backups:{}}}];
  for(let i=0;i<3;i++)envelopes[i].parse(domains[i]);
  return {domains,provenance:{version:1,metadataOnly:true,status:'selection-only',historyCoverage:'unknown-before-adoption',sourceHash:state.sourceHash,scopeHash:state.scopeHash,
    ruleVersion,decisionHash:current.decisionHash,manifestHash:manifest.hash,evaluatedAt:manifest.evaluatedAt,recheckedAt:input.evaluatedAt,entries:provenanceEntries,
    omissions:current.omissions,knownRestrictions:current.knownRestrictions}};
}

/** Returns one ephemeral current body for an explicitly requested review. The
 * controller must hold the transaction/source leases, enforce TTL and govern
 * display. This value is not plan metadata, selection consent or publication. */
export function reviewAdoptionCandidate(input={}){
  let selected;
  try{
    jsonOnly(input.record);
    selected=z.object({owner:z.string().regex(/^(project|user):[a-f0-9]{64}$/),id:idSchema,revision:z.number().int().positive()}).strict().parse(input.record);
  }catch{fail('P2_ADOPTION_REVIEW_INVALID');}
  const {manifest}=input;
  try{
    jsonOnly(manifest);const {hash,...body}=manifest;
    if(hash!==digest(body)||manifest.ruleVersion!==ruleVersion||manifest.metadataOnly!==true||
      !Number.isFinite(adoptionTimestamp(manifest.evaluatedAt))||!Number.isFinite(adoptionTimestamp(input.evaluatedAt))||
      adoptionTimestamp(input.evaluatedAt)<adoptionTimestamp(manifest.evaluatedAt))fail('P2_PLAN_CHANGED');
  }catch{fail('P2_PLAN_CHANGED');}
  const state=inspect(input),current=makeManifest(state,input.evaluatedAt);
  // Recreate the exact metadata at the original evaluation label using today's
  // classifications. Mere elapsed time is harmless; altered inputs, decisions or
  // manifest fields cannot acquire a current body through a recomputed self-hash.
  if(makeManifest(state,manifest.evaluatedAt).hash!==manifest.hash)fail('P2_PLAN_CHANGED');
  const decision=state.decisions.find(d=>identity(d.record)===identity(selected));
  if(!decision||decision.disposition!=='eligible')fail('P2_ADOPTION_REVIEW_UNAVAILABLE');
  const r=decision.record,meta=current.entries.find(e=>identity(e)===identity(selected));
  const originalScope={owner:r.owner,scope:r.scope,layer:r.layer};
  const record={...Object.fromEntries(['owner','id','revision','text','scope','layer','category','status','taskState','createdAt','updatedAt','lastUsedAt','closedAt','dueAt']
    .filter(k=>r[k]!==undefined).map(k=>[k,r[k]])),textSha256:meta.textSha256,recordSha256:meta.recordSha256,
    ...r.automatic?.expiresAt!==undefined?{automaticExpiresAt:r.automatic.expiresAt}:{}};
  const shared=r.scope==='user';
  const body={version:1,kind:'adoption-candidate-review',metadataOnly:false,reviewOnly:true,
    sourceHash:state.sourceHash,scopeHash:state.scopeHash,ruleVersion,decisionHash:current.decisionHash,manifestHash:manifest.hash,
    evaluatedAt:manifest.evaluatedAt,recheckedAt:input.evaluatedAt,record,retained:{status:true,taskState:true,timestamps:true},
    scope:{changed:false,from:originalScope,to:{...originalScope},projects:state.projects.filter(p=>shared?p.userOwner===r.owner:p.owner===r.owner).map(({key,root})=>({key,root})),
      shared,...shared?{userProfileHash:r.owner.slice('user:'.length)}:{}},
    history:{historyNotImported:true,count:r.historyRefs.length,sha256:meta.omittedHistorySha256,coverage:'unknown-before-adoption'},
    omissions:{sourceBody:true,sourceSha256:meta.omittedSourceSha256,automaticBody:true,...meta.omittedAutomaticSha256?{automaticSha256:meta.omittedAutomaticSha256}:{},
      oldL4:true,legacyHistory:true,backups:true,indexAndMedia:true},
    authorization:{reviewIsConsent:false,selection:'staging-only',publication:false}};
  return {...body,hash:digest(body)};
}
