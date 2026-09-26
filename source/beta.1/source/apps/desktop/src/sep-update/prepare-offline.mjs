import {readFile,writeFile,mkdir,readdir,access,lstat,readlink,realpath} from 'node:fs/promises';
import {join,resolve,isAbsolute,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import semver from 'semver';
import {inventory,fileHash,jsonFile,makeReport} from './update-inventory.mjs';
import {hash,renderReport} from './update-core.mjs';
import {readPluginEvidence} from './update-evidence.mjs';
import {managedProfileContext} from './update-profile.mjs';
import {verifyPreparedPolicy} from './prepare-preservation.mjs';
import {durableJson,verify} from './update-admission.mjs';
import {isProcessAlive} from './update-process.mjs';
import {rebaseProgram} from './prepare-profile.mjs';
import {createOfflinePublisher} from './runtime/offline-publisher.mjs';
import {createNativeProgramAdapter} from './runtime/native-program.mjs';
import {auditInstalledGraph} from './runtime/audit-graph.mjs';
const load=p=>import(pathToFileURL(p)),run=promisify(execFile),demand=(v,c)=>{if(!v)throw Error(c);};
export async function verifySelectedInstallation(installation){demand(hash(await jsonFile(join(installation.dailyRoot,'deployment-rc2.json')))===hash(installation),'SEP_PREPARATION_INSTALLATION_CHANGED');}
export async function profileAliases(home,oldRoot,newRoot){
 const root=join(home,'profiles/node_modules'),beforeAliases=[];let entries;try{entries=await readdir(root);}catch(e){if(e.code==='ENOENT')return {beforeAliases,candidateAliases:[]};throw e;}
 for(const entry of entries){const names=entry.startsWith('@')?(await readdir(join(root,entry))).map(n=>entry+'/'+n):[entry];for(const name of names){demand(/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name),'SEP_PROFILE_ALIAS');const path=join(root,name);demand((await lstat(path)).isSymbolicLink(),'SEP_PROFILE_ALIAS');const target=resolve(dirname(path),await readlink(path));await realpath(path);beforeAliases.push({name,target});}}
 return {beforeAliases,candidateAliases:beforeAliases.map(p=>({...p,target:rebaseProgram(p.target,oldRoot,newRoot)}))};
}
/** Exact consent is separate from permission to download and prepare. */
export function validatePlanConsent(expected,consent){demand(consent?.accepted===true&&['planHash','reportHash','graphHash'].every(k=>consent[k]===expected[k]),'SEP_PLAN_CONSENT');}
export async function assertInstallationIdle(installation,allowed=[]){
 const ignore=[process.pid];for(const identity of allowed)if(await isProcessAlive(identity))ignore.push(identity.pid);
 const encoded=Buffer.from(installation.dailyRoot.toLowerCase()).toString('base64');
 const script=`$ErrorActionPreference='Stop'; $r=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); $rows=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -notin @(${ignore.join(',')}) -and $_.Name -match '^(node|electron|dsh|deepseek.*)\\.exe$' -and $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($r) } | Select-Object ProcessId); ConvertTo-Json -InputObject $rows -Compress`;
 const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:65536});demand(JSON.parse(stdout.trim()||'[]').length===0,'SEP_PLAN_APP_RUNNING');
}
/** Read exact review evidence on preparation and again under publication locks.
 * The operator and every referenced file enter the P2 plan's input bindings.
 */
