import {readFile,lstat,realpath,readdir} from 'node:fs/promises';
import {join,resolve,dirname,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {spec as legacySpec} from '../store.js';
import {createLayeredMemory} from '../layered-memory.js';
import {validateSuiteConfig} from '../index.js';
import {Scope} from '../scope.js';
import {assertHostAdmission} from './host-admission.js';
import {rejectUnsupportedRecoveryMaintenance} from './recovery-maintenance.js';

const names=['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1'];
const tables=[['projects','media'],['active'],['archives','backups']];
const packages=['cordis','dsh-fs-local','dsh-storage','dsh-storage-json','dsh-storage-domain'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),HASH=/^[a-f0-9]{64}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const empty=v=>object(v)&&Object.keys(v).length===0;
const exact=(a,b)=>isDeepStrictEqual(a,b);
const key=p=>process.platform==='win32'?p.toLowerCase():p;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sanitized=e=>Object.assign(new Error(/^(?:P2_ADOPTION_HEALTH_[A-Z_]+|RECOVERY_MAINTENANCE_REQUIRED)$/.test(e?.code??'')?e.code:'P2_ADOPTION_HEALTH_FAILED'),{code:/^(?:P2_ADOPTION_HEALTH_[A-Z_]+|RECOVERY_MAINTENANCE_REQUIRED)$/.test(e?.code??'')?e.code:'P2_ADOPTION_HEALTH_FAILED'});
const identity=s=>`${s.dev}:${s.ino}`;
async function directory(path){
  if(typeof path!=='string'||!isAbsolute(path))fail('P2_ADOPTION_HEALTH_PATH');path=resolve(path);
  try{for(let p=path;;p=dirname(p)){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink())fail('P2_ADOPTION_HEALTH_PATH');if(dirname(p)===p)break;}const actual=await realpath(path);if(key(actual)!==key(path))fail('P2_ADOPTION_HEALTH_PATH');return {path:actual,identity:identity(await lstat(actual,{bigint:true}))};}catch{fail('P2_ADOPTION_HEALTH_PATH');}
}
async function file(path,limit=32*1024*1024){
  try{
    const before=await lstat(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>BigInt(limit))fail('P2_ADOPTION_HEALTH_PATH');
    const bytes=await readFile(path),after=await lstat(path,{bigint:true});if(bytes.length>limit||identity(before)!==identity(after)||before.mtimeNs!==after.mtimeNs||before.size!==after.size)fail('P2_ADOPTION_HEALTH_TARGET_CHANGED');
    return {bytes,fingerprint:{path,sha256:sha(bytes),size:bytes.length,identity:identity(after),mtimeNs:String(after.mtimeNs)}};
  }catch(e){if(e.code==='P2_ADOPTION_HEALTH_TARGET_CHANGED')throw e;fail('P2_ADOPTION_HEALTH_PATH');}
}
function parse(bytes,code){try{return JSON.parse(bytes.toString('utf8'));}catch{fail(code);}}
async function runtimeLockDirectory(path,storageRoot){
  if(typeof path!=='string'||!isAbsolute(path))fail('P2_ADOPTION_HEALTH_CONFIG');
  path=resolve(path);const rel=relative(join(storageRoot,'.suite-memory'),path);
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))fail('P2_ADOPTION_HEALTH_CONFIG');
  // A future lock directory is permitted. Every existing ancestor must remain
  // a real directory; validation never creates the lock or its parents.
  for(let p=path;;p=dirname(p)){
    try{const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink())fail('P2_ADOPTION_HEALTH_CONFIG');}
    catch(e){if(e.code!=='ENOENT')fail('P2_ADOPTION_HEALTH_CONFIG');}
    if(dirname(p)===p)break;
  }
  return path;
}
function envelopes(values){
  for(const [i,d]of values.entries())if(!keys(d,['unit','global','tables'])||!keys(d.unit,['name','version'])||d.unit.name!==names[i]||d.unit.version!==1||d.global!==null||!keys(d.tables,tables[i])||tables[i].some(name=>!object(d.tables[name])))fail('P2_ADOPTION_HEALTH_SEMANTICS');
}
async function projectsFor(input){
  if(!Array.isArray(input)||!input.length||input.length>16)fail('P2_ADOPTION_HEALTH_SCOPE');const projects=[];
  for(const p of input){
    if(!object(p)||typeof p.root!=='string'||p.userProfile!==undefined&&(typeof p.userProfile!=='string'||!p.userProfile.trim()||p.userProfile!==p.userProfile.trim()||p.userProfile.length>128))fail('P2_ADOPTION_HEALTH_SCOPE');
    const {path:root}=await directory(p.root);if(root.split(/[\\/]/).some(v=>v.toLowerCase()==='.suite-memory'))fail('P2_ADOPTION_HEALTH_SCOPE');
    for(const old of projects){const overlaps=(a,b)=>{const r=relative(a,b);return r===''||r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};if(overlaps(old.root,root)||overlaps(root,old.root))fail('P2_ADOPTION_HEALTH_SCOPE');}
    const project={root,key:sha(key(root)),...p.userProfile?{userProfile:p.userProfile}:{}};if(p.key!==undefined&&p.key!==project.key)fail('P2_ADOPTION_HEALTH_SCOPE');projects.push(project);
  }return projects;
}
function selectedSemantics(domains,projects){
  envelopes(domains);const [legacy,active,cold]=domains,catalog=active.tables.active.catalog;
  if(!exact(Object.keys(legacy.tables.projects).sort(),projects.map(p=>p.key).sort())||!empty(legacy.tables.media)||!empty(cold.tables.archives)||!empty(cold.tables.backups)||!exact(Object.keys(active.tables.active),['catalog'])||!keys(catalog,['version','owners','archives','migrations','audits'])||catalog.version!==1||!object(catalog.owners)||!empty(catalog.archives)||!empty(catalog.migrations)||!Array.isArray(catalog.audits)||catalog.audits.length)fail('P2_ADOPTION_HEALTH_SEMANTICS');
  const allowed=new Set(projects.flatMap(p=>['project:'+p.key,...p.userProfile?['user:'+sha(p.userProfile)]:[]]));if(!exact(Object.keys(catalog.owners).sort(),[...allowed].sort()))fail('P2_ADOPTION_HEALTH_SEMANTICS');
  for(const p of projects){const d=legacy.tables.projects[p.key];if(d.root!==p.root||d.index!==null||!Array.isArray(d.memories)||d.memories.length||d.workflow!==undefined)fail('P2_ADOPTION_HEALTH_SEMANTICS');for(const receipt of Object.values(d.automation?.receipts??{}))if(!keys(receipt,['status','at'])||!['done','skipped'].includes(receipt.status))fail('P2_ADOPTION_HEALTH_SEMANTICS');}
  const records=[],ids=new Set();
  for(const [owner,state]of Object.entries(catalog.owners)){
    if(!keys(state,['records','markers','events'])||!Array.isArray(state.records)||!Array.isArray(state.markers)||!object(state.events))fail('P2_ADOPTION_HEALTH_SEMANTICS');
    for(const r of state.records){
      if(r.owner!==owner||r.scope!==(owner.startsWith('user:')?'user':'project')||r.layer!==(['preference','personal','goal'].includes(r.category)?'L3':'L2')||owner.startsWith('user:')&&!['preference','personal'].includes(r.category)||ids.has(r.id)||!Array.isArray(r.historyRefs)||r.historyRefs.length||!keys(r.source,['kind','sourceHash','omittedSourceSha256'])||r.source.kind!=='adoption_selection'||!HASH.test(r.source.sourceHash??'')||!HASH.test(r.source.omittedSourceSha256??'')||r.automatic!==undefined&&(!keys(r.automatic,['expiresAt'])||typeof r.automatic.expiresAt!=='string'))fail('P2_ADOPTION_HEALTH_SEMANTICS');
      const textHash=sha(r.text.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()),keyHash=sha(r.semanticKey);
      if(state.markers.some(m=>['withdrawn','purged'].includes(m.status)&&(m.id===r.id||m.textHash===textHash||m.keyHash===keyHash)))fail('P2_ADOPTION_HEALTH_SEMANTICS');
      ids.add(r.id);records.push(r);
    }
  }
  for(const r of records)if(!Array.isArray(r.dependsOn)||r.dependsOn.some(id=>!ids.has(id)))fail('P2_ADOPTION_HEALTH_SEMANTICS');return records;
}

