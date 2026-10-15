import {z} from 'zod';
import {mkdir,open,readFile,lstat,readdir,realpath,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {digest,fail,checkAbort} from './errors.js';
import {DATA_DOMAINS} from './p2/control.js';
import {normalizeDocumentPath,documentMatches} from './p2/document-governance.js';
import {sessionEvents} from './session-events.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const documentSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('preview'),path:z.string().min(1).max(2048),deleteSource:z.boolean().default(false)}).strict(),
  z.object({action:z.literal('confirm'),planId:hash,planHash:hash}).strict(),
  z.object({action:z.literal('resume'),planId:hash,planHash:hash.optional()}).strict(),
  z.object({action:z.literal('status'),planId:hash}).strict(),
]);
const pathKey=p=>process.platform==='win32'?resolve(p).toLowerCase():resolve(p);
const textOf=m=>m.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')??'';
function confirmed(exec,planHash,deleteSource){
  const session=exec.agent?.session;if(!session||session.header?.origin==='subagent')fail('DIRECT_USER_REQUIRED');
  const events=sessionEvents(session),start=events.findLastIndex(e=>e.type==='turn/start');
  const message=events.slice(start+1).findLast(e=>e.type==='user/message'&&e.data?.role==='user'&&e.data.source?.kind==='user')?.data;
  if(!message)fail('DIRECT_USER_REQUIRED');
  const raw=textOf(message);if(raw.length>6000)fail('DIRECT_USER_REQUIRED');
  // This is a displayed confirmation token, not natural-language intent
  // inference: questions, quotations, cancellations and extra clauses fail.
  const expected=`确认永久删除计划 ${planHash}${deleteSource?'，同时删除原文件':''}`;
  if(raw.trim()!==expected)fail(deleteSource?'DOCUMENT_SOURCE_CONFIRMATION_REQUIRED':'DOCUMENT_CONFIRMATION_REQUIRED');
}

/** One body-free plan binds one authorized logical source path to its complete
 * governed history. The independent P2 deletion authority survives snapshots. */
