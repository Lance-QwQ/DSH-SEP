import {readFile,mkdir,writeFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
import {verify,sign,durableJson} from './update-admission.mjs';import {fileHash,jsonFile} from './update-inventory.mjs';import {hash,acceptRisks,decide} from './update-core.mjs';
import {processIdentity,isProcessAlive,acquireWorkerLease,cleanEnv} from './update-process.mjs';import {downloadPackage} from './download-package.mjs';import {preparePackage} from './prepare-package.mjs';import {copyProfile} from './prepare-profile.mjs';import {checkPreparedHealth} from './prepare-health.mjs';import {prepareOfflinePlan} from './prepare-offline.mjs';import {reviewCandidate} from './update-review.mjs';import {executeQueued} from './update-worker.mjs';
const code=e=>/^[A-Z0-9_]+$/.test(e.code??e.message)?e.code??e.message:'SEP_PREPARATION_FAILED';
export function programLocation(dailyRoot,id){const root=join(dailyRoot,'releases','sep-'+id.replaceAll('-','').slice(0,16));if(join(root,'node_modules/@deepseek-ai/dsh-desktop/resources/icon-windows.png').length>=260)throw Error('SEP_DESKTOP_PATH_TOO_LONG');return root;}
async function launchReview(directory,request){const child=spawn(join(request.installation.releaseRoot,'node_modules/electron/dist/electron.exe'),[fileURLToPath(new URL('./prepare-review-host.mjs',import.meta.url)),'--sep-updates-directory='+directory,'--sep-preparation-id='+request.id],{cwd:request.installation.dailyRoot,windowsHide:false,stdio:'ignore',env:cleanEnv()});const done=new Promise((res,rej)=>{child.once('error',rej);child.once('exit',(exitCode,signal)=>res({exitCode,signal}));});done.catch(()=>{});await new Promise((res,rej)=>{child.once('spawn',res);child.once('error',rej);});return {child,done,identity:await processIdentity(child.pid)};}
export async function prepareAutomatically(directory,id,{download=downloadPackage,startReview=launchReview,publish=executeQueued}={}){
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('SEP_PREPARATION_ID');const key=await readFile(join(directory,'control-key')),request=verify(await jsonFile(join(directory,'auto-request.json')),key);if(request.id!==id||request.kind!=='sep-automatic-preparation')throw Error('SEP_PREPARATION_REQUEST');
 const releaseLease=await acquireWorkerLease(directory,key);let review,timer,publicationQueued=false;const abort=new AbortController();
 const save=(status,extra={})=>durableJson(request.workRoot,'preparation-state.json',sign({schema:1,id,status,at:new Date().toISOString(),...extra},key));
 async function cancelled(){try{const value=await jsonFile(join(directory,'cancel-request.json'));if(Date.parse(value.cancelledAt)>=Date.parse(request.queuedAt))return true;}catch(e){if(e.code!=='ENOENT')throw e;}try{const value=verify(await jsonFile(join(request.workRoot,'review-cancelled.json')),key);if(value.id===id)return true;}catch(e){if(e.code!=='ENOENT')throw e;}return false;}
 try{
  const state=verify(await jsonFile(join(request.workRoot,'preparation-state.json')),key);if(state.status!=='waiting-exit')return;
  const deadline=Date.parse(request.queuedAt)+10800000;
  while(await isProcessAlive(request.parentIdentity)){if(await cancelled()){await save('cancelled');return;}if(Date.now()>=deadline)throw Error('SEP_PREPARATION_WAIT_EXPIRED');await delay(1000);}
  if(await cancelled()){await save('cancelled');return;}
  if(await fileHash(join(request.installation.dailyRoot,'deployment-rc2.json'))!==request.selectorHash)throw Error('SEP_PREPARATION_INSTALLATION_CHANGED');
  await save('preparing');review=await startReview(directory,request);
  timer=setInterval(()=>{void cancelled().then(v=>{if(v)abort.abort();}).catch(()=>abort.abort());},500);timer.unref();
  // Native desktop resources must not live under the deeply nested review cache.
  const programRoot=programLocation(request.installation.dailyRoot,id),releasesRoot=join(request.installation.dailyRoot,'releases');await mkdir(releasesRoot,{recursive:true});
  const archive=await download({directory:request.workRoot,release:request.release,signal:abort.signal}),prepared=await preparePackage({archive,bundleSha256:request.release.bundle.sha256,currentRoot:request.installation.releaseRoot,workRoot:join(request.workRoot,'candidate'),programRoot,release:request.release,signal:abort.signal});
  await copyProfile({currentRoot:request.installation.releaseRoot,targetRoot:prepared.root,graph:await jsonFile(join(prepared.root,'graph.json')),signal:abort.signal});
  const probeRoot=join(request.workRoot,'health-probe');await checkPreparedHealth({programRoot:prepared.root,probeRoot,graphHash:prepared.graphHash,installation:request.installation,signal:abort.signal});
  const transaction=await prepareOfflinePlan({directory:join(request.workRoot,'publication'),installation:request.installation,prepared,healthPath:join(probeRoot,'health.json'),updatesDirectory:directory,release:request.release,allowedOwners:[await processIdentity(process.pid),review.identity]});
  abort.signal.throwIfAborted();await durableJson(request.workRoot,'prepared-review.json',sign({schema:1,id,reportPath:transaction.op.reportPath,planDirectory:transaction.op.directory,expected:transaction.expected},key));await save('awaiting-review');
  const ended=await review.done;review=null;clearInterval(timer);timer=null;if(ended.exitCode!==0)throw Error('SEP_REVIEW_EXITED');
  let consent;try{consent=verify(await jsonFile(join(transaction.op.directory,'consent.json')),key);}catch(e){if(e.code==='ENOENT'){await save('cancelled');return;}throw e;}
  if(!consent.accepted||await cancelled()){await save('cancelled');return;}
  const a=await createGeneratedAdmission({directory,key,request,prepared,transaction,healthPath:join(probeRoot,'health.json')});
  const args={directory,projectDir:request.installation.releaseRoot,release:request.release,currentVersion:request.release.version,profileContext:transaction.op.currentContext},fresh=await reviewCandidate(args);
  if(fresh.report.hardBlocks.length)throw Error('SEP_PREPARATION_CHANGED');
  // The displayed pre-admission report and this report share the same inventory/risk fields.
  const risk=v=>hash({current:v.currentBinding,target:v.candidateBinding,hardBlocks:v.hardBlocks,plugins:v.plugins});if(risk(fresh.report)!==risk(transaction.report))throw Error('SEP_PREPARATION_CHANGED');
  const riskConsent=acceptRisks(fresh.report),queued={schema:3,id,release:request.release,currentVersion:request.release.version,profileContext:transaction.op.currentContext,reportBinding:fresh.report.binding,currentBinding:fresh.report.currentBinding,consent:riskConsent,admissionHash:hash(a),decision:decide(fresh.report,riskConsent).decision,queuedAt:new Date().toISOString(),parentIdentity:request.parentIdentity,projectDir:request.installation.releaseRoot};
  await durableJson(directory,'queued-request.json',sign(queued,key));publicationQueued=true;await save('publication-queued');
 }catch(error){await save(abort.signal.aborted?'cancelled':'blocked',{code:code(error)});if(review){await review.done;review=null;}throw error;}
 finally{clearInterval(timer);await releaseLease();}
 if(publicationQueued){const result=await publish(directory,id);await save(['verified','rolled_back'].includes(result?.phase)?result.phase:'publication-queued',{publicationPhase:result?.phase,statusCode:result?.message});return result;}
}
/** Local admission references the generated plan and real empty-profile health receipt. */
export async function createGeneratedAdmission({directory,key,request,prepared,transaction,healthPath}){
 const {op,plan}=transaction,h=await jsonFile(healthPath),healthEvidencePath=join(op.directory,'admission-health.json');
 await durableJson(op.directory,'admission-health.json',{schema:2,kind:'isolated-runtime-health',status:'pass',targetVersion:op.versions.candidate,targetSepVersion:request.release.sepVersion,targetRoot:prepared.root,targetBinding:(await jsonFile(op.policyPath)).targetBinding,targetGraphHash:prepared.graphHash,testedAt:h.testedAt,services:Object.fromEntries(h.checks.map(c=>[c.name,c.status==='pass'])),checks:h.checks.map(c=>({...c,evidencePath:healthPath}))});
 const a={schema:2,kind:'reviewed-local-p2-candidate',targetVersion:op.versions.candidate,targetRoot:prepared.root,targetProfileContext:op.targetContext,currentBinding:(await jsonFile(op.policyPath)).currentBinding,targetBinding:(await jsonFile(op.policyPath)).targetBinding,targetGraphHash:prepared.graphHash,planId:plan.id,planHash:plan.hash,proofs:{preservation:true,criticalHealth:true,checkpoint:true,writerCoverage:true},bindings:[],sep:{version:request.release.sepVersion,manifestHash:request.release.manifestHash,bundleSha256:request.release.bundle.sha256,bundlePath:prepared.archive,policyPath:op.policyPath},publisherPath:fileURLToPath(new URL('./prepare-publish.mjs',import.meta.url)),operatorPath:join(op.directory,'operator.json'),planPath:plan.planPath,healthEvidencePath,launcherPath:join(op.dailyRoot,'launch.mjs')};
 const paths=new Set([...op.input.bindings,a.publisherPath,a.operatorPath,a.planPath,a.healthEvidencePath,a.launcherPath,healthPath,prepared.archive,op.policyPath]);
 for(const path of paths)a.bindings.push({path,sha256:await fileHash(path)});
 await durableJson(directory,'approved-candidate.json',sign(a,key));return a;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))prepareAutomatically(process.argv[2],process.argv[3]).catch(e=>{console.error(code(e));process.exitCode=1;});