/** Key native/local reader fingerprints only; publication/control support is
 * independently bound by the caller. No packages are installed by this helper. */
export async function adoptionHealthRuntime({hostLibraryRoot}={}){
  try{
    const host=(await directory(hostLibraryRoot)).path,modules=[],manifests=[],paths=[];
    for(const name of packages){const manifestPath=join(host,name,'package.json'),manifest=parse((await file(manifestPath,262144)).bytes,'P2_ADOPTION_HEALTH_RUNTIME');modules.push({name,version:manifest.version});manifests.push({name,manifest});paths.push(manifestPath,join(host,name,'lib/index.js'));}
    const protocol=manifests.find(row=>row.name==='dsh-storage')?.manifest?.version==='0.1.6-alpha.2'?'adoption-native-read-alpha2-v1':'adoption-native-read-v1';
    let hostAdmission;try{hostAdmission=assertHostAdmission({protocol,modules:manifests});}catch{fail('P2_ADOPTION_HEALTH_RUNTIME');}
    paths.push(...['./adoption-health.js','./host-admission.js','./recovery-maintenance.js','../recovery-binding.js','../index.js','../scope.js','../automatic-memory.js','../p1.js','./storage.js','../store.js','../layered-memory.js','../errors.js','../layer-policy.js','../memory-commit.js','../vendor/bm25.js'].map(p=>fileURLToPath(new URL(p,import.meta.url))));
    const files=[];for(const path of paths){const value=await file(path,8*1024*1024);files.push({path,sha256:value.fingerprint.sha256});}
    return {protocol,hostAdmission,hostLibraryRoot:host,modules,files,coverage:'Native storage/filesystem package manifests/entry files and local reader/configuration/Scope dependencies; not a complete host environment or adoption-control protocol proof.'};
  }catch(e){if(e.code==='P2_ADOPTION_HEALTH_PATH')fail('P2_ADOPTION_HEALTH_RUNTIME');throw sanitized(e);}
}
async function nativeRead(storageRoot,hostLibraryRoot,domains,projects,configuration){
  const load=name=>import(pathToFileURL(join(hostLibraryRoot,name,'lib/index.js')).href),{Context}=await load('cordis'),ctx=new Context();let legacy,layers,nativeWriteAttempts=0;const opened=[];
  const deny=()=>{nativeWriteAttempts++;fail('P2_ADOPTION_HEALTH_WRITE_ATTEMPT');};
  try{
    for(const name of packages.slice(1)){const plugin=await load(name);await ctx.plugin(plugin.default??plugin,name==='dsh-storage-json'?{root:storageRoot}:name==='dsh-storage-domain'?{backend:'json'}:{});}
    if(ctx.get('llm')!==undefined)fail('P2_ADOPTION_HEALTH_RUNTIME');
    const scope=new Scope(ctx.fs,configuration.projects);
    try{await scope.init();}catch{fail('P2_ADOPTION_HEALTH_SCOPE');}
    if(!exact(scope.projects.map(p=>({root:p.root,key:p.key,...p.userProfile?{userProfile:p.userProfile}:{}})),projects))fail('P2_ADOPTION_HEALTH_SCOPE');
    projects=scope.projects;
    const backend=ctx.storage.backend.get('json');if(backend?.constructor?.name!=='JsonStorageBackend'||key(resolve(backend.root))!==key(storageRoot))fail('P2_ADOPTION_HEALTH_RUNTIME');
    const nativeUnitOpen=backend.kv.open.bind(backend.kv);backend.kv.open=async descriptor=>{
      if(!names.includes(descriptor.name)||descriptor.version!==1)fail('P2_ADOPTION_HEALTH_NATIVE_SCHEMA');const unit=await nativeUnitOpen(descriptor);
      if(key(resolve(unit.path))!==key(join(storageRoot,descriptor.name+'.json'))){await unit.close();fail('P2_ADOPTION_HEALTH_PATH');}
      for(const method of ['putRecord','deleteRecord','setGlobal','publish'])unit[method]=deny;
      return {descriptor:unit.descriptor,path:unit.path,loadAll:()=>unit.loadAll(),close:()=>unit.close(),putRecord:deny,deleteRecord:deny,setGlobal:deny};
    };
    const nativeOpen=ctx.storageDomain.open.bind(ctx.storageDomain),facility={async open(spec){
      const i=names.indexOf(spec.name);if(i<0)fail('P2_ADOPTION_HEALTH_NATIVE_SCHEMA');const domain=await nativeOpen(spec);opened.push(spec.name);
      try{for(const name of tables[i])if(!exact(Object.fromEntries(domain.table(name).entries()),domains[i].tables[name]))fail('P2_ADOPTION_HEALTH_SELECTION');}catch(e){await domain.close();throw e;}
      return {name:domain.name,close:()=>domain.close(),table(name){const t=domain.table(name);return {get:k=>structuredClone(t.get(k)),entries:()=>structuredClone([...t.entries()])[Symbol.iterator](),keys:()=>[...t.keys()][Symbol.iterator](),get size(){return t.size;},put:deny,delete:deny,clear:deny};}};
    }};
    legacy=await facility.open(legacySpec);layers=await createLayeredMemory({facility,scope,legacy:{read:p=>legacy.table('projects').get(p.key)},config:{enabled:true,migrateLegacy:false}});
    const summaries=[];for(const p of projects){const owners=['project:'+p.key,...p.userProfile?['user:'+sha(p.userProfile)]:[]],expected=owners.flatMap(owner=>domains[1].tables.active.catalog.owners[owner].records),actual=layers.read(p).map(({history,historyTotal,...r})=>{if(history.length||historyTotal!==0)fail('P2_ADOPTION_HEALTH_SEMANTICS');return r;});if(!exact(actual,expected))fail('P2_ADOPTION_HEALTH_SELECTION');summaries.push({key:p.key,visibleRecords:actual.length,sharedProfile:Boolean(p.userProfile)});}
    if(nativeWriteAttempts||!exact([...opened].sort(),[...names].sort()))fail('P2_ADOPTION_HEALTH_WRITE_ATTEMPT');return {openedNativeDomains:opened,nativeWriteAttempts,projects:summaries};
  }catch(e){if(e?.code==='invalid-record')fail('P2_ADOPTION_HEALTH_NATIVE_SCHEMA');throw sanitized(e);}
  finally{try{await layers?.close();await legacy?.close();}finally{await ctx.fiber.dispose();}}
}