export function createDocumentManager({scope,store,layers,control,facility,sourceAdapter}={}){
  let tail=Promise.resolve();
  const adapter=async()=>sourceAdapter??await import('./document-source.js');
  const configHash=project=>digest(JSON.stringify({root:project.root,key:project.key,sources:project.sources,userProfile:project.userProfile??null}));
  const owner=project=>`project:${project.key}`;
  const requirement=()=>{if(!control||!facility?.applyDocumentDeletion)fail('DOCUMENT_P2_REQUIRED','Document deletion needs an initialized governed P2 store');};
  async function directory(){
    requirement();await control.assertOwned();const path=join(control.root,'document-plans');await mkdir(path,{recursive:true});
    const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||pathKey(await realpath(path))!==pathKey(path))fail('DOCUMENT_PLAN_UNVERIFIED');return path;
  }
  async function readMetadata(path){
    const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>2*1024*1024)fail('DOCUMENT_PLAN_UNVERIFIED');
    const file=await open(path,'r');try{return JSON.parse(await file.readFile('utf8'));}finally{await file.close();}
  }
  async function durable(path,value,replace=false){
    const target=replace?`${path}.${randomUUID()}.tmp`:path;const file=await open(target,'wx',0o600);
    try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
    if(replace)await rename(target,path);
  }
  async function readPlan(project,id){
    hash.parse(id);const body=await readMetadata(join(await directory(),`${id}.json`));
    if(digest(JSON.stringify(body))!==id||body.version!==1||body.identity!==control.identity||body.owner!==owner(project)||pathKey(body.projectRoot)!==pathKey(project.root)||body.scopeHash!==configHash(project))fail('DOCUMENT_PLAN_CHANGED');
    if(normalizeDocumentPath(body.path)!==body.path||typeof body.deleteSource!=='boolean')fail('DOCUMENT_PLAN_UNVERIFIED');
    return {body,id};
  }
  async function source(project,path){
    const target=await scope.authorizedSource(project,path);return (await adapter()).inspectSource(scope.fs.processPath(target));
  }
  async function managed(){
    const result={};for(const name of ['backups','updates','adoptions']){
      const directory=join(control.root,name);let entries;try{const stat=await lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())fail('DOCUMENT_SCOPE_UNVERIFIED');entries=await readdir(directory,{withFileTypes:true});}catch(e){if(e.code==='ENOENT'){result[name]=[];continue;}throw e;}
      if(entries.some(e=>!e.isDirectory()||e.isSymbolicLink()))fail('DOCUMENT_SCOPE_UNVERIFIED');
      result[name]=entries.map(e=>e.name).sort();
    }return result;
  }
  async function inspect(project,path,cp,sourceSha){
    const domains=[];for(const name of DATA_DOMAINS){let bytes;try{const target=join(control.storageRoot,`${name}.json`),s=await lstat(target);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>64*1024*1024)fail('DOCUMENT_SCOPE_UNVERIFIED');bytes=await readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;}
      if((bytes?digest(bytes):null)!==cp.dataFingerprints[name])fail('DOCUMENT_PLAN_CHANGED');
      domains.push(bytes?JSON.parse(bytes.toString('utf8')):{tables:{}});
    }
    const marker={owner:owner(project),documentPath:path},match=(s,o=marker.owner)=>documentMatches(marker,o,s.path);
    const current=(domains[0].tables.projects?.[project.key]?.index?.sources??[]).filter(s=>match(s));
    const archives=Object.entries(domains[2].tables.archives??{}).filter(([,p])=>p.document&&match(p,p.owner));
    const migration=Object.values(domains[2].tables.backups??{}).filter(b=>b.projectKey===project.key).flatMap(b=>(b.snapshot?.index?.sources??[]).filter(s=>match(s)));
    const versions=[...new Set([...current,...archives.map(([,p])=>p.document),...migration].map(s=>s.sha256))].sort();
    // r5 indexes identify logical paths and hashes, not historical rename
    // lineage. An equal-hash record at another path may be a rename or an
    // independent copy: neither deleting it nor ignoring it proves complete
    // removal. Refuse the ambiguous plan without touching either document.
    const selected=new Set([...versions,...sourceSha?[sourceSha]:[]]);
    const other=[...(domains[0].tables.projects?.[project.key]?.index?.sources??[]),...Object.values(domains[2].tables.archives??{}).filter(p=>p.owner===owner(project)&&p.document).map(p=>p.document),...Object.values(domains[2].tables.backups??{}).filter(b=>b.projectKey===project.key).flatMap(b=>b.snapshot?.index?.sources??[])];
    if(other.some(s=>!match(s)&&selected.has(s.sha256)))fail('DOCUMENT_HISTORY_IDENTITY_UNKNOWN','A different logical path has matching history; no cross-path deletion is inferred');
    return {inventory:{currentSources:current.length,archives:archives.length,migrationCopies:migration.length,versions},dataFingerprints:cp.dataFingerprints,deletionSeq:cp.deletionSeq,managed:await managed()};
  }
  function view(body,id){return {status:'preview',planId:id,planHash:id,path:body.path,deleteSource:body.deleteSource,scope:{projectRoot:body.projectRoot,owner:body.owner},source:body.source,inventory:body.inventory,managed:body.managed,expiresAt:body.expiresAt,excludedFromDeletion:['native_chat_history','unregistered_external_copies'],confirmation:`确认永久删除计划 ${id}${body.deleteSource?'，同时删除原文件':''}`};}
  async function preview(project,args,exec){
    requirement();const path=normalizeDocumentPath(args.path);checkAbort(exec.signal);
    return control.withCheckpoint(async cp=>{
      if(cp.deletions.some(m=>documentMatches(m,owner(project),path)))fail('DOCUMENT_ALREADY_REMOVED','Use the original plan status or resume; re-admission is a separate authorization');
      const original=await source(project,path),snapshot=await inspect(project,path,cp,original.sha256);
      if(!snapshot.inventory.versions.length&&original.status==='missing')fail('DOCUMENT_NOT_FOUND');
      const body={version:1,identity:control.identity,owner:owner(project),projectRoot:project.root,path,scopeHash:configHash(project),deleteSource:args.deleteSource,source:original,...snapshot,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()};
      const id=digest(JSON.stringify(body));await durable(join(await directory(),`${id}.json`),body);return view(body,id);
    });
  }
  async function status(project,id){
    const {body}=await readPlan(project,id);const marker=control.documentDeletions().find(m=>m.planHash===id&&documentMatches(m,body.owner,body.path));
    if(!marker)return view(body,id);
    let receipt;try{receipt=await readMetadata(join(await directory(),`${id}.receipt.json`));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(receipt&&(receipt.checksum!==digest(JSON.stringify(receipt.value))||receipt.value?.planHash!==id))fail('DOCUMENT_RECEIPT_UNVERIFIED');
    if(!receipt||marker.cleanup!=='complete')return {status:'cleanup_pending',planId:id,planHash:id,source:{status:body.deleteSource?'pending':'retained'},cleanup:{complete:false,results:[]},exclusion:'persistent'};
    return receipt.value;
  }
  async function execute(project,input,exec){
    const args=documentSchema.parse(input);requirement();
    if(args.action==='preview')return preview(project,args,exec);
    if(args.action==='status')return status(project,args.planId);
    const {body,id}=await readPlan(project,args.planId);if(args.planHash!==undefined&&args.planHash!==id)fail('DOCUMENT_PLAN_CHANGED');
    confirmed(exec,id,body.deleteSource);checkAbort(exec.signal);
    const priorResult=await status(project,id);if(priorResult.status==='deleted')return priorResult;
    const marker={id:`document:${digest(`${body.owner}\0${body.path}`)}`,owner:body.owner,status:'purged',documentPath:body.path,planHash:id,at:new Date().toISOString(),...(body.source.identity?{sourceIdentity:body.source.identity}:{})};
    return control.documentDeletion(marker,async durableMarker=>{
      await facility.applyDocumentDeletion(durableMarker);let resultSource={status:'retained'},sourceDone=true;
      if(body.deleteSource){
        try{
          const native=await adapter();let result;
          if(body.source.status==='missing'){result=await native.inspectSource(body.source.path);if(result.status!=='missing')fail('DOCUMENT_SOURCE_CHANGED');}
          else result=await native.deleteReviewedSource({path:body.source.path,identity:body.source.identity,sha256:body.source.sha256});
          resultSource={status:result.status};sourceDone=['deleted','missing'].includes(result.status);
        }
        catch(e){sourceDone=false;resultSource={status:'pending',code:e.code??'DOCUMENT_SOURCE_DELETE_FAILED'};}
      }
      const managed=await control.completeDeletion({id:marker.id});
      const result={status:managed.complete&&sourceDone?'deleted':'cleanup_pending',planId:id,planHash:id,source:resultSource,cleanup:{complete:managed.complete&&sourceDone,results:managed.results},exclusion:'persistent'};
      await durable(join(await directory(),`${id}.receipt.json`),{value:result,checksum:digest(JSON.stringify(result))},true);return result;
    },async cp=>{
      if(cp.deletions.some(m=>m.planHash===id&&m.status==='purged'&&documentMatches(m,body.owner,body.path)))return;
      if(Date.now()>Date.parse(body.expiresAt))fail('DOCUMENT_PLAN_EXPIRED');
      let currentSource;try{currentSource=await source(project,body.path);}catch{fail('DOCUMENT_PLAN_CHANGED');}
      const current=await inspect(project,body.path,cp,currentSource.sha256);
      if(!isDeepStrictEqual(currentSource,body.source)||!isDeepStrictEqual(current.dataFingerprints,body.dataFingerprints)||current.deletionSeq!==body.deletionSeq||!isDeepStrictEqual(current.managed,body.managed)||!isDeepStrictEqual(current.inventory,body.inventory))fail('DOCUMENT_PLAN_CHANGED');
    });
  }
  return {execute(project,args,exec){const work=tail.then(()=>execute(project,args,exec));tail=work.catch(()=>{});return work;}};
}
