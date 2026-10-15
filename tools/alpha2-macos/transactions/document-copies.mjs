// Trusted, irreversible deletion of managed copies. The imported source is
// deliberately outside this inventory. Authority is supplied by independent P2.
import {readdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const logical=value=>{
 if(typeof value!=='string'||!value||value.length>2048||/[\\:\x00-\x1f\x7f]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)))fail('SEP_PROJECT_DOCUMENT_PATH');return value;
};
const proof=m=>({id:m?.id,owner:m?.owner,status:m?.status,documentPath:logical(m?.documentPath),planHash:m?.planHash});
export function documentCopies({root,rootIdentity,db,guard,meta,setMeta,atomic,save,event,io}){
 const {tree,directory,syncDirectory,applyFile,eraseTree}=io;
 db.exec('CREATE TABLE IF NOT EXISTS document_deletions(id TEXT PRIMARY KEY,value TEXT NOT NULL)');
 let authority;
 const records=()=>db.prepare('SELECT value FROM document_deletions ORDER BY id').all().map(r=>JSON.parse(r.value));
 const store=r=>db.prepare('INSERT INTO document_deletions VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(r.marker.id,JSON.stringify(r));
 async function verifiedAuthority(){
  const binding=meta().documentAuthority;if(!binding&&!records().length&&!authority)return [];
  if(!authority)fail('SEP_PROJECT_DOCUMENT_AUTHORITY_REQUIRED');
  if(binding!==authority.identity)fail('SEP_PROJECT_DOCUMENT_AUTHORITY_INVALID');
  const markers=await authority.read();if(!Array.isArray(markers)||markers.length>1024)fail('SEP_PROJECT_DOCUMENT_AUTHORITY_INVALID');
  const result=markers.filter(m=>m.documentPath!==undefined).map(proof);
  if(result.some(m=>typeof m.id!=='string'||!m.id||typeof m.owner!=='string'||!m.owner.startsWith('project:')||m.status!=='purged'||!/^[a-f0-9]{64}$/.test(m.planHash??''))||new Set(result.map(m=>m.id)).size!==result.length)fail('SEP_PROJECT_DOCUMENT_AUTHORITY_INVALID');
  for(const r of records())if(!result.some(m=>same(m,r.marker)))fail('SEP_PROJECT_DOCUMENT_AUTHORITY_INVALID');return result;
 }
 async function readable(){await guard();const markers=await verifiedAuthority(),saved=records();if(markers.some(m=>!saved.some(r=>same(m,r.marker)&&r.status==='complete')))fail('SEP_PROJECT_DOCUMENT_RECOVERY_REQUIRED');}
 function candidateAllowed(snapshot){
  const rows=records();for(const entry of snapshot.entries){if(rows.some(r=>entry.path===r.marker.documentPath))fail('SEP_PROJECT_DOCUMENT_REMOVED');if(entry.kind==='file'&&rows.some(r=>r.versions.includes(entry.sha256)))fail('SEP_PROJECT_DOCUMENT_COPY_REMOVED');}
 }
 async function inventory(path){
  logical(path);await guard();const m=meta();if(m.pending)fail('SEP_PROJECT_RECOVERY_REQUIRED');
  const generations=db.prepare('SELECT id,value FROM generations ORDER BY id').all(),transactions=db.prepare('SELECT value FROM transactions ORDER BY id').all().map(r=>JSON.parse(r.value));
  if(generations.length>128||transactions.length>256)fail('SEP_PROJECT_DOCUMENT_LIMIT');
  if(transactions.some(t=>['running','cleanup_blocked','intent','published'].includes(t.state)))fail('SEP_PROJECT_RECOVERY_REQUIRED');
  const items=[];
  for(const g of generations){
   const before=JSON.parse(g.value),folder=join(root,'generations',String(g.id),'data');let actual;
   try{actual=await tree(folder);}catch(e){if(e.code==='ENOENT')fail('SEP_PROJECT_BASELINE_CHANGED');throw e;}
   if(!same(actual,before))fail('SEP_PROJECT_BASELINE_CHANGED');items.push({kind:'generation',id:g.id,folder,before});
  }
  for(const t of transactions){
   const folder=join(root,'transactions',t.id);let names;try{const h=await directory(folder,true);await h.close();names=await readdir(folder);}catch(e){if(e.code==='ENOENT'&&t.state!=='ready')continue;throw e;}
   if(names.some(n=>n!=='candidate')||names.length&&(t.state!=='ready'||names.length!==1))fail('SEP_PROJECT_DOCUMENT_HISTORY_UNKNOWN');
   if(t.state==='ready'){const candidate=join(folder,'candidate'),actual=await tree(candidate);if(!same(actual,t.candidate))fail('SEP_PROJECT_CANDIDATE_CHANGED');items.push({kind:'candidate',id:t.id,folder:candidate,before:actual});}
  }
  const versions=[...new Set(items.flatMap(i=>i.before.entries.filter(e=>e.path===path&&e.kind==='file').map(e=>e.sha256)))].sort();
  if(items.some(i=>i.before.entries.some(e=>e.kind==='file'&&e.path!==path&&versions.includes(e.sha256))))fail('SEP_PROJECT_DOCUMENT_HISTORY_UNKNOWN');
  const plan={schema:1,rootIdentity,path,generation:m.generation,sequence:m.sequence,items};
  return {plan,planHash:hash(JSON.stringify(plan)),versions,generationCopies:items.filter(i=>i.kind==='generation'&&i.before.entries.some(e=>e.path===path&&e.kind==='file')).length,invalidatedPlans:items.filter(i=>i.kind==='candidate').length};
 }
 async function review(path){await readable();const r=await inventory(path);return {path,planHash:r.planHash,generationCopies:r.generationCopies,invalidatedPlans:r.invalidatedPlans,versions:r.versions,sourcePolicy:'imported-source-retained; all-managed-generations-and-candidates-governed'};}
 async function purge({marker,expectedPlanHash}={}){
  await guard();const selected=proof(marker),markers=await verifiedAuthority();if(!markers.some(m=>same(m,selected)))fail('SEP_PROJECT_DOCUMENT_AUTHORITY_INVALID');
  let record=records().find(r=>r.marker.id===selected.id);if(record?.status==='complete')return {status:'deleted',id:selected.id};
  if(!record){
   // A new deletion intent must bind the inventory that was actually reviewed.
   // Only an existing durable intent may resume without fresh confirmation.
   if(typeof expectedPlanHash!=='string'||!/^[a-f0-9]{64}$/.test(expectedPlanHash))fail('SEP_PROJECT_DOCUMENT_PLAN_REQUIRED');
   const reviewed=await inventory(selected.documentPath);if(reviewed.planHash!==expectedPlanHash)fail('SEP_PROJECT_DOCUMENT_PLAN_CHANGED');
   record={schema:1,marker:selected,status:'intent',versions:reviewed.versions,plan:reviewed.plan,planHash:reviewed.planHash};atomic(()=>store(record));event('document-intent-durable');
  }
  if(hash(JSON.stringify(record.plan))!==record.planHash||record.plan.rootIdentity!==rootIdentity||record.plan.path!==selected.documentPath)fail('SEP_PROJECT_DOCUMENT_RECOVERY_INVALID');
  const m=meta();if(m.pending||m.sequence!==record.plan.sequence||m.generation!==record.plan.generation)fail('SEP_PROJECT_DOCUMENT_RECOVERY_INVALID');
  // Every before-image is metadata only. A crash may leave a known deletion
  // prefix; additions/changed surviving bytes cannot be justified by deletion.
  for(const item of record.plan.items){
   let actual;try{actual=await tree(item.folder);}catch(e){if(e.code==='ENOENT'){if(item.kind==='candidate'){await syncDirectory(dirname(item.folder));continue;}fail('SEP_PROJECT_DOCUMENT_RECOVERY_INVALID');}throw e;}
   if(item.kind==='candidate'){
    if(actual.entries.some(e=>!item.before.entries.some(old=>same(e,old))))fail('SEP_PROJECT_DOCUMENT_RECOVERY_INVALID');
    await eraseTree(item.folder);await syncDirectory(dirname(item.folder));event('document-candidate-cleaned');continue;
   }
   const kept=item.before.entries.filter(e=>e.path!==selected.documentPath),beforeHash=item.before.sha256,afterHash=hash(JSON.stringify(kept));
   if(actual.sha256!==beforeHash&&actual.sha256!==afterHash)fail('SEP_PROJECT_DOCUMENT_RECOVERY_INVALID');
   const original=item.before.entries.find(e=>e.path===selected.documentPath);
   if(original&&original.kind!=='file')fail('SEP_PROJECT_DOCUMENT_PATH');
   if(original&&actual.entries.some(e=>e.path===selected.documentPath)){
    await applyFile(item.folder,{path:selected.documentPath,expectedSha256:original.sha256,delete:true});event('document-copy-unlinked');
   }else await syncDirectory(original?dirname(join(item.folder,selected.documentPath)):item.folder);
   const after=await tree(item.folder);if(after.sha256!==afterHash)fail('SEP_PROJECT_DOCUMENT_RECOVERY_INVALID');
  }
  const updated=[];for(const item of record.plan.items)if(item.kind==='generation')updated.push([item.id,await tree(item.folder)]);
  atomic(()=>{
   for(const [id,value]of updated)db.prepare('UPDATE generations SET value=? WHERE id=?').run(JSON.stringify(value),id);
   for(const row of db.prepare('SELECT value FROM transactions').all()){const t=JSON.parse(row.value);if(t.state==='ready'){t.state='aborted';save(t);}}
   record.status='complete';store(record);setMeta({...m,sequence:m.sequence+1});
  });event('document-complete-durable');return {status:'deleted',id:selected.id,generationCopies:record.plan.items.filter(i=>i.kind==='generation').length};
 }
 async function bind(input){
  await guard();if(!input||typeof input.identity!=='string'||!input.identity||typeof input.read!=='function')fail('SEP_PROJECT_DOCUMENT_AUTHORITY_INVALID');
  const prior=meta().documentAuthority;if(prior&&prior!==input.identity)fail('SEP_PROJECT_DOCUMENT_AUTHORITY_INVALID');authority=input;
  if(!prior)atomic(()=>setMeta({...meta(),documentAuthority:input.identity}));
  const markers=await verifiedAuthority(),raw=await authority.read();for(const marker of markers)await purge({marker,expectedPlanHash:raw.find(m=>m.id===marker.id)?.managedPlanHash});await readable();return {status:'pass'};
 }
 return {readable,candidateAllowed,review,purge,bind};
}