/** Read-only reviewed host adaptation over the actual target. The caller must hold its
 * publication exclusion lock and validate the independent control protocol.
 * This never applies the suite plugin, migrates, opens a business writer,
 * changes the budget, creates reports, or certifies a desktop installation. */
async function healthAdoption({storageRoot,configPath,expectedDomains,projects,hostLibraryRoot,phase,stagingRoot}={}){
  try{
    const storage=await directory(storageRoot);storageRoot=storage.path;
    let reading=storage;
    if(phase==='staging'){
      if(typeof stagingRoot!=='string'||!isAbsolute(stagingRoot)||stagingRoot.split(/[\\/]/).some(part=>part==='.'||part==='..'))fail('P2_ADOPTION_HEALTH_PATH');
      const parts=relative(storageRoot,resolve(stagingRoot)).split(sep);
      if(parts.length!==5||parts[0]!=='.suite-memory'||parts[1]!=='p2'||parts[2]!=='adoptions'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(parts[3])||parts[4]!=='staging')fail('P2_ADOPTION_HEALTH_PATH');
      reading=await directory(stagingRoot);
    }
    const readRoot=reading.path;
    if(!Array.isArray(expectedDomains)||expectedDomains.length!==3||typeof configPath!=='string'||!isAbsolute(configPath))fail('P2_ADOPTION_HEALTH_CONFIG');configPath=resolve(configPath);await directory(dirname(configPath));
    const expected=expectedDomains.map(value=>Buffer.isBuffer(value)||value instanceof Uint8Array?parse(Buffer.from(value),'P2_ADOPTION_HEALTH_SEMANTICS'):structuredClone(value));
    const configFile=await file(configPath,262144);let config;
    try{config=validateSuiteConfig(parse(configFile.bytes,'P2_ADOPTION_HEALTH_CONFIG'));}catch{fail('P2_ADOPTION_HEALTH_CONFIG');}
    rejectUnsupportedRecoveryMaintenance(config);
    const scoped=await projectsFor(projects),records=selectedSemantics(expected,scoped);
    if(!object(config)||config.enabled!==true||config.configFile!==undefined||config.memoryLayers?.enabled!==true||config.memoryLayers.migrateLegacy!==false||config.p2?.enabled!==true||typeof config.p2.storageRoot!=='string'||key((await directory(config.p2.storageRoot)).path)!==key(storageRoot)||config.modules?.memory===false)fail('P2_ADOPTION_HEALTH_CONFIG');
    if(!exact(await projectsFor(config.projects),scoped))fail('P2_ADOPTION_HEALTH_SCOPE');
    const lockDirectory=await runtimeLockDirectory(config.lockDirectory,storageRoot);
    const before=[];for(const [i,name]of names.entries()){
      const actual=await file(join(readRoot,name+'.json'));before.push(actual.fingerprint);
      if(!exact(parse(actual.bytes,'P2_ADOPTION_HEALTH_SEMANTICS'),expected[i])||(Buffer.isBuffer(expectedDomains[i])||expectedDomains[i] instanceof Uint8Array)&&sha(expectedDomains[i])!==actual.fingerprint.sha256)fail('P2_ADOPTION_HEALTH_SELECTION');
    }
    const listing=(await readdir(readRoot)).sort(),runtime=await adoptionHealthRuntime({hostLibraryRoot});let result,error;
    try{result=await nativeRead(readRoot,runtime.hostLibraryRoot,expected,scoped,config);}catch(e){error=e;}
    let after,configAfter;try{after=await Promise.all(names.map(async name=>(await file(join(readRoot,name+'.json'))).fingerprint));configAfter=(await file(configPath,262144)).fingerprint;
      if(!exact(before,after)||!exact(configFile.fingerprint,configAfter)||!exact(storage,await directory(storageRoot))||!exact(reading,await directory(readRoot))||!exact(listing,(await readdir(readRoot)).sort()))fail('P2_ADOPTION_HEALTH_TARGET_CHANGED');
    }catch{fail('P2_ADOPTION_HEALTH_TARGET_CHANGED');}
    if(!exact(runtime,await adoptionHealthRuntime({hostLibraryRoot})))fail('P2_ADOPTION_HEALTH_RUNTIME_CHANGED');if(error)throw error;
    return {status:'pass',phase,readRoot,adapterProtocol:runtime.protocol,adoptionControlProtocolValidated:false,runtime,...result,records:records.length,modelCalls:0,budgetSettlements:0,configuration:{path:configPath,sha256:configAfter.sha256,p2StorageRoot:storageRoot,migrateLegacy:false,lockDirectory,completeSchemaValidated:true,sourceScopeValidated:true},domains:after.map((f,i)=>({name:names[i],sha256:f.sha256,size:f.size,identity:f.identity})),inputBytesUnchanged:true,selectionPreserved:true,historyOmitted:true,scope:'Actual admitted host JSON/domain read adapter and native filesystem Scope validation with denied domain write primitives; no suite deployment, business-writer opening, complete host validation or OS read-only sandbox.'};
  }catch(e){throw sanitized(e);}
}

export const healthAdoptionTarget=input=>healthAdoption({...input,phase:'target',stagingRoot:undefined});
/** The caller holds and confirms the copy ledger. Only its canonical registered
 * staging layout is eligible; no projected configuration or copy is created. */
export const healthAdoptionStaging=input=>healthAdoption({...input,phase:'staging'});
