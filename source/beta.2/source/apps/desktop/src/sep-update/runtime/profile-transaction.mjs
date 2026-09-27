/** External, reviewed full-Profile publication. P2 owns the sole commit decision.
 * The three governed domains remain in place; this module never restores memory
 * bodies or budget. Adapters are bound local operator code, not model tools. */
import assert from 'node:assert/strict';
import {mkdir,readFile,lstat,stat,realpath,open,rename,unlink,readdir} from 'node:fs/promises';
import {join,dirname,resolve,relative,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>sha(JSON.stringify(value));
const fail=code=>{throw Object.assign(new Error(code),{code});};
const requireThat=(value,code)=>{if(!value)fail(code);};
const equal=(a,b,code)=>requireThat(isDeepStrictEqual(a,b),code);
const inside=(root,path)=>{const r=relative(root,path);return r===''||r!=='..'&&!r.startsWith('..\\')&&!r.startsWith('../')&&!isAbsolute(r);};
const exists=async path=>{try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function readJson(path){const st=await lstat(path);requireThat(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size<16*1024*1024,'PGR_RECORD_INVALID');return JSON.parse(await readFile(path,'utf8'));}
async function durable(path,value){
  await mkdir(dirname(path),{recursive:true});requireThat(!await exists(path),'PGR_RECORD_EXISTS');
  const temporary=path+'.'+randomUUID()+'.tmp',handle=await open(temporary,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  requireThat(!await exists(path),'PGR_RECORD_EXISTS');await rename(temporary,path);
  // As with the existing P2 primitive: process-crash safety on Windows; no
  // claim about directory-entry durability under an abrupt machine power loss.
  if(process.platform!=='win32'){const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}}
}
async function identity(path){const canonical=await realpath(path),st=await stat(canonical,{bigint:true});requireThat(st.ino!==0n,'PGR_IDENTITY_UNKNOWN');return {canonical,device:String(st.dev),inode:String(st.ino)};}
async function binding(path){
  requireThat(isAbsolute(path),'PGR_PATH_INVALID');
  if(!await exists(path)){return {path,absent:true,parent:await identity(dirname(path))};}
  const canonical=await realpath(path),st=await lstat(canonical);
  requireThat(st.isFile()&&!st.isSymbolicLink(),'PGR_FILE_INVALID');
  return {path,canonical,sha256:sha(await readFile(path))};
}
const bindings=paths=>Promise.all(paths.map(binding));
const compact=cp=>({identity:cp.identity,coverage:cp.coverage,businessSeq:cp.businessSeq,deletionSeq:cp.deletionSeq,dataFingerprints:cp.dataFingerprints,documentDeletionProtocol:cp.documentDeletionProtocol??0,adoption:cp.adoption?{status:cp.adoption.status,openedAt:cp.adoption.openedAt,firstBaseline:cp.adoption.firstBaseline,origin:cp.adoption.origin}:null});
async function domains(storageRoot,DATA_DOMAINS){return Object.fromEntries(await Promise.all(DATA_DOMAINS.map(async name=>{const path=join(storageRoot,name+'.json');return [name,await exists(path)?sha(await readFile(path)):null];})));}
function protocols(input,cp){
  requireThat(['governed-empty-origin','governed-adoption-origin'].includes(cp.coverage),'PGR_COVERAGE_UNKNOWN');
  for(const direction of ['old','candidate']){
    requireThat(input.protocols?.[direction]?.maintenance===1,'PGR_PROTOCOL_REQUIRED');
    if(cp.adoption)requireThat(input.protocols[direction].adoption===1&&cp.adoption.status==='adopted'&&cp.adoption.firstBaseline?.status==='ready'&&cp.adoption.openedAt,'PGR_ADOPTION_NOT_OPEN');
    if(cp.documentDeletionProtocol===1||cp.deletions.some(d=>d.documentPath!==undefined))requireThat(input.protocols[direction].documentDeletion===1,'PGR_DELETION_PROTOCOL_REQUIRED');
  }
  requireThat(!cp.deletions.some(d=>d.cleanup!=='complete'),'PGR_DELETION_PENDING');
}
const matching=(cp,p,type)=>cp.events.filter(e=>e.type===type&&e.payload.transactionId===p.id&&e.payload.planHash===p.hash);
function validatePlan(p){const {hash:checksum,...body}=p;requireThat(p.schema===1&&p.kind==='reviewed-profile-graph'&&checksum===hash(body),'PGR_PLAN_CHANGED');return p;}
async function savedPlan(p){validatePlan(p);equal(await readJson(p.planPath),p,'PGR_PLAN_CHANGED');requireThat(!await exists(join(p.directory,'invalidated.json')),'PGR_PLAN_INVALIDATED');return p;}

export function createProfilePublisher(adapters){
  const {openControl,DATA_DOMAINS}=adapters;
  assert.equal(typeof openControl,'function','PGR_ADAPTER_REQUIRED');
  assert.ok(Array.isArray(DATA_DOMAINS),'PGR_ADAPTER_REQUIRED');
  for(const fn of [adapters.verifyInputs,adapters.verifyInstalled,adapters.install,adapters.assertQuiescent,adapters.health,adapters.native?.acquire,adapters.native?.record,adapters.native?.verify,adapters.program?.publish,adapters.program?.verify])assert.equal(typeof fn,'function','PGR_ADAPTER_REQUIRED');
  const progress=async(phase,plan,extra={})=>adapters.onProgress?.({phase,planHash:plan.hash,transactionId:plan.id,...extra});
  async function verifyImmutable(p){
    await savedPlan(p);equal(await identity(p.profileRoot),p.profileIdentity,'PGR_PLAN_CHANGED');
    equal(await identity(p.directory),p.directoryIdentity,'PGR_PLAN_CHANGED');
    equal(await bindings(p.inputs.map(x=>x.path)),p.inputs,'PGR_PLAN_CHANGED');
    await adapters.verifyInputs(p);
  }
  async function beforeStart(p,c){
    // Validate the saved locator before using any path for an invalidation.
    await savedPlan(p);
    try{
      await verifyImmutable(p);
      if(c){await governed(p,c,{initial:true});await checkNative(p,{initial:true});await adapters.verifyInstalled({plan:p,direction:'old'});await adapters.program.verify({plan:p,direction:'old'});await adapters.native.verify({plan:p});}
    }catch(error){
      if(!await exists(p.transactionPath)&&/^(?:PGR_(?:PLAN_CHANGED|INPUT_CHANGED|GOVERNANCE_CHANGED|BUDGET_CHANGED|NATIVE_CHANGED|CONFIG_|GRAPH_|RELEASE_|INSTALLED_|PUBLISHED_)|NP_(?:SOURCE_CHANGED|DIRECTORY_CHANGED|ALIAS_UNREVIEWED|PUBLIC_UNREVIEWED|PUBLIC_CHANGED|ALIAS_CHANGED))/.test(error.code??'')){
        await durable(join(p.directory,'invalidated.json'),{schema:1,planHash:p.hash,reason:error.code,at:new Date().toISOString()});
      }
      throw error;
    }
  }
  async function governed(p,c,{initial=false}={}){
    await c.assertOwned();const cp=await c.checkpoint();protocols(p,cp);
    if(initial){equal(cp.head,p.head,'PGR_PLAN_CHANGED');requireThat(!cp.barrier.closed&&!cp.pending.length,'PGR_RECOVERY_REQUIRED');}
    equal(compact(cp),p.baseline,'PGR_GOVERNANCE_CHANGED');
    equal(await domains(p.storageRoot,DATA_DOMAINS),p.baseline.dataFingerprints,'PGR_GOVERNANCE_CHANGED');
    equal(await binding(p.budgetPath),p.budget,'PGR_BUDGET_CHANGED');
    requireThat(cp.pending.every(v=>v.kind==='maintenance'&&v.transactionId===p.id&&v.planHash===p.hash),'PGR_FOREIGN_OPERATION');
    // The baseline head must still be an exact ancestor. Deletion authority is
    // independently checked by P2 on every checkpoint and is never restored.
    equal(cp.events[p.head.seq-1]?.hash,p.head.hash,'PGR_GOVERNANCE_CHANGED');
    const own=new Set();
    for(const event of cp.events.slice(p.head.seq)){
      const value=event.payload;
      if(event.type==='maintenance_intent'){
        requireThat(value.transactionId===p.id&&value.planHash===p.hash,'PGR_FOREIGN_OPERATION');own.add(value.operationId);
      }else if(event.type==='maintenance_complete')requireThat(own.has(value.operationId),'PGR_FOREIGN_OPERATION');
      else if(event.type==='recovered_intents')requireThat(value.operationIds.every(id=>own.has(id)),'PGR_FOREIGN_OPERATION');
      else requireThat(['barrier','committed','rolled_back'].includes(event.type)&&value.transactionId===p.id&&value.planHash===p.hash,'PGR_FOREIGN_OPERATION');
    }
    return cp;
  }
  async function owned(p,recover,fn){
    const release=await adapters.native.acquire({plan:p});let control;
    try{
      let recoverLockToken;
      const lockPath=join(p.storageRoot,'.suite-memory/p2/owner.lock');
      if(await exists(lockPath)){
        requireThat(recover,'PGR_STORAGE_OWNED');const prior=await readJson(lockPath);
        const operators=await readdir(join(p.directory,'operators'));let bound=false;
        for(const name of operators){if(!/^\d+-[a-f0-9-]+\.json$/.test(name))continue;const item=await readJson(join(p.directory,'operators',name));if(item.planHash===p.hash&&item.token===prior.token&&item.pid===prior.pid&&item.identity===prior.identity)bound=true;}
        requireThat(bound&&prior.mode==='maintenance','PGR_UNKNOWN_OWNER');
        try{process.kill(prior.pid,0);fail('PGR_OWNER_ALIVE');}catch(e){if(e.code!=='ESRCH')throw e;}
        recoverLockToken=prior.token;
      }
      control=await openControl({storageRoot:p.storageRoot,mode:'maintenance',initialize:false,...(recoverLockToken?{recoverLockToken}:{})});
      await durable(join(p.directory,'operators',`${process.pid}-${randomUUID()}.json`),{schema:1,planHash:p.hash,pid:process.pid,token:control.token,identity:control.identity,at:new Date().toISOString()});
      return await fn(control);
    }finally{await control?.close();await release();}
  }
  const nativeState=p=>({schemaVersion:1,operationId:p.id,profile:'web',phase:'installing'});
  const transaction=p=>({schema:1,planHash:p.hash,planPath:p.planPath,nativeState:nativeState(p)});
  async function checkNative(p,{initial=false,finalized=false,published=false}={}){
    const states=await Promise.all(p.nativeStatePaths.map(readJson));
    for(const [index,state]of states.entries()){
      const allowed=initial?[p.nativeOriginal[index]]:finalized?[{...nativeState(p),phase:'reconciled'}]:[...(!published?[p.nativeOriginal[index]]:[]),nativeState(p),{...nativeState(p),phase:'reconciled'}];
      requireThat(allowed.some(value=>isDeepStrictEqual(value,state)),'PGR_NATIVE_CHANGED');
    }
    if(initial)equal(await bindings(p.nativeStatePaths),p.nativeBindings,'PGR_NATIVE_CHANGED');
  }
  async function verifyGate(p,{missing=false}={}){
    const expected=transaction(p);equal(await readJson(p.transactionPath),expected,'PGR_TRANSACTION_CHANGED');
    if(await exists(p.markerPath))equal(await readJson(p.markerPath),expected,'PGR_MARKER_CHANGED');
    else requireThat(missing,'PGR_MARKER_MISSING');
  }
  async function finish(p,c,direction,status,{allowMissing=false}={}){
    await verifyImmutable(p);const cp=await governed(p,c);
    await checkNative(p,{published:true});
    requireThat(!cp.pending.length,'PGR_PENDING_OPERATION');
    requireThat(matching(cp,p,status).length===1,'PGR_DECISION_REQUIRED');
    await adapters.verifyInstalled({direction,plan:p});await adapters.program.verify({direction,plan:p});
    await verifyGate(p,{missing:allowMissing});
    if(cp.barrier.closed){equal(cp.barrier,{closed:true,transactionId:p.id,planHash:p.hash},'PGR_BARRIER_CHANGED');await c.setBarrier({closed:false,transactionId:p.id,planHash:p.hash});}
    await adapters.native.record({...nativeState(p),phase:'reconciled'});
    await adapters.native.verify({plan:p,state:{...nativeState(p),phase:'reconciled'}});
    await verifyImmutable(p);await governed(p,c);
    await verifyGate(p,{missing:allowMissing});if(await exists(p.markerPath))await unlink(p.markerPath);
    await progress('opened',p,{direction,status});
    return {status,businessEntry:'open',planHash:p.hash,direction};
  }
  async function checkedHealth(p,c,direction){
    await verifyImmutable(p);await governed(p,c);
    const proof=await adapters.health({plan:p,direction});
    requireThat(proof?.status==='pass'&&proof.version===p.versions[direction],'PGR_HEALTH_FAILED');
    await verifyImmutable(p);await governed(p,c);
    await adapters.verifyInstalled({plan:p,direction});await adapters.program.verify({plan:p,direction});
    return proof;
  }
  async function prepareInstallation(p,direction){
    const id=randomUUID(),logDirectory=join(p.directory,'logs',`${direction}-${id}`);
    await mkdir(dirname(logDirectory),{recursive:true});equal((await identity(dirname(logDirectory))).canonical,dirname(logDirectory),'PGR_DIRECTORY_CHANGED');
    // This locator survives even if an installer directory is removed. Recovery
    // must prove every registered operation quiescent, not just scan survivors.
    await durable(join(p.directory,'installations',id+'.json'),{schema:1,planHash:p.hash,direction,profileRoot:p.profileRoot,operationDir:logDirectory});
    return {direction,installationId:id,operationDir:logDirectory};
  }
  async function quiescence(p,c){
    const cp=await c.checkpoint();
    const operations=cp.events.filter(event=>event.seq>p.head.seq&&event.type==='maintenance_intent').map(event=>{
      const v=event.payload;
      requireThat(v.planHash===p.hash&&v.transactionId===p.id&&/^[a-f0-9-]{36}$/.test(v.installationId??'')&&['old','candidate'].includes(v.direction)&&v.operationDir===join(p.directory,'logs',v.direction+'-'+v.installationId),'P2_PROCESS_TREE_UNKNOWN');
      return {installationId:v.installationId,direction:v.direction,operationDir:v.operationDir};
    });
    return adapters.assertQuiescent({plan:p,operations});
  }
  async function restore(p,c,cause){
    await verifyImmutable(p);let cp=await governed(p,c);requireThat(!matching(cp,p,'committed').length,'PGR_ALREADY_COMMITTED');
    await quiescence(p,c);
    await checkNative(p);
    equal(cp.barrier,{closed:true,transactionId:p.id,planHash:p.hash},'PGR_BARRIER_CHANGED');
    await verifyGate(p);await adapters.native.record(nativeState(p));
    const operation=await prepareInstallation(p,'old');
    await c.maintenance({transactionId:p.id,planHash:p.hash,file:'old-profile-graph',...operation},async()=>{
      await adapters.install({plan:p,direction:'old',logDirectory:operation.operationDir});
      await adapters.program.publish({plan:p,direction:'old'});
      // Check while the intent is pending, BEFORE maintenance_complete records
      // fingerprints. An unrelated write must never become P2's new baseline.
      await verifyImmutable(p);await governed(p,c);
    });
    const proof=await checkedHealth(p,c,'old');cp=await governed(p,c);
    if(cp.pending.length)await c.event('recovered_intents',{operationIds:cp.pending.map(v=>v.operationId)});
    await governed(p,c);await verifyGate(p);
    await c.event('rolled_back',{transactionId:p.id,planHash:p.hash,kind:p.kind,cause:String(cause?.code??cause??'uncommitted-recovery'),health:proof,domainsRetained:true,graphReview:p.deployment});
    await progress('rolled-back',p);return finish(p,c,'old','rolled_back');
  }
  return {
    async prepare(input){
      for(const key of ['directory','profileRoot','storageRoot','budgetPath','markerPath'])requireThat(isAbsolute(input[key]??''),'PGR_PATH_INVALID');
      requireThat(Array.isArray(input.bindings)&&input.bindings.length>0&&input.versions?.old&&input.versions?.candidate&&input.nativeStatePaths?.length===2&&input.nativeStatePaths.every(isAbsolute),'PGR_INPUT_REQUIRED');
      await mkdir(input.directory,{recursive:true});const directory=await realpath(input.directory),profileRoot=await realpath(input.profileRoot),storageRoot=await realpath(input.storageRoot);
      requireThat(!inside(profileRoot,directory)&&!inside(storageRoot,directory)&&!inside(profileRoot,input.markerPath)&&!inside(storageRoot,input.markerPath),'PGR_SCOPE');
      requireThat(!await exists(join(directory,'plan.json'))&&!await exists(input.markerPath),'PGR_OPERATION_EXISTS');
      const release=await adapters.native.acquire({input});let c;
      try{
        c=await openControl({storageRoot,mode:'maintenance',initialize:false});const cp=await c.checkpoint();protocols(input,cp);
        requireThat(!cp.pending.length&&!cp.barrier.closed,'PGR_RECOVERY_REQUIRED');
        equal(await domains(storageRoot,DATA_DOMAINS),cp.dataFingerprints,'PGR_GOVERNANCE_CHANGED');
        await adapters.verifyInputs(input);await adapters.verifyInstalled({plan:input,direction:'old'});await adapters.program.verify({plan:input,direction:'old'});await adapters.native.verify({plan:input});
        const body={...structuredClone(input),schema:1,kind:'reviewed-profile-graph',id:randomUUID(),directory,profileRoot,storageRoot,createdAt:new Date().toISOString(),
          planPath:join(directory,'plan.json'),transactionPath:join(directory,'transaction.json'),profileIdentity:await identity(profileRoot),directoryIdentity:await identity(directory),
          inputs:await bindings(input.bindings),nativeBindings:await bindings(input.nativeStatePaths),nativeOriginal:await Promise.all(input.nativeStatePaths.map(readJson)),budget:await binding(input.budgetPath),head:cp.head,baseline:compact(cp)};
        const p={...body,hash:hash(body)};await durable(p.planPath,p);await governed(p,c,{initial:true});await progress('prepared',p);return p;
      }finally{await c?.close();await release();}
    },
    async apply(p){
      await beforeStart(p);return owned(p,false,async c=>{
        // Recheck after both admission locks, including all time spent waiting.
        await beforeStart(p,c);
        await durable(p.transactionPath,transaction(p));await durable(p.markerPath,transaction(p));
        await adapters.native.record(nativeState(p));await c.setBarrier({closed:true,transactionId:p.id,planHash:p.hash});
        await progress('maintenance-closed',p);
        try{
          await verifyImmutable(p);await governed(p,c);await verifyGate(p);await adapters.native.verify({plan:p,state:nativeState(p)});
          const operation=await prepareInstallation(p,'candidate');
          const install=await c.maintenance({transactionId:p.id,planHash:p.hash,file:'candidate-profile-graph',...operation},async()=>{
            const result=await adapters.install({plan:p,direction:'candidate',logDirectory:operation.operationDir});
            await adapters.program.publish({plan:p,direction:'candidate'});
            await verifyImmutable(p);await governed(p,c);return result;
          });
          const proof=await checkedHealth(p,c,'candidate');await progress('health-passed',p);
          await verifyImmutable(p);const cp=await governed(p,c);requireThat(!cp.pending.length,'PGR_PENDING_OPERATION');await verifyGate(p);await adapters.native.verify({plan:p,state:nativeState(p)});
          await adapters.verifyInstalled({plan:p,direction:'candidate'});await adapters.program.verify({plan:p,direction:'candidate'});
          // Only this P2 event and its matching durable head commit the update.
          await c.event('committed',{transactionId:p.id,planHash:p.hash,kind:p.kind,install,health:proof,domainsRetained:true,dataFingerprints:cp.dataFingerprints,graphReview:p.deployment});
          await progress('committed',p);return await finish(p,c,'candidate','committed');
        }catch(error){
          const cp=await c.checkpoint();if(matching(cp,p,'committed').length)throw error;
          return restore(p,c,error);
        }
      });
    },
    async recover(p){
      await verifyImmutable(p);return owned(p,true,async c=>{
        await verifyImmutable(p);let cp=await c.checkpoint();
        await quiescence(p,c);
        const committed=matching(cp,p,'committed'),rolledBack=matching(cp,p,'rolled_back');
        requireThat(committed.length+rolledBack.length<=1,'PGR_DECISION_INVALID');
        if((committed.length||rolledBack.length)&&!cp.barrier.closed&&!await exists(p.markerPath)){
          // Finalized history is not a new restoration request. Later lawful
          // business must not cause writes, gate recreation or old-data replay.
          equal(cp.events[p.head.seq-1]?.hash,p.head.hash,'PGR_GOVERNANCE_CHANGED');
          requireThat(!cp.pending.length,'PGR_PENDING_OPERATION');equal(await domains(p.storageRoot,DATA_DOMAINS),cp.dataFingerprints,'PGR_GOVERNANCE_CHANGED');
          await verifyGate(p,{missing:true});await checkNative(p,{finalized:true});
          const direction=committed.length?'candidate':'old';await adapters.verifyInstalled({plan:p,direction});await adapters.program.verify({plan:p,direction});
          return {status:committed.length?'committed':'rolled_back',businessEntry:'open',planHash:p.hash,direction,alreadyFinalized:true};
        }
        cp=await governed(p,c);await checkNative(p);
        if(committed.length||rolledBack.length){
          const direction=committed.length?'candidate':'old',status=committed.length?'committed':'rolled_back';
          await verifyGate(p,{missing:!cp.barrier.closed});await checkedHealth(p,c,direction);
          return finish(p,c,direction,status,{allowMissing:!cp.barrier.closed});
        }
        // No program mutation precedes these two records and the P2 barrier.
        // A crash in early admission can recreate a missing marker, but must
        // still have the exact saved transaction and old graph/program.
        equal(await readJson(p.transactionPath),transaction(p),'PGR_TRANSACTION_CHANGED');
        if(!cp.barrier.closed){
          requireThat(!cp.pending.length,'PGR_PENDING_OPERATION');await adapters.verifyInstalled({plan:p,direction:'old'});await adapters.program.verify({plan:p,direction:'old'});
          if(!await exists(p.markerPath))await durable(p.markerPath,transaction(p));
          await verifyGate(p);await adapters.native.record(nativeState(p));await c.setBarrier({closed:true,transactionId:p.id,planHash:p.hash});
        }
        return restore(p,c,'uncommitted-recovery');
      });
    },
  };
}
