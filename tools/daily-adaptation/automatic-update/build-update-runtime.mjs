import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [repo,output]=process.argv.slice(2);if(!repo||!output||!/^D:[\\/]/i.test(resolve(output)))throw Error('UPDATE_OUTPUT_ROOT');
const source=join(repo,'tools/offline-upgrade-bridge-beta2/operator/shared/sep-update');await mkdir(output);await cp(source,output,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),origins=[];
const captured=JSON.parse(await readFile(join(import.meta.dirname,'upstream-desktop/CAPTURE.json')));
if(captured.kind!=='current-alpha1-desktop-updater-additions'||captured.host!=='0.2.1-alpha.1')throw Error('UPDATE_DESKTOP_CAPTURE');
for(const row of captured.files){const bytes=await readFile(join(import.meta.dirname,'upstream-desktop',row.name));if(sha(bytes)!==row.sha256)throw Error('UPDATE_DESKTOP_CAPTURE_HASH');await cp(join(import.meta.dirname,'upstream-desktop',row.name),join(output,row.name));}
async function edit(name,fn){let input=await readFile(join(output,name),'utf8'),text=input;const transforms=[];const replace=(from,to,all=false)=>{const count=text.split(from).length-1;if(!count||(!all&&count!==1))throw Error('UPDATE_ADAPTATION_ORIGIN: '+name+' '+from);text=all?text.replaceAll(from,to):text.replace(from,to);transforms.push({from,to,all,count});};await fn(replace,()=>text);await writeFile(join(output,name),text);origins.push({name,sourceSha256:sha(input),transforms,resultSha256:sha(text)});}
// The current installed-version reader requires manifest identity. This legacy
// synthetic fixture omitted name; fix the fixture, never relax the reader.
await edit('tests/update-preferences.test.mjs',r=>r("JSON.stringify({version:'0.2.1-beta.1'})","JSON.stringify({name:'dsh-system-enhancement-package',version:'0.2.1-beta.1'})"));
const {adaptUpdaterInventory}=await import(pathToFileURL(join(repo,'tools/daily-adaptation/build/updater-inventory.mjs')));
await cp(join(repo,'tools/daily-adaptation/lib/graph-layout.mjs'),join(output,'graph-layout.mjs'));
await cp(join(repo,'tools/daily-adaptation/lib/installed-sep-version.mjs'),join(output,'installed-sep-version.mjs'));
const inv=await readFile(join(output,'update-inventory.mjs'),'utf8'),a=adaptUpdaterInventory(inv);let replay=inv;for(const step of a.transforms)replay=replay.replace(step.from,step.to);
const header="import {packagePath,packageRoot,packageOwner,assertGraphLayout} from './graph-layout.mjs';\n",anchor=replay.split('\n')[0];if(a.text!==header+replay||replay.split(anchor).length!==2)throw Error('UPDATE_INVENTORY_HEADER_ORIGIN');
await writeFile(join(output,'update-inventory.mjs'),a.text);origins.push({name:'update-inventory.mjs',sourceSha256:sha(inv),transforms:[...a.transforms,{from:anchor,to:header+anchor,count:1}],resultSha256:sha(a.text)});
await edit('update-profile.mjs',r=>{
 r("const dir=join(root,'store',id);","const dir=packageRoot(root,graph,id);");
 r('  return {home:context.home===null?',"  if(context.profileRoot!==undefined&&(typeof context.profileRoot!=='string'||!isAbsolute(context.profileRoot)))throw Error('UPDATE_PROFILE_CONTEXT_REQUIRED');\n  return {...(context.profileRoot?{profileRoot:resolve(context.profileRoot)}:{}),home:context.home===null?");
 r('const ctx=profileContextIdentity(context),warnings=[];','const ctx=profileContextIdentity(context),profileRoot=ctx.profileRoot??root,warnings=[];');
 for(const n of ['package.json','compatibility.json'])r("join(root,'"+n+"')","join(profileRoot,'"+n+"')");
 r("join(root,'cordis.patch.yml'),","join(profileRoot,'cordis.patch.yml'),");r("readProfileManifest('sep-update',root)","readProfileManifest('sep-update',profileRoot)");r('ctx.installAnchor,root)','ctx.installAnchor,profileRoot)');r("loadOptionalPatches('sep-update',join(root,'cordis.patch.yml'))","loadOptionalPatches('sep-update',join(profileRoot,'cordis.patch.yml'))");
 r("import {hash} from './update-core.mjs';","import {hash} from './update-core.mjs';\nimport {packageRoot} from './graph-layout.mjs';");
});
await edit('prepare-package.mjs',r=>{
 r("const owners=new Set(","import {validateMaterializedDelta,verifyMaterializedRootManifest} from './materialized-package.mjs';\nimport {auditMaterializedGraph} from './materialized-audit.mjs';\nconst owners=new Set(");
 r('export function validateDelta(base,next,metadata,release){','export function validateDelta(base,next,metadata,release){\n if(base.schema===3||next.schema===3)return validateMaterializedDelta(base,next,metadata,release);');
 r(" for(const [parent,deps]of [[root,next.roots]", " if(next.schema!==3)for(const [parent,deps]of [[root,next.roots]");
 r(" signal?.throwIfAborted();const result=",` if(next.schema===3){\n  await verifyMaterializedRootManifest(currentRoot,root,next);await auditMaterializedGraph(root,metadata.targetGraphHash);\n  const {writeDesktopRuntime,verifyDesktopRuntime}=await import(pathToFileURL(join(currentRoot,'build-runtime-helper.mjs')));const descriptor=await jsonFile(join(currentRoot,'desktop-runtime.json'));\n  writeDesktopRuntime(root,descriptor.release,descriptor.sharedPackages.map(row=>row.name),{platform:process.platform,arch:process.arch});await verifyDesktopRuntime(root,release.version,{platform:process.platform,arch:process.arch});\n }\n signal?.throwIfAborted();const result=`);
 r("import {fileURLToPath} from 'node:url';","import {fileURLToPath,pathToFileURL} from 'node:url';");
});
await edit('runtime/audit-graph.mjs',r=>{
 r("import assert from 'node:assert/strict';","import assert from 'node:assert/strict';\nimport {auditMaterializedGraph} from '../materialized-audit.mjs';");
 r(' const graph=JSON.parse(bytes);let cursor=0,totalBytes=0;',' const graph=JSON.parse(bytes);if(graph.schema===3)return auditMaterializedGraph(root,expected);let cursor=0,totalBytes=0;');
});
await edit('prepare-preservation.mjs',r=>{
 r("import {validateDelta} from './prepare-package.mjs';","import {validateDelta} from './prepare-package.mjs';\nimport {materializedOwner} from './materialized-package.mjs';");
 r("delta.changed.map(p=>p.split('/')[1])","delta.changed.map(p=>base.schema===3?materializedOwner(base,p):p.split('/')[1])");
 r("base.files.some(f=>f.path===rel)?/^store\\/([^/]+)\\//.exec(rel)?.[1]:undefined","base.files.some(f=>f.path===rel)?(base.schema===3?materializedOwner(base,rel):/^store\\/([^/]+)\\//.exec(rel)?.[1]):undefined");
 r("changes.some(f=>f.split('/')[1]===owner)","changes.some(f=>(base.schema===3?materializedOwner(base,f):f.split('/')[1])===owner)");
});
await edit('prepare-offline.mjs',r=>{
 r("import {assertInstallationIdle}","import {prepareMaterializedOffline,inspectMaterialized} from './materialized-offline.mjs';\nimport {assertInstallationIdle}");
 r('async function inspect(op){',"async function inspect(op){\n if(op.kind==='automatic-materialized-sep-plan')return inspectMaterialized(op);");
 r(" demand(isAbsolute(directory??'')", " if((await jsonFile(join(installation.releaseRoot,'graph.json'))).schema===3)return prepareMaterializedOffline({directory,installation,prepared,healthPath,updatesDirectory,release,allowedOwners,compatibilityEvidence,successorOf});\n demand(isAbsolute(directory??'')");
 r("demand(op.kind==='automatic-sep-only-plan','SEP_PLAN_KIND');","demand(['automatic-sep-only-plan','automatic-materialized-sep-plan'].includes(op.kind),'SEP_PLAN_KIND');");
 r("demand(fresh.report.binding===original.binding&&fresh.report.hardBlocks.length===0,'SEP_PLAN_INPUT_CHANGED');", "if(fresh.report.binding!==original.binding||fresh.report.hardBlocks.length)throw Object.assign(Error('PGR_INPUT_CHANGED'),{code:'PGR_INPUT_CHANGED'});");
 r("const {openControl,DATA_DOMAINS}=await load(join(oldPkg,'dsh-system-enhancement-package/src/p2/control.js')),{acquireOwnerFile}=await load(join(oldPkg,'dsh-system-enhancement-package/src/owner-lease.mjs'))", "const suite=op.kind==='automatic-materialized-sep-plan'?'dsh-sep-bundle/bundle/modules/system-enhancement-package':'dsh-system-enhancement-package';const {openControl,DATA_DOMAINS}=await load(join(oldPkg,suite,'src/p2/control.js')),{acquireOwnerFile}=await load(join(oldPkg,suite,'src/owner-lease.mjs'))");
});
await edit('prepare-worker.mjs',r=>{
 r("import {readFile,mkdir,writeFile}","import {prepareCandidateProfile} from './materialized-profile.mjs';\nimport {readFile,mkdir,writeFile}");
 r("spawn(join(request.installation.releaseRoot,'node_modules/electron/dist/electron.exe')", "spawn(request.installation.desktopRuntimeRoot?join(request.installation.desktopRuntimeRoot,'electron.exe'):join(request.installation.releaseRoot,'node_modules/electron/dist/electron.exe')");
 r("  await copyProfile({currentRoot:request.installation.releaseRoot,targetRoot:prepared.root,graph:await jsonFile(join(prepared.root,'graph.json')),signal:abort.signal});", "  prepared.workRoot=join(request.workRoot,'candidate');await prepareCandidateProfile({installation:request.installation,prepared,signal:abort.signal});");
});
await edit('prepare-health.mjs',r=>{
 r("import {assertRequiredDesktopEntries}","import {checkMaterializedHealth} from './materialized-health.mjs';\nimport {assertRequiredDesktopEntries}");
 r(" demand(isAbsolute(programRoot??'')", " if((await json(join(programRoot,'graph.json'))).schema===3)return checkMaterializedHealth({programRoot,probeRoot,graphHash,installation,signal});\n demand(isAbsolute(programRoot??'')");
});
await edit('update-review.mjs',r=>{
 r("candidate.rootVersions['dsh-system-enhancement-package']","(candidate.rootVersions['dsh-sep-bundle']??candidate.rootVersions['dsh-system-enhancement-package'])",true);
 r("current.rootVersions['dsh-system-enhancement-package']","(current.rootVersions['dsh-sep-bundle']??current.rootVersions['dsh-system-enhancement-package'])",true);
});
await edit('prepare-queue.mjs',r=>{
 r("const id=randomUUID(),workRoot=join(directory,'preparations',id);", "const id=randomUUID(),materialized=(await jsonFile(join(installation.releaseRoot,'graph.json'))).schema===3,workRoot=join(materialized?join(dirname(installation.releaseRoot),'sep-update-work'):join(directory,'preparations'),id);");
});
await edit('prepare-worker.mjs',r=>{
 r("import {join,resolve} from 'node:path';","import {join,resolve,dirname} from 'node:path';");
 r("const programRoot=programLocation(request.installation.dailyRoot,id),releasesRoot=join(request.installation.dailyRoot,'releases');", "const materialized=(await jsonFile(join(request.installation.releaseRoot,'graph.json'))).schema===3,programParent=materialized?join(dirname(request.installation.releaseRoot),'sep-update-programs'):request.installation.dailyRoot,programRoot=materialized?join(programParent,'sep-'+id.replaceAll('-','').slice(0,16)):programLocation(programParent,id),releasesRoot=materialized?programParent:join(programParent,'releases');");
 r('await mkdir(releasesRoot,{recursive:true});',"if(join(programRoot,'node_modules/@deepseek-ai/dsh-desktop/resources/icon-windows.png').length>=260)throw Error('SEP_DESKTOP_PATH_TOO_LONG');await mkdir(releasesRoot,{recursive:true});");
});
await edit('update-worker.mjs',r=>{
 r("operator.kind==='automatic-sep-only-plan'", "['automatic-sep-only-plan','automatic-materialized-sep-plan'].includes(operator.kind)");
 r('const {client:c}=await client(),[status,desktop,p2]', 'const {active,client:c}=await client(),[status,desktop,p2]');r('!same(desktop.projectDir,target.root)','!same(desktop.projectDir,active.profileRoot??target.root)');
 r("join(target.root,'node_modules/dsh-system-enhancement-package/src/p2/control.js')", "join(target.root,'node_modules',operator.kind==='automatic-materialized-sep-plan'?'dsh-sep-bundle/bundle/modules/system-enhancement-package/src/p2/control.js':'dsh-system-enhancement-package/src/p2/control.js')");
});
await cp(join(repo,'tools/daily-adaptation/build/daily-launcher.mjs'),join(output,'alpha1-launcher-build.mjs'));
await mkdir(join(output,'runtime/alpha1-support/lib'),{recursive:true});await cp(join(repo,'tools/daily-adaptation/lib/installed-sep-version.mjs'),join(output,'runtime/alpha1-support/lib/installed-sep-version.mjs'));
const additions=[];
for(const name of await readdir(join(import.meta.dirname,'runtime'))){await cp(join(import.meta.dirname,'runtime',name),join(output,name));additions.push({name,source:'runtime/'+name,sha256:sha(await readFile(join(output,name)))});}
for(const [name,source] of [['graph-layout.mjs','lib/graph-layout.mjs'],['installed-sep-version.mjs','lib/installed-sep-version.mjs'],['alpha1-launcher-build.mjs','build/daily-launcher.mjs'],['runtime/alpha1-support/lib/installed-sep-version.mjs','lib/installed-sep-version.mjs']])additions.push({name,source:'../'+source,sha256:sha(await readFile(join(output,name)))});
await writeFile(join(output,'ADAPTATION-ORIGIN.json'),JSON.stringify({schema:2,kind:'alpha1-materialized-updater',origins,additions,captured,builderSha256:sha(await readFile(import.meta.filename))},null,2)+'\n');
console.log(JSON.stringify({output,adapted:origins.length}));
