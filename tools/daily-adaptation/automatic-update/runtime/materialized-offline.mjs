import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import semver from 'semver';
import {inventory,jsonFile,fileHash,makeReport} from './update-inventory.mjs';
import {hash,renderReport} from './update-core.mjs';
import {durableJson} from './update-admission.mjs';
import {verifyPreparedPolicy} from './prepare-preservation.mjs';
import {materializedContext,createMaterializedLaunch} from './materialized-profile.mjs';
import {readOfflinePluginEvidence,offlineEvidencePaths,assertInstallationIdle,verifySelectedInstallation,profileAliases,executePreparedPlan} from './prepare-offline.mjs';
import {validateBootstrap} from './runtime/launcher/validate-bootstrap.mjs';
const demand=(v,c)=>{if(!v)throw Error(c);};
export async function inspectMaterialized(op){
 const current=await inventory(op.oldHostRoot,{profileContext:op.currentContext}),candidate=await inventory(op.candidateHostRoot,{profileContext:op.targetContext}),policy=await jsonFile(op.policyPath);
 const proof=await verifyPreparedPolicy({policy,current,candidate,currentRoot:op.oldHostRoot,targetRoot:op.candidateHostRoot,currentContext:op.currentContext,targetContext:op.targetContext,release:op.release});
 const report=makeReport(current,candidate,op.release,op.versions.old,(v,r)=>semver.satisfies(v,r,{includePrerelease:true}),{sepPolicy:policy,preservationProof:proof,pluginEvidence:await readOfflinePluginEvidence(op)});
 report.current='DSH '+op.versions.old+' / SEP '+current.rootVersions['dsh-sep-bundle'];report.target='SEP '+op.release.sepVersion+' / DSH '+op.versions.candidate;return {current,candidate,report};
}
export async function prepareMaterializedOffline({directory,installation:c,prepared,healthPath,updatesDirectory,release,allowedOwners=[],compatibilityEvidence,successorOf}){
 demand(process.platform==='win32'&&process.arch==='x64','SEP_MATERIALIZED_PLATFORM_UNSUPPORTED');
 demand(prepared.profileRoot&&prepared.selectionPath,'SEP_MATERIALIZED_PROFILE_REQUIRED');await assertInstallationIdle(c,allowedOwners);await verifySelectedInstallation(c);await mkdir(directory);await mkdir(join(directory,'sources'));
 const launcherRoot=join(directory,'launcher'),{config}=await createMaterializedLaunch({installation:c,prepared,out:launcherRoot}),currentContext=materializedContext(c),targetContext=materializedContext(config);
 const current=await inventory(c.releaseRoot,{profileContext:currentContext}),target=await inventory(prepared.root,{profileContext:targetContext});
 const policyPath=await durableJson(directory,'sep-policy.json',{schema:2,kind:'sep-program-delta-policy',currentRoot:c.releaseRoot,targetRoot:prepared.root,currentBinding:current.binding,targetBinding:target.binding,metadata:prepared.metadata});
 const publicFiles=[];async function pair(name,body){const path=join(c.dailyRoot,name),oldSource=join(directory,'sources/old-'+name),candidateSource=join(directory,'sources/candidate-'+name);await writeFile(oldSource,await readFile(path),{flag:'wx'});await writeFile(candidateSource,body,{flag:'wx'});publicFiles.push({path,oldSource,candidateSource});}
 await pair('deployment-rc2.json',JSON.stringify(config,null,2)+'\n');
 const url=name=>pathToFileURL(join(launcherRoot,name)).href;
 await pair('launch.mjs',`import {reportStartupFailure} from ${JSON.stringify(url('startup-report.mjs'))};\nimport {join} from 'node:path';\ntry{const {run}=await import(${JSON.stringify(url('launcher.mjs'))});await run(join(import.meta.dirname,'deployment-rc2.json'));}catch(error){process.exitCode=await reportStartupFailure(import.meta.dirname,error);}\n`);
 await validateBootstrap({entryPath:publicFiles[1].candidateSource,managedRoot:launcherRoot,nodeExecutable:c.nodeExecutable});
 const op={schema:1,kind:'automatic-materialized-sep-plan',directory,transactionDirectory:directory,launcherRoot,initialOperationId:randomUUID(),installation:c,updatesDirectory,allowedOwners,...(compatibilityEvidence?{compatibilityEvidence}:{}),currentContext,targetContext,release,policyPath,healthPath,reportPath:join(directory,'report.json'),dailyRoot:c.dailyRoot,controlRoot:c.controlRoot,homeRoot:c.home,profileRoot:c.profileRoot,oldHostRoot:c.releaseRoot,candidateHostRoot:prepared.root,releaseRoot:prepared.root,storageRoot:c.storageRoot,additionalProfileRoots:[prepared.profileRoot],...await profileAliases(c.home,c.releaseRoot,prepared.root),publicFiles,versions:{old:release.version,candidate:release.version},graphHashes:{old:prepared.baseGraphHash,candidate:prepared.graphHash}};
 const {report}=await inspectMaterialized(op);demand(report.hardBlocks.length===0,'SEP_PLAN_PLUGIN_BLOCKED: '+report.hardBlocks.join(', '));await durableJson(directory,'report.json',report);await writeFile(join(directory,'report.html'),renderReport(report),{flag:'wx'});op.reportHash=await fileHash(op.reportPath);
 const code=[];async function walk(at){for(const r of await readdir(at,{withFileTypes:true})){if(r.name==='node_modules')continue;const p=join(at,r.name);if(r.isSymbolicLink())throw Error('SEP_OPERATOR_ALIAS');if(r.isDirectory())await walk(p);else code.push(p);}}await walk(import.meta.dirname);
 const profiles=[...current.profileCoverage.files,...target.profileCoverage.files].filter(f=>f.sha256!==null).map(f=>f.path);
 op.input={...(successorOf?{successorOf}:{}),directory,profileRoot:op.profileRoot,storageRoot:op.storageRoot,budgetPath:JSON.parse(await readFile(c.dailySelectionPath)).configuration.runtime.profile.selection.budgetPath,markerPath:join(c.dailyRoot,'state/sep-deployment-in-progress.json'),versions:op.versions,bindings:[...new Set([...code,...profiles,...offlineEvidencePaths(op),...prepared.profileSourceBindings.map(b=>b.path),prepared.selectionPath,c.desktopPayloadPath,...(await readdir(launcherRoot)).map(n=>join(launcherRoot,n)),policyPath,healthPath,prepared.archive,op.reportPath,join(directory,'operator.json'),...publicFiles.flatMap(f=>[f.oldSource,f.candidateSource]),join(c.releaseRoot,'graph.json'),join(prepared.root,'graph.json'),join(c.releaseRoot,'desktop-runtime.json'),join(prepared.root,'desktop-runtime.json')])],deployment:{graphHash:prepared.graphHash,sourceGraphHash:prepared.baseGraphHash,targetRoot:prepared.root,scope:'Windows alpha.1 same-host/schema-3 SEP delta, separate Profile; governed data retained in place'},protocols:{old:{maintenance:1,adoption:1,documentDeletion:1},candidate:{maintenance:1,adoption:1,documentDeletion:1}}};
 await durableJson(directory,'operator.json',op);const plan=await executePreparedPlan('prepare',join(directory,'operator.json'));return {op,plan,report,expected:{planHash:plan.hash,reportHash:op.reportHash,graphHash:prepared.graphHash}};
}
