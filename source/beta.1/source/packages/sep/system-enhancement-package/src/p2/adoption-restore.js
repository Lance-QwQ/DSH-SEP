import {readFile,readdir,mkdir,open,lstat,rename,unlink,realpath} from 'node:fs/promises';
import {join,dirname,resolve,relative,isAbsolute,sep,basename,parse} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {channel} from 'node:diagnostics_channel';
import {openControl,DATA_DOMAINS} from './control.js';
import {assertDocumentDeletionProtocol} from './document-governance.js';
import {inspectRestore} from './backups.js';
import {inspectArtifact,fingerprintFiles,canonicalIdentity,installProfile} from './artifacts.js';
import {bindInstallInputs} from './install-inputs.js';
import {healthProfile} from './health.js';
import {adoptionHealthRuntime} from './adoption-health.js';
import {acquireAdoptionAdmission} from './adoption-admission.js';
import {acquireAdoptionBudgetLease} from './adoption-budget.js';

const sha=b=>createHash('sha256').update(b).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>sha(JSON.stringify(stable(v))),same=(a,b)=>digest(a)===digest(b);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const changed=()=>fail('P2_ADOPTION_RESTORE_PLAN_CHANGED');
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const kind='adoption-first-baseline-restore',lifecycle=channel('dsh.adoption.restore');
const suiteRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const inside=(a,b)=>{const r=relative(a,b);return r===''||r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
async function absent(path){try{await lstat(path);return false;}catch(e){if(e.code==='ENOENT')return true;throw e;}}
async function pathSafe(path,{missing=false,directory=false}={}){
  if(!isAbsolute(path??''))fail('P2_ADOPTION_RESTORE_INPUT');
  for(let p=resolve(path);;p=dirname(p)){
    try{const s=await lstat(p);if(s.isSymbolicLink()||p!==resolve(path)&&!s.isDirectory()||p===resolve(path)&&(!directory&&(!s.isFile()||s.nlink!==1)||directory&&!s.isDirectory()))changed();}
    catch(e){if(!missing||e.code!=='ENOENT')throw e;}
    if(dirname(p)===p)break;
  }
  return resolve(path);
}
async function fingerprint(paths){for(const p of paths)await pathSafe(p,{missing:true});return fingerprintFiles(paths);}
async function durable(path,bytes){await pathSafe(path,{missing:true});await mkdir(dirname(path),{recursive:true});const f=await open(path,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}}
async function syncDirectory(path){if(process.platform!=='win32'){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}}
async function closeAll(...resources){let failure;for(const r of resources)try{await r?.close();}catch(e){failure??=e;}if(failure)throw failure;}
async function implementation(){const paths=[join(suiteRoot,'package.json'),join(suiteRoot,'cordis.patch.yml')];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())changed();if(e.isDirectory())await walk(join(dir,e.name));else paths.push(join(dir,e.name));}}await walk(join(suiteRoot,'src'));return fingerprint(paths.sort());}
const event=(cp,p,type)=>cp.events.findLast(e=>e.type===type&&e.payload.planHash===p.hash&&e.payload.transactionId===p.id);
const origin=pp=>({transactionId:pp.transactionId,planHash:pp.hash,epoch:pp.epoch,sourceHash:pp.preparation.manifest.sourceHash,selectionHash:digest(pp.preparation.selection),rulesHash:digest(pp.inputs.code),confirmationHash:pp.hash,restrictionHash:digest(pp.restrictions)});
function adopted(cp){if(cp.coverage!=='governed-adoption-origin'||cp.adoption?.status!=='adopted'||cp.adoption.firstBaseline?.status!=='ready'||!cp.adoption.openedAt||cp.epoch!==cp.adoption.origin.epoch)fail('P2_ADOPTION_RESTORE_BASELINE_REQUIRED');}
function business(cp,B){if(cp.businessSeq!==B||cp.pending.some(v=>v.kind!=='maintenance'))fail('P2_ADOPTION_RESTORE_NEW_BUSINESS');}
function compatibility(version){return {from:version,to:version,rule:{id:'original-adopted-generation-v1',from:version,to:version,approvedSemanticChecks:['Exact original committed adoption baseline and sealed artifact; current deletion authority is replayed.']}};}
function valid(p){
  if(!p||p.kind!==kind||p.version!==1||!UUID.test(p.id??'')||!HASH.test(p.hash??'')||!isAbsolute(p.storageRoot??'')||p.directory!==join(p.storageRoot,'.suite-memory','p2','updates',p.id)||p.planPath!==join(p.directory,'plan.json'))changed();
  const {hash,...body}=p;if(sha(JSON.stringify(body))!==hash)changed();return p;
}
async function readPlan(p){valid(p);await pathSafe(p.planPath);if(!await absent(join(p.directory,'invalidated.json')))fail('P2_PLAN_INVALIDATED');const saved=JSON.parse(await readFile(p.planPath,'utf8'));valid(saved);if(!same(p,saved))changed();return saved;}

