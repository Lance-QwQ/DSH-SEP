import {provenanceShape,mergeProvenance} from '../source-provenance.js';
import {mkdir,open,readFile,lstat,readdir,rename,rm} from 'node:fs/promises';
import {resolve,dirname,basename,relative,isAbsolute,sep,join,parse} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {documentMatches,validateDocumentMarker} from './document-governance.js';

const DOMAINS=['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const fault=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const inside=(root,path)=>{const rel=relative(resolve(root),resolve(path));return rel===''||!rel.startsWith(`..${sep}`)&&rel!=='..'&&!isAbsolute(rel);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

async function noLinks(path){
  if(!isAbsolute(path))fault('P2_SNAPSHOT_FORBIDDEN_PATH');
  const absolute=resolve(path),root=parse(absolute).root;let current=root;
  for(const part of absolute.slice(root.length).split(sep).filter(Boolean)){
    current=join(current,part);let stat;
    try{stat=await lstat(current);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(stat.isSymbolicLink())fault('P2_SNAPSHOT_FORBIDDEN_PATH','Snapshot paths cannot traverse links');
  }
  return absolute;
}
async function managedDirectory(path){
  const absolute=await noLinks(path);
  if(!absolute.split(sep).includes('.suite-memory'))fault('P2_SNAPSHOT_FORBIDDEN_PATH','Backups must be under .suite-memory');
  return absolute;
}
function fileShape(files,excludedPaths=[]){
  if(!Array.isArray(files)||!files.length)fault('P2_SNAPSHOT_INCOMPLETE');
  const paths=new Set(),ids=new Set();
  for(const file of files){
    if(!object(file)||typeof file.id!=='string'||!file.id||ids.has(file.id)||!['domain','config','manifest','lock'].includes(file.role)||!isAbsolute(file.path))fault('P2_SNAPSHOT_INCOMPLETE');
    const key=process.platform==='win32'?resolve(file.path).toLowerCase():resolve(file.path);
    if(paths.has(key))fault('P2_SNAPSHOT_INCOMPLETE');paths.add(key);ids.add(file.id);
    if(excludedPaths.some(path=>inside(path,file.path))||/budget|deletion.*ledger|control.*ledger/i.test(basename(file.path)))fault('P2_SNAPSHOT_FORBIDDEN_PATH');
  }
  const domains=files.filter(file=>file.role==='domain');
  if(domains.length!==3||DOMAINS.some(name=>!domains.some(file=>basename(file.path)===`${name}.json`))||['config','manifest','lock'].some(role=>!files.some(file=>file.role===role)))fault('P2_SNAPSHOT_INCOMPLETE');
}
async function durableNew(path,bytes){
  const handle=await open(path,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  // Windows directory fsync is unavailable; recovery requires verified files,
  // never mere existence of a completion filename after a power interruption.
  if(process.platform!=='win32'){const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}}
}
async function bytesOrMissing(path){
  await noLinks(path);
  try{const stat=await lstat(path);if(!stat.isFile())fault('P2_SNAPSHOT_FORBIDDEN_PATH');return await readFile(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function sealed(value){return {...value,checksum:sha(JSON.stringify(value))};}
function unseal(value){const {checksum,...body}=value;if(checksum!==sha(JSON.stringify(body)))fault('P2_SNAPSHOT_CORRUPT');return body;}
const adoptionCoverage='governed-adoption-origin';
const validHead=head=>object(head)&&Number.isSafeInteger(head.seq)&&head.seq>0&&/^[a-f0-9]{64}$/.test(head.hash??'');
function adoptionCheckpoint(cp,ready=false){
  const a=cp?.adoption;
  return cp?.coverage===adoptionCoverage&&cp.historyCoverage==='unknown-before-adoption'&&typeof cp.epoch==='string'&&cp.epoch===a?.origin?.epoch&&a?.status==='adopted'&&Number.isFinite(Date.parse(a.adoptedAt))&&validHead(a.commit?.head)&&validHead(cp.head)&&cp.head.seq>=a.commit.head.seq&&a.firstBaseline?.id===cp.epoch&&a.firstBaseline.directory===a.commit.firstBaseline?.directory&&isAbsolute(a.firstBaseline.directory??'')&&['planned','ready'].includes(a.firstBaseline.status)&&(!ready||a.firstBaseline.status==='ready'&&validHead(a.firstBaseline.readyHead)&&/^[a-f0-9]{64}$/.test(a.firstBaseline.checksum??'')&&cp.head.seq>=a.firstBaseline.readyHead.seq);
}
const baselineProof=b=>{const c=b?.deletionCheckpoint;return {planHash:b?.planHash,businessSeq:b?.businessSeq,identity:c?.identity,coverage:c?.coverage,historyCoverage:c?.historyCoverage,epoch:c?.epoch,businessSeqCheckpoint:c?.businessSeq,deletionSeq:c?.deletionSeq,dataFingerprints:c?.dataFingerprints,origin:c?.adoption?.origin,commit:c?.adoption?.commit};};
async function directoryIdentity(path){const s=await lstat(path,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||s.ino===0n)fault('P2_SNAPSHOT_FORBIDDEN_PATH');return `${s.dev}:${s.ino}`;}
async function resumeFirstAdoptionSnapshot({directory,files,baseline}){
  const cp=baseline.deletionCheckpoint;if(!adoptionCheckpoint(cp)||directory!==cp.adoption.firstBaseline.directory)fault('P2_ADOPTION_BASELINE_REQUIRED');
  const entries=[];for(const [i,file]of files.entries()){const bytes=await bytesOrMissing(file.path);entries.push({id:file.id,path:resolve(file.path),role:file.role,exists:bytes!==null,sha256:bytes===null?null:sha(bytes),payload:bytes===null?null:`files/${i}.bin`});}
  if(entries.filter(f=>f.role==='domain').some(f=>!f.exists||cp.adoption.commit.dataFingerprints[basename(f.path,'.json')]!==f.sha256))fault('P2_SNAPSHOT_SOURCE_CHANGED');
  await mkdir(dirname(directory),{recursive:true});try{await mkdir(directory);}catch(e){if(e.code!=='EEXIST')throw e;}
  const identity=await directoryIdentity(directory),intentPath=join(directory,'capture-intent.json');let intent;
  const members=await readdir(directory,{withFileTypes:true});if(members.some(e=>e.isSymbolicLink()||!['capture-intent.json','files','manifest.json'].includes(e.name)))fault('P2_SNAPSHOT_CORRUPT');
  try{intent=unseal(JSON.parse(await bytesOrMissing(intentPath)));}catch(error){
    if(error.code==='P2_SNAPSHOT_CORRUPT'||members.length)fault('P2_SNAPSHOT_CORRUPT');
    intent={version:1,directory,identity,createdAt:new Date().toISOString(),baseline:structuredClone(baseline),files:entries};await durableNew(intentPath,JSON.stringify(sealed(intent),null,2));
  }
  if(intent.version!==1||intent.directory!==directory||intent.identity!==identity||!isDeepStrictEqual(baselineProof(intent.baseline),baselineProof(baseline))||!isDeepStrictEqual(intent.files,entries))fault('P2_SNAPSHOT_CORRUPT');
  const payloadRoot=join(directory,'files');await noLinks(payloadRoot);try{await mkdir(payloadRoot);}catch(e){if(e.code!=='EEXIST')throw e;}
  const allowed=new Set(entries.filter(f=>f.exists).map(f=>basename(f.payload)));for(const file of await readdir(payloadRoot,{withFileTypes:true}))if(!file.isFile()||file.isSymbolicLink()||!allowed.has(file.name))fault('P2_SNAPSHOT_CORRUPT');
  const priorManifest=await bytesOrMissing(join(directory,'manifest.json'));if(priorManifest!==null){const manifest=await verifySnapshot(directory);if(!isDeepStrictEqual(manifest.baseline,intent.baseline)||!isDeepStrictEqual(manifest.files,intent.files)||manifest.createdAt!==intent.createdAt)fault('P2_SNAPSHOT_CORRUPT');return manifest;}
  for(const file of entries)if(file.exists){const path=join(directory,file.payload),bytes=await bytesOrMissing(path);if(bytes===null){const source=await bytesOrMissing(file.path);if(source===null||sha(source)!==file.sha256)fault('P2_SNAPSHOT_SOURCE_CHANGED');await durableNew(path,source);}else if(sha(bytes)!==file.sha256||(await lstat(path)).nlink!==1)fault('P2_SNAPSHOT_CORRUPT');}
  for(const file of entries){const source=await bytesOrMissing(file.path);if((source!==null)!==file.exists||source!==null&&sha(source)!==file.sha256)fault('P2_SNAPSHOT_SOURCE_CHANGED');}
  const manifest=sealed({version:1,complete:true,createdAt:intent.createdAt,baseline:intent.baseline,files:entries});await durableNew(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}

/** Caller must hold the storage-wide maintenance lock and have quiesced every writer. */
export async function captureSnapshot({directory,files,baseline,excludedPaths=[],resume=false}){
  directory=await managedDirectory(directory);fileShape(files,excludedPaths);
  if(!object(baseline))fault('P2_SNAPSHOT_INCOMPLETE');
  if(baseline.deletionCheckpoint?.coverage===adoptionCoverage&&!adoptionCheckpoint(baseline.deletionCheckpoint))fault('P2_ADOPTION_BASELINE_REQUIRED');
  for(const file of files){await noLinks(file.path);if(inside(directory,file.path))fault('P2_SNAPSHOT_FORBIDDEN_PATH');}
  if(resume)return resumeFirstAdoptionSnapshot({directory,files,baseline});
  await mkdir(dirname(directory),{recursive:true});await mkdir(directory);await mkdir(join(directory,'files'));
  const entries=[];
  for(const [i,file] of files.entries()){
    const bytes=await bytesOrMissing(file.path);const entry={id:file.id,path:resolve(file.path),role:file.role,exists:bytes!==null,sha256:bytes===null?null:sha(bytes),payload:bytes===null?null:`files/${i}.bin`};
    if(bytes!==null)await durableNew(join(directory,entry.payload),bytes);entries.push(entry);
  }
  // Detect writes during copying; the coordinator supplies the stronger shared-writer proof.
  for(const entry of entries){const bytes=await bytesOrMissing(entry.path);if((bytes!==null)!==entry.exists||(bytes!==null&&sha(bytes)!==entry.sha256))fault('P2_SNAPSHOT_SOURCE_CHANGED');}
  const manifest=sealed({version:1,complete:true,createdAt:new Date().toISOString(),baseline:structuredClone(baseline),files:entries});
  await durableNew(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}

export async function verifySnapshot(directory){
  directory=await managedDirectory(directory);
  try{
    try{await lstat(join(directory,'cleanup-pending.json'));fault('P2_SNAPSHOT_CORRUPT','Deletion cleanup has not completed');}catch(error){if(error.code!=='ENOENT')throw error;}
    await noLinks(join(directory,'manifest.json'));const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));unseal(manifest);
    const captureIntent=await bytesOrMissing(join(directory,'capture-intent.json'));if(captureIntent!==null){const intent=unseal(JSON.parse(captureIntent));if(intent.directory!==directory||intent.identity!==await directoryIdentity(directory)||!isDeepStrictEqual(baselineProof(intent.baseline),baselineProof(manifest.baseline)))fault('P2_SNAPSHOT_CORRUPT');}
    if(manifest.version!==1||manifest.complete!==true||!object(manifest.baseline))fault('P2_SNAPSHOT_CORRUPT');fileShape(manifest.files);
    for(const [i,file] of manifest.files.entries()){
      if(typeof file.exists!=='boolean'||(!file.exists&&(file.payload!==null||file.sha256!==null)))fault('P2_SNAPSHOT_CORRUPT');
      if(file.exists){if(file.payload!==`files/${i}.bin`||!/^[a-f0-9]{64}$/.test(file.sha256))fault('P2_SNAPSHOT_CORRUPT');const bytes=await bytesOrMissing(join(directory,file.payload));if(bytes===null||sha(bytes)!==file.sha256)fault('P2_SNAPSHOT_CORRUPT');}
    }return manifest;
  }catch(error){if(error.code==='P2_SNAPSHOT_FORBIDDEN_PATH')throw error;fault('P2_SNAPSHOT_CORRUPT',`Snapshot is not a verified complete generation: ${error.message}`);}
}

/** The controller owns rule approval; arbitrary booleans or schema numbers are not rules. */
export function assertCompatibility({from,to,rule}={}){
  if(typeof from!=='string'||!from||typeof to!=='string'||!to||!object(rule)||rule.from!==from||rule.to!==to||typeof rule.id!=='string'||!rule.id||!Array.isArray(rule.approvedSemanticChecks)||!rule.approvedSemanticChecks.length||rule.approvedSemanticChecks.some(value=>typeof value!=='string'||!value.trim()))fault('P2_COMPATIBILITY_REQUIRED');
  return structuredClone(rule);
}

function shape(value,keys){if(!object(value)||Object.keys(value).some(key=>!keys.includes(key)))fault('P2_UNKNOWN_DATA_SHAPE');}
function mapShape(value){if(!object(value))fault('P2_UNKNOWN_DATA_SHAPE');}
function arrayShape(value){if(!Array.isArray(value))fault('P2_UNKNOWN_DATA_SHAPE');}
const recordKeys=['id','owner','scope','layer','category','text','status','revision','createdAt','updatedAt','lastUsedAt','source','automatic','semanticKey','pinned','dependsOn','dueAt','taskState','closedAt','historyRefs','conflictsWith'];
const metaKeys=['archiveId','owner','recordId','revision','layer','originalLayer','category','archivedAt','reason','validity','keyHash','textHash','sourceType','path','sha256','historyProvenance'];
function validateProject(project){
  shape(project,['root','index','memories','events','workflow','automation']);arrayShape(project.memories);mapShape(project.events);
  for(const memory of project.memories){shape(memory,['id','createdAt','revision','text','status','updatedAt','source','automatic','history']);arrayShape(memory.history);for(const revision of memory.history)shape(revision,['revision','text','status','updatedAt','source','automatic']);}
  if(project.index!==null&&project.index!==undefined){shape(project.index,['generation','parserVersion','indexedAt','sources']);arrayShape(project.index.sources);for(const source of project.index.sources){shape(source,['path','sha256','parts','warnings']);arrayShape(source.parts);for(const part of source.parts)shape(part,['id','text','locator']);}}
}
function validateDomains(domains){
  if(!Array.isArray(domains)||domains.length!==3)fault('P2_UNKNOWN_DATA_SHAPE');
  const map=new Map();
  for(const data of domains){shape(data,['unit','global','tables']);shape(data.unit,['name','version']);if(!DOMAINS.includes(data.unit.name)||data.unit.version!==1||map.has(data.unit.name)||data.global!==null&&data.global!==undefined)fault('P2_UNKNOWN_DATA_SHAPE');map.set(data.unit.name,data);mapShape(data.tables);}
  const legacy=map.get(DOMAINS[0]),active=map.get(DOMAINS[1]),cold=map.get(DOMAINS[2]);
  shape(legacy.tables,['projects','media']);shape(active.tables,['active']);shape(cold.tables,['archives','backups']);
  for(const [data,tables] of [[legacy,['projects','media']],[active,['active']],[cold,['archives','backups']]])for(const table of tables){if(data.tables[table]===undefined)data.tables[table]={};mapShape(data.tables[table]);}
  for(const project of Object.values(legacy.tables.projects))validateProject(project);
  for(const media of Object.values(legacy.tables.media))shape(media,['projectKey','createdAt','value']);
  for(const key of Object.keys(active.tables.active))if(key!=='catalog')fault('P2_UNKNOWN_DATA_SHAPE');
  const catalog=active.tables.active.catalog??={version:1,owners:{},archives:{},migrations:{},audits:[]};
  shape(catalog,['version','owners','archives','migrations','audits']);if(catalog.version!==1)fault('P2_UNKNOWN_DATA_SHAPE');mapShape(catalog.owners);mapShape(catalog.archives);mapShape(catalog.migrations);arrayShape(catalog.audits);
  for(const owner of Object.values(catalog.owners)){shape(owner,['records','markers','events','lastMaintenanceAt']);arrayShape(owner.records);arrayShape(owner.markers);mapShape(owner.events);for(const record of owner.records){shape(record,recordKeys);arrayShape(record.historyRefs);}}
  for(const meta of Object.values(catalog.archives))shape(meta,metaKeys);
  for(const payload of Object.values(cold.tables.archives)){shape(payload,[...metaKeys,'record','document']);if(payload.record)shape(payload.record,recordKeys);if(payload.document){shape(payload.document,['path','sha256','parts','warnings']);arrayShape(payload.document.parts);}}
  for(const backup of Object.values(cold.tables.backups)){shape(backup,['projectKey','createdAt','sourceSha256','snapshot','purgedIds']);validateProject(backup.snapshot);}
  return {legacy,catalog,cold};
}
function validateDeletion(entry){
  validateDocumentMarker(entry);
  if(entry.historyProvenance!==undefined&&!provenanceShape(entry.historyProvenance))fault('P2_DELETION_AUTHORITY_REQUIRED');
  if(!object(entry)||typeof entry.id!=='string'||!entry.id||typeof entry.owner!=='string'||!entry.owner||!['withdrawn','purged'].includes(entry.status)||typeof entry.operationId!=='string'||!entry.operationId||!Number.isSafeInteger(entry.deletionSeq)||entry.deletionSeq<1)fault('P2_DELETION_AUTHORITY_REQUIRED');
  if(entry.sourceRefs!==undefined){arrayShape(entry.sourceRefs);for(const source of entry.sourceRefs)if(!object(source)||typeof source.path!=='string'||typeof source.sha256!=='string')fault('P2_DELETION_AUTHORITY_REQUIRED');}
  if(entry.archiveIds!==undefined&&(!Array.isArray(entry.archiveIds)||entry.archiveIds.some(id=>typeof id!=='string')))fault('P2_DELETION_AUTHORITY_REQUIRED');
}
function deletionAuthority(baseline,deletions){
  const current=deletions?.checkpoint,prior=baseline?.deletionCheckpoint;
  if(deletions?.verified!==true||!object(current)||!object(prior)||!['governed-empty-origin',adoptionCoverage].includes(current.coverage)||prior.coverage!==current.coverage||!current.identity||current.identity!==prior.identity||!Number.isSafeInteger(current.deletionSeq)||current.deletionSeq<0||!Number.isSafeInteger(prior.deletionSeq)||current.deletionSeq<prior.deletionSeq||!object(current.head)||!object(prior.head)||!Number.isSafeInteger(current.head.seq)||current.head.seq<prior.head.seq||typeof current.head.hash!=='string'||!Array.isArray(current.deletions)||current.deletions.length!==current.deletionSeq)fault('P2_DELETION_AUTHORITY_REQUIRED');
  if(current.coverage===adoptionCoverage){
    if(!adoptionCheckpoint(current,true)||!adoptionCheckpoint(prior)||current.epoch!==prior.epoch||!isDeepStrictEqual(current.adoption.origin,prior.adoption.origin)||!isDeepStrictEqual(current.adoption.commit,prior.adoption.commit)||prior.deletionSeq<prior.adoption.commit.deletionSeq||!Array.isArray(current.events)||!current.events.some(e=>e.seq===prior.head.seq&&e.hash===prior.head.hash)||!current.events.some(e=>e.type==='adopted'&&e.seq===current.adoption.commit.head.seq&&e.hash===current.adoption.commit.head.hash))fault('P2_DELETION_AUTHORITY_REQUIRED');
    if(prior.adoption.firstBaseline.status==='ready'&&(!isDeepStrictEqual(current.adoption.firstBaseline,prior.adoption.firstBaseline)||prior.head.seq<current.adoption.firstBaseline.readyHead.seq))fault('P2_DELETION_AUTHORITY_REQUIRED');
  }
  current.deletions.forEach((entry,i)=>{validateDeletion(entry);if(entry.deletionSeq!==i+1)fault('P2_DELETION_AUTHORITY_REQUIRED');});
  if(current.head.seq===prior.head.seq&&current.head.hash!==prior.head.hash)fault('P2_DELETION_AUTHORITY_REQUIRED');
  return structuredClone(current);
}
const normalized=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();

/** Pure transformation. Its caller must verify the external journal and latest high-water mark. */
export function applyDeletionGovernance(input,entries){
  const domains=structuredClone(input),{legacy,catalog,cold}=validateDomains(domains);
  for(const entry of entries){
    validateDeletion(entry);const purged=entry.status==='purged';
    const sourceMatch=(source,owner)=>entry.documentPath!==undefined?documentMatches(entry,owner,source.path):entry.owner===owner&&(entry.sourceRefs??[]).some(ref=>source.path===ref.path&&source.sha256===ref.sha256);
    const recordMatch=(record,owner)=>entry.documentPath===undefined&&(record.id===entry.id||owner===entry.owner&&(entry.keyHash&&record.semanticKey&&sha(normalized(record.semanticKey))===entry.keyHash||entry.textHash&&record.text&&sha(normalized(record.text))===entry.textHash));
    const archiveMatch=meta=>entry.documentPath!==undefined?meta.sourceType==='document'&&sourceMatch(meta,meta.owner):meta.recordId===entry.id||(entry.archiveIds??[]).includes(meta.archiveId)||meta.owner===entry.owner&&(entry.keyHash&&meta.keyHash===entry.keyHash||sourceMatch(meta,meta.owner));
    const affectedIds=new Set();
    for(const [ownerKey,owner] of Object.entries(catalog.owners)){
      for(const record of owner.records.filter(record=>recordMatch(record,ownerKey))){
        if(!purged){
          const id=`p2-withdraw-${sha(`${record.owner}:${record.id}:${record.revision}`)}`;
          const meta={archiveId:id,owner:record.owner,recordId:record.id,revision:record.revision,layer:'L4',originalLayer:record.layer,category:record.category,archivedAt:entry.at,reason:'withdrawn',validity:'withdrawn',keyHash:sha(normalized(record.semanticKey)),textHash:sha(normalized(record.text)),sourceType:'memory',...record.source?.historyProvenance?{historyProvenance:structuredClone(record.source.historyProvenance)}:{}};
          catalog.archives[id]??=meta;cold.tables.archives[id]??={...meta,record:structuredClone(record)};
        }
      }
      owner.records=owner.records.filter(record=>!recordMatch(record,ownerKey));
    }
    const owner=catalog.owners[entry.owner]??={records:[],markers:[],events:{}};
    const existing=owner.markers.find(marker=>marker.id===entry.id&&marker.status===entry.status);
    if(!existing){const marker={id:entry.id,status:entry.status,at:entry.at};for(const field of ['keyHash','textHash','historyProvenance'])if(entry[field]!==undefined)marker[field]=entry[field];owner.markers.push(marker);}
    else if(entry.historyProvenance)existing.historyProvenance=mergeProvenance(existing.historyProvenance,entry.historyProvenance);
    for(const meta of Object.values(catalog.archives))if(archiveMatch(meta)){meta.validity='withdrawn';affectedIds.add(meta.archiveId);}
    for(const [id,payload] of Object.entries(cold.tables.archives))if(archiveMatch(payload)||payload.record&&recordMatch(payload.record,payload.owner)){
      affectedIds.add(id);if(purged)delete cold.tables.archives[id];else payload.validity='withdrawn';
    }
    function cleanProject(project,projectKey){
      const key=`project:${projectKey}`;
      if(purged)project.memories=project.memories.filter(record=>!recordMatch(record,key));
      else for(const record of project.memories)if(recordMatch(record,key)){record.status='revoked';for(const history of record.history)history.status='revoked';}
      if(project.index)project.index.sources=project.index.sources.filter(source=>!sourceMatch(source,key));
    }
    for(const [key,project] of Object.entries(legacy.tables.projects))cleanProject(project,key);
    for(const backup of Object.values(cold.tables.backups)){
      const had=backup.snapshot.memories.some(record=>recordMatch(record,`project:${backup.projectKey}`));cleanProject(backup.snapshot,backup.projectKey);
      if(purged&&had)backup.purgedIds=[...new Set([...(backup.purgedIds??[]),entry.id])];
    }
    // Extraction caches have opaque payloads; invalidating this disposable cache
    // avoids returning stale governed material without guessing its internal shape.
    for(const [key,media] of Object.entries(legacy.tables.media))if(entry.owner===`project:${media.projectKey}`||entry.owner.startsWith('user:'))delete legacy.tables.media[key];
    if(purged){for(const o of Object.values(catalog.owners))for(const record of o.records)record.historyRefs=record.historyRefs.filter(id=>!affectedIds.has(id));}
  }
  return domains;
}

/** Only prepares sealed copies. Publication and final checkpoint recheck belong to the locked controller. */
export async function inspectRestore({snapshotDirectory,deletions,compatibility,excludedPaths=[]}){
  const manifest=await verifySnapshot(snapshotDirectory);assertCompatibility(compatibility);const checkpoint=deletionAuthority(manifest.baseline,deletions);
  if(checkpoint.coverage===adoptionCoverage){
    const first=checkpoint.adoption.firstBaseline,prior=manifest.baseline.deletionCheckpoint;
    if(prior.adoption.firstBaseline.status==='planned'){
      if(resolve(snapshotDirectory)!==first.directory||(manifest.adoptionBaselineChecksum??manifest.checksum)!==first.checksum)fault('P2_DELETION_AUTHORITY_REQUIRED');
      if(manifest.adoptionBaselineChecksum&&(!manifest.cleanupCheckpoint||manifest.cleanupCheckpoint.identity!==checkpoint.identity||manifest.cleanupCheckpoint.deletionSeq>checkpoint.deletionSeq||!checkpoint.events.some(e=>e.seq===manifest.cleanupCheckpoint.head?.seq&&e.hash===manifest.cleanupCheckpoint.head?.hash)))fault('P2_DELETION_AUTHORITY_REQUIRED');
    }else if(prior.head.seq<first.readyHead.seq)fault('P2_DELETION_AUTHORITY_REQUIRED');
  }
  fileShape(manifest.files,excludedPaths);
  const domainFiles=manifest.files.filter(file=>file.role==='domain');
  const input=await Promise.all(domainFiles.map(async file=>file.exists?JSON.parse(await readFile(join(snapshotDirectory,file.payload),'utf8')):{unit:{name:basename(file.path,'.json'),version:1},global:null,tables:{}}));
  const governed=applyDeletionGovernance(input,checkpoint.deletions);
  const files=[],payloads=[];
  for(const [i,file] of manifest.files.entries()){
    let bytes=file.exists?await readFile(join(snapshotDirectory,file.payload)):null;
    if(file.role==='domain'&&checkpoint.deletions.length){
      const domainIndex=domainFiles.indexOf(file);
      if(!isDeepStrictEqual(input[domainIndex],governed[domainIndex]))bytes=Buffer.from(`${JSON.stringify(governed[domainIndex],null,2)}\n`);
    }
    payloads.push(bytes);
    files.push({...file,exists:bytes!==null,sha256:bytes===null?null:sha(bytes)});
  }
  return {manifest,files,payloads,deletionCheckpoint:checkpoint,compatibilityRule:assertCompatibility(compatibility)};
}

/** Register any new managed copy before calling this lower-level staging helper. */
export async function prepareRestore({snapshotDirectory,outputDirectory,...options}){
  const inspected=await inspectRestore({snapshotDirectory,...options});
  outputDirectory=await managedDirectory(outputDirectory);
  if(inside(snapshotDirectory,outputDirectory)||inside(outputDirectory,snapshotDirectory)||inspected.manifest.files.some(file=>inside(outputDirectory,file.path)))fault('P2_SNAPSHOT_FORBIDDEN_PATH');
  await mkdir(dirname(outputDirectory),{recursive:true});await mkdir(outputDirectory);
  const files=[];
  for(const [i,file] of inspected.files.entries()){
    const bytes=inspected.payloads[i],stagedPath=bytes===null?null:join(outputDirectory,`${i}.bin`);
    if(bytes!==null)await durableNew(stagedPath,bytes);files.push({...file,stagedPath});
  }
  const result={manifest:inspected.manifest,files,deletionCheckpoint:inspected.deletionCheckpoint,compatibilityRule:inspected.compatibilityRule};
  await durableNew(join(outputDirectory,'restore-manifest.json'),JSON.stringify(sealed(result),null,2));return result;
}

async function atomicReplace(path,bytes){
  await noLinks(path);const temporary=join(dirname(path),`.p2-${randomUUID()}.tmp`);
  try{await durableNew(temporary,bytes);await rename(temporary,path);if(process.platform!=='win32'){const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}}}
  catch(error){await rm(temporary,{force:true});throw error;}
}

/** Only committed generations count; pinned recovery dependencies can keep more than three. */
export async function rotateBackups({directory,generations,retain=3,pinned=[]}){
  directory=await managedDirectory(directory);
  if(retain!==3||!Array.isArray(generations)||!Array.isArray(pinned))fault('P2_BACKUP_ROTATION_INVALID');
  const ids=new Set(),paths=new Set();
  for(const generation of generations){
    if(!object(generation)||typeof generation.id!=='string'||ids.has(generation.id)||!isAbsolute(generation.directory)||dirname(resolve(generation.directory))!==directory||paths.has(resolve(generation.directory)))fault('P2_BACKUP_ROTATION_INVALID');
    await noLinks(generation.directory);ids.add(generation.id);paths.add(resolve(generation.directory));
    if(generation.status==='committed'&&!Number.isFinite(Date.parse(generation.committedAt)))fault('P2_BACKUP_ROTATION_INVALID');
  }
  if(pinned.some(id=>!ids.has(id)))fault('P2_BACKUP_ROTATION_INVALID');
  const success=generations.filter(generation=>generation.status==='committed').sort((a,b)=>Date.parse(b.committedAt)-Date.parse(a.committedAt));
  const kept=new Set([...success.slice(0,retain).map(generation=>generation.id),...pinned]);
  // Verify every retained successful/pinned recovery generation before deleting any old one.
  for(const generation of generations.filter(generation=>kept.has(generation.id)))await verifySnapshot(generation.directory);
  const removed=[];
  for(const generation of success.filter(generation=>!kept.has(generation.id))){
    const path=await managedDirectory(generation.directory);if(dirname(path)!==directory)fault('P2_BACKUP_ROTATION_INVALID');
    await rm(path,{recursive:true,force:false});removed.push(generation.id);
  }
  return {removed,retained:generations.filter(generation=>!removed.includes(generation.id)).map(generation=>generation.id)};
}

async function resumeCleanup(directory,journal){
  unseal(journal);const next=journal.nextManifest;unseal(next);fileShape(next.files);
  if(journal.version!==1||!Array.isArray(journal.writes)||!object(journal.beforeHashes))fault('P2_SNAPSHOT_CORRUPT');
  for(const write of journal.writes){
    const index=next.files.findIndex(file=>file.payload===write.payload),file=next.files[index];
    if(index<0||write.staged!==`cleanup/${index}.bin`||typeof journal.beforeHashes[write.payload]!=='string')fault('P2_SNAPSHOT_CORRUPT');
    const current=await bytesOrMissing(join(directory,write.payload));const currentHash=current===null?null:sha(current);
    if(currentHash!==file.sha256&&currentHash!==journal.beforeHashes[write.payload])fault('P2_SNAPSHOT_CORRUPT');
    if(currentHash!==file.sha256){const staged=await bytesOrMissing(join(directory,write.staged));if(staged===null||sha(staged)!==file.sha256)fault('P2_SNAPSHOT_CORRUPT');await atomicReplace(join(directory,write.payload),staged);}
  }
  // All managed files, including untouched configuration/package records, must
  // still match before publishing the replacement integrity manifest.
  for(const file of next.files)if(file.exists){const bytes=await bytesOrMissing(join(directory,file.payload));if(bytes===null||sha(bytes)!==file.sha256)fault('P2_SNAPSHOT_CORRUPT');}
  await atomicReplace(join(directory,'manifest.json'),JSON.stringify(next,null,2));
  const cleanup=await managedDirectory(join(directory,'cleanup'));if(dirname(cleanup)!==resolve(directory))fault('P2_SNAPSHOT_FORBIDDEN_PATH');
  await rm(cleanup,{recursive:true,force:true});await rm(join(directory,'cleanup-pending.json'));
}

async function cleanGeneration(directory,checkpoint){
  const journalPath=join(directory,'cleanup-pending.json');
  try{await noLinks(journalPath);const journal=JSON.parse(await readFile(journalPath,'utf8'));
    deletionAuthority({deletionCheckpoint:journal.nextManifest?.baseline?.deletionCheckpoint},{verified:true,checkpoint});
    if(journal.nextManifest?.cleanupCheckpoint?.deletionSeq>checkpoint.deletionSeq)fault('P2_DELETION_AUTHORITY_REQUIRED');
    await resumeCleanup(directory,journal);
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const manifest=await verifySnapshot(directory);deletionAuthority(manifest.baseline,{verified:true,checkpoint});
  const domainFiles=manifest.files.filter(file=>file.role==='domain');
  const data=await Promise.all(domainFiles.map(async file=>file.exists?JSON.parse(await readFile(join(directory,file.payload),'utf8')):{unit:{name:basename(file.path,'.json'),version:1},global:null,tables:{}}));
  const governed=applyDeletionGovernance(data,checkpoint.deletions),next=structuredClone(manifest),writes=[],beforeHashes={};
  // A missing domain cannot contain a body to erase and stays absent. Restore
  // creates current markers from the independent journal if subsequently needed.
  for(const [i,file] of next.files.entries())if(file.role==='domain'&&file.exists){
    const bytes=Buffer.from(`${JSON.stringify(governed[domainFiles.findIndex(prior=>prior.id===file.id)],null,2)}\n`);const hash=sha(bytes);
    if(hash!==file.sha256){writes.push({payload:file.payload,staged:`cleanup/${i}.bin`,bytes});beforeHashes[file.payload]=file.sha256;file.sha256=hash;}
  }
  if(!writes.length)return;
  if(checkpoint.coverage===adoptionCoverage&&manifest.baseline.deletionCheckpoint.adoption.firstBaseline.status==='planned')next.adoptionBaselineChecksum??=manifest.checksum;
  next.cleanupCheckpoint={identity:checkpoint.identity,deletionSeq:checkpoint.deletionSeq,head:checkpoint.head};delete next.checksum;
  const nextManifest=sealed(next);const cleanup=join(directory,'cleanup');
  await noLinks(cleanup);try{await mkdir(cleanup);}catch(error){if(error.code!=='EEXIST')throw error;}
  const expected=new Map(writes.map(write=>[basename(write.staged),write]));
  for(const entry of await readdir(cleanup,{withFileTypes:true})){
    const write=expected.get(entry.name);if(!write||!entry.isFile()||entry.isSymbolicLink()||sha(await bytesOrMissing(join(cleanup,entry.name)))!==sha(write.bytes))fault('P2_SNAPSHOT_CORRUPT','Unverifiable interrupted cleanup staging');
  }
  for(const write of writes){const path=join(directory,write.staged);if(await bytesOrMissing(path)===null)await durableNew(path,write.bytes);}
  const journal=sealed({version:1,beforeHashes,nextManifest,writes:writes.map(({payload,staged})=>({payload,staged}))});
  await durableNew(journalPath,JSON.stringify(journal,null,2));await resumeCleanup(directory,journal);
  await verifySnapshot(directory);
}

/** Caller holds the same deletion/restore lock and supplies a freshly verified external checkpoint. */
export async function purgeOwnedBackups({directory,checkpoint}){
  directory=await managedDirectory(directory);
  deletionAuthority({deletionCheckpoint:checkpoint},{verified:true,checkpoint});
  let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return {complete:true,results:[]};throw error;}
  const results=[];
  for(const entry of entries){
    const path=join(directory,entry.name);
    if(!entry.isDirectory()||entry.isSymbolicLink()){results.push({directory:path,status:'incomplete',code:'P2_SNAPSHOT_FORBIDDEN_PATH'});continue;}
    try{await noLinks(path);if(dirname(resolve(path))!==directory)fault('P2_SNAPSHOT_FORBIDDEN_PATH');await cleanGeneration(path,checkpoint);results.push({directory:path,status:'cleaned'});}
    catch(error){results.push({directory:path,status:'incomplete',code:error.code??'P2_BACKUP_CLEANUP_FAILED'});}
  }
  return {complete:results.every(result=>result.status==='cleaned'),results};
}

async function stageEntries(directory){
  await noLinks(directory);
  try{return await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
}

async function invalidateUpdate(directory,checkpoint){
  const path=join(directory,'invalidated.json'),bytes=await bytesOrMissing(path);
  if(bytes!==null){
    const prior=unseal(JSON.parse(bytes));
    if(prior.version!==1||prior.identity!==checkpoint.identity||!Number.isSafeInteger(prior.deletionSeq)||prior.deletionSeq>checkpoint.deletionSeq||!object(prior.head)||prior.head.seq>checkpoint.head.seq)fault('P2_STAGING_CORRUPT');
    if(prior.head.seq===checkpoint.head.seq&&prior.head.hash!==checkpoint.head.hash)fault('P2_STAGING_CORRUPT');
  }
  // Publication precedes any body deletion, including when a plan is corrupt.
  const marker=sealed({version:1,identity:checkpoint.identity,deletionSeq:checkpoint.deletionSeq,head:checkpoint.head,reason:'permanent-deletion',at:new Date().toISOString()});
  if(bytes===null)await durableNew(path,JSON.stringify(marker,null,2));else await atomicReplace(path,JSON.stringify(marker,null,2));
  const verified=unseal(JSON.parse(await readFile(path,'utf8')));
  if(verified.identity!==checkpoint.identity||verified.deletionSeq!==checkpoint.deletionSeq||!isDeepStrictEqual(verified.head,checkpoint.head))fault('P2_STAGING_CORRUPT');
}

async function cleanUpdateStaging(directory,checkpoint){
  await invalidateUpdate(directory,checkpoint);
  const planPath=join(directory,'plan.json');await noLinks(planPath);
  const plan=JSON.parse(await readFile(planPath,'utf8')), {hash,...body}=plan;
  if(!/^[a-f0-9]{64}$/.test(hash??'')||hash!==sha(JSON.stringify(body))||plan.version!==1||plan.id!==basename(directory)||plan.directory!==directory||plan.planPath!==planPath||!isAbsolute(plan.storageRoot??'')||plan.baseline?.identity!==checkpoint.identity||!Number.isSafeInteger(plan.baseline?.deletionSeq)||plan.baseline.deletionSeq>checkpoint.deletionSeq)fault('P2_STAGING_CORRUPT');
  fileShape(plan.files);
  const payloads=new Set(),knownInputs=new Set();
  for(const [i,file] of plan.files.entries()){
    if(typeof file.exists!=='boolean'||file.stagedPath!==join(directory,`input-${i}.bin`))fault('P2_STAGING_CORRUPT');
    knownInputs.add(basename(file.stagedPath));
    if(file.role==='domain'){
      if(dirname(file.path)!==plan.storageRoot)fault('P2_STAGING_CORRUPT');
      payloads.add(file.stagedPath);
      payloads.add(join(directory,'validation','storage',basename(file.path)));
    }
  }
  const domainNames=new Set(plan.files.filter(file=>file.role==='domain').map(file=>basename(file.path)));
  for(const entry of await stageEntries(join(directory,'validation','storage'))){
    if(!domainNames.has(entry.name)||!entry.isFile()||entry.isSymbolicLink())fault('P2_STAGING_CORRUPT');
  }
  for(const entry of await stageEntries(directory)){
    if(entry.isSymbolicLink())fault('P2_SNAPSHOT_FORBIDDEN_PATH');
    if(entry.name.startsWith('restore-')){
      if(!entry.isDirectory())fault('P2_STAGING_CORRUPT');
      const restoreDirectory=join(directory,entry.name),manifestPath=join(restoreDirectory,'restore-manifest.json');await noLinks(manifestPath);
      const restored=unseal(JSON.parse(await readFile(manifestPath,'utf8')));fileShape(restored.files);unseal(restored.manifest);fileShape(restored.manifest.files);
      deletionAuthority({deletionCheckpoint:restored.deletionCheckpoint},{verified:true,checkpoint});
      const known=new Set(['restore-manifest.json']);
      for(const [i,file] of restored.files.entries()){
        if(typeof file.exists!=='boolean'||file.stagedPath!==(file.exists?join(restoreDirectory,`${i}.bin`):null))fault('P2_STAGING_CORRUPT');
        if(file.exists)known.add(`${i}.bin`);
        if(file.role==='domain'){
          if(!plan.files.some(prior=>prior.role==='domain'&&prior.path===file.path&&prior.id===file.id))fault('P2_STAGING_CORRUPT');
          if(file.exists)payloads.add(file.stagedPath);
        }
      }
      for(const file of await stageEntries(restoreDirectory))if(!known.has(file.name)||!file.isFile()||file.isSymbolicLink())fault('P2_STAGING_CORRUPT');
    }else if(knownInputs.has(entry.name)||['plan.json','invalidated.json'].includes(entry.name)){
      if(!entry.isFile())fault('P2_STAGING_CORRUPT');
    }else if(['validation','logs'].includes(entry.name)){
      if(!entry.isDirectory())fault('P2_STAGING_CORRUPT');
    }else fault('P2_STAGING_CORRUPT','Unrecorded update staging must be reconciled before deletion completion');
  }
  // Validate every selected path before removal. A missing payload is a safe,
  // idempotent retry; links or undeclared copies never authorize deletion.
  for(const path of payloads){if(!inside(directory,path)||path===directory)fault('P2_SNAPSHOT_FORBIDDEN_PATH');await bytesOrMissing(path);}
  for(const path of payloads){await noLinks(path);await rm(path,{force:true});}
  for(const path of payloads)if(await bytesOrMissing(path)!==null)fault('P2_STAGING_CORRUPT');
}

/** Same storage-wide lock and verified deletion authority as backup cleanup.
 * Prepared plans are conservatively invalidated; their recorded domain copies
 * are discarded rather than silently changing the user's approved plan. */
export async function purgeOwnedUpdateStaging({directory,checkpoint}){
  directory=await managedDirectory(directory);
  deletionAuthority({deletionCheckpoint:checkpoint},{verified:true,checkpoint});
  if(!checkpoint.deletions.some(entry=>entry.status==='purged'))return {complete:true,results:[]};
  const results=[];
  for(const entry of await stageEntries(directory)){
    const path=join(directory,entry.name);
    try{
      if(!entry.isDirectory()||entry.isSymbolicLink()||dirname(resolve(path))!==directory)fault('P2_SNAPSHOT_FORBIDDEN_PATH');
      await noLinks(path);await cleanUpdateStaging(path,checkpoint);results.push({directory:path,status:'cleaned'});
    }catch(error){results.push({directory:path,status:'incomplete',code:error.code??'P2_STAGING_CLEANUP_FAILED'});}
  }
  return {complete:results.every(result=>result.status==='cleaned'),results};
}