export async function readOfflinePluginEvidence(op){return op.compatibilityEvidence?readPluginEvidence(op.compatibilityEvidence):null;}
/** Return evidence inputs to bind to the immutable publication plan. */
export function offlineEvidencePaths(op){return op.compatibilityEvidence?[...new Set([op.compatibilityEvidence.compatibilityEvidencePath,...(op.compatibilityEvidence.bindings??[]).map(b=>b.path)])]:[];}
async function inspect(op){
 const current=await inventory(op.oldHostRoot,{profileContext:op.currentContext}),candidate=await inventory(op.candidateHostRoot,{profileContext:op.targetContext});
 const policy=await jsonFile(op.policyPath),preservationProof=await verifyPreparedPolicy({policy,current,candidate,currentRoot:op.oldHostRoot,targetRoot:op.candidateHostRoot,currentContext:op.currentContext,targetContext:op.targetContext,release:op.release});
 const report=makeReport(current,candidate,op.release,op.versions.old,(v,r)=>semver.satisfies(v,r,{includePrerelease:true}),{sepPolicy:policy,preservationProof,pluginEvidence:await readOfflinePluginEvidence(op)});
 report.current='DSH '+op.versions.old+' / SEP '+current.rootVersions['dsh-system-enhancement-package'];report.target='SEP '+op.release.sepVersion+' / DSH '+op.versions.candidate;return {current,candidate,report};
}
/** Generate a local plan after normal application exit; no business data is copied. */
export async function prepareOfflinePlan({directory,installation,prepared,healthPath,updatesDirectory,release,allowedOwners=[],compatibilityEvidence}={}){
 demand(isAbsolute(directory??'')&&isAbsolute(installation?.dailyRoot??'')&&isAbsolute(prepared?.root??''),'SEP_PLAN_INPUT');
 await readOfflinePluginEvidence({compatibilityEvidence});await assertInstallationIdle(installation,allowedOwners);await verifySelectedInstallation(installation);await mkdir(directory);await mkdir(join(directory,'sources'));
 const currentContext=await managedProfileContext(installation.releaseRoot,installation.home),targetContext=await managedProfileContext(prepared.root,installation.home);
 const current=await inventory(installation.releaseRoot,{profileContext:currentContext}),target=await inventory(prepared.root,{profileContext:targetContext});
 const policy={schema:2,kind:'sep-program-delta-policy',currentRoot:installation.releaseRoot,targetRoot:prepared.root,currentBinding:current.binding,targetBinding:target.binding,metadata:prepared.metadata};
 const policyPath=join(directory,'sep-policy.json');await durableJson(directory,'sep-policy.json',policy);
 const managedRoot=join(installation.dailyRoot,'managed-sep-'+randomUUID());await mkdir(managedRoot);const launcherBindings=[];
 for(const name of await readdir(join(import.meta.dirname,'runtime/launcher'))){const dest=join(managedRoot,name);await writeFile(dest,(await readFile(join(import.meta.dirname,'runtime/launcher',name),'utf8')).replaceAll('@SEP_GRAPH_HASH@',prepared.graphHash),{flag:'wx'});launcherBindings.push(dest);}
 const publicFiles=[];async function pair(name,bytes){const path=join(installation.dailyRoot,name),oldSource=join(directory,'sources/old-'+name),candidateSource=join(directory,'sources/candidate-'+name);await writeFile(oldSource,await readFile(path),{flag:'wx'});await writeFile(candidateSource,bytes,{flag:'wx'});publicFiles.push({path,oldSource,candidateSource});}
 await pair('deployment-rc2.json',JSON.stringify({...installation,releaseRoot:prepared.root,graphHash:prepared.graphHash},null,2)+'\n');
 const relativeManaged='./'+managedRoot.slice(installation.dailyRoot.length+1).replaceAll('\\','/');
 await pair('launch.mjs',`import {reportStartupFailure} from ${JSON.stringify(relativeManaged+'/startup-report.mjs')};\nimport {join} from 'node:path';\ntry{const {run}=await import(${JSON.stringify(relativeManaged+'/launcher.mjs')});await run(join(import.meta.dirname,'deployment-rc2.json'));}catch(error){process.exitCode=await reportStartupFailure(import.meta.dirname,error);}\n`);
 for(const name of ['start.vbs','start.ps1'])await pair(name,await readFile(join(installation.dailyRoot,name)));
 const op={schema:1,kind:'automatic-sep-only-plan',directory,transactionDirectory:directory,initialOperationId:randomUUID(),installation,updatesDirectory,allowedOwners,...(compatibilityEvidence?{compatibilityEvidence}:{}),currentContext,targetContext,release,policyPath,healthPath,reportPath:join(directory,'report.json'),dailyRoot:installation.dailyRoot,controlRoot:installation.controlRoot,homeRoot:installation.home,profileRoot:installation.releaseRoot,oldHostRoot:installation.releaseRoot,candidateHostRoot:prepared.root,releaseRoot:prepared.root,storageRoot:installation.storageRoot,additionalProfileRoots:[prepared.root,join(installation.home,'profiles')],...await profileAliases(installation.home,installation.releaseRoot,prepared.root),publicFiles,versions:{old:release.version,candidate:release.version},graphHashes:{old:prepared.baseGraphHash,candidate:prepared.graphHash}};
 const {report}=await inspect(op);demand(report.hardBlocks.length===0,'SEP_PLAN_PLUGIN_BLOCKED');await durableJson(directory,'report.json',report);await writeFile(join(directory,'report.html'),renderReport(report),{flag:'wx'});op.reportHash=await fileHash(op.reportPath);
 const codeFiles=[];async function list(p){for(const e of await readdir(p,{withFileTypes:true})){const path=join(p,e.name);if(e.isDirectory())await list(path);else codeFiles.push(path);}}await list(import.meta.dirname);
 const configPaths=[...current.profileCoverage.files,...target.profileCoverage.files].filter(f=>f.sha256!==null).map(f=>f.path);
 op.input={directory,profileRoot:op.profileRoot,storageRoot:op.storageRoot,budgetPath:join(installation.dailyRoot,'state/budget.json'),markerPath:join(installation.dailyRoot,'state/sep-deployment-in-progress.json'),versions:op.versions,bindings:[...new Set([...codeFiles,...configPaths,...offlineEvidencePaths(op),...launcherBindings,policyPath,healthPath,prepared.archive,op.reportPath,join(directory,'operator.json'),...publicFiles.flatMap(f=>[f.oldSource,f.candidateSource]),join(op.oldHostRoot,'graph.json'),join(op.candidateHostRoot,'graph.json')])],deployment:{graphHash:prepared.graphHash,sourceGraphHash:prepared.baseGraphHash,targetRoot:prepared.root,scope:'Same-host SEP-only update with exact local profile preservation'},protocols:{old:{maintenance:1,adoption:1,documentDeletion:1},candidate:{maintenance:1,adoption:1,documentDeletion:1}}};
 await durableJson(directory,'operator.json',op);const plan=await executePreparedPlan('prepare',join(directory,'operator.json'));
 return {op,plan,report,expected:{planHash:plan.hash,reportHash:op.reportHash,graphHash:prepared.graphHash}};
}
/** Reuse the P2 commit protocol; preserve decisions and unknown outcomes on failure. */
export async function executePreparedPlan(mode,operatorPath){
 demand(['prepare','apply','recover'].includes(mode),'SEP_PLAN_MODE');const op=await jsonFile(operatorPath);demand(op.kind==='automatic-sep-only-plan','SEP_PLAN_KIND');
 const idle=()=>assertInstallationIdle(op.installation,op.allowedOwners),oldPkg=join(op.oldHostRoot,'node_modules');await idle();
 const {openControl,DATA_DOMAINS}=await load(join(oldPkg,'dsh-system-enhancement-package/src/p2/control.js')),{acquireOwnerFile}=await load(join(oldPkg,'dsh-system-enhancement-package/src/owner-lease.mjs')),{openRecovery}=await load(join(oldPkg,'@deepseek-ai/dsh-recovery/src/controller.mjs'));
 let plan;if(mode!=='prepare'){plan=await jsonFile(join(op.directory,'plan.json'));const key=await readFile(join(op.updatesDirectory,'control-key'));validatePlanConsent({planHash:plan.hash,reportHash:op.reportHash,graphHash:op.graphHashes.candidate},verify(await jsonFile(join(op.directory,'consent.json')),key));}
 const controller=await openRecovery({controlRoot:op.controlRoot});
 try{
  const np=await createNativeProgramAdapter({...op,acquireOwnerFile}),audits=new Map();
  const verifyInstalled=async({direction})=>{if(!audits.has(direction))audits.set(direction,await auditInstalledGraph(direction==='old'?op.oldHostRoot:op.candidateHostRoot,op.graphHashes[direction]));return audits.get(direction);};
  const verifyInputs=async()=>{demand(await fileHash(op.reportPath)===op.reportHash,'SEP_PLAN_REPORT_CHANGED');const fresh=await inspect(op),original=await jsonFile(op.reportPath);demand(fresh.report.binding===original.binding&&fresh.report.hardBlocks.length===0,'SEP_PLAN_INPUT_CHANGED');};
  const health=async({direction})=>{await verifyInstalled({direction});if(direction==='old')return {status:'pass',version:op.versions.old,kind:'cold-restoration'};const h=await jsonFile(op.healthPath);demand(h.status==='pass'&&h.targetGraphHash===op.graphHashes.candidate&&h.targetRoot===op.candidateHostRoot&&['desktop-host','recovery-control','governed-storage'].every(n=>h.checks.some(c=>c.name===n&&c.status==='pass')),'SEP_PLAN_HEALTH');return {status:'pass',version:op.versions.candidate,kind:'bound-empty-profile-runtime-health',graphHash:op.graphHashes.candidate};};
  const publisher=createOfflinePublisher({controller,openControl,assertQuiescent:idle,adapters:{DATA_DOMAINS,verifyInputs,verifyInstalled,assertQuiescent:idle,program:np.program,native:np.native,install:verifyInstalled,health}});
  let result;if(mode==='prepare'){
   const release=await np.native.acquire();try{let current;try{current=await jsonFile(np.native.statePaths[0]);}catch(e){if(e.code!=='ENOENT')throw e;current={schemaVersion:1,operationId:op.initialOperationId,profile:'web',phase:'reconciled'};}demand(current.phase==='reconciled','SEP_PLAN_NATIVE_PENDING');await np.native.record(current);}finally{await release();}
   result=await publisher.prepare({...op.input,nativeStatePaths:np.native.statePaths});
  }else result=await publisher[mode](plan);
  await durableJson(op.directory,mode+'-result.json',{schema:1,result,audits:[...audits.values()],at:new Date().toISOString()});return result;
 }finally{await controller.close();}
}
