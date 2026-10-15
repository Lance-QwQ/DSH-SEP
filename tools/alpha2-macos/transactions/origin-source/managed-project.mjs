// Experimental Linux controller; imported source is never overwritten. All
// untrusted commands must go through this controller's namespace carrier.
import {DatabaseSync} from 'node:sqlite';
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,rm,readdir} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {runIsolated} from './linux-isolation.mjs';
import {directory,tree,hash,fail,syncDirectory} from './project-tree.mjs';
import {inspectSandbox} from './linux-process-owner.mjs';
import {documentCopies} from './document-copies.mjs';
const inside=(a,b)=>{const r=relative(a,b);return !r||r!=='..'&&!r.startsWith('../')&&!isAbsolute(r);};
const identity=s=>s.dev+':'+s.ino;
const parse=text=>JSON.parse(text);
const changes=(before,after)=>{
 const a=new Map(before.map(x=>[x.path,x])),b=new Map(after.map(x=>[x.path,x]));
 return [...new Set([...a.keys(),...b.keys()])].sort().flatMap(path=>JSON.stringify(a.get(path))===JSON.stringify(b.get(path))?[]:[{path,kind:!a.has(path)?'created':!b.has(path)?'deleted':'modified'}]);
};
async function sqlitePath(path){
 for(const p of [path,path+'-journal',path+'-wal',path+'-shm'])try{
  const s=await lstat(p,{bigint:true});if(!s.isFile()||s.nlink!==1n||s.uid!==BigInt(process.getuid())||(s.mode&0o077n)!==0n||await realpath(p)!==p)fail('SEP_PROJECT_PATH');
 }catch(e){if(e.code!=='ENOENT')throw e;}
}
async function database(path){
 await sqlitePath(path);try{const file=await open(path,'wx',0o600);await file.close();}catch(e){if(e.code!=='EEXIST')throw e;}
 await sqlitePath(path);return new DatabaseSync(path);
}

