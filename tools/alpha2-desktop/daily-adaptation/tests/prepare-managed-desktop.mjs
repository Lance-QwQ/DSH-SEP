// Synthetic installation builder. Never use this to select private daily data.
import {mkdir,writeFile,readFile,readdir,cp} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildDailyComposition} from '../build/daily-composition.mjs';
import {buildDailyLauncher} from '../build/daily-launcher.mjs';
import {writeProgramGraph} from '../build/program-graph.mjs';
import {adaptDailyPresets} from '../lib/daily-presets.mjs';
import {buildProfileSelection} from '../lib/daily-profile.mjs';
const repo=process.env.SEP_SOURCE_REPO,H=process.env.SEP_DAILY_MANAGED_HOST;
const generation=process.argv[2]??'r1';if(!/^r[1-9][0-9]*$/.test(generation))throw Error('GENERATION');
const {setup,close,load}=await import(pathToFileURL(join(repo,'tools/bundle-install/tests/native-settings-fixture.mjs')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const realistic=process.env.SEP_DAILY_REALISTIC_PROFILE==='1';
const clean=process.env.SEP_DAILY_CLEAN_PROBE==='1';
const f=await setup({mountRoot:false});
try{
 const core=join(H,'node_modules/dsh-sep-bundle'),adapter=join(H,'daily-adapter');if(!clean)await buildDailyComposition({coreRoot:core,out:adapter});
 let configuration=structuredClone(f.input);delete configuration.runtime.compaction.nativeEntryId;
 let converted;
 if(realistic){
  const daily=(process.env.SEP_RETAINED_DAILY_ROOT??(()=>{throw Error('SEP_RETAINED_DAILY_ROOT_REQUIRED');})()),current=JSON.parse(await readFile(join(daily,'deployment-rc2.json')));
  const sourcePatch=await readFile(join(current.releaseRoot,'cordis.patch.yml')),sourceSuite=await readFile(join(daily,'managed-rc2/suite-config.json'));
  const suite=JSON.parse(sourceSuite);suite.projects[0].sources=['资料'];
  converted=buildProfileSelection({programRoot:H,project:{id:configuration.runtime.profile.selection.projectId,root:f.dirs.project},roots:configuration.runtime.profile.selection.roots,budgetPath:f.budgetPath,savedSourceRoot:join(f.base,'saved-sources'),suite,patches:JSON.parse(sourcePatch)});
  configuration={runtime:converted.runtime,ui:configuration.ui};
  await writeFile(join(f.base,'SOURCE-PROFILE-BINDING.json'),JSON.stringify({patchSha256:sha(sourcePatch),suiteSha256:sha(sourceSuite),scope:'Actual daily policy shape, synthetic paths/data/key; source files not modified'})+'\n');
 }
 const bindings=[];for(const path of [join(core,'package.json'),...(await readdir(adapter)).map(name=>join(adapter,name))])bindings.push({path,sha256:sha(await readFile(path))});
 const selection={schema:2,dsh:'0.2.1-alpha.2',sep:'0.2.1-beta.3-alpha2-adapter.1',bundleRoot:core,dailyAdapterRoot:adapter,nativeCompactionEntryKey:converted?.nativeEntryKey??'native',configuration,bindings};
 const selectionPath=join(f.base,'daily-selection.json'),selectionBytes=JSON.stringify(selection)+'\n';await writeFile(selectionPath,selectionBytes);
 const {PROFILE_TEMPLATES,loadOverlayPatches}=await load('@deepseek-ai/dsh-app-boot');
 const presets=['standard','cordis','minimal','ptc'].map(name=>loadOverlayPatches('dsh',join(H,'node_modules/@deepseek-ai/dsh-web-app/presets',name+'.patch.yml'))[0].insert[0]);
 const profileRoot=join(f.base,'profile');await mkdir(profileRoot);
 await writeFile(join(profileRoot,'package.json'),JSON.stringify({name:'sep-synthetic-managed-profile',private:true,type:'module',dsh:{profile:{bundles:PROFILE_TEMPLATES.web.bundles}}})+'\n');
 const recovery=join(H,'node_modules/@deepseek-ai/dsh-recovery');
 const patch=[...adaptDailyPresets(presets),...(converted?.patches??[...['fs-sandbox','session-persistence-jsonl','desktop-product-telemetry','product-analytics','session-telemetry-otel','otel'].map(id=>({id,disabled:true})),{id:'storage-json',config:{root:f.dirs.memory}},{id:'sandbox-policy',config:{mode:'workspace-write',workspaceRoot:f.dirs.project}},{insert:[{id:'native',name:'@deepseek-ai/dsh-compaction-basic',config:{auto:true,thresholdRatio:.08,retainRatio:.016,maxTokens:8192,compactionRetries:0,maxOverflowRetries:2}},{id:'sep-brand',name:pathToFileURL(join(H,'node_modules/dsh-sep-brand/lib/index.js')).href,config:{}},{id:'sep-recovery',name:pathToFileURL(join(recovery,'src/host-plugin.mjs')).href,config:{registerSelectedWorkspaces:true}},{id:'sep-continuation',name:pathToFileURL(join(recovery,'src/desktop-continuation.mjs')).href,config:{}}]}])];
 await writeFile(join(profileRoot,'cordis.patch.yml'),JSON.stringify(patch)+'\n');
 for(const name of ['state','dsh-home','electron-data','runtime-user','runtime-user/temp'])await mkdir(join(f.base,name),{recursive:true});
 await writeFile(join(f.base,'electron-data/background-close-confirmed'),'synthetic preconfirmed notice\n');
 // The test bootstrap uses the real desktop and managed connection, adding
 // bounded observations and a synthetic GitHub response. It is test-only.
 const desktop=join(H,'node_modules/@deepseek-ai/dsh-desktop');
 const probeRoot=clean?join(f.base,'external-desktop-probe'):join(desktop,'lib');if(clean){await mkdir(probeRoot);await writeFile(join(probeRoot,'package.json'),JSON.stringify({name:'sep-clean-program-probe',version:'0.2.1-alpha.2',type:'module',main:'sep-test-bootstrap.mjs'})+'\n');}
 await cp(resolve(process.env.SEP_DAILY_ADAPTER_SOURCE,'tests/desktop-probe-bootstrap.mjs'),join(probeRoot,'sep-test-bootstrap.mjs'));
 if(!clean){const appManifest=JSON.parse(await readFile(join(desktop,'package.json')));appManifest.main='lib/sep-test-bootstrap.mjs';await writeFile(join(desktop,'package.json'),JSON.stringify(appManifest,null,2)+'\n');}
 const receipt=join(f.base,'MANAGED-DESKTOP-LIFECYCLE.json');
 await writeFile(join(probeRoot,'sep-test-input.json'),JSON.stringify({...(clean?{appRoot:desktop,desktopMain:join(desktop,'lib/main.js')}:{ }),userData:join(f.base,'electron-data'),receipt,project:f.dirs.project,notVerified:['actual tray click','first-close native prompt','manual drag','paid model','private continuation']})+'\n');
 await close(f);
 const graph=clean?{sha256:sha(await readFile(join(H,'graph.json')))}:await writeProgramGraph(H);
 const {writeDesktopRuntime,verifyDesktopRuntime}=await import(pathToFileURL(join(H,'build-runtime-helper.mjs')));
 const prior=JSON.parse(await readFile(join(H,'desktop-runtime.json')));if(!clean)writeDesktopRuntime(H,prior.release,prior.sharedPackages.map(row=>row.name),{platform:'win32',arch:'x64'});await verifyDesktopRuntime(H,'0.2.1-alpha.2',{platform:'win32',arch:'x64'});
 const launchSource=join(process.env.SEP_REAL_SOURCE_REPO,'tools/offline-upgrade-bridge-beta2/operator/shared/sep-update/runtime/launcher'),launcher=join(f.base,'launcher');await buildDailyLauncher({sourceRoot:launchSource,out:launcher,graphHash:graph.sha256,adapterSource:process.env.SEP_DAILY_ADAPTER_SOURCE});
 const daily=(process.env.SEP_RETAINED_DAILY_ROOT??(()=>{throw Error('SEP_RETAINED_DAILY_ROOT_REQUIRED');})());
 await mkdir(join(f.base,'runtime'));await cp(join(daily,'runtime/primary-runtime'),join(f.base,'runtime/primary-runtime'),{recursive:true});
 await cp(join(daily,'runtime/office-skills'),join(f.base,'runtime/office-skills'),{recursive:true});
 const config={schema:1,kind:'dsh-sep-managed-daily',dailyRoot:f.base,releaseRoot:H,graphHash:graph.sha256,nodeExecutable:process.execPath,home:join(f.base,'dsh-home'),storageRoot:f.dirs.memory,controlRoot:join(f.base,'authority'),lockDirectory:f.dirs.locks,electronUserData:join(f.base,'electron-data'),runtimeUser:join(f.base,'runtime-user'),credentialsPath:join(f.base,'synthetic.env'),pnpmEntry:process.env.SEP_DAILY_PNPM,projects:[{id:configuration.runtime.profile.selection.projectId,root:f.dirs.project}],dailySelectionPath:selectionPath,dailySelectionSha256:sha(selectionBytes),runtimeDescriptorSha256:sha(await readFile(join(H,'desktop-runtime.json')))};
 const {auditDesktopPayload}=await import(pathToFileURL(join(launcher,'desktop-payload.mjs')));
 const desktopRuntimeRoot=resolve(process.env.SEP_DAILY_ELECTRON_PAYLOAD),payload={schema:1,platform:'win32-x64',version:'44.7.0',executable:'electron.exe',...await auditDesktopPayload(desktopRuntimeRoot)};
 const payloadBytes=JSON.stringify(payload)+'\n',desktopPayloadPath=join(f.base,'desktop-payload.json');await writeFile(desktopPayloadPath,payloadBytes);
 Object.assign(config,{profileRoot,desktopRuntimeRoot,desktopPayloadPath,desktopPayloadSha256:sha(payloadBytes)});
 await writeFile(config.credentialsPath,'DEEPSEEK_API_KEY=synthetic-not-a-real-key\n');
 await writeFile(join(f.base,'deployment.json'),JSON.stringify(config,null,2)+'\n');
 await writeFile(join(process.env.SEP_BUNDLE_TEST_ROOT,'MANAGED-DESKTOP-FIXTURE-'+generation+'.json'),JSON.stringify({base:f.base,launcher:join(launcher,'launcher.mjs'),config:join(f.base,'deployment.json'),receipt,graphHash:graph.sha256,...(clean?{externalDesktopEntry:probeRoot}:{}),status:'synthetic-prepared-not-run'},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({base:f.base,graphHash:graph.sha256,status:'synthetic-prepared-not-run'}));
}catch(error){await close(f).catch(()=>{});throw error;}
