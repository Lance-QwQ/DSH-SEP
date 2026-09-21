import {readFile,lstat,realpath,mkdir,open,rename,readdir} from 'node:fs/promises';
import {isAbsolute,resolve,dirname,relative,sep,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fingerprintFiles,canonicalIdentity} from './artifacts.js';
import {assertPreparationPlan,assertPreparationEvent} from './adoption-metadata.js';
import {createAdoptionPublication} from './adoption-publication.js';
import {acquireAdoptionAdmission} from './adoption-admission.js';
import {withAdoptionRecoveryGuard} from './adoption-retention.js';
import {readAdoptionMetadataRetirement} from './adoption-metadata-retention.js';
import {rejectUnsupportedRecoveryMaintenance} from './recovery-maintenance.js';

const domains=['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1'];
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>sha(JSON.stringify(stable(v)));
const same=(a,b)=>digest(a)===digest(b);
const provenance=value=>{const {recheckedAt,...fixed}=value;return fixed;};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const code=e=>typeof e?.code==='string'&&/^(P2_ADOPTION_|ADOPTION_|P2_PLAN_CHANGED|RECOVERY_MAINTENANCE_REQUIRED)/.test(e.code)?e.code:'P2_ADOPTION_IO';
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const within=(parent,child)=>{const r=relative(parent,child);return r===''||r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
async function canonical(p,kind){
  if(typeof p!=='string'||!isAbsolute(p)||p.includes('\0'))fail('P2_ADOPTION_REQUEST');
  let q=resolve(p);for(;;){if((await lstat(q)).isSymbolicLink())fail('P2_ADOPTION_SCOPE');const parent=dirname(q);if(q===parent)break;q=parent;}
  const actual=await realpath(p),s=await lstat(actual);
  if(!samePath(actual,resolve(p))||kind==='directory'&&!s.isDirectory()||kind==='file'&&(!s.isFile()||s.nlink!==1))fail('P2_ADOPTION_SCOPE');
  return actual;
}
async function emptyTarget(storageRoot){
  for(const name of domains){try{await lstat(join(storageRoot,name+'.json'));fail('P2_ADOPTION_TARGET_NOT_EMPTY');}catch(e){if(e.code!=='ENOENT')throw e;}}
  try{await lstat(join(storageRoot,'.suite-memory','p2','journal.jsonl'));fail('P2_ADOPTION_TARGET_NOT_EMPTY');}catch(e){if(e.code!=='ENOENT')throw e;}
}
async function request(input){
  if(!input||Object.keys(input).some(k=>!['sourceRoot','storageRoot','trustedAncestor','configPath','budgetPath','retireKnownWriters'].includes(k))||
     ['sourceRoot','storageRoot','trustedAncestor','configPath','budgetPath'].some(k=>typeof input[k]!=='string'||!isAbsolute(input[k]))||
     input.retireKnownWriters!==undefined&&typeof input.retireKnownWriters!=='boolean')fail('P2_ADOPTION_REQUEST');
  const result={...input,retireKnownWriters:input.retireKnownWriters??false};
  for(const key of ['sourceRoot','storageRoot','trustedAncestor'])result[key]=await canonical(result[key],'directory');
  if(within(result.sourceRoot,result.storageRoot)||within(result.storageRoot,result.sourceRoot)||!within(result.trustedAncestor,result.sourceRoot)||samePath(result.trustedAncestor,result.sourceRoot)||within(result.trustedAncestor,result.storageRoot))fail('P2_ADOPTION_SCOPE');
  await emptyTarget(result.storageRoot);
  for(const key of ['configPath','budgetPath'])result[key]=await canonical(result[key],'file');
  const parsedConfigFingerprint=(await fingerprintFiles([result.configPath]))[0],configBytes=await readFile(result.configPath);
  if(!parsedConfigFingerprint.exists||sha(configBytes)!==parsedConfigFingerprint.sha256)fail('P2_ADOPTION_PLAN_CHANGED');
  const config=JSON.parse(configBytes.toString('utf8'));
  rejectUnsupportedRecoveryMaintenance(config);
  if(!Array.isArray(config.projects)||!config.projects.length)fail('P2_ADOPTION_SCOPE');
  const projects=[];
  for(const p of config.projects){
    const root=await canonical(p.root,'directory');
    if(root.split(/[\\/]/).some(v=>v.toLowerCase()==='.suite-memory')||within(root,result.sourceRoot)||within(root,result.storageRoot)||projects.some(old=>within(old.root,root)||within(root,old.root)))fail('P2_ADOPTION_SCOPE');
    if(p.userProfile!==undefined&&(typeof p.userProfile!=='string'||!p.userProfile.trim()))fail('P2_ADOPTION_SCOPE');
    projects.push({root,...p.userProfile===undefined?{}:{userProfile:p.userProfile}});
  }
  return {...result,projects,parsedConfigFingerprint};
}

async function durable(path,bytes,{replace=false}={}){
  const tmp=replace?join(dirname(path),`head.${randomUUID()}.tmp`):path;
  const h=await open(tmp,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
  if(replace)await rename(tmp,path);
}
async function readJson(path){
  const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>16*1024*1024)fail('P2_ADOPTION_METADATA');
  try{return JSON.parse(await readFile(path,'utf8'));}catch{fail('P2_ADOPTION_METADATA');}
}
function locator(p){if(!p||typeof p.storageRoot!=='string'||!isAbsolute(p.storageRoot)||!UUID.test(p.transactionId??''))fail('P2_ADOPTION_REQUEST');return {storageRoot:p.storageRoot,transactionId:p.transactionId};}
function planValid(p){assertPreparationPlan(p);const {hash,...body}=p;if(digest(body)!==hash)fail('P2_ADOPTION_PLAN_CHANGED');locator(p);return p;}
const seal=body=>({...body,hash:digest(body)});
const runtime={node:process.version,platform:process.platform,architecture:process.arch};
const rulePaths=['adoption.js','adoption-cli.js','adoption-presentation.js','adoption-terminal.js','adoption-copies.js','adoption-capture.js','adoption-capture-win32.ps1','adoption-candidates.js','adoption-lifecycle.js','adoption-metadata.js','adoption-publication.js','adoption-health.js','adoption-budget.js','adoption-admission.js','adoption-governance.js','adoption-retention.js','adoption-metadata-retention.js','adoption-retention-cli.js','control.js','backups.js','../layer-policy.js','../layered-memory.js','../store.js'].map(p=>fileURLToPath(new URL(p,import.meta.url)));
async function environment(input){
  const files=await fingerprintFiles([input.configPath,input.budgetPath,...rulePaths]);
  if(!input.parsedConfigFingerprint||!same(files[0],input.parsedConfigFingerprint))fail('P2_ADOPTION_PLAN_CHANGED');
  return {files,directories:await Promise.all([input.sourceRoot,input.trustedAncestor,input.storageRoot,...input.projects.map(p=>p.root)].map(canonicalIdentity)),runtime};
}

async function metadata(c,{initialize=false,clock}={}){
  const root=join(c.storageRoot,'.suite-memory','p2','adoption-plans',c.transactionId),plans=join(root,'plans');
  if(initialize){await mkdir(root,{recursive:true});await mkdir(plans);}
  await canonical(root,'directory');await canonical(plans,'directory');
  const identity={transactionId:c.transactionId,copyIdentity:(await c.checkpoint()).identity,root:await canonicalIdentity(root),plans:await canonicalIdentity(plans)};
  const bindingPath=join(root,'binding.json'),journalPath=join(root,'events.jsonl'),headPath=join(root,'head.json');
  if(initialize)await durable(bindingPath,JSON.stringify(seal(identity)));
  const bound=await readJson(bindingPath);if(!same(seal(identity),bound))fail('P2_ADOPTION_METADATA');
  async function checked(){
    await c.checkpoint();
    if(!same(identity.root,await canonicalIdentity(root))||!same(identity.plans,await canonicalIdentity(plans)))fail('P2_ADOPTION_METADATA');
    for(const e of await readdir(root,{withFileTypes:true})){
      if(e.isSymbolicLink()||!['plans','binding.json','events.jsonl','head.json'].includes(e.name)&&!/^head\.[a-f0-9-]{36}\.tmp$/.test(e.name))fail('P2_ADOPTION_METADATA');
      if(/^head\./.test(e.name)&&e.name!=='head.json'){
        const value=await readJson(join(root,e.name));
        if(Object.keys(value).some(k=>!['identity','seq','hash'].includes(k))||value.identity!==bound.hash||!Number.isSafeInteger(value.seq)||value.seq<1||!HASH.test(value.hash??''))fail('P2_ADOPTION_METADATA');
      }
    }
    for(const e of await readdir(plans,{withFileTypes:true})){
      if(!e.isFile()||e.isSymbolicLink()||! /^[a-f0-9]{64}\.json$/.test(e.name))fail('P2_ADOPTION_METADATA');
      const saved=planValid(await readJson(join(plans,e.name)));if(e.name!==saved.hash+'.json'||saved.transactionId!==c.transactionId||saved.storageRoot!==c.storageRoot)fail('P2_ADOPTION_METADATA');
    }
  }
  async function read(){
    await checked();let text;
    try{const s=await lstat(journalPath);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>16*1024*1024)fail('P2_ADOPTION_METADATA');text=await readFile(journalPath,'utf8');}catch{fail('P2_ADOPTION_RECOVERY_REQUIRED');}
    if(!text.endsWith('\n'))fail('P2_ADOPTION_RECOVERY_REQUIRED');let events;try{events=text.slice(0,-1).split('\n').map(JSON.parse);}catch{fail('P2_ADOPTION_RECOVERY_REQUIRED');}
    let previous=null,lastAt=0;
    for(const [i,e] of events.entries()){
      assertPreparationEvent(e);
      const {hash,...body}=e;
      if(e.seq!==i+1||e.previous!==previous||e.identity!==bound.hash||digest(body)!==hash||!Number.isSafeInteger(e.at)||e.at<lastAt)fail('P2_ADOPTION_RECOVERY_REQUIRED');
      previous=hash;lastAt=e.at;
    }
    if(!same(await readJson(headPath),{identity:bound.hash,seq:events.length,hash:previous}))fail('P2_ADOPTION_RECOVERY_REQUIRED');
    for(const e of await readdir(root)){if(/^head\.[a-f0-9-]{36}\.tmp$/.test(e)){const h=await readJson(join(root,e));if(events[h.seq-1]?.hash!==h.hash)fail('P2_ADOPTION_METADATA');}}
    const registered=new Map(events.filter(e=>e.type==='plan_reserved').map(e=>[e.payload.planHash,e.payload.phase]));
    for(const filename of await readdir(plans)){const p=await readJson(join(plans,filename));if(registered.get(p.hash)!==p.phase)fail('P2_ADOPTION_METADATA');}
    if(clock()<lastAt)fail('P2_ADOPTION_CLOCK');
    return {events,last:events.at(-1),planHash:events.findLast(e=>e.payload?.planHash)?.payload.planHash};
  }
  async function append(type,payload,{first=false}={}){
    await checked();const before=first?{events:[],last:null}:await read();
    const body={identity:bound.hash,seq:before.events.length+1,previous:before.last?.hash??null,type,payload,at:clock()},event={...body,hash:digest(body)};
    assertPreparationEvent(event);
    const h=await open(journalPath,first?'wx':'a',0o600);try{await h.writeFile(JSON.stringify(event)+'\n');await h.sync();}finally{await h.close();}
    await durable(headPath,JSON.stringify({identity:bound.hash,seq:event.seq,hash:event.hash}),{replace:true});return event;
  }
  async function save(p){planValid(p);await checked();const state=await read();if(state.last.type!=='plan_reserved'||state.last.payload.planHash!==p.hash||state.last.payload.phase!==p.phase)fail('P2_ADOPTION_METADATA');const path=join(plans,p.hash+'.json');try{await durable(path,JSON.stringify(p));}catch(e){if(e.code!=='EEXIST'||!same(await readJson(path),p))throw e;}return p;}
  async function load(p){planValid(p);await checked();if(!same(await readJson(join(plans,p.hash+'.json')),p)||(await read()).planHash!==p.hash)fail('P2_ADOPTION_PLAN_CHANGED');return p;}
  return {root,append,read,save,load};
}

