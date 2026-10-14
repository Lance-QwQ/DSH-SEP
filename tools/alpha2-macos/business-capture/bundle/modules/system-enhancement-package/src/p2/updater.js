import {mkdir,open,readFile,rename,unlink,realpath,stat,lstat} from 'node:fs/promises';
import {join,dirname,resolve,relative,isAbsolute,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openControl,DATA_DOMAINS} from './control.js';
import {inspectArtifact,fingerprintFiles,canonicalIdentity,installProfile,sealArtifact,checkArtifactCompatibility} from './artifacts.js';
import {captureSnapshot,verifySnapshot,prepareRestore,assertCompatibility,rotateBackups,applyDeletionGovernance} from './backups.js';
import {bindInstallInputs} from './install-inputs.js';
import {healthProfile} from './health.js';
import {assertConfigBinding} from './config-binding.js';
import {migrateLegacyDomains} from './migrations.js';
import {assertDocumentDeletionProtocol} from './document-governance.js';
import {rejectUnsupportedRecoveryMaintenance} from './recovery-maintenance.js';

const sha=x=>createHash('sha256').update(x).digest('hex');
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const inside=(root,path)=>{const r=relative(root,path);return r===''||r!=='..'&&!r.startsWith(`..${sep}`)&&!isAbsolute(r);};
const compact=cp=>({identity:cp.identity,coverage:cp.coverage,businessSeq:cp.businessSeq,deletionSeq:cp.deletionSeq,dataFingerprints:cp.dataFingerprints});
function assertAdoptionProtocol(checkpoint,...artifacts){
  assertDocumentDeletionProtocol(checkpoint,...artifacts);
  if(checkpoint.adoption&&artifacts.some(artifact=>artifact?.manifest?.dshSuiteAdoptionProtocol!==1))fail('P2_ADOPTION_PROTOCOL_REQUIRED','Adopted stores require explicit adopted-origin controller support in both target and recovery code');
}
async function durable(path,bytes,{replace=false}={}){
  await mkdir(dirname(path),{recursive:true});const temp=replace?`${path}.${randomUUID()}.tmp`:path;
  const f=await open(temp,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}
  if(replace)await rename(temp,path);
}
async function fingerprint(paths){return fingerprintFiles([...new Set(paths)]);}
function validPlan(p){const {hash,...body}=p;if(!/^[a-f0-9]{64}$/.test(hash??'')||sha(JSON.stringify(body))!==hash)fail('P2_PLAN_CHANGED');rejectUnsupportedRecoveryMaintenance(p.runtime?.suiteConfig);rejectUnsupportedRecoveryMaintenance(p.runtime?.currentSuiteConfig);return p;}
async function readPlan(p){validPlan(p);try{await lstat(join(p.directory,'invalidated.json'));fail('P2_PLAN_INVALIDATED');}catch(e){if(e.code!=='ENOENT')throw e;}const saved=JSON.parse(await readFile(p.planPath,'utf8'));validPlan(saved);if(!same(p,saved))fail('P2_PLAN_CHANGED');return saved;}
const records=(cp,p,type)=>cp.events.filter(e=>e.type===type&&e.payload.planHash===p.hash);

/** Independent maintenance controller. Installer/health adapters are trusted local
 * application dependencies, never tools or commands chosen by model output. */
