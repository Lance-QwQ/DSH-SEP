import {readFile,readdir,mkdir,open,lstat,realpath} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {channel} from 'node:diagnostics_channel';
import {openControl,DATA_DOMAINS} from './control.js';
import {fingerprintFiles,canonicalIdentity,inspectArtifact,sealArtifact} from './artifacts.js';
import {captureSnapshot} from './backups.js';
import {bindInstallInputs} from './install-inputs.js';
import {cleanupAdoptionTransactions} from './adoption-governance.js';
import {acquireAdoptionAdmission} from './adoption-admission.js';

const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>sha(JSON.stringify(stable(v))),same=(a,b)=>digest(a)===digest(b),seal=v=>({...v,hash:digest(v)});
const suiteRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const inside=(root,path)=>{const r=relative(root,path);return r===''||r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
const safeError=e=>typeof e?.code==='string'&&/^(?:P2_|ADOPTION_)[A-Z_]+$/.test(e.code)?e.code:'P2_ADOPTION_IO';
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function regular(path){
  if(!isAbsolute(path??''))fail('P2_ADOPTION_PUBLICATION_INPUT');
  for(let p=resolve(path);;p=dirname(p)){const s=await lstat(p);if(s.isSymbolicLink())fail('P2_ADOPTION_SCOPE');if(dirname(p)===p)break;}
  const s=await lstat(path);if(!s.isFile()||s.nlink!==1||s.size>64*1024*1024)fail('P2_ADOPTION_SCOPE');return realpath(path);
}
async function durableNew(path,bytes){const f=await open(path,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}}
async function json(path){await regular(path);try{return JSON.parse(await readFile(path,'utf8'));}catch{fail('P2_ADOPTION_PUBLICATION_INPUT');}}
async function implementation(){
  const paths=[join(suiteRoot,'package.json'),join(suiteRoot,'cordis.patch.yml')];
  async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())fail('P2_ADOPTION_SCOPE');const p=join(dir,e.name);if(e.isDirectory())await walk(p);else paths.push(p);}}
  await walk(join(suiteRoot,'src'));return fingerprintFiles(paths.sort());
}
async function inputs(request,budgetPath,budgetLease){
  const keys=['configPath','manifestPath','lockPath','artifactPath','hostLibraryRoot'];
  if(!request||Object.keys(request).some(k=>!keys.includes(k))||keys.some(k=>!isAbsolute(request[k]??'')))fail('P2_ADOPTION_PUBLICATION_INPUT');
  const files=await fingerprintFiles(await Promise.all(keys.filter(k=>k!=='hostLibraryRoot').map(k=>regular(request[k]))));
  const code=await implementation(),artifact=await inspectArtifact(request.artifactPath);
  const inputBytes={};
  for(const key of ['configPath','manifestPath','lockPath']){
    const bytes=await readFile(request[key]),record=files.find(f=>f.path===resolve(request[key]));
    if(!record||sha(bytes)!==record.sha256)fail('P2_ADOPTION_PLAN_CHANGED');inputBytes[key]=bytes;
  }
  if(artifact.sha256!==files.find(f=>f.path===resolve(request.artifactPath))?.sha256)fail('P2_ADOPTION_PLAN_CHANGED');
  for(const f of code){const member=artifact.members.find(m=>m.path==='package/'+relative(suiteRoot,f.path).replaceAll('\\','/'));
    if(!member||member.sha256!==f.sha256)fail('P2_ADOPTION_PACKAGE_MISMATCH');}
  // Binding is checked without rewriting the caller's existing Profile files.
  bindInstallInputs({manifestBytes:inputBytes.manifestPath,lockBytes:inputBytes.lockPath,artifact,requireExistingBinding:{manifestPath:request.manifestPath,lockPath:request.lockPath}});
  let config;try{config=JSON.parse(inputBytes.configPath.toString('utf8'));}catch{fail('P2_ADOPTION_PUBLICATION_INPUT');}
  const {inspectAdoptionBudget}=await import('./adoption-budget.js'),budget=budgetLease?await budgetLease.inspect():await inspectAdoptionBudget({budgetPath,config});
  if(budget.configSha256!==digest(config))fail('P2_ADOPTION_PLAN_CHANGED');
  const {adoptionHealthRuntime}=await import('./adoption-health.js'),native=await adoptionHealthRuntime({hostLibraryRoot:request.hostLibraryRoot});
  if(!isAbsolute(config.lockDirectory??''))fail('P2_ADOPTION_PUBLICATION_INPUT');
  const lockDirectory=await canonicalIdentity(config.lockDirectory);
  if(!same(await fingerprintFiles(files.map(f=>f.path)),files))fail('P2_ADOPTION_PLAN_CHANGED');
  return {files,code,artifact:{path:artifact.path,sha256:artifact.sha256,version:artifact.manifest.version},budget,native,lockDirectory};
}
function restrictions(domains){const rows=[];for(const [owner,value]of Object.entries(domains[1].tables.active.catalog.owners))for(const marker of value.markers??[]){
  const clean={owner,...Object.fromEntries(['id','status','keyHash','textHash','at'].filter(k=>marker[k]!==undefined).map(k=>[k,marker[k]]))};
  if(!rows.some(r=>same(r,clean)))rows.push(clean);
}return rows;}
const names=DATA_DOMAINS;
const lifecycle=channel('dsh.adoption.publication');
const fingerprints=async root=>Object.fromEntries((await fingerprintFiles(names.map(n=>join(root,n+'.json')))).map((f,i)=>[names[i],f.sha256]));