/** Preparation consent remains staging-only. Formal publication uses its own
 * plan and an explicit new-use acknowledgement, through the publication service. */
export function createAdoptionPreparation({clock=Date.now}={}){
  const timestamp=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<0)fail('P2_ADOPTION_CLOCK');return new Date(n).toISOString();};
  async function copies(p,initialize=false,options={}){const {openAdoptionCopies}=await import('./adoption-copies.js');return openAdoptionCopies({...locator(p),initialize,clock,recoverLockToken:options.recoverLockToken,...options.allowBlocked?{allowBlocked:true}:{}});}
  async function api(){return import('./adoption-candidates.js');}
  async function bodies(c,group='capture'){return Promise.all(domains.map(name=>c.read(`${group}/${name}.json`)));}
  async function capture(input,c,expectedCapture){
    const {acquireAdoptionCapture}=await import('./adoption-capture.js');
    return acquireAdoptionCapture({sourceRoot:input.sourceRoot,trustedAncestor:input.trustedAncestor,captureDirectory:join(c.root,'capture'),...(expectedCapture?{copy:false,expectedCapture}:{}),
      reserveCopy:async ({relativePath,sourceRefs})=>{const name='capture/'+relativePath;await c.reserve(name,{category:'capture',captureVersion:c.transactionId,sourceRefs:sourceRefs.map(r=>({sourceId:digest({path:r.path,volume:r.volume,fileId:r.fileId}),sha256:r.sha256}))});return {copyId:name};},
      completeCopy:async ({copyId,sha256})=>{const result=await c.complete(copyId);if(result.sha256!==sha256)fail('P2_ADOPTION_PLAN_CHANGED');}
    });
  }
  async function assertEnvironment(p){
    try{await emptyTarget(p.storageRoot);if(!same(await environment(p.request),p.environment))fail('P2_ADOPTION_PLAN_CHANGED');}catch{fail('P2_ADOPTION_PLAN_CHANGED');}
  }
  async function withPlan(p,fn,options={}){
    planValid(p);const c=await copies(p,false,options);try{
      const cp=await c.checkpoint();if(cp.expired&&!cp.invalidated){await c.invalidate('expired');await guardedCleanup(c);}
      if(cp.invalidated||cp.expired||cp.cleanup==='complete')fail('P2_ADOPTION_INVALIDATED');
      const m=await metadata(c,{clock});await m.load(p);return await fn(c,m);
    }catch(e){fail(code(e));}finally{await c.close();}
  }
  async function guardedCleanup(c){
    try{return await withAdoptionRecoveryGuard({storageRoot:c.storageRoot,transactionId:c.transactionId},({recoveryRequired})=>c.cleanup({recoveryRequired}));}
    catch{return c.cleanup({recoveryRequired:true});}
  }
  async function retiredStatus(c,cp){
    const metadataRetirement=await readAdoptionMetadataRetirement({storageRoot:c.storageRoot,transactionId:c.transactionId});
    if(!metadataRetirement)return null;
    if(!cp.invalidated||cp.cleanup!=='complete'||cp.blocked)fail('P2_ADOPTION_METADATA');
    return {status:cp.invalidated.reason==='cancelled'?'cancelled':cp.expired?'expired':'invalidated',transactionId:c.transactionId,storageRoot:c.storageRoot,
      expiresAt:cp.expiresAt,cleanup:{complete:true},metadataRetirement,metadataRecoveryRequired:metadataRetirement.status!=='retired',
      sourceFiles:'retained',sourcePermissions:'unchanged',businessWrites:'blocked-not-adopted'};
  }
  async function previousRetirement(input,options){
    // An independently retired preparation can predate an unrelated governed
    // store. Its receipt reports terminal history and grants no store authority.
    if(!await readAdoptionMetadataRetirement(input))return null;
    const c=await copies(input,false,{...options,allowBlocked:true});
    try{return await retiredStatus(c,await c.inspect());}finally{await c.close();}
  }
  async function withSource(p,c,fn,expected=p.source){
    let lease;
    try{await assertEnvironment(p);lease=await capture(p.request,c,expected);await c.confirm();await lease.revalidate();
      if(p.retirementPlan&&!expected.retirement&&!same(await lease.retirementPlan(),p.retirementPlan))fail('P2_ADOPTION_PLAN_CHANGED');return await fn(lease);}
    catch(e){
      const changed=['P2_ADOPTION_PLAN_CHANGED','P2_PLAN_CHANGED','P2_ADOPTION_CAPTURE_CHANGED','P2_ADOPTION_CAPTURE_RETIREMENT_CHANGED','P2_ADOPTION_CAPTURE_MISSING','P2_ADOPTION_CAPTURE_LINK','P2_ADOPTION_CAPTURE_PATH','P2_ADOPTION_CAPTURE_IDENTITY'].includes(e.code);
      if(changed){try{await c.invalidate('plan-changed');}catch{}fail('P2_ADOPTION_PLAN_CHANGED');}throw e;
    }
    finally{await lease?.close();}
  }
  async function prepare(input){
    const checked=await request(input),transactionId=randomUUID(),createdAt=timestamp();let admission,c,m,lease;
    try{
      admission=await acquireAdoptionAdmission({storageRoot:checked.storageRoot,transactionId});
      await admission.assertOwned();await emptyTarget(checked.storageRoot);c=await copies({...checked,transactionId},true);
      m=await metadata(c,{initialize:true,clock});await m.append('preparing',{transactionId,businessWrites:'blocked-not-adopted'},{first:true});
      const env=await environment(checked);lease=await capture(checked,c);
      const manifest=(await api()).prepareAdoptionCandidates({domains:await bodies(c),projects:checked.projects,evaluatedAt:createdAt});
      await lease.revalidate();if(!same(env,await environment(checked)))fail('P2_ADOPTION_PLAN_CHANGED');const cp=await c.confirm();
      const p=seal({kind:'adoption-preparation-v1',phase:'prepared',transactionId,storageRoot:c.storageRoot,request:checked,createdAt,evaluatedAt:createdAt,expiresAt:cp.expiresAt,environment:env,source:lease.snapshot(),manifest,
        ...checked.retireKnownWriters?{retirementPlan:await lease.retirementPlan()}:{},oldHistoryCoverage:'unknown-before-adoption',excludedHistory:['old-L4','legacy-history','migration-backups','index-and-media-body'],businessWrites:'blocked-not-adopted'});
      await m.append('plan_reserved',{planHash:p.hash,phase:p.phase});await m.save(p);await m.append('prepared',{planHash:p.hash});await admission.assertOwned();return p;
    }catch(e){try{await c?.invalidate('failed');await c?.cleanup({recoveryRequired:false});}catch{}throw Object.assign(new Error(code(e)),{code:code(e),transactionId,storageRoot:checked.storageRoot});}
    finally{try{await lease?.close();}finally{try{await c?.close();}finally{await admission?.close();}}}
  }
  async function select(p,choices){return withPlan(p,async(c,m)=>{
    if(p.phase!=='prepared')fail('P2_ADOPTION_PLAN_CHANGED');
    return withSource(p,c,async()=>{
      const materialized=(await api()).materializeAdoptionSelection({domains:await bodies(c),projects:p.request.projects,evaluatedAt:timestamp(),manifest:p.manifest,choices});
      const {hash,...base}=p;
      const chosen=seal({...base,phase:'selected',baseHash:hash,choices:structuredClone(choices),selection:{hashes:materialized.domains.map(value=>sha(Buffer.from(JSON.stringify(value)))),provenance:materialized.provenance}});
      await m.append('plan_reserved',{planHash:chosen.hash,phase:chosen.phase});await m.save(chosen);await m.append('selected',{planHash:chosen.hash,baseHash:hash});return chosen;
    });
  });}
  async function confirm(p,exactHash){return withPlan(p,async(c,m)=>{
    if(p.phase!=='selected'||exactHash!==p.hash)fail('P2_ADOPTION_CONFIRMATION');
    const state=await m.read();
    return withSource(p,c,async()=>{
      await materialized(p,c);await c.confirm();
      if(state.last.type==='selected')await m.append('confirmed',{planHash:p.hash});
      else if(!['confirmed','staged'].includes(state.last.type))fail('P2_ADOPTION_CONFIRMATION');
      return {status:'confirmed',planHash:p.hash,businessWrites:'blocked-not-adopted'};
    },state.last.type==='staged'?state.last.payload.result.sourceProof:p.source);
  });}
  async function materialized(p,c){
    const result=(await api()).materializeAdoptionSelection({domains:await bodies(c),projects:p.request.projects,evaluatedAt:timestamp(),manifest:p.manifest,choices:p.choices});
    if(!same(result.domains.map(value=>sha(Buffer.from(JSON.stringify(value)))),p.selection.hashes)||!same(provenance(result.provenance),provenance(p.selection.provenance)))fail('P2_ADOPTION_PLAN_CHANGED');return result;
  }
  async function impact(p){return withPlan(p,async(c,m)=>{
    const state=await m.read();return withSource(p,c,async()=>{
      const {renderAdoptionImpact}=await import('./adoption-presentation.js');return renderAdoptionImpact(p);
    },state.last.type==='staged'?state.last.payload.result.sourceProof:p.source);
  });}
  async function review(p,record,display){return withPlan(p,async(c,m)=>{
    if(typeof display!=='function')fail('P2_ADOPTION_REVIEW_SINK_REQUIRED');
    const state=await m.read();return withSource(p,c,async lease=>{
      const candidateApi=await api(),captured=await bodies(c),currentView=()=>candidateApi.reviewAdoptionCandidate({domains:captured,projects:p.request.projects,evaluatedAt:timestamp(),manifest:p.manifest,record});
      const assertValid=async()=>{await c.confirm();await assertEnvironment(p);await lease.revalidate();currentView();};
      const view=currentView();
      await assertValid();await display(view,{expiresAt:p.expiresAt,assertValid});await assertValid();
      return {status:'reviewed',planHash:p.hash,record:{owner:view.record.owner,id:view.record.id,revision:view.record.revision,sha256:view.record.recordSha256},confirmationScope:'staging-only',reviewIsConsent:false};
    },state.last.type==='staged'?state.last.payload.result.sourceProof:p.source);
  });}
  async function stage(p){return withPlan(p,async(c,m)=>{
    const state=await m.read();if(state.last.type==='staged')return withSource(p,c,async()=>{await materialized(p,c);await c.confirm();return state.last.payload.result;},state.last.payload.result.sourceProof);
    if(p.phase!=='selected'||state.last.type!=='confirmed')fail('P2_ADOPTION_CONFIRMATION');
    try{return await withSource(p,c,async lease=>{
      const data=await materialized(p,c);await m.append('staging',{planHash:p.hash});
      let retirement={status:'not-requested',assurance:'known-writer-perimeter'};
      if(p.request.retireKnownWriters){await c.confirm();retirement=await lease.retireKnownWriters(p.retirementPlan,{expiresAt:p.expiresAt});await m.append('retired',{planHash:p.hash,retirement});}
      const files=[];
      for(const [i,name] of domains.entries()){
        const entry=await c.write('staging/'+name+'.json',Buffer.from(JSON.stringify(data.domains[i])),{category:'staging',captureVersion:p.transactionId,sourceRefs:[{sourceId:p.manifest.sourceHash,sha256:p.selection.hashes[i]}]});
        files.push({name,path:join(c.root,'staging',name+'.json'),sha256:entry.sha256,bytes:entry.bytes});
      }
      await lease.revalidate();await assertEnvironment(p);await c.confirm();
      const result={status:'staged',planHash:p.hash,transactionId:p.transactionId,storageRoot:p.storageRoot,files,retirement,sourceProof:lease.snapshot(),expiresAt:p.expiresAt,businessWrites:'blocked-not-adopted',formalPublicationSupported:false};
      await m.append('staged',{planHash:p.hash,result});return result;
    });}catch(e){try{await c.invalidate('plan-changed');await m.append('invalidated',{planHash:p.hash,code:code(e)});}catch{}fail(code(e));}
  });}
  async function status(input,options={}){
    locator(input);
    const retired=await previousRetirement(input,options);if(retired)return retired;
    let formal=false;try{await lstat(join(input.storageRoot,'.suite-memory','p2','journal.jsonl'));formal=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(formal)return publication.publicationStatus(input);
    const c=await copies(input,false,{...options,allowBlocked:true});try{
      const cp=await c.inspect(),base={transactionId:c.transactionId,storageRoot:c.storageRoot,expiresAt:cp.expiresAt,businessWrites:'blocked-not-adopted'};
      const retired=await retiredStatus(c,cp);if(retired)return retired;
      if(cp.expired||cp.invalidated){
        if(!cp.invalidated)await c.invalidate('expired');const cleanup=await guardedCleanup(c);
        let maintenance;try{const m=await metadata(c,{clock}),state=await m.read(),event=state.events.findLast(e=>e.type.startsWith('maintenance_end_'));
          if(event)maintenance={status:event.type,oldWritesMayBeEnabled:state.events.some(e=>e.type==='maintenance_end_intent'),oldBusinessHealthVerified:false};}catch{}
        return {...base,status:cp.invalidated?.reason==='cancelled'?'cancelled':cp.expired?'expired':'invalidated',cleanup,...maintenance?{maintenance}:{}};
      }
      if(cp.blocked)return {...base,status:'adoption_recovery_required',blocked:true,code:cp.code};
      const m=await metadata(c,{clock}),state=await m.read();
      return {...base,status:['preparing','plan_reserved','staging','retired','interrupted'].includes(state.last.type)?'adoption_recovery_required':state.last.type,planHash:state.planHash,pending:cp.pending};
    }catch(e){fail(code(e));}finally{await c.close();}
  }
  async function cancel(input,options={}){
    locator(input);
    const retired=await previousRetirement(input,options);if(retired)return retired;
    try{await lstat(join(input.storageRoot,'.suite-memory','p2','journal.jsonl'));fail('P2_ADOPTION_PUBLICATION_STARTED');}catch(e){if(e.code!=='ENOENT')throw e;}
    const c=await copies(input,false,{...options,allowBlocked:true});try{
      const retired=await retiredStatus(c,await c.inspect());if(retired)return retired;
      await c.invalidate('cancelled');const cleanup=await guardedCleanup(c);
      let metadataRecoveryRequired=false;try{const m=await metadata(c,{clock}),state=await m.read();if(state.last.type!=='cancelled')await m.append('cancelled',{planHash:state.planHash??null});}catch{metadataRecoveryRequired=true;}
      return {status:'cancelled',transactionId:c.transactionId,cleanup,metadataRecoveryRequired,sourceFiles:'retained',sourcePermissions:'any-confirmed-retirement-is-retained',businessWrites:'blocked-not-adopted'};
    }catch(e){fail(code(e));}finally{await c.close();}
  }
  async function recover(input,options={}){return cancel(input,options);}
  async function recoverAdmission(input,options){
    if(!input||Object.keys(input).length!==2||Object.keys(input).some(k=>!['storageRoot','transactionId'].includes(k))||!options||Object.keys(options).length!==1||!UUID.test(options.recoverLockToken??''))fail('P2_ADOPTION_REQUEST');
    // Releasing this exact dead admission does not resolve a control/copies
    // journal or authorize business. Deletion also uses this same perimeter.
    const checked=locator(input);
    const admission=await acquireAdoptionAdmission({...checked,recoverLockToken:options.recoverLockToken});
    try{await admission.assertOwned();return {status:'admission-released',...checked,businessWrites:'unchanged',copies:'unchanged'};}finally{await admission.close();}
  }
  // This operates only on cancelled, fully cleaned preparations. It never grants
  // new-store business authority and intentionally does not reuse the import TTL.
  async function withEnd(p,fn){
    planValid(p);const c=await copies(p);let lease;
    try{
      const cp=await c.checkpoint();if(!cp.invalidated||cp.cleanup!=='complete')fail('P2_ADOPTION_END_REQUIRES_CLEANUP');
      if(!p.request.retireKnownWriters||!p.retirementPlan)fail('P2_ADOPTION_END_NOT_RETIRED');
      const m=await metadata(c,{clock});await m.load(p);
      const assertEndEnvironment=async()=>{
        try{await emptyTarget(p.storageRoot);
          const files=await fingerprintFiles([p.request.configPath,p.request.budgetPath]);if(!same(files,p.environment.files.slice(0,2)))fail('P2_ADOPTION_END_PLAN_CHANGED');
          const paths=[p.request.sourceRoot,p.request.trustedAncestor,p.storageRoot,...p.request.projects.map(v=>v.root)];
          if(!same(await Promise.all(paths.map(canonicalIdentity)),p.environment.directories))fail('P2_ADOPTION_END_PLAN_CHANGED');
        }catch{fail('P2_ADOPTION_END_PLAN_CHANGED');}
      };
      await assertEndEnvironment();lease=await capture(p.request,c,p.source);await lease.revalidate();
      return await fn(c,m,lease,assertEndEnvironment);
    }catch(e){throw Object.assign(new Error(code(e)),{code:code(e),...e.maintenanceMayHaveResumed?{maintenanceMayHaveResumed:true}:{}});}
    finally{await lease?.close();await c.close();}
  }
  async function endPlan(p){return withEnd(p,async(c,m,lease,revalidate)=>{
    const permissions=await lease.inspectRestoration(p.retirementPlan);await revalidate();
    const createdAt=clock(),release=seal({kind:'adoption-maintenance-end-v1',nonce:randomUUID(),transactionId:p.transactionId,storageRoot:p.storageRoot,originalPlanHash:p.hash,mode:'restore-original-dacl',createdAt,expiresAt:createdAt+600000,permissions,implementation:{files:await fingerprintFiles(rulePaths),runtime},newBusinessAvailable:false,oldBusinessHealthVerified:false});
    await m.append('maintenance_end_planned',{planHash:p.hash,release});return release;
  });}
  async function endMaintenance(p,releaseHash,{acceptReturnToOld=false,onPlan}={}){return withEnd(p,async(c,m,lease,revalidate)=>{
    const state=await m.read(),release=state.last.payload.release;
    if(state.last.type!=='maintenance_end_planned'||release?.hash!==releaseHash)fail('P2_ADOPTION_END_PLAN_CHANGED');
    const {hash,...body}=release;if(digest(body)!==hash||release.originalPlanHash!==p.hash)fail('P2_ADOPTION_END_PLAN_CHANGED');
    await onPlan?.(release);if(acceptReturnToOld!==true)fail('P2_ADOPTION_RETURN_ACK_REQUIRED');
    if(clock()>=release.expiresAt)fail('P2_ADOPTION_END_PLAN_EXPIRED');
    if(!same({files:await fingerprintFiles(rulePaths),runtime},release.implementation))fail('P2_ADOPTION_END_PLAN_CHANGED');
    if(!same(await lease.inspectRestoration(p.retirementPlan),release.permissions))fail('P2_ADOPTION_END_PLAN_CHANGED');await revalidate();
    await m.append('maintenance_end_intent',{planHash:p.hash,releaseHash});
    try{
      const result=await lease.restoreKnownWriters(p.retirementPlan,{expiresAt:release.expiresAt});
      await lease.revalidate();await revalidate();
      if(!same({files:await fingerprintFiles(rulePaths),runtime},release.implementation))fail('P2_ADOPTION_END_PLAN_CHANGED');
      await m.append('maintenance_end_done',{planHash:p.hash,releaseHash,restoredPaths:result.restoredPaths,alreadyOriginalPaths:result.alreadyOriginalPaths});
      return {status:'maintenance-ended',planHash:p.hash,releaseHash,permissions:'original-dacl-restored',newBusinessAvailable:false,oldBusinessHealthVerified:false,oldProcessesStarted:false};
    }catch(e){try{await m.append('maintenance_end_interrupted',{planHash:p.hash,releaseHash,code:code(e)});}catch{}
      throw Object.assign(new Error(code(e)),{code:code(e),maintenanceMayHaveResumed:true});
    }
  });}
  const publication=createAdoptionPublication({clock,withPlan,withSource,materialized,bodies,planValid,copies,metadata,environment,capture,emptyTarget});
  return {prepare,select,confirm,stage,status,cancel,recover,recoverAdmission,...publication,impact,review,endPlan,endMaintenance};
}
