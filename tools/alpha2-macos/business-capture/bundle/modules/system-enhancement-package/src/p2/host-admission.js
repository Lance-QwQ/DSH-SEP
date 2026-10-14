const adapters={
  'maintenance-native-read-v1':['cordis','dsh-system-prompt','dsh-tools','dsh-fs-local','dsh-storage','dsh-storage-json','dsh-storage-domain','dsh-llm','dsh-session','dsh-agent','dsh-agent-loop'],
  'adoption-native-read-v1':['cordis','dsh-fs-local','dsh-storage','dsh-storage-json','dsh-storage-domain'],
};
const p1Modules=['dsh-user-approval','dsh-subagent','dsh-subagent-spawn-in-process'];
adapters['maintenance-native-read-rc2-v1']=adapters['maintenance-native-read-v1'];
adapters['maintenance-native-read-alpha2-v1']=adapters['maintenance-native-read-v1'];
adapters['adoption-native-read-alpha2-v1']=adapters['adoption-native-read-v1'];
const baselines={'0.1.0-rc.5':'rc.5','0.1.0-rc.5-local.p1.3':'rc.5-local.p1.3'};
const repairBase='0.1.0-rc.5-local.p1.3';
const repairVersions={'dsh-fs-local':repairBase+'.stability1','dsh-storage-json':repairBase+'.storage2'};
const repairProfile='rc.5-local.p1.3-fs-stability1-storage2';
const fail=()=>{throw Object.assign(new Error('Host packages do not match a reviewed adapter baseline.'),{code:'P2_HOST_ADMISSION'});};

function assertRepairManifest(name,manifest){
  if(manifest.version!==repairVersions[name]||manifest.private!==true)fail();
  if(name==='dsh-fs-local'){
    const expected={kind:'private-isolated-host-repair',baseHostVersion:repairBase,label:'stability1',scope:'fs-local recovery-record publication only'},actual=manifest.dshLocalBuild;
    if(!actual||Object.keys(actual).length!==Object.keys(expected).length||Object.entries(expected).some(([key,value])=>actual[key]!==value))fail();
  }else{
    // This exact archive has no injected local-build declaration. Its provenance
    // is established by external source/member hashes, not invented metadata.
    const expected={'@deepseek-ai/dsh-invariants':repairBase,'@deepseek-ai/dsh-storage':repairBase,'@deepseek-ai/cordis':'4.0.1'},actual=manifest.peerDependencies;
    if(manifest.dshLocalBuild!==undefined||!actual||Object.keys(actual).length!==3||Object.entries(expected).some(([key,value])=>actual[key]!==value))fail();
  }
}

/** Compatibility admission of the adapter's complete requested module group.
 * Manifest claims are not executable integrity or functional health proof;
 * callers retain native schema/read checks and their independent file binding. */
export function assertHostAdmission({protocol,modules,p1NativeServices=false}={}){
  if(!Object.hasOwn(adapters,protocol??'')||typeof p1NativeServices!=='boolean'||protocol?.startsWith('adoption-')&&p1NativeServices||!Array.isArray(modules))fail();
  const expected=[...adapters[protocol],...p1NativeServices?p1Modules:[]];
  if(modules.length!==expected.length||new Set(modules.map(item=>item?.name)).size!==expected.length||modules.some(item=>!expected.includes(item?.name)))fail();
  if(protocol==='maintenance-native-read-alpha2-v1'||protocol==='adoption-native-read-alpha2-v1'){
    for(const {name,manifest} of modules)if(manifest?.name!=='@deepseek-ai/'+name||manifest.version!==(name==='cordis'?'4.0.2':'0.1.6-alpha.2'))fail();
    return {protocol,baseline:'0.1.6-alpha.2',dshPackageVersion:'0.1.6-alpha.2',cordisVersion:'4.0.2',p1NativeServices,
      modules:modules.map(({name,manifest})=>({name,version:manifest.version})),completeHostIntegrity:false,
      scope:'Exact alpha.2 read adapter manifest group. Separate byte binding, native health, adoption control and publication checks remain required.'};
  }
  if(protocol==='maintenance-native-read-rc2-v1'){
    for(const {name,manifest} of modules)if(manifest?.name!=='@deepseek-ai/'+name||manifest.version!==(name==='cordis'?'4.0.2':'0.1.5-rc.2'))fail();
    return {protocol,baseline:'0.1.5-rc.2',dshPackageVersion:'0.1.5-rc.2',cordisVersion:'4.0.2',p1NativeServices,
      modules:modules.map(({name,manifest})=>({name,version:manifest.version})),completeHostIntegrity:false,
      scope:'Exact rc.2 read-only maintenance service group; separate byte binding and native health required. No adoption or recovery publication authorization.'};
  }
  const repaired=modules.some(({name,manifest})=>Object.hasOwn(repairVersions,name)&&manifest?.version===repairVersions[name]);
  if(repaired&&Object.entries(repairVersions).some(([name,version])=>modules.find(item=>item.name===name)?.manifest?.version!==version))fail();
  let version=repaired?repairBase:undefined;
  for(const {name,manifest} of modules){
    if(manifest?.name!=='@deepseek-ai/'+name)fail();
    if(name==='cordis'){if(manifest.version!=='4.0.1')fail();continue;}
    if(repaired&&Object.hasOwn(repairVersions,name)){assertRepairManifest(name,manifest);continue;}
    if(!Object.hasOwn(baselines,manifest.version??'')||version!==undefined&&manifest.version!==version)fail();
    version=manifest.version;
    if(version==='0.1.0-rc.5-local.p1.3'){
      const build=manifest.dshLocalBuild;
      if(build?.kind!=='private-isolated-host'||build.upstreamVersion!=='0.1.0-rc.5'||build.label!=='p1.3')fail();
    }else if(manifest.dshLocalBuild!==undefined)fail();
  }
  return {protocol,baseline:baselines[version],dshPackageVersion:version,cordisVersion:'4.0.1',p1NativeServices,
    ...repaired?{profile:repairProfile,repairVersions:{...repairVersions}}:{},
    modules:modules.map(({name,manifest})=>({name,version:manifest.version})),completeHostIntegrity:false,
    scope:'Exact reviewed manifest group and adapter protocol admission; executable identity and native functional health are separately verified.'};
}