/** Dedicated restoration of the original adopted generation. Dependencies are
 * trusted local adapters, not CLI/model input. Source and budget are never copied. */
export function createAdoptionBaselineRestore({installer,health}={}){
  const nativeInstaller=!installer;
  installer??=async({plan,profileRoot,version})=>{
    const artifact=plan.artifact,manifest=plan.files.find(f=>f.role==='manifest'),lock=plan.files.find(f=>f.role==='lock');
    const manifestBytes=await readFile(manifest.stagedPath),lockBytes=await readFile(lock.stagedPath),bound=bindInstallInputs({manifestBytes,lockBytes,artifact});
    const logs=join(plan.directory,'logs','install-'+randomUUID());await mkdir(logs,{recursive:true});
    const manifestPath=join(logs,'package.json'),lockfilePath=join(logs,'pnpm-lock.yaml');await durable(manifestPath,bound.manifestBytes);await durable(lockfilePath,bound.lockBytes);
    // installProfile temporarily consumes sealed references. A durable intent
    // explicitly accounts for those two exact intermediate metadata hashes.
    let processTreeUnknown=false;
    try{return await installProfile({...plan.runtime,profileRoot,artifact,expectedVersion:version,manifestPath,lockfilePath,logDirectory:logs});}
    catch(error){processTreeUnknown=error.code==='P2_PROCESS_TREE_UNKNOWN';throw error;}
    finally{if(!processTreeUnknown){await replace(plan,manifest,manifestBytes);await replace(plan,lock,lockBytes);}}
  };
  health??=healthProfile;
  async function replace(p,f,bytes){
    const root=join(p.directory,'validation',f.role==='domain'?'storage':'profile');await mkdir(root,{recursive:true});
    const temporary=join(root,f.role==='domain'?basename(f.path):'metadata-'+p.files.indexOf(f)+'.bin');
    await pathSafe(f.path,{missing:true});await pathSafe(temporary,{missing:true});
    if(!await absent(temporary)){if(sha(await readFile(temporary))!==sha(bytes))changed();}else await durable(temporary,bytes);
    await rename(temporary,f.path);await syncDirectory(dirname(f.path));
  }
  async function publication(cp,c){
    const path=join(c.root,'adoption-publications',cp.adoption.origin.transactionId,cp.adoption.origin.planHash+'.json');await pathSafe(path);
    const pp=JSON.parse(await readFile(path,'utf8')),{hash,...body}=pp;
    if(digest(body)!==hash||hash!==cp.adoption.origin.planHash||!same(origin(pp),cp.adoption.origin))changed();
    const artifact=await inspectArtifact(join(c.root,'artifacts',pp.inputs.artifact.sha256+'.tgz'),{expectedSha256:pp.inputs.artifact.sha256});
    if(artifact.manifest.dshSuiteAdoptionProtocol!==1||artifact.manifest.dshSuiteMaintenanceProtocol!==1)fail('P2_ADOPTION_PROTOCOL_REQUIRED');
    assertDocumentDeletionProtocol(cp,artifact);
    return {pp,path,artifact};
  }
  async function inspect(cp,c){
    adopted(cp);const {pp,path,artifact}=await publication(cp,c);
    const result=await inspectRestore({snapshotDirectory:cp.adoption.firstBaseline.directory,deletions:{verified:true,checkpoint:cp},compatibility:compatibility(artifact.manifest.version),excludedPaths:[pp.preparation.request.budgetPath,join(c.root,'journal.jsonl'),c.headPath]});
    if(result.manifest.baseline.planHash!==cp.adoption.origin.planHash||result.manifest.baseline.businessSeq!==cp.adoption.commit.businessSeq)changed();
    business(cp,result.manifest.baseline.businessSeq);
    return {...result,pp,publicationPath:path,artifact};
  }
  async function scoped(p,c,fn,options={}){
    await readPlan(p);let admission,control,budget;
    try{
      admission=await acquireAdoptionAdmission({storageRoot:p.storageRoot,transactionId:p.id,recoverLockToken:options.admissionRecoverToken});
      control=await openControl({storageRoot:p.storageRoot,mode:'maintenance',recoverLockToken:options.recoverLockToken});
      budget=await acquireAdoptionBudgetLease({budgetPath:p.budgetPath,config:p.runtime.suiteConfig,transactionId:p.id,recoverLockToken:options.budgetRecoverToken});
      return await fn(control,budget,admission);
    }finally{await closeAll(budget,control,admission);}
  }
  async function fixed(p,c,budget){
    await readPlan(p);const cp=await c.checkpoint();adopted(cp);business(cp,p.baseline.businessSeq);
    if(cp.identity!==p.baseline.identity||cp.epoch!==p.epoch||!same(cp.adoption,p.adoption)||cp.deletionSeq!==p.baseline.deletionSeq||!same(cp.deletions,p.deletions))changed();
    if(!same(await canonicalIdentity(p.profileRoot),p.profileIdentity)||!same(await fingerprint(p.staticFingerprints.map(f=>f.path)),p.staticFingerprints)||!same(await implementation(),p.implementation)||!same(await adoptionHealthRuntime(p.runtime),p.native))changed();
    for(const parent of p.parents)if(!same(await canonicalIdentity(parent.canonicalPath),parent))changed();
    if(!same((await budget.inspect()).fingerprint,p.budgetFingerprint))changed();
    const inspected=await inspect(cp,c);
    if(inspected.artifact.sha256!==p.artifact.sha256||inspected.manifest.checksum!==p.snapshotChecksum||!same(inspected.files.map(f=>({id:f.id,path:f.path,role:f.role,exists:f.exists,sha256:f.sha256})),p.files.map(({id,path,role,exists,sha256})=>({id,path,role,exists,sha256}))))changed();
    for(const f of p.files)if(f.exists){await pathSafe(f.stagedPath);if(sha(await readFile(f.stagedPath))!==f.sha256)changed();}
    return cp;
  }
  async function precheck(p,c,budget){const cp=await fixed(p,c,budget);if(cp.pending.length||cp.barrier.closed)fail('P2_RECOVERY_REQUIRED');if(!same(await fingerprint(p.files.map(f=>f.path)),p.beforeFingerprints))changed();await domainEvidence(p,cp);return cp;}
  async function domainEvidence(p,cp){
    const actual=await fingerprint(DATA_DOMAINS.map(n=>join(p.storageRoot,n+'.json')));
    for(const [i,f]of actual.entries()){
      if(f.sha256===(cp.dataFingerprints[DATA_DOMAINS[i]]??null))continue;
      const planned=p.files.find(v=>v.path===f.path);
      if(!planned||!cp.pending.some(v=>v.kind==='maintenance'&&v.transactionId===p.id&&v.file===planned.id)||f.sha256!==planned.sha256)fail('P2_UNTRACKED_WRITE');
    }
  }
  async function published(p){const actual=await fingerprint(p.files.map(f=>f.path));if(p.files.some((f,i)=>f.exists!==actual[i].exists||f.sha256!==actual[i].sha256))changed();return actual;}
  async function installed(p){
    try{
      const root=await realpath(join(p.profileRoot,'node_modules',p.artifact.manifest.name));if(!inside(p.profileRoot,root))fail('P2_INSTALLED_MISMATCH');
      for(const member of p.artifact.members.filter(m=>m.type==='file')){
        const path=join(root,...member.path.split('/').slice(1)),actual=await realpath(path),info=await lstat(path);
        if(!inside(root,actual)||!info.isFile()||info.isSymbolicLink()||sha(await readFile(actual))!==member.sha256)fail('P2_INSTALLED_MISMATCH');
      }
    }catch{fail('P2_INSTALLED_MISMATCH');}
  }
  function emit(p,phase,extra={}){lifecycle.publish({phase,transactionId:p.id,planHash:p.hash,...extra});}
  async function checkedHealth(p,c,budget){
    await fixed(p,c,budget);await published(p);await installed(p);const version=p.artifact.manifest.version,before=await fingerprint([...p.files.map(f=>f.path),p.budgetPath]);let proof;
    try{proof=await health({plan:{...p,candidate:p.artifact,directory:join(p.directory,'logs')},profileRoot:p.profileRoot,storageRoot:p.storageRoot,phase:'first-baseline',version});}
    finally{if(!same(before,await fingerprint([...p.files.map(f=>f.path),p.budgetPath])))fail('P2_UNTRACKED_WRITE');}
    if(proof?.version!==version)fail('P2_HEALTH_FAILED');await published(p);await fixed(p,c,budget);let cp=await c.checkpoint();await domainEvidence(p,cp);if(cp.pending.length)fail('P2_RECOVERY_REQUIRED');
    await c.event('first_baseline_restore_health',{transactionId:p.id,planHash:p.hash,success:true,version});emit(p,'health-verified');
    // A crash or external change after health is never inferred to be a commit.
    await fixed(p,c,budget);await published(p);await installed(p);cp=await c.checkpoint();await domainEvidence(p,cp);if(cp.pending.length)fail('P2_RECOVERY_REQUIRED');return cp;
  }
  const result=(p,cp)=>({status:'first_baseline_restored',businessWrites:'open',epoch:cp.epoch,adoptedAt:cp.adoption.adoptedAt,firstBaseline:cp.adoption.firstBaseline,restorePlanHash:p.hash,baselineHash:p.snapshotChecksum,cleanup:{status:'retained-governed-update-staging',bodyCopies:'retained',deletionGoverned:true}});
  async function execute(p,recovery,options={}){return scoped(p,null,async(c,budget,admission)=>{
    let cp=await c.checkpoint(),started=event(cp,p,'first_baseline_restore_started');const commit=event(cp,p,'committed');
    if(recovery&&!started&&cp.barrier.closed&&cp.barrier.transactionId===p.id&&cp.barrier.planHash===p.hash&&event(cp,p,'first_baseline_restore_confirmed')){
      await fixed(p,c,budget);if(cp.pending.length||!same(await fingerprint(p.files.map(f=>f.path)),p.beforeFingerprints))changed();
      started=await c.event('first_baseline_restore_started',{transactionId:p.id,planHash:p.hash,kind});
    }
    if(recovery&&!started)fail('P2_ADOPTION_RESTORE_NOT_STARTED');
    if(!event(cp,p,'first_baseline_restore_confirmed'))fail('P2_ADOPTION_RESTORE_CONFIRMATION');
    if(!started){
      cp=await precheck(p,c,budget);emit(p,'checking');
      await c.setBarrier({closed:true,transactionId:p.id,planHash:p.hash});
      await c.event('first_baseline_restore_started',{transactionId:p.id,planHash:p.hash,kind});emit(p,'started');
    }else{
      await fixed(p,c,budget);
      if(commit&&!cp.barrier.closed){await published(p);await installed(p);await domainEvidence(p,cp);return result(p,cp);}
      if(!cp.barrier.closed||cp.barrier.transactionId!==p.id||cp.barrier.planHash!==p.hash)fail('P2_RECOVERY_REQUIRED');
      if(event(cp,p,'first_baseline_restore_failed')?.payload.code==='P2_PROCESS_TREE_UNKNOWN')fail('P2_PROCESS_TREE_UNKNOWN');
    }
    try{
      if(!commit){
        cp=await c.checkpoint();await domainEvidence(p,cp);
        if(cp.pending.some(v=>v.kind!=='maintenance'||v.transactionId!==p.id||!p.files.some(f=>f.id===v.file)&&v.file!=='install'))fail('P2_RECOVERY_REQUIRED');
        // A dead maintenance parent does not prove that its real pnpm descendants
        // stopped. Synthetic trusted adapters have no native process tree.
        if(nativeInstaller&&cp.pending.some(v=>v.transactionId===p.id&&v.file==='install'))fail('P2_PROCESS_TREE_UNKNOWN');
        for(const [i,f]of p.files.entries()){
          await fixed(p,c,budget);cp=await c.checkpoint();const actual=(await fingerprint([f.path]))[0],before=p.beforeFingerprints[i];
          const completed=cp.events.some(e=>e.type==='first_baseline_restore_file'&&e.payload.planHash===p.hash&&e.payload.fileIndex===i);
          const pending=cp.pending.filter(v=>v.transactionId===p.id&&v.file===f.id),installPending=cp.pending.some(v=>v.transactionId===p.id&&v.file==='install');
          const expected=actual.exists===f.exists&&actual.sha256===f.sha256,original=actual.exists===before.exists&&actual.sha256===before.sha256;
          const installIntermediate=installPending&&p.installIntermediate[f.role]===actual.sha256;
          if(completed&&!expected&&!installIntermediate||!completed&&!expected&&!original)changed();
          if(!completed||installIntermediate){
            await c.maintenance({transactionId:p.id,file:f.id},async()=>{
              emit(p,'file-intent',{fileIndex:i});
              if(f.exists)await replace(p,f,await readFile(f.stagedPath));else if(!await absent(f.path))await unlink(f.path);
              emit(p,'file-durable',{fileIndex:i});
            });
            if(pending.length)await c.event('recovered_intents',{operationIds:pending.map(v=>v.operationId)});
            await c.event('first_baseline_restore_file',{transactionId:p.id,planHash:p.hash,fileIndex:i,sha256:f.sha256});emit(p,'file-complete',{fileIndex:i});
          }else if(pending.length)await c.event('recovered_intents',{operationIds:pending.map(v=>v.operationId)});
        }
        await fixed(p,c,budget);await published(p);const version=p.artifact.manifest.version;
        await c.maintenance({transactionId:p.id,file:'install'},async()=>{await installer({plan:p,profileRoot:p.profileRoot,version,direction:'baseline'});});
        cp=await c.checkpoint();const installPending=cp.pending.filter(v=>v.transactionId===p.id&&v.file==='install');if(installPending.length)await c.event('recovered_intents',{operationIds:installPending.map(v=>v.operationId)});
        await c.event('first_baseline_restore_installed',{transactionId:p.id,planHash:p.hash,version,artifactSha256:p.artifact.sha256});emit(p,'installed');
        cp=await checkedHealth(p,c,budget);
        await c.event('committed',{transactionId:p.id,planHash:p.hash,kind,epoch:p.epoch,baselineChecksum:p.snapshotChecksum,artifactSha256:p.artifact.sha256,health:{success:true,version,dataFingerprints:cp.dataFingerprints}});emit(p,'committed');
      }else await checkedHealth(p,c,budget);
      await admission.assertOwned();await fixed(p,c,budget);await published(p);await installed(p);cp=await c.checkpoint();await domainEvidence(p,cp);
      if(!event(cp,p,'committed')||cp.pending.length)fail('P2_COMMIT_REQUIRED');
      await c.setBarrier({closed:false,transactionId:p.id,planHash:p.hash});emit(p,'business-open');return result(p,await c.checkpoint());
    }catch(e){await c.event('first_baseline_restore_failed',{transactionId:p.id,planHash:p.hash,code:/^P2_[A-Z_]+$/.test(e.code??'')?e.code:'P2_ADOPTION_RESTORE_IO'});throw e;}
  },options);}
  return {
    async prepare(input){
      if(!input||!isAbsolute(input.storageRoot??'')||!isAbsolute(input.profileRoot??'')||!input.runtime)fail('P2_ADOPTION_RESTORE_INPUT');
      const id=randomUUID();let admission,c,budget;
      try{
        admission=await acquireAdoptionAdmission({storageRoot:input.storageRoot,transactionId:id});c=await openControl({storageRoot:input.storageRoot,mode:'maintenance'});
        const cp=await c.checkpoint();adopted(cp);business(cp,cp.adoption.commit.businessSeq);if(cp.pending.length||cp.barrier.closed)fail('P2_RECOVERY_REQUIRED');
        const inspected=await inspect(cp,c),profileRoot=await pathSafe(input.profileRoot,{directory:true}),storageRoot=c.storageRoot;
        if(inside(profileRoot,fileURLToPath(import.meta.url)))fail('P2_CONTROLLER_IN_TARGET');
        const configFile=inspected.files.findIndex(f=>f.role==='config'),config=JSON.parse(inspected.payloads[configFile]),budgetPath=inspected.pp.preparation.request.budgetPath;
        if(!config.p2?.enabled||resolve(config.p2.storageRoot)!==storageRoot)fail('P2_WRITER_COVERAGE_REQUIRED');
        const runtime={...input.runtime,suiteConfig:config};for(const k of ['nodePath','pnpmPath','hostLibraryRoot'])if(!isAbsolute(runtime[k]??''))fail('P2_ADOPTION_RESTORE_INPUT');
        const native=await adoptionHealthRuntime(runtime);
        budget=await acquireAdoptionBudgetLease({budgetPath,config,transactionId:id});const budgetProof=await budget.inspect();
        const directory=join(c.root,'updates',id),planPath=join(directory,'plan.json');
        const files=inspected.files.map(({payload,...f},i)=>({...f,stagedPath:join(directory,`input-${i}.bin`)}));
        if(files.length!==6||files.some(f=>f.role==='domain'?dirname(f.path)!==storageRoot:!inside(profileRoot,f.path)))fail('P2_ADOPTION_RESTORE_INPUT');
        if(parse(profileRoot).root.toLowerCase()!==parse(storageRoot).root.toLowerCase())fail('P2_ADOPTION_RESTORE_VOLUME');
        const beforeFingerprints=await fingerprint(files.map(f=>f.path));await domainEvidence({storageRoot,files:[],id:null},cp);
        const currentConfig=JSON.parse(await readFile(files[configFile].path));
        if(resolve(currentConfig.p1?.budgetPath??'')!==resolve(budgetPath)||!currentConfig.p2?.enabled||resolve(currentConfig.p2.storageRoot)!==storageRoot)fail('P2_ADOPTION_RESTORE_INPUT');
        const manifest=files.findIndex(f=>f.role==='manifest'),lock=files.findIndex(f=>f.role==='lock');
        const bound=bindInstallInputs({manifestBytes:inspected.payloads[manifest],lockBytes:inspected.payloads[lock],artifact:inspected.artifact});
        if(nativeInstaller){
          const installed=JSON.parse(await readFile(join(profileRoot,'node_modules/dsh-system-enhancement-package/package.json')));
          if(installed.dshSuiteAdoptionProtocol!==1)fail('P2_ADOPTION_PROTOCOL_REQUIRED');
        }
        const runtimePaths=[runtime.nodePath,runtime.pnpmPath,resolve(dirname(runtime.pnpmPath),'../dist/pnpm.mjs')];
        const staticFingerprints=await fingerprint([...runtimePaths,inspected.publicationPath,inspected.artifact.path]);
        const parents=await Promise.all([...new Set(files.map(f=>dirname(f.path)))].map(p=>canonicalIdentity(p)));
        const p={version:1,kind,id,directory,planPath,storageRoot,profileRoot,profileIdentity:await canonicalIdentity(profileRoot),epoch:cp.epoch,adoption:cp.adoption,
          baseline:{identity:cp.identity,coverage:cp.coverage,businessSeq:cp.businessSeq,deletionSeq:cp.deletionSeq},deletions:cp.deletions,firstBaseline:cp.adoption.firstBaseline,snapshotChecksum:inspected.manifest.checksum,
          artifact:inspected.artifact,budgetPath,budgetFingerprint:budgetProof.fingerprint,runtime,native,parents,staticFingerprints,implementation:await implementation(),beforeFingerprints,files,installIntermediate:{manifest:sha(bound.manifestBytes),lock:sha(bound.lockBytes)},createdAt:new Date().toISOString()};
        p.hash=sha(JSON.stringify(p));await mkdir(directory,{recursive:true});await durable(planPath,JSON.stringify(p,null,2));
        // Durable declaration precedes every new copy, including interrupted preparation.
        for(const [i,f]of files.entries())if(f.exists)await durable(f.stagedPath,inspected.payloads[i]);
        await precheck(p,c,budget);await c.event('first_baseline_restore_prepared',{transactionId:id,planHash:p.hash,kind});return p;
      }finally{await closeAll(budget,c,admission);}
    },
    async validate(p){return scoped(p,null,async(c,b)=>{await precheck(p,c,b);await c.event('first_baseline_restore_validated',{transactionId:p.id,planHash:p.hash,kind});return {status:'validated',planHash:p.hash};});},
    async impact(p){await readPlan(p);return {planHash:p.hash,storageRoot:p.storageRoot,profileRoot:p.profileRoot,epoch:p.epoch,firstBaseline:p.firstBaseline,artifact:{path:p.artifact.path,sha256:p.artifact.sha256,version:p.artifact.manifest.version},paths:p.files.map(f=>({path:f.path,role:f.role})),businessSeq:p.baseline.businessSeq,deletionCheckpoint:{identity:p.baseline.identity,deletionSeq:p.baseline.deletionSeq},budget:{path:p.budgetPath,restored:false},originalSource:'untouched',modelCalls:0};},
    async confirm(p,hash,options={}){return scoped(p,null,async(c,b)=>{const cp=await precheck(p,c,b);if(!event(cp,p,'first_baseline_restore_validated'))fail('P2_ADOPTION_RESTORE_VALIDATION_REQUIRED');if(hash!==p.hash||options.acceptBaselineRestore!==true||options.acceptBusinessOpen!==true)fail('P2_ADOPTION_RESTORE_CONFIRMATION');await c.event('first_baseline_restore_confirmed',{transactionId:p.id,planHash:p.hash,kind,acceptBaselineRestore:true,acceptBusinessOpen:true});return {status:'confirmed',planHash:p.hash};});},
    restore:p=>execute(p,false),recover:(p,options)=>execute(p,true,options),
    async status(p){await readPlan(p);const c=await openControl({storageRoot:p.storageRoot,mode:'maintenance'});try{const cp=await c.checkpoint();return {status:event(cp,p,'committed')?(cp.barrier.closed?'committed':'first_baseline_restored'):event(cp,p,'first_baseline_restore_started')?'recovery_required':event(cp,p,'first_baseline_restore_confirmed')?'confirmed':event(cp,p,'first_baseline_restore_validated')?'validated':'prepared',planHash:p.hash,businessWrites:cp.barrier.closed?'blocked':'open',epoch:cp.epoch};}finally{await c.close();}}
  };
}