export async function openManagedProject({root,source,isolation,onEvent=()=>{}}){
 if(process.platform!=='linux'||process.arch!=='x64')fail('SEP_PROJECT_UNAVAILABLE');
 if(!isolation||typeof onEvent!=='function')fail('SEP_PROJECT_CONFIG');
 const held=await directory(root,true),rootIdentity=identity(await held.stat({bigint:true}));
 let owner,db,active,controller,closePromise,documents,closing=false,closed=false,ownerIdentity,dbIdentity,startupInterrupted=false;
 const pathFor=id=>join(root,'generations',String(id),'data');
 const meta=()=>{const row=db.prepare('SELECT value FROM metadata WHERE id=1').get();if(!row)fail('SEP_PROJECT_INITIALIZATION_INCOMPLETE');return parse(row.value);};
 const transaction=id=>{const row=db.prepare('SELECT value FROM transactions WHERE id=?').get(id);if(!row)fail('SEP_PROJECT_PLAN_INVALID');return parse(row.value);};
 const save=t=>db.prepare('INSERT INTO transactions(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(t.id,JSON.stringify(t));
 const setMeta=m=>db.prepare('INSERT INTO metadata(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(m));
 const atomic=fn=>{db.exec('BEGIN IMMEDIATE');try{fn();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}};
 const event=(name,t)=>{db.prepare('INSERT INTO events(kind,transaction_id) VALUES(?,?)').run(name,t?.id??null);onEvent(name);};
 const guard=async()=>{
  if(closed)fail('SEP_PROJECT_CLOSED');
  if(await realpath(root)!==root||identity(await lstat(root,{bigint:true}))!==rootIdentity)fail('SEP_PROJECT_PATH');
  await sqlitePath(join(root,'owner.sqlite'));await sqlitePath(join(root,'state.sqlite'));
  if(identity(await lstat(join(root,'owner.sqlite'),{bigint:true}))!==ownerIdentity||identity(await lstat(join(root,'state.sqlite'),{bigint:true}))!==dbIdentity)fail('SEP_PROJECT_PATH');
  owner.prepare('SELECT 1').get();
 };
 const ready=async()=>{await guard();await documents?.readable();const m=meta();if(m.pending||startupInterrupted)fail('SEP_PROJECT_RECOVERY_REQUIRED');return m;};
 const snapshot=async id=>{
  const row=db.prepare('SELECT value FROM generations WHERE id=?').get(id);if(!row)fail('SEP_PROJECT_BASELINE_CHANGED');
  const saved=parse(row.value),actual=await tree(pathFor(id));
  if(saved?.sha256!==actual.sha256||saved?.version!==actual.version)fail('SEP_PROJECT_BASELINE_CHANGED');return actual;
 };
 const exclusive=fn=>{
  if(closed||closing)fail('SEP_PROJECT_CLOSED');if(active)fail('SEP_PROJECT_BUSY');
  controller=new AbortController();active=Promise.resolve().then(()=>fn(controller.signal)).finally(()=>{active=undefined;controller=undefined;});return active;
 };
 const removeCopies=async(t,{candidate=true}={})=>{
  await guard();if(!/^[a-f0-9-]{36}$/.test(t.id))fail('SEP_PROJECT_PLAN_INVALID');
  const folder=join(root,'transactions',t.id);
  // The durable intent precedes mkdir; absence after a crash means there is
  // no copied body to remove. An existing alias is never traversed.
  let handle;try{handle=await directory(folder,true);}catch(e){if(e.code==='ENOENT')return;throw e;}await handle.close();
  for(const name of candidate?['work','candidate']:['work'])await rm(join(folder,name),{recursive:true,force:true});
  await syncDirectory(folder);
 };
 const lookup=planHash=>{
  if(!/^[a-f0-9]{64}$/.test(planHash??''))fail('SEP_PROJECT_PLAN_INVALID');
  const row=db.prepare("SELECT value FROM transactions WHERE json_extract(value,'$.planHash')=?").get(planHash);
  if(!row)fail('SEP_PROJECT_PLAN_INVALID');const t=parse(row.value);
  if(hash(JSON.stringify(t.plan))!==planHash||t.plan.rootIdentity!==rootIdentity)fail('SEP_PROJECT_PLAN_INVALID');return t;
 };
 const recoverInternal=async()=>{
  await guard();await documents?.readable();let m=meta();
  if(db.prepare("SELECT 1 FROM transactions WHERE json_extract(value,'$.state')='cleanup_blocked'").get())fail('SEP_PROJECT_CLEANUP_BLOCKED');
  if(m.pending){
   const t=transaction(m.pending);
   if(!['intent','published'].includes(t.state)||m.sequence!==t.plan.baseSequence||![t.plan.baseGeneration,t.target].includes(m.generation))fail('SEP_PROJECT_RECOVERY_BLOCKED');
   await snapshot(t.plan.baseGeneration);
   // Admission remains closed until all rollback cleanup finishes. No journal
   // record or newer business sequence is overwritten to make recovery pass.
   if(t.target!==t.plan.baseGeneration)await rm(join(root,'generations',String(t.target)),{recursive:true,force:true});
   await syncDirectory(join(root,'generations'));await removeCopies(t);
   atomic(()=>{t.state='rolled_back';save(t);setMeta({...m,generation:t.plan.baseGeneration,pending:null});});event('rollback-durable',t);
  }
  for(const row of db.prepare('SELECT value FROM transactions').all()){
   const t=parse(row.value);
   if(['running','committed','rolled_back','aborted'].includes(t.state)||t.state==='ready'&&Date.now()-t.createdAt>=86400000){
    if(t.state==='running'&&t.launch!=='not-dispatched'&&(await inspectSandbox(t.sandbox)).state!=='gone')fail('SEP_PROJECT_CLEANUP_BLOCKED');
    await removeCopies(t);if(['running','ready'].includes(t.state)){t.state='aborted';save(t);}
   }
  }
  startupInterrupted=false;m=meta();await snapshot(m.generation);return {status:'pass',action:m.pending?'blocked':'reconciled',generation:m.generation,sequence:m.sequence};
 };
 const newTransaction=async(kind,m)=>{
  const t={id:randomUUID(),kind,state:'running',launch:'not-dispatched',createdAt:Date.now(),baseGeneration:m.generation,baseSequence:m.sequence};save(t);
  await mkdir(join(root,'transactions',t.id),{mode:0o700});await syncDirectory(join(root,'transactions'));return t;
 };
 const finishPlan=async(t,baseline,candidate)=>{
  documents?.candidateAllowed(candidate);
  const m=await ready();if(m.generation!==t.baseGeneration||m.sequence!==t.baseSequence)fail('SEP_PROJECT_STALE_PLAN');
  const after=await snapshot(m.generation);if(after.version!==baseline.version)fail('SEP_PROJECT_BASELINE_CHANGED');
  t.plan={schema:1,rootIdentity,id:t.id,kind:t.kind,baseGeneration:m.generation,baseSequence:m.sequence,targetSha256:candidate.sha256,changes:changes(baseline.entries,candidate.entries)};
  t.planHash=hash(JSON.stringify(t.plan));t.candidate=candidate;t.state='ready';save(t);event('plan-ready',t);
  return {status:'ready',planHash:t.planHash};
 };
 try{
  owner=await database(join(root,'owner.sqlite'));
  try{owner.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE');}catch(e){if(/busy|locked/i.test(e.message))fail('SEP_PROJECT_LOCKED');throw e;}
  ownerIdentity=identity(await lstat(join(root,'owner.sqlite'),{bigint:true}));
  db=await database(join(root,'state.sqlite'));db.exec('PRAGMA synchronous=FULL; PRAGMA journal_mode=DELETE; CREATE TABLE IF NOT EXISTS metadata(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS generations(id INTEGER PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,kind TEXT NOT NULL,transaction_id TEXT)');
  dbIdentity=identity(await lstat(join(root,'state.sqlite'),{bigint:true}));
  if(!db.prepare('SELECT 1 FROM metadata').get()){
   if(!source||inside(root,source)||inside(source,root))fail('SEP_PROJECT_PATH');
   await directory(source).then(h=>h.close());
   const before=await tree(source);
   await mkdir(join(root,'generations'),{mode:0o700});await mkdir(join(root,'transactions'),{mode:0o700});await mkdir(join(root,'generations','1'),{mode:0o700});await mkdir(pathFor(1),{mode:0o700});
   await tree(source,{copyTo:pathFor(1)});const after=await tree(source);
   if(before.version!==after.version)fail('SEP_PROJECT_TREE_CHANGED');const captured=await tree(pathFor(1));if(captured.sha256!==before.sha256)fail('SEP_PROJECT_TREE_CHANGED');
   await syncDirectory(join(root,'generations','1'));await syncDirectory(join(root,'generations'));await syncDirectory(root);
   atomic(()=>{db.prepare('INSERT INTO generations VALUES(1,?)').run(JSON.stringify(captured));setMeta({schema:1,rootIdentity,generation:1,sequence:0,pending:null});});event('initialized');
  }
  const m=meta();if(m.schema!==1||m.rootIdentity!==rootIdentity)fail('SEP_PROJECT_PATH');
  documents=documentCopies({root,rootIdentity,db,guard,meta,setMeta,atomic,save,event});
  startupInterrupted=db.prepare("SELECT 1 FROM transactions WHERE json_extract(value,'$.state') IN ('running','cleanup_blocked')").get()!==undefined;
  await guard();
  return {
   bindDocumentAuthority(input){return exclusive(()=>documents.bind(input));},
   reviewDocument(path){return exclusive(()=>documents.review(path));},
   deleteDocument(input){return exclusive(()=>documents.purge(input));},
   async current(){const m=await ready();await snapshot(m.generation);return {generation:m.generation,sequence:m.sequence,path:pathFor(m.generation)};},
   async plans(){await guard();return db.prepare("SELECT value FROM transactions WHERE json_extract(value,'$.state')='ready'").all().map(row=>parse(row.value)).map(t=>({planHash:t.planHash,kind:t.kind,createdAt:t.createdAt,expired:Date.now()-t.createdAt>=86400000,changes:t.plan.changes}));},
   async view(planHash){const m=await ready();if(planHash===undefined)return {path:pathFor(m.generation),...await snapshot(m.generation)};const t=lookup(planHash);if(t.state!=='ready'||t.plan.baseGeneration!==m.generation||t.plan.baseSequence!==m.sequence||Date.now()-t.createdAt>=86400000)fail('SEP_PROJECT_STALE_PLAN');const path=join(root,'transactions',t.id,'candidate'),actual=await tree(path);if(actual.sha256!==t.candidate.sha256||actual.version!==t.candidate.version)fail('SEP_PROJECT_CANDIDATE_CHANGED');return {path,...actual};},
   run({command,timeoutMs=3000,signal,basePlanHash,readOnly=false,input='',reportOutput=false,maxInputBytes,maxOutputBytes}={}){return exclusive(async internal=>{
    const m=await ready();if(signal?.aborted||internal.aborted)return {status:'aborted',reason:'cancelled'};
    const baseline=await snapshot(m.generation);let workSource=pathFor(m.generation),workTree=baseline;
    if(basePlanHash!==undefined){const prior=lookup(basePlanHash);if(prior.state!=='ready'||Date.now()-prior.createdAt>=86400000||prior.plan.baseGeneration!==m.generation||prior.plan.baseSequence!==m.sequence)fail('SEP_PROJECT_STALE_PLAN');workSource=join(root,'transactions',prior.id,'candidate');workTree=await tree(workSource);if(workTree.sha256!==prior.candidate.sha256||workTree.version!==prior.candidate.version)fail('SEP_PROJECT_CANDIDATE_CHANGED');}
    const t=await newTransaction('business',m),folder=join(root,'transactions',t.id);
    const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});internal.addEventListener('abort',cancel,{once:true});
    try{
     await mkdir(join(folder,'work'),{mode:0o700});if(signal?.aborted||internal.aborted)abort.abort();
     const result=await runIsolated({...isolation,source:workSource,scratch:join(folder,'work'),command,timeoutMs,signal:abort.signal,readOnly,input,maxInputBytes,maxOutputBytes,copySourceHash:readOnly?undefined:workTree.sha256,onSpawn:record=>{t.sandbox=record;t.launch='dispatch-authorized';save(t);}});
     if(!result.exited){t.state='cleanup_blocked';save(t);startupInterrupted=true;return {status:'blocked',reason:'cleanup-blocked'};}
     if(result.reason!=='exit'||result.code!==0||abort.signal.aborted){t.state='aborted';save(t);return {status:'aborted',reason:abort.signal.aborted?'cancelled':result.reason==='exit'?'tool-failed':result.reason,...readOnly&&reportOutput?{diagnostic:result.stderr}:{}};}
     if(readOnly){t.state='aborted';save(t);return {status:'read',...(reportOutput?{output:result.stdout}:{})};}
     await mkdir(join(folder,'candidate'),{mode:0o700});await tree(join(folder,'work'),{copyTo:join(folder,'candidate')});
     const candidate=await tree(join(folder,'candidate'));await syncDirectory(folder);
     if(abort.signal.aborted){t.state='aborted';save(t);return {status:'aborted',reason:'cancelled'};}
     return {...await finishPlan(t,baseline,candidate),...(reportOutput?{output:result.stdout}:{})};
    }catch(e){t.state='aborted';save(t);throw e;}
    finally{signal?.removeEventListener('abort',cancel);internal.removeEventListener('abort',cancel);if(t.state!=='cleanup_blocked')await removeCopies(t,{candidate:t.state!=='ready'});}
   });},
   planRestore(generation){return exclusive(async()=>{
    const m=await ready();if(!Number.isSafeInteger(generation)||generation<1)fail('SEP_PROJECT_PLAN_INVALID');
    const baseline=await snapshot(m.generation),sourceTree=await snapshot(generation),t=await newTransaction('restore',m),folder=join(root,'transactions',t.id);
    try{await mkdir(join(folder,'candidate'),{mode:0o700});await tree(pathFor(generation),{copyTo:join(folder,'candidate')});const candidate=await tree(join(folder,'candidate'));if(candidate.sha256!==sourceTree.sha256)fail('SEP_PROJECT_BASELINE_CHANGED');await syncDirectory(folder);return await finishPlan(t,baseline,candidate);}
    catch(e){t.state='aborted';save(t);await removeCopies(t);throw e;}
   });},
   async review(planHash){await ready();const t=lookup(planHash);if(t.state!=='ready')fail('SEP_PROJECT_PLAN_INVALID');if(Date.now()-t.createdAt>=86400000)fail('SEP_PROJECT_PLAN_EXPIRED');return {...t.plan,planHash:t.planHash};},
   commit({planHash,signal}={}){return exclusive(async internal=>{
    const m=await ready(),t=lookup(planHash);if(t.state!=='ready')fail('SEP_PROJECT_PLAN_INVALID');
    if(Date.now()-t.createdAt>=86400000)fail('SEP_PROJECT_PLAN_EXPIRED');
    if(m.generation!==t.plan.baseGeneration||m.sequence!==t.plan.baseSequence)fail('SEP_PROJECT_STALE_PLAN');
    if(signal?.aborted||internal.aborted)fail('SEP_PROJECT_CANCELLED');await snapshot(m.generation);
    const candidate=join(root,'transactions',t.id,'candidate'),actual=await tree(candidate);
    documents.candidateAllowed(actual);
    if(actual.sha256!==t.candidate.sha256||actual.version!==t.candidate.version)fail('SEP_PROJECT_CANDIDATE_CHANGED');
    t.target=Number(db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM generations').get().id);
    t.state='intent';atomic(()=>{save(t);db.prepare('INSERT INTO generations VALUES(?,?)').run(t.target,'null');setMeta({...m,pending:t.id});});event('intent-durable',t);
    await mkdir(join(root,'generations',String(t.target)),{mode:0o700});await mkdir(pathFor(t.target),{mode:0o700});
    await tree(candidate,{copyTo:pathFor(t.target)});const target=await tree(pathFor(t.target));
    if(target.sha256!==t.plan.targetSha256)fail('SEP_PROJECT_CANDIDATE_CHANGED');
    await syncDirectory(join(root,'generations',String(t.target)));await syncDirectory(join(root,'generations'));
    if(signal?.aborted||internal.aborted)fail('SEP_PROJECT_CANCELLED');
    t.state='published';atomic(()=>{db.prepare('UPDATE generations SET value=? WHERE id=?').run(JSON.stringify(target),t.target);save(t);setMeta({...m,generation:t.target,pending:t.id});});event('published-durable',t);
    await snapshot(t.target);event('health-passed',t);
    if(signal?.aborted||internal.aborted)fail('SEP_PROJECT_CANCELLED');
    // This single FULL-synchronous SQLite commit is the only committed rule.
    // Until it succeeds current()/run()/restore refuse all business admission.
    t.state='committed';atomic(()=>{save(t);setMeta({...m,generation:t.target,sequence:m.sequence+1,pending:null});});event('committed-durable',t);
    await removeCopies(t);return {status:'committed',generation:t.target,sequence:m.sequence+1,planHash};
   });},
   recover(){return exclusive(recoverInternal);},
   async reviewCleanup(){
    await guard();const m=meta(),items=[];
    for(const row of db.prepare('SELECT value FROM transactions').all()){
     const t=parse(row.value);if(t.state!=='cleanup_blocked')continue;
     const observed=await inspectSandbox(t.sandbox);items.push({id:t.id,recordSha256:hash(row.value),owner:t.sandbox,observed});
    }
    if(!items.length||items.some(x=>x.observed.state!=='gone'))return {status:'blocked',reasons:items.map(x=>({id:x.id,...x.observed}))};
    const plan={schema:1,rootIdentity,generation:m.generation,sequence:m.sequence,pending:m.pending,items};return {status:'pass',planHash:hash(JSON.stringify(plan)),transactions:items.map(x=>x.id)};
   },
   resolveCleanup({planHash}={}){return exclusive(async()=>{
    await guard();const m=meta(),items=[];
    for(const row of db.prepare('SELECT value FROM transactions').all()){
     const t=parse(row.value);if(t.state!=='cleanup_blocked')continue;
     const observed=await inspectSandbox(t.sandbox);items.push({id:t.id,recordSha256:hash(row.value),owner:t.sandbox,observed});
    }
    const plan={schema:1,rootIdentity,generation:m.generation,sequence:m.sequence,pending:m.pending,items};
    if(!items.length||items.some(x=>x.observed.state!=='gone')||hash(JSON.stringify(plan))!==planHash)fail('SEP_PROJECT_CLEANUP_PLAN_INVALID');
    for(const item of items){const t=transaction(item.id);await removeCopies(t);t.state='aborted';save(t);event('cleanup-confirmed-durable',t);}
    return recoverInternal();
   });},
   discard(planHash){return exclusive(async()=>{await ready();const t=lookup(planHash);if(t.state!=='ready')fail('SEP_PROJECT_PLAN_INVALID');await removeCopies(t);t.state='aborted';save(t);return {status:'pass'};});},
   close(){return closePromise??=(async()=>{
    closing=true;controller?.abort();
    try{await active;}catch{} // Durable pending state is retained for recover().
    const blocked=db.prepare("SELECT 1 FROM transactions WHERE json_extract(value,'$.state')='cleanup_blocked'").get()!==undefined;
    closed=true;try{db.close();}finally{try{owner.close();}finally{await held.close();}}return {status:blocked?'blocked':'pass'};
   })();},
  };
 }catch(e){try{db?.close();}finally{try{owner?.close();}finally{await held.close();}}throw e;}
}
