import {cp,mkdir,readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildDailyRecovery} from './daily-recovery.mjs';
import {adaptUpdaterInventory} from './updater-inventory.mjs';
const base=process.env.SEP_BUNDLE_TEST_ROOT,generation=process.argv[2];
if(!/^r[1-9][0-9]*$/.test(generation??''))throw Error('INVALID_GENERATION');
const out=join(base,'alpha2-runtime-'+generation);await mkdir(out);
await cp(join(base,'alpha2-runtime-r2'),out,{recursive:true});
const core=join(out,'node_modules/dsh-sep-bundle'),recovery=join(out,'node_modules/@deepseek-ai/dsh-recovery');
await buildDailyRecovery({coreRoot:core,out:recovery,leaseSource:resolve(process.env.SEP_DAILY_ADAPTER_SOURCE,'lib/project-write-lease.mjs')});
const desktopGeneration=process.env.SEP_DAILY_DESKTOP_BUILD??'integrated-desktop-r2';
await cp(join(base,desktopGeneration,'desktop-host/lib'),join(out,'node_modules/@deepseek-ai/dsh-desktop-host/lib'),{recursive:true});
const desktop=join(out,'node_modules/@deepseek-ai/dsh-desktop');
for(const part of ['lib','resources','renderer'])await cp(join(base,desktopGeneration,'app',part),join(desktop,part),{recursive:true});
const desktopManifest=JSON.parse(await readFile('D:/AIData/ProjectWork/DSH/alpha2-desktop-continuation-20261012/source-r1/desktop-source/apps/desktop/package.json'));
// SEP's retained ZIP extractor is outside the official main bundle. Bind its
// exact dependency and materialize its complete runtime dependency closure.
desktopManifest.dependencies.yauzl='3.4.0';
const oldRoot='D:/AIData/ProjectWork/DSH/dsh-020rc2-20260929/upstream';
for(const [name,version] of [['yauzl','3.4.0'],['pend','1.2.0']]){
 const source=join(oldRoot,'node_modules/.pnpm',name+'@'+version,'node_modules',name);
 const meta=JSON.parse(await readFile(join(source,'package.json')));
 if(meta.name!==name||meta.version!==version)throw Error('DAILY_EXTRA_DEPENDENCY_IDENTITY');
 await cp(source,join(out,'node_modules',name),{recursive:true,filter:path=>!path.slice(source.length).split(/[\\/]/).includes('node_modules')});
}
for(const section of ['dependencies','peerDependencies','devDependencies'])for(const [name,version] of Object.entries(desktopManifest[section]??{}))if(version.startsWith('workspace:'))desktopManifest[section][name]=name.startsWith('@deepseek-ai/cordis')?'4.0.5-alpha.1':'0.2.1-alpha.2';
await writeFile(join(desktop,'package.json'),JSON.stringify(desktopManifest,null,2)+'\n');
const daily=(process.env.SEP_RETAINED_DAILY_ROOT??(()=>{throw Error('SEP_RETAINED_DAILY_ROOT_REQUIRED');})());
const prior=JSON.parse(await readFile(join(daily,'deployment-rc2.json')));
// Existing rounded product icons are program assets, not user data.
await cp(join(prior.releaseRoot,'node_modules/@deepseek-ai/dsh-desktop/resources'),join(desktop,'resources'),{recursive:true});
const inventoryPath=join(desktop,'lib/sep-update/update-inventory.mjs'),inventory=await readFile(inventoryPath,'utf8');
const inventoryAdaptation=adaptUpdaterInventory(inventory);
await writeFile(inventoryPath,inventoryAdaptation.text);
await cp(resolve(process.env.SEP_DAILY_ADAPTER_SOURCE,'lib/graph-layout.mjs'),join(desktop,'lib/sep-update/graph-layout.mjs'));
const updateProfilePath=join(desktop,'lib/sep-update/update-profile.mjs'),updateProfile=await readFile(updateProfilePath,'utf8');let profileText=updateProfile;const profileTransforms=[];
const replaceProfile=(from,to)=>{if(profileText.split(from).length!==2)throw Error('DAILY_INVENTORY_ORIGIN: '+from);profileText=profileText.replace(from,to);profileTransforms.push({from,to});};
replaceProfile("  const dir=join(root,'store',id);",'  const dir=packageRoot(root,graph,id);');
replaceProfile('  return {home:context.home===null?',"  if(context.profileRoot!==undefined&&(typeof context.profileRoot!=='string'||!isAbsolute(context.profileRoot)))throw Error('UPDATE_PROFILE_CONTEXT_REQUIRED');\n  return {...(context.profileRoot?{profileRoot:resolve(context.profileRoot)}:{}),home:context.home===null?");
replaceProfile('const ctx=profileContextIdentity(context),warnings=[];','const ctx=profileContextIdentity(context),profileRoot=ctx.profileRoot??root,warnings=[];');
for(const name of ['package.json','compatibility.json'])replaceProfile("join(root,'"+name+"')","join(profileRoot,'"+name+"')");
replaceProfile("join(root,'cordis.patch.yml'),","join(profileRoot,'cordis.patch.yml'),");
replaceProfile("readProfileManifest('sep-update',root)","readProfileManifest('sep-update',profileRoot)");
replaceProfile('ctx.installAnchor,root)','ctx.installAnchor,profileRoot)');
replaceProfile("loadOptionalPatches('sep-update',join(root,'cordis.patch.yml'))","loadOptionalPatches('sep-update',join(profileRoot,'cordis.patch.yml'))");
await writeFile(updateProfilePath,"import {packageRoot} from './graph-layout.mjs';\n"+profileText);
await writeFile(join(out,'DAILY-UPDATER-ORIGIN.json'),JSON.stringify({sourceSha256:(await import('node:crypto')).createHash('sha256').update(inventory).digest('hex'),transforms:inventoryAdaptation.transforms,resultSha256:(await import('node:crypto')).createHash('sha256').update(inventoryAdaptation.text).digest('hex')},null,2)+'\n');
for(const name of ['ui-settings-general','ui-settings-account','ui-chat','ui-settings','remotes']){
 const target=join(out,'node_modules/@deepseek-ai/dsh-'+(name==='remotes'?'api-remotes':'client-'+name), 'lib');
 await cp(join(base,'integrated-client-r1',name),target,{recursive:true});
}
const brand=join(out,'node_modules/dsh-sep-brand');await cp(join(core,'bundle/modules/sep-brand'),brand,{recursive:true});
const brandManifest=JSON.parse(await readFile(join(brand,'package.json')));
brandManifest.peerDependencies={'@deepseek-ai/cordis':'4.0.5-alpha.1','@deepseek-ai/dsh-client-ui-sidebar':'0.2.1-alpha.2'};
await writeFile(join(brand,'package.json'),JSON.stringify(brandManifest,null,2)+'\n');
const packagePath=join(out,'package.json'),manifest=JSON.parse(await readFile(packagePath));
manifest.dependencies['@deepseek-ai/dsh-recovery']=JSON.parse(await readFile(join(recovery,'package.json'))).version;
manifest.dependencies['dsh-sep-brand']=brandManifest.version;
await writeFile(packagePath,JSON.stringify(manifest,null,2)+'\n');
const {writeDesktopRuntime,verifyDesktopRuntime}=await import(pathToFileURL(join(out,'build-runtime-helper.mjs')));
const original=JSON.parse(await readFile(join(base,'alpha2-runtime-r2/desktop-runtime.json')));
writeDesktopRuntime(out,original.release,[...original.sharedPackages.map(row=>row.name),'@deepseek-ai/dsh-recovery','dsh-sep-brand'],{platform:'win32',arch:'x64'});
await verifyDesktopRuntime(out,'0.2.1-alpha.2',{platform:'win32',arch:'x64'});
let count=0;async function check(at){for(const name of await readdir(at)){const path=join(at,name),s=await lstat(path);if(s.isSymbolicLink())throw Error('INTEGRATED_GRAPH_ALIAS');if(s.isDirectory())await check(path);else if(s.isFile()&&s.nlink===1)count++;else throw Error('INTEGRATED_GRAPH_IDENTITY');}}await check(out);
await writeFile(join(base,'INTEGRATED-RUNTIME-'+generation+'.json'),JSON.stringify({status:'built-not-deployable',root:out,files:count,desktop:desktopGeneration,client:'integrated-client-r1',brand:'retained rounded daily assets, exact target peers',notVerified:['persistent trusted launcher','complete managed Electron lifecycle','private continuation','final reviewed deployment plan']},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,files:count,status:'built-not-deployable'}));