export function createMaintenance({installer,health}={}){
  const nativeInstaller=!installer;
  installer??=async({plan,profileRoot,version,direction})=>{
    const artifact=direction==='old'?plan.current:plan.candidate;
    const manifestPath=join(profileRoot,'package.json'),lockfilePath=join(profileRoot,'pnpm-lock.yaml');
    const manifestBytes=await readFile(manifestPath),lockBytes=await readFile(lockfilePath);
    const bound=bindInstallInputs({manifestBytes,lockBytes,artifact});
    const logDirectory=join(plan.directory,'logs',`${direction}-${randomUUID()}`);await mkdir(logDirectory,{recursive:true});
    const inputManifest=join(logDirectory,'package.json'),inputLock=join(logDirectory,'pnpm-lock.yaml');
    await durable(inputManifest,bound.manifestBytes);await durable(inputLock,bound.lockBytes);
    try{return await installProfile({...plan.runtime,profileRoot,artifact,expectedVersion:version,manifestPath:inputManifest,lockfilePath:inputLock,logDirectory});}
    finally{
      // Reinstating old metadata may retain its original local reference. Only
      // the sealed equivalent was consumed while materializing the package.
      await durable(manifestPath,manifestBytes,{replace:true});await durable(lockfilePath,lockBytes,{replace:true});
    }
  };
  health??=healthProfile;
  async function owned(p,fn,options={}){
    await readPlan(p);const c=await openControl({storageRoot:p.storageRoot,mode:'maintenance',...options});
    try{return await fn(c);}finally{await c.close();}
  }
  async function recheck(p,c){
    assertAdoptionProtocol(await c.checkpoint(),p.current,p.candidate);
    await assertDomainEvidence(p,c);
    if(!same(await fingerprint(p.fingerprints.map(f=>f.path)),p.fingerprints)||!same(compact(await c.checkpoint()),p.baseline))fail('P2_PLAN_CHANGED');
    for(const f of p.files)if(f.exists&&sha(await readFile(f.stagedPath))!==f.sha256)fail('P2_PLAN_CHANGED');
    if(!same(await canonicalIdentity(p.profileRoot),p.profileIdentity)||c.identity!==p.baseline.identity)fail('P2_PLAN_CHANGED');
  }
  async function rotate(p,c){
    try{
      const cp=await c.checkpoint(),byId=new Map();
      for(const e of cp.events.filter(e=>e.type==='committed'))if(!byId.has(e.payload.transactionId))byId.set(e.payload.transactionId,{id:e.payload.transactionId,directory:join(c.root,'backups',e.payload.transactionId),status:'committed',committedAt:e.at});
      const generations=[];for(const g of byId.values()){try{await stat(g.directory);generations.push(g);}catch(e){if(e.code!=='ENOENT')throw e;}}
      const result=await rotateBackups({directory:join(c.root,'backups'),generations,retain:3,pinned:[p.id]});
      await c.event('backup_rotation',{transactionId:p.id,planHash:p.hash,...result});return {status:'complete',...result};
    }catch(e){await c.event('backup_rotation_pending',{transactionId:p.id,planHash:p.hash,error:e.code??e.message});return {status:'pending',error:e.code??e.message};}
  }
  async function assertDomainEvidence(p,c){
    const cp=await c.checkpoint();
    for(const name of DATA_DOMAINS){
      const path=join(p.storageRoot,name+'.json');const [actual]=await fingerprint([path]);
      if(actual.sha256===(cp.dataFingerprints[name]??null))continue;
      const planned=p.files.find(f=>f.path===path);
      const explained=planned&&cp.pending.some(v=>v.kind==='maintenance'&&v.transactionId===p.id&&v.file===planned.id)&&actual.sha256===planned.sha256;
      if(!explained)fail('P2_UNTRACKED_WRITE','Data changed outside a durable maintenance intent; preserve the latest files');
    }
  }
  async function assertPublished(files){
    const actual=await fingerprint(files.map(f=>f.path));
    if(files.some((f,i)=>f.exists!==actual[i].exists||f.sha256!==actual[i].sha256))fail('P2_PUBLICATION_MISMATCH','Installed files differ from the approved publication manifest');
    return actual;
  }
  async function checkedHealth(args){
    const paths=args.plan.files.map(f=>f.role==='domain'?join(args.storageRoot,f.path.split(/[\\/]/).at(-1)):join(args.profileRoot,relative(args.plan.profileRoot,f.path)));
    paths.push(args.plan.budgetPath);const before=await fingerprint(paths);let proof;
    // Native health emits metadata below plan.directory/health. Keep it inside
    // the update's declared logs tree so permanent-deletion cleanup can still
    // account for every top-level member without trusting unknown directories.
    try{proof=await health({...args,plan:{...args.plan,directory:join(args.plan.directory,'logs')}});}finally{if(!same(before,await fingerprint(paths)))fail('P2_UNTRACKED_WRITE','Read-only health changed a planned file or budget');}
    if(proof?.version!==args.version)fail('P2_HEALTH_FAILED','Health result must identify the exact installed version');
    return proof;
  }
  async function publish(files,c,transactionId){
    for(const f of files){
      await c.maintenance({transactionId,file:f.id},async()=>{
        if(f.exists){const bytes=await readFile(f.stagedPath);if(sha(bytes)!==f.sha256)fail('P2_PLAN_CHANGED');await durable(f.path,bytes,{replace:true});}
        else{try{await unlink(f.path);}catch(e){if(e.code!=='ENOENT')throw e;}}
      });
      await c.event('file_published',{transactionId,id:f.id,sha256:f.sha256,exists:f.exists});
    }
  }
  async function restore(p,c,cause){
    await assertDomainEvidence(p,c);
    let cp=await c.checkpoint();
    if(cp.businessSeq!==p.baseline.businessSeq||cp.pending.some(v=>v.kind==='business'))fail('P2_RECOVERY_REQUIRED','Business writes or uncertain business intents forbid old snapshots');
    if(!same(await fingerprint([p.budgetPath]),p.budgetFingerprint))fail('P2_RECOVERY_REQUIRED','Budget state changed; do not restore or retry unknown requests');
    const snapshot=await verifySnapshot(p.snapshotDirectory);
    if(snapshot.baseline.planHash!==p.hash)fail('P2_SNAPSHOT_CORRUPT');
    const prepared=await prepareRestore({snapshotDirectory:p.snapshotDirectory,outputDirectory:join(p.directory,`restore-${randomUUID()}`),
      deletions:{verified:true,checkpoint:cp},compatibility:{from:p.current.manifest.version,to:p.candidate.manifest.version,rule:p.compatibilityRule},
      excludedPaths:[p.budgetPath,join(c.root,'journal.jsonl'),c.headPath]});
    await publish(prepared.files,c,p.id);
    const install=await installer({plan:p,profileRoot:p.profileRoot,version:p.current.manifest.version,direction:'old'});
    const proof=await checkedHealth({plan:p,profileRoot:p.profileRoot,storageRoot:p.storageRoot,phase:'rollback',version:p.current.manifest.version});
    await assertPublished(prepared.files);
    await assertDomainEvidence(p,c);
    cp=await c.checkpoint();const pending=cp.pending.filter(v=>v.kind==='maintenance');
    if(pending.length)await c.event('recovered_intents',{operationIds:pending.map(v=>v.operationId)});
    const legacyReadOnly=Boolean(cp.adoption&&p.current.manifest.dshSuiteAdoptionProtocol!==1)||nativeInstaller&&!(p.current.manifest.dshSuiteMaintenanceProtocol===1&&p.runtime.currentSuiteConfig?.p2?.enabled);
    await c.event('rolled_back',{transactionId:p.id,planHash:p.hash,legacyReadOnly,cause:String(cause?.code??cause?.message??cause),install,health:proof,files:await fingerprint(p.files.map(f=>f.path))});
    if(!legacyReadOnly)await c.setBarrier({closed:false,transactionId:p.id,planHash:p.hash});
    return {status:'rolled_back',planHash:p.hash,businessWrites:legacyReadOnly?'blocked-legacy-version':'open'};
  }
  return {
    async prepare(input){
      rejectUnsupportedRecoveryMaintenance(input?.runtime?.suiteConfig);
      rejectUnsupportedRecoveryMaintenance(input?.runtime?.currentSuiteConfig);
      for(const key of ['storageRoot','profileRoot','budgetPath','currentArtifact','candidateArtifact'])if(!isAbsolute(input[key]??''))fail('P2_CONFIG',key);
      const c=await openControl({storageRoot:input.storageRoot,mode:'maintenance'});
      try{
        const cp=await c.checkpoint();const lastRollback=cp.events.findLast(e=>e.type==='rolled_back');
        if(cp.pending.length||cp.barrier.closed&&!(lastRollback?.payload.legacyReadOnly&&lastRollback.payload.transactionId===cp.barrier.transactionId))fail('P2_RECOVERY_REQUIRED');
        const profileRoot=await realpath(input.profileRoot),storageRoot=c.storageRoot;
        if(inside(profileRoot,fileURLToPath(import.meta.url)))fail('P2_CONTROLLER_IN_TARGET');
        await assertDomainEvidence({storageRoot,files:[],id:null},c);
        if(nativeInstaller){
          await assertConfigBinding({files:input.files,runtime:input.runtime,phase:'current'});
          await assertConfigBinding({files:input.files,runtime:input.runtime,phase:'candidate'});
        }
        const inspectedCurrent=await inspectArtifact(input.currentArtifact),inspectedCandidate=await inspectArtifact(input.candidateArtifact);
        assertAdoptionProtocol(cp,inspectedCurrent,inspectedCandidate);
        const current=await sealArtifact(input.currentArtifact,join(c.root,'artifacts'),inspectedCurrent.sha256);
        const candidate=await sealArtifact(input.candidateArtifact,join(c.root,'artifacts'),inspectedCandidate.sha256);
        if(nativeInstaller){
          const packageRoot=await realpath(join(profileRoot,'node_modules',current.manifest.name));
          for(const m of current.members.filter(m=>m.type==='file')){
            const path=await realpath(join(packageRoot,...m.path.split('/').slice(1)));
            if(!inside(packageRoot,path)||sha(await readFile(path))!==m.sha256)fail('P2_CURRENT_PACKAGE_CHANGED');
          }
          if(!input.runtime.suiteConfig.p2?.enabled||await realpath(input.runtime.suiteConfig.p2.storageRoot)!==storageRoot)fail('P2_WRITER_COVERAGE_REQUIRED');
        }
        assertCompatibility({from:current.manifest.version,to:candidate.manifest.version,rule:input.compatibilityRule});
        if(/0\.1\.0-alpha\.[45]$/.test(candidate.manifest.version))fail('P2_COMPATIBILITY_UNKNOWN','Four-layer storage cannot be handed to pre-four-layer code');
        const compatibility=await checkArtifactCompatibility(current,candidate,input.compatibilityRule);
        if(!compatibility.restoreSupported)fail('P2_COMPATIBILITY_UNKNOWN','First maintenance release requires an explicitly supported recovery direction');
        if(current.dependencyFingerprint!==candidate.dependencyFingerprint)fail('P2_DEPENDENCY_REVIEW_REQUIRED');
        const id=randomUUID(),directory=join(c.root,'updates',id),planPath=join(directory,'plan.json');await mkdir(directory,{recursive:true});
        const selected=input.files;if(!Array.isArray(selected)||!selected.length)fail('P2_CONFIG');
        const manifestFiles=selected.filter(f=>f.role==='manifest'),lockFiles=selected.filter(f=>f.role==='lock');
        if(manifestFiles.length!==1||lockFiles.length!==1)fail('P2_CONFIG');
        const bound=bindInstallInputs({manifestBytes:await readFile(manifestFiles[0].source),lockBytes:await readFile(lockFiles[0].source),artifact:candidate});
        let migration;const migratedBytes=new Map();
        if(input.migration!==undefined){
          const request=input.migration;
          if(!request||Object.keys(request).some(k=>!['id','now'].includes(k))||request.id!=='alpha5-legacy-to-four-layer-v1')fail('P2_MIGRATION_CONFIG');
          if(input.compatibilityRule.migrationId!==request.id)fail('P2_MIGRATION_REVIEW_REQUIRED');
          const config=input.runtime?.suiteConfig;
          if(!config?.memoryLayers?.enabled||config.memoryLayers.migrateLegacy||!Array.isArray(config.projects))fail('P2_MIGRATION_CONFIG','Migration runs in staging; target health must not perform migration writes');
          const domainFiles=DATA_DOMAINS.map(name=>{
            const matches=selected.filter(f=>f.role==='domain'&&f.path===join(storageRoot,name+'.json'));
            if(matches.length!==1||!isAbsolute(matches[0].source??''))fail('P2_MIGRATION_CONFIG');return matches[0];
          });
          const before=await fingerprint(domainFiles.map(f=>f.source));
          const originals=await Promise.all(domainFiles.map(async(f,i)=>before[i].exists?JSON.parse(await readFile(f.source,'utf8')):{unit:{name:DATA_DOMAINS[i],version:1},global:null,tables:{}}));
          // Only the verified independent journal may supply deletion authority.
          // Replay it both before conversion and over the resulting cold copies.
          const governed=applyDeletionGovernance(originals,cp.deletions);
          const roots=await Promise.all(config.projects.map(p=>realpath(p.root)));
          const projects=Object.entries(governed[0].tables.projects).map(([key,data])=>{
            if(!roots.includes(data.root)||key!==sha(process.platform==='win32'?data.root.toLowerCase():data.root))fail('P2_MIGRATION_SCOPE','Legacy owners must match the explicitly configured canonical project roots');
            return {key,root:data.root};
          });
          const converted=await migrateLegacyDomains({domains:governed,projects,now:request.now,fromVersion:current.manifest.version,toVersion:candidate.manifest.version});
          const output=applyDeletionGovernance(converted.domains,cp.deletions);
          if(!same(before,await fingerprint(domainFiles.map(f=>f.source))))fail('P2_PLAN_CHANGED');
          for(const [i,f]of domainFiles.entries())migratedBytes.set(f.path,Buffer.from(JSON.stringify(output[i],null,2)+'\n'));
          migration={...converted.migration,inputFingerprints:before,deletionSeq:cp.deletionSeq,
            outputs:domainFiles.map(f=>({path:f.path,sha256:sha(migratedBytes.get(f.path))}))};
        }
        const paths=new Set();const files=[];
        for(const [i,f] of selected.entries()){
          if(!isAbsolute(f.path??'')||!isAbsolute(f.source??'')||paths.has(resolve(f.path).toLowerCase()))fail('P2_CONFIG');
          paths.add(resolve(f.path).toLowerCase());const identity=await canonicalIdentity(f.path),canonical=identity.canonicalPath;
          if(f.role==='domain'?!DATA_DOMAINS.some(n=>canonical===join(storageRoot,n+'.json')):!inside(profileRoot,canonical))fail('P2_SCOPE');
          if(canonical===resolve(input.budgetPath)||inside(c.root,canonical))fail('P2_SCOPE');
          const [source]=await fingerprint([f.source]);const stagedPath=join(directory,`input-${i}.bin`);
          const bytes=migratedBytes.get(f.path)??(source.exists?(f.role==='manifest'?bound.manifestBytes:f.role==='lock'?bound.lockBytes:await readFile(f.source)):null);
          if(bytes!==null)await durable(stagedPath,bytes);
          files.push({id:f.id,role:f.role,path:canonical,source:f.source,exists:bytes!==null,sha256:bytes===null?null:sha(bytes),stagedPath});
        }
        const runtimeFiles=['nodePath','pnpmPath'].map(k=>input.runtime?.[k]).filter(Boolean);
        if(migration)runtimeFiles.push(...['./migrations.js','./backups.js','../layered-memory.js','../layer-policy.js','../store.js'].map(path=>fileURLToPath(new URL(path,import.meta.url))));
        if(input.runtime?.pnpmPath)runtimeFiles.push(join(dirname(input.runtime.pnpmPath),'../dist/pnpm.mjs'));
        if(input.runtime?.hostLibraryRoot)for(const module of ['dsh','cordis','dsh-tools','dsh-storage','dsh-storage-json','dsh-storage-domain','dsh-llm','dsh-agent','dsh-subagent']){
          runtimeFiles.push(join(input.runtime.hostLibraryRoot,module,'package.json'));
          if(module!=='dsh')runtimeFiles.push(join(input.runtime.hostLibraryRoot,module,'lib/index.js'));
        }
        if(runtimeFiles.some(p=>!isAbsolute(p)))fail('P2_CONFIG');
        const fingerprints=await fingerprint([input.currentArtifact,input.candidateArtifact,input.budgetPath,...selected.flatMap(f=>[f.path,f.source]),...runtimeFiles]);
        // The final plan must still identify the exact inputs that produced
        // the staged migration, including sources outside the governed store.
        if(migration?.inputFingerprints.some(before=>!same(before,fingerprints.find(after=>after.path===before.path))))fail('P2_PLAN_CHANGED');
        if(runtimeFiles.some(path=>!fingerprints.find(f=>f.path===resolve(path))?.exists))fail('P2_RUNTIME_MISSING');
        const body={version:1,id,directory,planPath,storageRoot,profileRoot,profileIdentity:await canonicalIdentity(profileRoot),budgetPath:input.budgetPath,
          current,candidate,files,fingerprints,baseline:compact(cp),budgetFingerprint:await fingerprint([input.budgetPath]),
          compatibilityRule:input.compatibilityRule,runtime:input.runtime??{},...(migration?{migration}:{}),snapshotDirectory:join(c.root,'backups',id)};
        const p={...body,hash:sha(JSON.stringify(body))};await durable(planPath,JSON.stringify(p,null,2));await c.event('prepared',{planHash:p.hash,transactionId:id});return p;
      }finally{await c.close();}
    },
    async validate(p){return owned(p,async c=>{
      await recheck(p,c);const stage=join(p.directory,'validation'),profileRoot=join(stage,'profile'),storageRoot=join(stage,'storage');
      await mkdir(profileRoot,{recursive:true});await mkdir(storageRoot,{recursive:true});
      for(const f of p.files){if(!f.exists)continue;const target=f.role==='domain'?join(storageRoot,f.path.split(/[\\/]/).at(-1)):join(profileRoot,relative(p.profileRoot,f.path));await durable(target,await readFile(f.stagedPath),{replace:true});}
      const install=await installer({plan:p,profileRoot,version:p.candidate.manifest.version,direction:'candidate'});
      const proof=await checkedHealth({plan:p,profileRoot,storageRoot,phase:'isolated',version:p.candidate.manifest.version});
      await c.event('validated',{transactionId:p.id,planHash:p.hash,install,health:proof});return {status:'validated',planHash:p.hash};
    });},
    async confirm(p,hash){return owned(p,async c=>{
      if(hash!==p.hash)fail('P2_CONFIRMATION_REQUIRED');await recheck(p,c);
      if(!records(await c.checkpoint(),p,'validated').length)fail('P2_VALIDATION_REQUIRED');
      await c.event('confirmed',{transactionId:p.id,planHash:p.hash});return {status:'confirmed',planHash:p.hash};
    });},
    async switch(p){return owned(p,async c=>{
      const cp=await c.checkpoint();if(!records(cp,p,'confirmed').length)fail('P2_CONFIRMATION_REQUIRED');
      if(records(cp,p,'switching').length)fail('P2_RECOVERY_REQUIRED','Use recover for an already-started plan');
      await recheck(p,c);
      const snapshot=await captureSnapshot({directory:p.snapshotDirectory,files:p.files,baseline:{planHash:p.hash,businessSeq:cp.businessSeq,deletionCheckpoint:cp},excludedPaths:[p.budgetPath,c.root]});
      await c.setBarrier({closed:true,transactionId:p.id,planHash:p.hash});
      await c.event('switching',{transactionId:p.id,planHash:p.hash,snapshotChecksum:snapshot.checksum});
      try{
        await publish(p.files,c,p.id);
        const install=await installer({plan:p,profileRoot:p.profileRoot,version:p.candidate.manifest.version,direction:'candidate'});
        await c.event('verifying',{transactionId:p.id,planHash:p.hash});
        await assertDomainEvidence(p,c);
        await assertPublished(p.files);
        const proof=await checkedHealth({plan:p,profileRoot:p.profileRoot,storageRoot:p.storageRoot,phase:'target',version:p.candidate.manifest.version});
        await assertDomainEvidence(p,c);
        await assertPublished(p.files);
        const evidence={transactionId:p.id,planHash:p.hash,install,health:proof,files:await fingerprint(p.files.map(f=>f.path)),checkpoint:compact(await c.checkpoint())};
        await c.event('committed',evidence);await c.setBarrier({closed:false,transactionId:p.id,planHash:p.hash});
        return {status:'committed',planHash:p.hash,backupRotation:await rotate(p,c)};
      }catch(error){
        if(error.code==='P2_PROCESS_TREE_UNKNOWN'){
          await c.event('recovery_required',{transactionId:p.id,planHash:p.hash,error:error.code,processTreeUnknown:true});
          return {status:'recovery_required',planHash:p.hash,error:error.code};
        }
        try{return await restore(p,c,error);}catch(recovery){try{await c.event('recovery_required',{transactionId:p.id,planHash:p.hash,error:String(error.message),recovery:String(recovery.message)});}catch{}return {status:'recovery_required',planHash:p.hash,error:error.code??error.message,recovery:recovery.code??recovery.message};}
      }
    });},
    async recover(p,{restoreOld=false,recoverLockToken}={}){return owned(p,async c=>{
      const before=await c.checkpoint();
      const latest=before.events.findLast(e=>['switching','committed','rolled_back'].includes(e.type));
      if(latest&&latest.payload.transactionId!==p.id||before.barrier.closed&&before.barrier.transactionId!==p.id)fail('P2_PLAN_SUPERSEDED');
      await c.setBarrier({closed:true,transactionId:p.id,planHash:p.hash});
      try{
        const cp=await c.checkpoint();
        if(records(cp,p,'recovery_required').some(e=>e.payload.processTreeUnknown))fail('P2_PROCESS_TREE_UNKNOWN','Unresolved process ownership requires external reconciliation before recovery');
        if(!records(cp,p,'switching').length)fail('P2_RECOVERY_REQUIRED','No durable switch intent for this plan');
        if(cp.businessSeq!==p.baseline.businessSeq||cp.pending.some(v=>v.kind==='business'))fail('P2_RECOVERY_REQUIRED','New or uncertain business writes exist');
        await assertDomainEvidence(p,c);
        if(!same(await fingerprint([p.budgetPath]),p.budgetFingerprint))fail('P2_RECOVERY_REQUIRED','Budget state requires reconciliation');
        await verifySnapshot(p.snapshotDirectory);
        if(restoreOld)return await restore(p,c,'Explicit old-version recovery');
        const actual=await fingerprint(p.files.map(f=>f.path));
        const matches=p.files.every((f,i)=>actual[i].exists===f.exists&&actual[i].sha256===f.sha256);
        if(!matches||cp.deletionSeq!==p.baseline.deletionSeq)return await restore(p,c,'Incomplete publication or later deletion governance');
        const candidate=await inspectArtifact(p.candidate.path,{expectedSha256:p.candidate.sha256});
        assertAdoptionProtocol(cp,candidate);
        const proof=await checkedHealth({plan:p,profileRoot:p.profileRoot,storageRoot:p.storageRoot,phase:'recovery',version:p.candidate.manifest.version});
        await assertDomainEvidence(p,c);
        await assertPublished(p.files);
        if(cp.pending.length)await c.event('recovered_intents',{operationIds:cp.pending.map(v=>v.operationId)});
        await c.event('committed',{transactionId:p.id,planHash:p.hash,recovered:true,health:proof,files:actual,checkpoint:compact(await c.checkpoint())});
        await c.setBarrier({closed:false,transactionId:p.id,planHash:p.hash});return {status:'committed',planHash:p.hash,recovered:true,backupRotation:await rotate(p,c)};
      }catch(error){try{await c.event('recovery_required',{transactionId:p.id,planHash:p.hash,error:String(error.message)});}catch{}return {status:'recovery_required',planHash:p.hash,error:error.code??error.message};}
    },recoverLockToken?{recoverLockToken}:{});},
  };
}
