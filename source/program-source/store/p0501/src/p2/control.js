import {acquireOwnerFile} from '../owner-lease.mjs';
import {provenanceShape} from '../source-provenance.js';
import {storageIdentity} from './storage-location.js';
import {mkdir,open,readFile,writeFile,rename,unlink,realpath,stat,lstat} from 'node:fs/promises';
import {join,isAbsolute,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync,existsSync} from 'node:fs';
import {fail} from '../errors.js';
import {purgeOwnedBackups,purgeOwnedUpdateStaging,verifySnapshot,applyDeletionGovernance} from './backups.js';
import {validateDocumentMarker} from './document-governance.js';
import {cleanupAdoptionTransactions} from './adoption-governance.js';
import {acquireAdoptionAdmission} from './adoption-admission.js';
import {setTimeout as delay} from 'node:timers/promises';
import {isDeepStrictEqual} from 'node:util';

export const DATA_DOMAINS=['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1'];
const hash=v=>createHash('sha256').update(v).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const semanticHash=value=>hash(JSON.stringify(canonical(value)));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const sha256=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const originKeys=['transactionId','planHash','epoch','sourceHash','selectionHash','rulesHash','confirmationHash','restrictionHash'];
function validOrigin(v){return exact(v,originKeys)&&uuid(v.transactionId)&&uuid(v.epoch)&&originKeys.filter(k=>!['transactionId','epoch'].includes(k)).every(k=>sha256(v[k]));}
function domainHashes(v,allowMissing=false){return exact(v,DATA_DOMAINS)&&DATA_DOMAINS.every(k=>sha256(v[k])||allowMissing&&v[k]===null);}
const adoptionBinding=v=>Object.fromEntries(['transactionId','planHash','file','sha256','operationId'].map(k=>[k,v[k]]));
async function exists(path){try{await stat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function syncFile(path,value,flags='w'){const f=await open(path,flags,0o600);try{await f.writeFile(value);await f.sync();}finally{await f.close();}}
async function publish(path,value){
  const temp=`${path}.${randomUUID()}.tmp`;await syncFile(temp,JSON.stringify(value),'wx');
  // Retry only publication of this already durable head. Re-appending the
  // journal or rerunning a business callback would create a different event.
  for(let attempt=0;;attempt++){
    try{await rename(temp,path);break;}
    catch(error){if(!['EPERM','EBUSY'].includes(error.code)||attempt>=3)throw error;await delay(25*(attempt+1));}
  }
  // On permanent failure both old head and pending temp are retained; journal
  // verification refuses new work until the discrepancy is reconciled.
  if(process.platform!=='win32'){const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}}
}
async function fingerprints(storageRoot){const result={};for(const name of DATA_DOMAINS){try{result[name]=hash(await readFile(join(storageRoot,`${name}.json`)));}catch(e){if(e.code!=='ENOENT')throw e;result[name]=null;}}return result;}
function reduce(events,identity){const cp={identity,coverage:'governed-empty-origin',businessSeq:0,maintenanceSeq:0,deletionSeq:0,pending:[],deletions:[],events,barrier:{closed:true},dataFingerprints:{}};for(const e of events){const p=e.payload;
  if(e.type==='adoption_initialized'){
    if(e.seq!==1||!validOrigin(p.origin)||p.coverage!=='governed-adoption-origin'||p.historyCoverage!=='unknown-before-adoption'||!domainHashes(p.dataFingerprints,true)||Object.values(p.dataFingerprints).some(v=>v!==null))fail('P2_JOURNAL_INVALID');
    cp.coverage=p.coverage;cp.historyCoverage=p.historyCoverage;cp.epoch=p.origin.epoch;cp.dataFingerprints=p.dataFingerprints;cp.adoption={origin:p.origin,status:'importing',adoptedAt:null,commit:null,firstBaseline:null,openedAt:null};cp.adoptionWrites=[];cp.barrier={closed:true,transactionId:p.origin.transactionId,planHash:p.origin.planHash};
  }
  if(e.type==='initialized'){cp.dataFingerprints=p.dataFingerprints;cp.barrier={closed:false};}
  if(e.type==='barrier'){cp.barrier=p;if(cp.adoption&&!p.closed&&!cp.adoption.openedAt)cp.adoption.openedAt=e.at;}
  if(e.type==='adoption_intent'){
    if(cp.adoption?.status!=='importing'||!cp.barrier.closed||cp.pending.length||p.businessSeq!==cp.businessSeq+1||p.epoch!==cp.epoch||p.transactionId!==cp.adoption.origin.transactionId||p.planHash!==cp.adoption.origin.planHash||!uuid(p.operationId)||!sha256(p.sha256)||!isAbsolute(p.file??'')||!isDeepStrictEqual(p.beforeFingerprints,cp.dataFingerprints)||cp.adoptionWrites.some(v=>v.operationId===p.operationId||v.file===p.file))fail('P2_JOURNAL_INVALID');
    cp.businessSeq=p.businessSeq;cp.pending.push({...p,kind:'adoption'});
  }
  if(e.type==='adoption_complete'){
    const prior=cp.pending.find(v=>v.operationId===p.operationId&&v.kind==='adoption');
    if(!prior||!domainHashes(p.dataFingerprints,true)||p.dataFingerprints[DATA_DOMAINS.find(n=>prior.file.endsWith(n+'.json'))]!==prior.sha256)fail('P2_JOURNAL_INVALID');
    cp.pending=cp.pending.filter(v=>v.operationId!==p.operationId);cp.dataFingerprints=p.dataFingerprints;cp.adoptionWrites.push({...prior,completedHead:{seq:e.seq,hash:e.hash}});
  }
  if(e.type==='adopted'){
    if(cp.adoption?.status!=='importing'||!cp.barrier.closed||cp.pending.length||cp.adoptionWrites.length!==3||p.businessSeq!==cp.businessSeq||p.deletionSeq!==cp.deletionSeq||!isDeepStrictEqual(p.dataFingerprints,cp.dataFingerprints)||p.confirmationHash!==cp.adoption.origin.confirmationHash||p.health?.success!==true||!isDeepStrictEqual(p.health.dataFingerprints,p.dataFingerprints))fail('P2_JOURNAL_INVALID');
    cp.adoption.status='adopted';cp.adoption.adoptedAt=e.at;cp.adoption.commit={...p,head:{seq:e.seq,hash:e.hash}};cp.adoption.firstBaseline={...p.firstBaseline,status:'planned'};
  }
  if(e.type==='adoption_baseline_ready'){
    if(cp.adoption?.status!=='adopted'||cp.adoption.firstBaseline.status!=='planned'||!isDeepStrictEqual(p.firstBaseline,cp.adoption.commit.firstBaseline)||!sha256(p.checksum))fail('P2_JOURNAL_INVALID');
    cp.adoption.firstBaseline={...p.firstBaseline,status:'ready',checksum:p.checksum,readyHead:{seq:e.seq,hash:e.hash}};
  }
  if(e.type==='business_intent'){if(p.businessSeq!==cp.businessSeq+1)fail('P2_JOURNAL_INVALID');cp.businessSeq=p.businessSeq;cp.pending.push({...p,kind:'business'});}
  if(e.type==='maintenance_intent'){if(p.maintenanceSeq!==cp.maintenanceSeq+1)fail('P2_JOURNAL_INVALID');cp.maintenanceSeq=p.maintenanceSeq;cp.pending.push({...p,kind:'maintenance'});}
  if(e.type==='business_complete'||e.type==='maintenance_complete'){if(!cp.pending.some(v=>v.operationId===p.operationId))fail('P2_JOURNAL_INVALID');cp.pending=cp.pending.filter(v=>v.operationId!==p.operationId);cp.dataFingerprints=p.dataFingerprints;}
  if(e.type==='deletion_intent'){validateDocumentMarker(p);if(p.deletionSeq!==cp.deletionSeq+1)fail('P2_JOURNAL_INVALID');cp.deletionSeq=p.deletionSeq;cp.deletions.push({...p,cleanup:'pending'});}
  if(e.type==='deletion_complete'){const d=cp.deletions.find(v=>v.deletionSeq===p.deletionSeq);if(!d)fail('P2_JOURNAL_INVALID');d.cleanup='complete';}
  if(e.type==='recovered_intents')cp.pending=cp.pending.filter(v=>!p.operationIds.includes(v.operationId));
}cp.head={seq:events.length,hash:events.at(-1)?.hash??null};return cp;}
function verifyJournal(body,head,identity){if(!body.endsWith('\n'))fail('P2_JOURNAL_INVALID');const events=body.slice(0,-1).split('\n').map(JSON.parse);let previous=null;for(let i=0;i<events.length;i++){const {hash:actual,...value}=events[i];if(value.seq!==i+1||value.previous!==previous||value.identity!==identity||actual!==hash(JSON.stringify(value))||i>0&&['initialized','adoption_initialized'].includes(value.type))fail('P2_JOURNAL_INVALID');previous=actual;}if(head.identity!==identity||head.seq!==events.length||head.hash!==previous||!['initialized','adoption_initialized'].includes(events[0]?.type))fail('P2_JOURNAL_INVALID');return reduce(events,identity);}

/** Fixed rc.5 JSON storage coordinator. fsync is exercised for process-crash safety;
 * Windows directory durability under sudden power loss is not claimed. */
export async function openControl({storageRoot,mode='writer',initialize=false,recoverLockToken,adoption,recoverDocumentDeletion=false}={}){
  if(!isAbsolute(storageRoot??'')||!['writer','maintenance'].includes(mode))fail('P2_CONFIG');
  if(adoption!==undefined&&(!validOrigin(adoption)||initialize||mode!=='maintenance'))fail('P2_ADOPTION_ORIGIN_INVALID');
  await mkdir(storageRoot,{recursive:true});storageRoot=await realpath(storageRoot);
  const location=await stat(storageRoot,{bigint:true}),locationKey=`${location.dev}:${location.ino}`;
  if(location.ino===0n)fail('P2_STORAGE_UNVERIFIED','Filesystem does not expose a stable directory identity');
  const root=join(storageRoot,'.suite-memory','p2');await mkdir(root,{recursive:true});
  if(await realpath(root)!==root)fail('P2_STORAGE_MISMATCH','Control root cannot be redirected');
  const identity=await storageIdentity({storageRoot,locationKey,root});
  const lockPath=join(root,'owner.lock'),guardPath=join(root,'recovery.guard'),journalPath=join(root,'journal.jsonl'),legacyHeadPath=join(root,'head.json'),adoptionHeadPath=join(root,'adoption-control','head.json'),documentHeadPath=join(root,'document-control','head.json');
  const authorityHeads=[legacyHeadPath,adoptionHeadPath,documentHeadPath];
  let headPath=legacyHeadPath;
  let matchedPrior=false;
  let ownership,closed=false,tail=Promise.resolve();const token=randomUUID(),context=new AsyncLocalStorage();
  // Legacy guard files remain a refusal: they carry no native ownership proof.
  if(await exists(guardPath)||recoverLockToken&&(mode!=='maintenance'||!await exists(lockPath)))fail('P2_LOCKED');
  try {ownership=await acquireOwnerFile({path:lockPath,payload:{token,identity,pid:process.pid,mode,createdAt:new Date().toISOString()},validatePrior:prior=>(matchedPrior=typeof prior.token==='string'&&/^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(prior.token)&&Number.isInteger(prior.pid)&&prior.pid>0&&Number.isFinite(Date.parse(prior.createdAt))&&prior.identity===identity&&['writer','maintenance'].includes(prior.mode)&&(!recoverLockToken||prior.token===recoverLockToken))});}catch(cause){throw Object.assign(new Error('P2_LOCKED: '+(cause.code??'OWNER_UNKNOWN'),{cause}),{code:'P2_LOCKED',reason:cause.code});}
  if(await exists(guardPath)||recoverLockToken&&!matchedPrior){await ownership.release();fail('P2_LOCKED');}
  async function assertOwned(){if(closed)fail('P2_FENCE_LOST','Coordinator closed');await ownership.assertOwned();const owner=JSON.parse(await readFile(lockPath,'utf8'));if(owner.token!==token||owner.identity!==identity)fail('P2_FENCE_LOST');const current=await stat(storageRoot,{bigint:true});if(`${current.dev}:${current.ino}`!==locationKey||await realpath(storageRoot)!==storageRoot||await realpath(root)!==root||await realpath(dirname(headPath))!==dirname(headPath))fail('P2_STORAGE_MISMATCH');if((await Promise.all(authorityHeads.map(exists))).filter(Boolean).length>1)fail('P2_JOURNAL_INVALID');}
  const documentProtocol=cp=>headPath===documentHeadPath?{...cp,documentDeletionProtocol:1}:cp;
  async function checkpoint(){await assertOwned();try{const [body,head]=await Promise.all([readFile(journalPath,'utf8'),readFile(headPath,'utf8').then(JSON.parse)]);return documentProtocol(verifyJournal(body,head,identity));}catch(e){if(e.code==='P2_FENCE_LOST')throw e;fail('P2_JOURNAL_INVALID',e.message);}}
  function readableCheckpoint(){if(closed)fail('P2_FENCE_LOST');const owner=JSON.parse(readFileSync(lockPath,'utf8'));if(owner.token!==token)fail('P2_FENCE_LOST');let cp;try{if(authorityHeads.filter(existsSync).length>1)fail('P2_JOURNAL_INVALID');cp=documentProtocol(verifyJournal(readFileSync(journalPath,'utf8'),JSON.parse(readFileSync(headPath,'utf8')),identity));}catch(e){fail('P2_JOURNAL_INVALID',e.message);}const local=context.getStore();if((cp.barrier.closed||cp.pending.length)&&(local?.control!==control||local.kind==='access'))fail('P2_RECOVERY_REQUIRED');return cp;}
  function assertReadable(){readableCheckpoint();}
  function assertDocumentDeletion(marker){const local=context.getStore();if(local?.control!==control||local.kind!=='business'||local.meta?.operation!=='document_delete'||local.meta.recordId!==marker?.id||local.meta.planHash!==marker?.planHash||local.meta.documentPath!==marker?.documentPath||local.meta.owner!==marker?.owner)fail('P2_EVENT_RESERVED');const cp=readableCheckpoint();if(!cp.deletions.some(d=>d.id===marker.id&&d.owner===marker.owner&&d.planHash===marker.planHash&&d.documentPath===marker.documentPath))fail('P2_DELETION_INVALID');}
  async function append(type,payload,cp){await assertOwned();cp??=await checkpoint();const value={seq:cp.head.seq+1,previous:cp.head.hash,identity,type,payload,at:new Date().toISOString()};const e={...value,hash:hash(JSON.stringify(value))};await syncFile(journalPath,`${JSON.stringify(e)}\n`,'a');await publish(headPath,{identity,seq:e.seq,hash:e.hash});return e;}
  const queue=fn=>{if(context.getStore()?.control===control){if(context.getStore().kind==='checkpoint')fail('P2_CHECKPOINT_READ_ONLY');return fn();}const run=tail.then(fn);tail=run.catch(()=>{});return run;};
  // Retention holds the same queue through its filesystem work, without
  // inventing a business write or a maintenance intent. The callback may read
  // this coordinator, but nested mutations cannot bypass its write journal.
  const withCheckpoint=async fn=>queue(async()=>{if(typeof fn!=='function')fail('P2_CONFIG');const cp=await checkpoint();return context.run({control,kind:'checkpoint'},async()=>{const result=await fn(cp);await assertOwned();return result;});});
  // Native KV lookups are synchronous. Their asynchronous suite callers take
  // this lease before reading, and keep it until their data work finishes.
  // Reads therefore cannot sample an append between journal fsync and head
  // publication, or observe a different operation's unresolved business data.
  // This is not a business transaction: nested writes still journal normally.
  async function withAccess(fn){
    if(typeof fn!=='function')fail('P2_CONFIG');
    if(context.getStore()?.control===control){await assertOwned();return fn();}
    return queue(async()=>{
      async function verify(){const cp=await checkpoint();if(cp.barrier.closed||cp.pending.length)fail('P2_RECOVERY_REQUIRED');if(!same(await fingerprints(storageRoot),cp.dataFingerprints))fail('P2_DATA_DRIFT');}
      await verify();
      return context.run({control,kind:'access'},async()=>{const result=await fn();await verify();return result;});
    });
  }
  async function event(type,payload={}){return queue(async()=>{
    if(['initialized','adoption_initialized','adoption_intent','adoption_complete','adopted','adoption_baseline_ready','business_intent','business_complete','maintenance_intent','maintenance_complete','deletion_intent','deletion_complete'].includes(type))fail('P2_EVENT_RESERVED');
    if(mode!=='maintenance'&&!['audit','inspection'].includes(type))fail('P2_MAINTENANCE_REQUIRED');
    const cp=await checkpoint();
    if(type==='barrier'&&payload.closed===false){
      if(cp.adoption&&!cp.adoption.openedAt){
        if(cp.adoption.status!=='adopted')fail('P2_ADOPTION_COMMIT_REQUIRED');
        if(cp.adoption.firstBaseline?.status!=='ready')fail('P2_ADOPTION_BASELINE_REQUIRED');
        if(cp.pending.length||!cp.barrier.closed||payload.transactionId!==cp.adoption.origin.transactionId||payload.planHash!==cp.adoption.origin.planHash||!isDeepStrictEqual(await fingerprints(storageRoot),cp.dataFingerprints))fail('P2_ADOPTION_PLAN_CHANGED');
        return append(type,payload,cp);
      }
      const lastClosed=cp.events.findLastIndex(e=>e.type==='barrier'&&e.payload.closed===true);
      if(cp.pending.length||!cp.barrier.closed||cp.barrier.transactionId!==payload.transactionId||cp.barrier.planHash!==payload.planHash||!cp.events.slice(lastClosed+1).some(e=>['committed','rolled_back'].includes(e.type)&&e.payload.transactionId===payload.transactionId&&e.payload.planHash===payload.planHash))fail('P2_COMMIT_REQUIRED');
    }
    if(type==='recovered_intents'){
      if(!Array.isArray(payload.operationIds)||payload.operationIds.some(id=>!cp.pending.some(v=>v.operationId===id&&v.kind==='maintenance')))fail('P2_RECOVERY_REQUIRED','Only verified maintenance intents can be resolved by recovery');
    }
    return append(type,payload,cp);
  });}
  async function operation(kind,meta,fn){
    if(context.getStore()?.control===control&&context.getStore().kind!=='access'){await assertOwned();if(context.getStore().kind==='checkpoint')fail('P2_CHECKPOINT_READ_ONLY');if(context.getStore().kind==='adoption')fail('P2_ADOPTION_WRITE_REQUIRED');return fn();}
    return queue(async()=>{const cp=await checkpoint();if(kind==='business'&&(cp.barrier.closed||cp.pending.length))fail('P2_RECOVERY_REQUIRED');if(kind==='maintenance'&&cp.adoption&&!cp.adoption.openedAt)fail('P2_ADOPTION_WRITE_REQUIRED');if(kind==='maintenance'&&(mode!=='maintenance'||!cp.barrier.closed))fail('P2_MAINTENANCE_REQUIRED');if(kind==='business'&&!same(await fingerprints(storageRoot),cp.dataFingerprints))fail('P2_DATA_DRIFT');
      const operationId=randomUUID(),seqName=kind==='business'?'businessSeq':'maintenanceSeq';await append(`${kind}_intent`,{...meta,operationId,[seqName]:cp[seqName]+1,writer:token},cp);
      const result=await context.run({control,kind,operationId,meta},fn);await assertOwned();await append(`${kind}_complete`,{operationId,dataFingerprints:await fingerprints(storageRoot)});return result;
    });
  }
  function importing(cp,meta){
    if(mode!=='maintenance'||!cp.adoption)fail('P2_MAINTENANCE_REQUIRED');
    if(cp.adoption.status!=='importing')fail('P2_ADOPTION_ALREADY_COMMITTED');
    if(!cp.barrier.closed)fail('P2_MAINTENANCE_REQUIRED');
    if(!exact(meta,['transactionId','planHash','file','sha256','operationId'])||meta.transactionId!==cp.adoption.origin.transactionId||meta.planHash!==cp.adoption.origin.planHash||!uuid(meta.operationId)||!sha256(meta.sha256)||!DATA_DOMAINS.some(name=>meta.file===join(storageRoot,name+'.json')))fail('P2_ADOPTION_PLAN_CHANGED');
  }
  async function adoptionOperation(meta,fn,reconcile=false){return queue(async()=>{
    let cp=await checkpoint();importing(cp,meta);const key=DATA_DOMAINS.find(name=>meta.file===join(storageRoot,name+'.json'));
    const completed=cp.adoptionWrites.find(v=>v.operationId===meta.operationId);
    if(completed){if(!isDeepStrictEqual(adoptionBinding(completed),meta))fail('P2_ADOPTION_PLAN_CHANGED');if(!isDeepStrictEqual(await fingerprints(storageRoot),cp.dataFingerprints)||cp.dataFingerprints[key]!==meta.sha256)fail('P2_ADOPTION_DATA_CHANGED');return structuredClone(completed);}
    let intent=cp.pending.find(v=>v.operationId===meta.operationId&&v.kind==='adoption');
    if(cp.pending.length&&(!intent||cp.pending.length!==1))fail('P2_RECOVERY_REQUIRED');
    if(intent&&!isDeepStrictEqual(adoptionBinding(intent),meta))fail('P2_ADOPTION_PLAN_CHANGED');
    if(!intent){
      if(reconcile||cp.adoptionWrites.some(v=>v.file===meta.file))fail('P2_ADOPTION_PLAN_CHANGED');
      const actual=await fingerprints(storageRoot);if(!isDeepStrictEqual(actual,cp.dataFingerprints))fail('P2_ADOPTION_DATA_CHANGED');
      intent={...meta,epoch:cp.epoch,businessSeq:cp.businessSeq+1,beforeFingerprints:actual,writer:token};
      await append('adoption_intent',intent,cp);cp=await checkpoint();
    }
    const expected={...intent.beforeFingerprints,[key]:meta.sha256},actual=await fingerprints(storageRoot);
    if(!isDeepStrictEqual(actual,expected)){
      if(reconcile||!isDeepStrictEqual(actual,intent.beforeFingerprints))fail('P2_ADOPTION_DATA_CHANGED');
      await context.run({control,kind:'adoption',operationId:meta.operationId,meta},fn);
    }
    await assertOwned();if(!isDeepStrictEqual(await fingerprints(storageRoot),expected))fail('P2_ADOPTION_DATA_CHANGED');
    await append('adoption_complete',{operationId:meta.operationId,dataFingerprints:expected});
    return structuredClone((await checkpoint()).adoptionWrites.find(v=>v.operationId===meta.operationId));
  });}
  async function commitAdoption(input){return queue(async()=>{
    const cp=await checkpoint();if(mode!=='maintenance'||!cp.adoption)fail('P2_MAINTENANCE_REQUIRED');
    if(!exact(input,['transactionId','planHash','expectedBusinessSeq','expectedDeletionSeq','expectedDataFingerprints','health','firstBaseline'])||input.transactionId!==cp.adoption.origin.transactionId||input.planHash!==cp.adoption.origin.planHash)fail('P2_ADOPTION_PLAN_CHANGED');
    const firstBaseline={id:cp.epoch,directory:join(root,'backups',cp.epoch)};
    if(!isDeepStrictEqual(firstBaseline,input.firstBaseline)||!Number.isSafeInteger(input.expectedBusinessSeq)||!Number.isSafeInteger(input.expectedDeletionSeq))fail('P2_ADOPTION_PLAN_CHANGED');
    const payload={businessSeq:input.expectedBusinessSeq,deletionSeq:input.expectedDeletionSeq,dataFingerprints:input.expectedDataFingerprints,confirmationHash:cp.adoption.origin.confirmationHash,health:input.health,firstBaseline};
    if(cp.adoption.status==='adopted'){
      const {head,...prior}=cp.adoption.commit;if(!isDeepStrictEqual(payload,prior))fail('P2_ADOPTION_PLAN_CHANGED');return structuredClone(cp.adoption);
    }
    if(input.expectedBusinessSeq!==cp.businessSeq||input.expectedDeletionSeq!==cp.deletionSeq)fail('P2_ADOPTION_PLAN_CHANGED');
    if(!cp.barrier.closed||cp.pending.length||cp.adoptionWrites.length!==3||!domainHashes(input.expectedDataFingerprints)||!exact(input.health,['success','dataFingerprints'])||input.health.success!==true||!isDeepStrictEqual(input.health.dataFingerprints,input.expectedDataFingerprints))fail('P2_ADOPTION_COMMIT_REQUIRED');
    if(!isDeepStrictEqual(input.expectedDataFingerprints,cp.dataFingerprints)||!isDeepStrictEqual(await fingerprints(storageRoot),cp.dataFingerprints)||DATA_DOMAINS.some(name=>!cp.adoptionWrites.some(v=>v.file===join(storageRoot,name+'.json')&&v.sha256===cp.dataFingerprints[name])))fail('P2_ADOPTION_DATA_CHANGED');
    await append('adopted',payload,cp);return structuredClone((await checkpoint()).adoption);
  });}
  async function acceptAdoptionBaseline(input){return queue(async()=>{
    const cp=await checkpoint();if(mode!=='maintenance'||cp.adoption?.status!=='adopted'||!cp.barrier.closed)fail('P2_ADOPTION_COMMIT_REQUIRED');
    const first=cp.adoption.firstBaseline;
    if(!exact(input,['directory','checksum'])||input.directory!==first.directory||!sha256(input.checksum))fail('P2_ADOPTION_BASELINE_REQUIRED');
    const manifest=await verifySnapshot(input.directory),prior=manifest.baseline.deletionCheckpoint;
    if(manifest.checksum!==input.checksum||!prior||prior.coverage!==cp.coverage||prior.identity!==cp.identity||prior.epoch!==cp.epoch||prior.historyCoverage!==cp.historyCoverage||prior.adoption?.status!=='adopted'||!isDeepStrictEqual(prior.adoption.origin,cp.adoption.origin)||!isDeepStrictEqual(prior.adoption.commit,cp.adoption.commit)||manifest.baseline.planHash!==cp.adoption.origin.planHash||manifest.baseline.businessSeq!==cp.adoption.commit.businessSeq||prior.head.seq<cp.adoption.commit.head.seq||cp.pending.length||cp.businessSeq!==cp.adoption.commit.businessSeq||cp.deletionSeq!==cp.adoption.commit.deletionSeq||!isDeepStrictEqual(await fingerprints(storageRoot),cp.adoption.commit.dataFingerprints))fail('P2_ADOPTION_BASELINE_REQUIRED');
    const domains=manifest.files.filter(f=>f.role==='domain');if(DATA_DOMAINS.some(name=>!domains.some(f=>f.exists&&f.path===join(storageRoot,name+'.json')&&f.sha256===cp.adoption.commit.dataFingerprints[name])))fail('P2_ADOPTION_BASELINE_REQUIRED');
    if(first.status==='ready'){if(first.checksum!==input.checksum)fail('P2_ADOPTION_BASELINE_REQUIRED');return structuredClone(first);}
    await append('adoption_baseline_ready',{firstBaseline:cp.adoption.commit.firstBaseline,checksum:input.checksum},cp);return structuredClone((await checkpoint()).adoption.firstBaseline);
  });}
  async function deletion(marker){return queue(async()=>{
    const cp=await checkpoint();if(context.getStore()?.kind!=='business'&&!(mode==='maintenance'&&cp.barrier.closed))fail('P2_BUSINESS_REQUIRED');
    if(typeof marker.id!=='string'||!marker.id||typeof marker.owner!=='string'||!marker.owner||!['withdrawn','purged'].includes(marker.status))fail('P2_DELETION_INVALID');
    validateDocumentMarker(marker);
    if(marker.historyProvenance!==undefined&&!provenanceShape(marker.historyProvenance))fail('P2_DELETION_INVALID');
    if(marker.sourceRefs!==undefined&&(!Array.isArray(marker.sourceRefs)||marker.sourceRefs.length>2048||marker.sourceRefs.some(r=>!r||Object.keys(r).some(k=>!['path','sha256'].includes(k))||typeof r.path!=='string'||r.path.length>4096||! /^[a-f0-9]{64}$/.test(r.sha256))))fail('P2_DELETION_INVALID');
    if(marker.archiveIds!==undefined&&(!Array.isArray(marker.archiveIds)||marker.archiveIds.length>5000||marker.archiveIds.some(id=>typeof id!=='string'||!id||id.length>512)))fail('P2_DELETION_INVALID');
    const prior=cp.deletions.find(d=>d.id===marker.id&&d.owner===marker.owner&&d.status===marker.status);if(prior){if(JSON.stringify(marker.historyProvenance)!==JSON.stringify(prior.historyProvenance))fail('P2_DELETION_PROVENANCE_CHANGED');if(marker.documentPath!==undefined&&(prior.documentPath!==marker.documentPath||prior.planHash!==marker.planHash))fail('P2_DOCUMENT_PLAN_CHANGED');return prior;}
    const allowed=Object.fromEntries(['id','owner','status','keyHash','textHash','at','sourceRefs','archiveIds','revisionIds','documentPath','planHash','sourceIdentity','historyProvenance'].filter(k=>marker[k]!==undefined).map(k=>[k,marker[k]]));const e=await append('deletion_intent',{...allowed,deletionSeq:cp.deletionSeq+1,operationId:context.getStore()?.operationId??randomUUID()},cp);return e.payload;
  });}
  async function readDomains(){
    const rows=[];
    for(const name of DATA_DOMAINS){try{rows.push(JSON.parse(await readFile(join(storageRoot,name+'.json'),'utf8')));}catch(error){if(error.code!=='ENOENT')throw error;rows.push({unit:{name,version:1},global:null,tables:name===DATA_DOMAINS[0]?{projects:{},media:{}}:name===DATA_DOMAINS[1]?{active:{}}:{archives:{},backups:{}}});}}
    return rows;
  }
  function documentPending(cp){
    return !cp.barrier.closed&&cp.pending.length===1&&cp.pending.every(intent=>{
      const marker=intent.documentMarker;
      try{validateDocumentMarker(marker);}catch{return false;}
      return intent.kind==='business'&&intent.operation==='document_delete'&&marker?.documentPath!==undefined&&intent.recordId===marker.id&&intent.planHash===marker.planHash&&intent.owner===marker.owner&&intent.documentPath===marker.documentPath&&domainHashes(intent.documentRemaining)&&domainHashes(intent.beforeFingerprints,true)&&cp.deletions.filter(d=>d.operationId===intent.operationId).every(d=>d.id===marker.id&&d.owner===marker.owner&&d.documentPath===marker.documentPath&&d.planHash===marker.planHash);
    });
  }
  async function documentDeletion(marker,fn,preflight){return queue(async()=>{
    validateDocumentMarker(marker);
    if(marker.historyProvenance!==undefined&&!provenanceShape(marker.historyProvenance))fail('P2_DELETION_INVALID');if(marker.documentPath===undefined||typeof fn!=='function'||preflight!==undefined&&typeof preflight!=='function')fail('P2_DELETION_INVALID');
    const cp=await checkpoint();if(cp.barrier.closed||cp.pending.length)fail('P2_RECOVERY_REQUIRED');
    if(!same(await fingerprints(storageRoot),cp.dataFingerprints))fail('P2_DATA_DRIFT');
    const prior=cp.deletions.find(d=>d.id===marker.id&&d.owner===marker.owner&&d.status==='purged');
    if(prior&&(prior.documentPath!==marker.documentPath||prior.planHash!==marker.planHash))fail('P2_DOCUMENT_PLAN_CHANGED');
    if(preflight)await context.run({control,kind:'checkpoint'},()=>preflight(structuredClone(cp)));
    if(!same(await fingerprints(storageRoot),cp.dataFingerprints))fail('P2_DATA_DRIFT');
    const operationId=randomUUID(),approved=prior??{...structuredClone(marker),at:marker.at??new Date().toISOString(),deletionSeq:cp.deletionSeq+1,operationId};
    const rows=applyDeletionGovernance(await readDomains(),[approved]);
    const meta={operation:'document_delete',recordId:marker.id,owner:marker.owner,documentPath:marker.documentPath,planHash:marker.planHash,documentMarker:approved,beforeFingerprints:cp.dataFingerprints,documentRemaining:Object.fromEntries(rows.map(row=>[row.unit.name,semanticHash(row)]))};
    // A single same-filesystem rename upgrades the authority location before
    // any new deletion intent. Pre-protocol runtimes require their old head and
    // consequently fail closed even when installed directly outside updater.
    if(headPath!==documentHeadPath){await assertOwned();await mkdir(dirname(documentHeadPath),{recursive:true});if(await realpath(dirname(documentHeadPath))!==dirname(documentHeadPath))fail('P2_STORAGE_MISMATCH');if(await exists(documentHeadPath))fail('P2_JOURNAL_INVALID');await rename(headPath,documentHeadPath);headPath=documentHeadPath;if(process.platform!=='win32'){const directory=await open(dirname(documentHeadPath),'r');try{await directory.sync();}finally{await directory.close();}}}
    await append('business_intent',{...meta,operationId,businessSeq:cp.businessSeq+1,writer:token},cp);
    const result=await context.run({control,kind:'business',operationId,meta},async()=>fn(await deletion(approved)));
    await assertOwned();await append('business_complete',{operationId,dataFingerprints:await fingerprints(storageRoot)});return result;
  });}
  async function recoverDocumentDeletions(){return queue(async()=>{
    const cp=await checkpoint();if(!cp.pending.length)return {recovered:false};if(!documentPending(cp))fail('P2_RECOVERY_REQUIRED');
    const intent=cp.pending[0],meta=intent,operationId=intent.operationId;
    return context.run({control,kind:'business',operationId,meta},async()=>{
      const marker=await deletion(intent.documentMarker),current=await readDomains(),governed=applyDeletionGovernance(current,[marker]);
      if(governed.some(row=>semanticHash(row)!==intent.documentRemaining[row.unit.name]))fail('P2_DATA_DRIFT');
      for(const [i,row]of governed.entries()){
        const path=join(storageRoot,row.unit.name+'.json');if(intent.beforeFingerprints[row.unit.name]===null)continue;
        if(!isDeepStrictEqual(row,current[i])){
          const temporary=path+'.document-recovery-'+operationId+'.tmp',bytes=Buffer.from(JSON.stringify(row));
          try{await syncFile(temporary,bytes,'wx');}catch(error){
            if(error.code!=='EEXIST')throw error;
            const identity=await lstat(temporary,{bigint:true});if(!identity.isFile()||identity.isSymbolicLink()||identity.nlink!==1n||identity.size>BigInt(bytes.length))fail('P2_DATA_DRIFT');
            const previous=await readFile(temporary);if(!previous.equals(bytes.subarray(0,previous.length)))fail('P2_DATA_DRIFT');
            const handle=await open(temporary,'r+');try{const actual=await handle.stat({bigint:true});if(actual.dev!==identity.dev||actual.ino!==identity.ino||actual.nlink!==1n)fail('P2_DATA_DRIFT');await handle.truncate(0);await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
          }
          await assertOwned();await rename(temporary,path);
        }
      }
      await append('business_complete',{operationId,dataFingerprints:await fingerprints(storageRoot)});
      return {recovered:true,id:marker.id,planHash:marker.planHash,cleanup:'pending'};
    });
  });}
  async function completeDeletion(input){
    const {id}=input??{},local=context.getStore();if(!input||Object.keys(input).some(key=>key!=='id')||local?.control!==control||local.kind!=='business'||!['purge_owned_backups','document_delete'].includes(local.meta?.operation)||local.meta.recordId!==id)fail('P2_EVENT_RESERVED');
    const cp=await checkpoint();if(!cp.deletions.some(d=>d.id===id&&d.status==='purged'))fail('P2_DELETION_INVALID');
    const results=[];
    for(const [name,cleanup]of [['backups',purgeOwnedBackups],['updates',purgeOwnedUpdateStaging]]){
      try{const result=await cleanup({directory:join(root,name),checkpoint:cp});results.push(...result.results);}
      catch(error){results.push({directory:join(root,name),status:'incomplete',code:error.code??'P2_DELETION_CLEANUP_FAILED'});}
    }
    let admission;
    try{
      try{
        admission=await acquireAdoptionAdmission({storageRoot,transactionId:local.operationId});
        await admission.assertOwned();const cleanup=await cleanupAdoptionTransactions({storageRoot,reason:'deleted'});results.push(...cleanup.results);await admission.assertOwned();
      }catch(error){results.push({directory:join(root,'adoptions'),status:'incomplete',code:error.code??'P2_DELETION_CLEANUP_FAILED'});}
      await assertOwned();const result={complete:results.every(value=>value.status==='cleaned'),results};
      if(result.complete){await admission.assertOwned();for(const marker of cp.deletions.filter(d=>d.id===id&&d.status==='purged'&&d.cleanup!=='complete'))await append('deletion_complete',{deletionSeq:marker.deletionSeq,operationId:local.operationId});}
      return result;
    }finally{await admission?.close();}
  }
  const control={root,storageRoot,identity,mode,token,get headPath(){return headPath;},checkpoint,withCheckpoint,withAccess,event,assertOwned,assertReadable,assertDocumentDeletion,deletion,completeDeletion,documentDeletion,recoverDocumentDeletions,documentDeletions:()=>structuredClone(readableCheckpoint().deletions.filter(marker=>marker.documentPath!==undefined)),adoptionWrite:(meta,fn)=>adoptionOperation(meta,fn),reconcileAdoption:meta=>adoptionOperation(meta,null,true),commitAdoption,acceptAdoptionBaseline,business:(meta,fn)=>operation('business',meta,fn),maintenance:(meta,fn)=>operation('maintenance',meta,fn),setBarrier:payload=>event('barrier',payload),
    async close(){if(context.getStore()?.control===control&&context.getStore().kind==='checkpoint')fail('P2_CHECKPOINT_READ_ONLY');if(closed)return;await tail;closed=true;await ownership.release();}
  };
  try{
    const journalExists=await exists(journalPath),legacyHeadExists=await exists(legacyHeadPath),adoptionHeadExists=await exists(adoptionHeadPath),documentHeadExists=await exists(documentHeadPath);
    if([legacyHeadExists,adoptionHeadExists,documentHeadExists].filter(Boolean).length>1)fail('P2_JOURNAL_INVALID');
    let adoptionJournal=Boolean(adoption);
    if(journalExists){try{adoptionJournal=JSON.parse((await readFile(journalPath,'utf8')).split('\n')[0]).type==='adoption_initialized';}catch{fail('P2_JOURNAL_INVALID');}}
    if(documentHeadExists)headPath=documentHeadPath;
    else if(adoptionJournal){headPath=adoptionHeadPath;await mkdir(dirname(headPath),{recursive:true});if(await realpath(dirname(headPath))!==dirname(headPath))fail('P2_STORAGE_MISMATCH');}
    const headExists=documentHeadExists||(adoptionJournal?adoptionHeadExists:legacyHeadExists);
    if(!documentHeadExists&&(adoptionJournal&&legacyHeadExists||!adoptionJournal&&adoptionHeadExists))fail('P2_JOURNAL_INVALID');
    if(!journalExists&&!headExists){if(!initialize&&!adoption)fail('P2_UNINITIALIZED');const dataFingerprints=await fingerprints(storageRoot);if(Object.values(dataFingerprints).some(v=>v!==null))fail('P2_COVERAGE_UNKNOWN');if(adoption)await append('adoption_initialized',{coverage:'governed-adoption-origin',historyCoverage:'unknown-before-adoption',origin:structuredClone(adoption),dataFingerprints},{head:{seq:0,hash:null}});else await append('initialized',{coverage:'governed-empty-origin',dataFingerprints},{head:{seq:0,hash:null}});}
    else if(journalExists!==headExists)fail('P2_JOURNAL_INVALID');
    const cp=await checkpoint();if(adoption&&!isDeepStrictEqual(adoption,cp.adoption?.origin))fail('P2_ADOPTION_PLAN_CHANGED');if(mode==='writer'&&(cp.barrier.closed||cp.pending.length)&&!(recoverDocumentDeletion===true&&documentPending(cp)))fail('P2_RECOVERY_REQUIRED');return control;
  }catch(e){await control.close();throw e;}
}