/** Formal authority is a separate exact plan. Preparation confirmation remains staging-only. */
export function createAdoptionPublication(a){
  const {clock}=a;
  const planPath=pp=>join(pp.storageRoot,'.suite-memory','p2','adoption-publications',pp.transactionId,pp.hash+'.json');
  function valid(pp){
    if(!pp||pp.kind!=='adoption-publication-v1'||!UUID.test(pp.epoch??'')||!HASH.test(pp.hash??'')||!HASH.test(pp.preparationHash??''))fail('P2_ADOPTION_PUBLICATION_INPUT');
    const {hash,...body}=pp;if(digest(body)!==hash)fail('P2_ADOPTION_PLAN_CHANGED');a.planValid(pp.preparation);
    if(pp.preparation.hash!==pp.preparationHash||pp.storageRoot!==pp.preparation.storageRoot||pp.transactionId!==pp.preparation.transactionId||pp.operations?.length!==3||
      pp.operations.some((op,i)=>op.file!==join(pp.storageRoot,names[i]+'.json')||op.sha256!==pp.preparation.selection.hashes[i]||!UUID.test(op.operationId)))fail('P2_ADOPTION_PLAN_CHANGED');
    return pp;
  }
  const origin=pp=>({transactionId:pp.transactionId,planHash:pp.hash,epoch:pp.epoch,sourceHash:pp.preparation.manifest.sourceHash,selectionHash:digest(pp.preparation.selection),
    rulesHash:digest(pp.inputs.code),confirmationHash:pp.hash,restrictionHash:digest(pp.restrictions)});
  async function check(pp,budgetLease){
    if(!same(await a.environment(pp.preparation.request),pp.preparation.environment)||!same(await inputs(pp.request,pp.preparation.request.budgetPath,budgetLease),pp.inputs))fail('P2_ADOPTION_PLAN_CHANGED');
  }
  async function createPlan(p,request){return a.withPlan(p,async(c,m)=>{
    const state=await m.read(),staged=state.last.payload.result;
    if(state.last.type!=='staged')fail('P2_ADOPTION_STAGE_REQUIRED');
    if(!staged?.retirement?.retired||!staged.sourceProof.retirement?.retired)fail('P2_ADOPTION_RETIREMENT_REQUIRED');
    return a.withSource(p,c,async lease=>{
      const selected=await a.materialized(p,c),bound=await inputs(request,p.request.budgetPath);
      for(const path of Object.values(request))if(inside(p.request.sourceRoot,path)||inside(c.root,path))fail('P2_ADOPTION_SCOPE');
      const buffers=await a.bodies(c,'staging');
      const {healthAdoptionStaging}=await import('./adoption-health.js');
      await healthAdoptionStaging({storageRoot:p.storageRoot,stagingRoot:join(c.root,'staging'),configPath:request.configPath,expectedDomains:buffers,projects:p.request.projects,hostLibraryRoot:request.hostLibraryRoot});
      const pp=seal({kind:'adoption-publication-v1',transactionId:p.transactionId,storageRoot:p.storageRoot,epoch:randomUUID(),preparationHash:p.hash,preparation:p,
        request,inputs:bound,createdAt:clock(),expiresAt:p.expiresAt,source:staged.sourceProof,restrictions:restrictions(selected.domains),
        operations:names.map((n,i)=>({operationId:randomUUID(),file:join(p.storageRoot,n+'.json'),sha256:sha(buffers[i])})),
        confirmationScope:'new-use-and-business-open',oldHistoryCoverage:'unknown-before-adoption',oldSourceDisposition:'retain-retired',baselinePolicy:'post-adopted-only'});
      await c.confirm();await lease.revalidate();await check(pp);
      const path=planPath(pp);await mkdir(dirname(path),{recursive:true});await durableNew(path,JSON.stringify(pp));return pp;
    },staged.sourceProof);
  });}
  async function ensurePlan(pp){valid(pp);if(!same(await json(planPath(pp)),pp))fail('P2_ADOPTION_PLAN_CHANGED');}
  function result(pp,cp,cleanup){return {status:'adopted',transactionId:pp.transactionId,epoch:cp.epoch,planHash:pp.hash,adoptedAt:cp.adoption.adoptedAt,
    firstBaseline:cp.adoption.firstBaseline,businessWrites:cp.barrier.closed?'blocked':'open',historyCoverage:cp.historyCoverage,
    provenance:{planPath:planPath(pp),entries:pp.preparation.selection.provenance.entries.map(e=>({owner:e.owner,id:e.id,revision:e.revision,historyNotImported:true,adoptedAt:cp.adoption.adoptedAt}))},
    cleanup,sourceFiles:'retained',sourcePermissions:'retired',oldProcessesStarted:false,modelCalls:0};}
  async function execute(pp,options={},recovery=false){
    await ensurePlan(pp);const p=pp.preparation;
    const c=await a.copies(p,false,options.recoverLockToken?{recoverLockToken:options.recoverLockToken}:{});let control,lease,budgetLease,admission,phase='checking';
    const report=(next,domainIndex)=>{phase=next;lifecycle.publish({phase,transactionId:pp.transactionId,planHash:pp.hash,...domainIndex===undefined?{}:{domainIndex}});};
    try{
      const m=await a.metadata(c,{clock});await m.load(p);
      admission=await acquireAdoptionAdmission({storageRoot:p.storageRoot,transactionId:p.transactionId,...options.admissionRecoverToken?{recoverLockToken:options.admissionRecoverToken}:{}});
      const initialized=await exists(join(p.storageRoot,'.suite-memory','p2','journal.jsonl'));
      if(recovery&&!initialized)fail('P2_ADOPTION_PUBLICATION_NOT_STARTED');
      if(initialized){control=await openControl({storageRoot:p.storageRoot,mode:'maintenance',adoption:origin(pp),...options.controlRecoverToken?{recoverLockToken:options.controlRecoverToken}:{}});
        const prior=await control.checkpoint();
        if(prior.adoption?.status==='adopted'&&!prior.barrier.closed)return result(pp,prior,{complete:(await c.checkpoint()).cleanup==='complete',status:'already-adopted'});
      }
      if(!same(await fingerprintFiles(pp.inputs.files.map(f=>f.path)),pp.inputs.files))fail('P2_ADOPTION_PLAN_CHANGED');
      lease=await a.capture(p.request,c,pp.source);await lease.revalidate();
      if(!lease.snapshot().retirement?.retired)fail('P2_ADOPTION_RETIREMENT_REQUIRED');
      const {acquireAdoptionBudgetLease}=await import('./adoption-budget.js');
      budgetLease=await acquireAdoptionBudgetLease({budgetPath:p.request.budgetPath,config:await json(pp.request.configPath),transactionId:pp.transactionId,...options.budgetRecoverToken?{recoverLockToken:options.budgetRecoverToken}:{}});
      try{await check(pp,budgetLease);}catch{fail('P2_ADOPTION_PLAN_CHANGED');}
      if(!control){await c.confirm();await a.materialized(p,c);await a.emptyTarget(p.storageRoot);
        control=await openControl({storageRoot:p.storageRoot,mode:'maintenance',adoption:origin(pp)});
      }
      let cp=await control.checkpoint();
      report('origin-ready');
      if(cp.adoption.status!=='adopted'){
        await c.confirm();await a.materialized(p,c);
        // After an initial restriction pass, any unrelated deletion is a new
        // decision and cannot be overwritten by replaying the old import.
        for(const d of cp.deletions)if(!pp.restrictions.some(r=>same(r,Object.fromEntries(Object.keys(r).map(k=>[k,d[k]])))))fail('P2_ADOPTION_RESTRICTIONS_CHANGED');
        for(const marker of pp.restrictions)await control.deletion(marker);
        cp=await control.checkpoint();
        if(cp.deletionSeq!==new Set(pp.restrictions.map(r=>`${r.owner}:${r.id}:${r.status}`)).size)fail('P2_ADOPTION_RESTRICTIONS_CHANGED');
        report('restrictions-recorded');
        for(const [i,operation]of pp.operations.entries()){
          await check(pp,budgetLease);await c.confirm();await lease.revalidate();
          const bytes=await c.read('staging/'+names[i]+'.json');if(sha(bytes)!==operation.sha256)fail('P2_ADOPTION_PLAN_CHANGED');
          await control.adoptionWrite({...operation,transactionId:pp.transactionId,planHash:pp.hash},async()=>{report('domain-intent',i);await durableNew(operation.file,bytes);report('domain-durable',i);});
          report('domain-complete',i);
        }
        const expected=Object.fromEntries(pp.operations.map((op,i)=>[names[i],op.sha256]));
        if(!same(await fingerprints(p.storageRoot),expected))fail('P2_ADOPTION_TARGET_CHANGED');
        const {healthAdoptionTarget}=await import('./adoption-health.js');
        await healthAdoptionTarget({storageRoot:p.storageRoot,configPath:pp.request.configPath,expectedDomains:await a.bodies(c,'staging'),projects:p.request.projects,hostLibraryRoot:pp.request.hostLibraryRoot});
        report('health-verified');
        await check(pp,budgetLease);await lease.revalidate();await c.confirm();
        const dataFingerprints=await fingerprints(p.storageRoot);if(!same(dataFingerprints,expected))fail('P2_ADOPTION_TARGET_CHANGED');
        await sealArtifact(pp.request.artifactPath,join(control.root,'artifacts'),pp.inputs.artifact.sha256);
        await control.commitAdoption({transactionId:pp.transactionId,planHash:pp.hash,expectedDataFingerprints:expected,expectedBusinessSeq:3,expectedDeletionSeq:cp.deletionSeq,
          health:{success:true,dataFingerprints:expected},firstBaseline:{id:pp.epoch,directory:join(control.root,'backups',pp.epoch)}});
        cp=await control.checkpoint();
        report('adopted');
      }
      // From this point the adopted timestamp/operation IDs are immutable.
      // No source body is required to reconstruct a committed first baseline.
      if(cp.businessSeq!==cp.adoption.commit.businessSeq||cp.deletionSeq!==cp.adoption.commit.deletionSeq||cp.pending.length||!same(await fingerprints(p.storageRoot),cp.adoption.commit.dataFingerprints))fail('P2_ADOPTION_TARGET_CHANGED');
      const directory=cp.adoption.firstBaseline.directory;
      if(cp.adoption.firstBaseline.status!=='ready'){
        const files=[...names.map((name,i)=>({id:'domain-'+i,role:'domain',path:join(p.storageRoot,name+'.json')})),
          {id:'config',role:'config',path:pp.request.configPath},{id:'manifest',role:'manifest',path:pp.request.manifestPath},{id:'lock',role:'lock',path:pp.request.lockPath}];
        const snapshot=await captureSnapshot({directory,files,resume:true,baseline:{planHash:pp.hash,businessSeq:cp.businessSeq,deletionCheckpoint:cp},excludedPaths:[p.request.budgetPath,join(control.root,'journal.jsonl'),control.headPath]});
        await control.acceptAdoptionBaseline({directory,checksum:snapshot.checksum});
        report('baseline-ready');
      }
      await check(pp,budgetLease);await lease.revalidate();
      await c.invalidate('committed');const cleanup=await c.cleanup({recoveryRequired:false});if(!cleanup.complete)fail('P2_ADOPTION_CLEANUP_PENDING');
      const superseded=await cleanupAdoptionTransactions({storageRoot:p.storageRoot,exceptTransactionId:p.transactionId,reason:'superseded'});
      if(!superseded.complete)fail('P2_ADOPTION_CLEANUP_PENDING');cleanup.superseded=superseded;
      report('copies-cleaned');
      await admission.assertOwned();
      await check(pp,budgetLease);await lease.revalidate();
      await control.setBarrier({closed:false,transactionId:pp.transactionId,planHash:pp.hash});
      report('business-open');
      return result(pp,await control.checkpoint(),cleanup);
    }catch(e){lifecycle.publish({phase:'failed',after:phase,code:safeError(e),errorType:['TypeError','ReferenceError','RangeError'].includes(e?.name)?e.name:'Error',ioCode:['EPERM','EACCES','EEXIST','ENOENT','EBUSY','EINVAL','EIO'].includes(e?.code)?e.code:null,transactionId:pp.transactionId,planHash:pp.hash});throw Object.assign(new Error(safeError(e)),{code:safeError(e),transactionId:pp.transactionId,storageRoot:pp.storageRoot});}
    finally{
      // Every held resource gets a release attempt even when an earlier close
      // fails. Return only a body-free code; stale ownership stays recoverable.
      let closeFailed=false;
      for(const resource of [lease,budgetLease,control,c,admission])try{await resource?.close();}catch{closeFailed=true;}
      if(closeFailed)fail('P2_ADOPTION_RELEASE_PENDING');
    }
  }
  return {publishPlan:createPlan,
    async publicationImpact(pp){await ensurePlan(pp);return {planHash:pp.hash,storageRoot:pp.storageRoot,epoch:pp.epoch,configPath:pp.request.configPath,
      artifact:{path:pp.inputs.artifact.path,version:pp.inputs.artifact.version,sha256:pp.inputs.artifact.sha256},selectedRecords:pp.preparation.selection.provenance.entries.length};},
    async publicationStatus(input){
      const control=await openControl({storageRoot:input.storageRoot,mode:'maintenance'});
      try{const cp=await control.checkpoint();if(cp.adoption?.origin.transactionId!==input.transactionId)fail('P2_ADOPTION_PLAN_CHANGED');
        const pp=await json(planPath({storageRoot:input.storageRoot,transactionId:input.transactionId,hash:cp.adoption.origin.planHash}));await ensurePlan(pp);
        if(cp.adoption.status==='adopted')return result(pp,cp,{status:cp.barrier.closed?'requires-recovery':'completed-before-business-open',complete:!cp.barrier.closed});
        return {status:'adoption_recovery_required',transactionId:pp.transactionId,epoch:cp.epoch,planHash:pp.hash,businessWrites:'blocked',pendingOperations:cp.pending.length,
          historyCoverage:cp.historyCoverage,expiresAt:pp.expiresAt,copyRetention:clock()>=pp.expiresAt?'expired-recovery-dependency':'recovery-dependency'};
      }finally{await control.close();}
    },
    async publish(pp,exactHash,{acceptNewUse=false,acceptBusinessOpen=false,...options}={}){
      if(pp?.kind!=='adoption-publication-v1')fail('P2_ADOPTION_NOT_READY');
      if(exactHash!==pp.hash||!acceptNewUse||!acceptBusinessOpen)fail('P2_ADOPTION_PUBLICATION_CONFIRMATION');
      return execute(pp,options,false);
    },recoverPublication:(pp,options)=>execute(pp,options,true)};
}
