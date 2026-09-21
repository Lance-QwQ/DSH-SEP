import {readFile,writeFile,mkdir,realpath,mkdtemp} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {runCommand,fingerprintFiles} from './artifacts.js';
import {spec as legacySpec} from '../store.js';
import {createLayeredMemory} from '../layered-memory.js';
import {assertHostAdmission} from './host-admission.js';
import {rejectUnsupportedRecoveryMaintenance} from './recovery-maintenance.js';

const DOMAIN_TABLES={dsh_enhancement_suite_v1:['projects','media'],dsh_four_layer_memory_v1:['active'],dsh_four_layer_archive_v1:['archives','backups']};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value,allowed)=>object(value)&&Object.keys(value).every(key=>allowed.includes(key));

async function verifyEnvelopes(storageRoot,{legacyRollback=false}={}){
  const result=[];
  for(const [name,tables] of Object.entries(DOMAIN_TABLES)){
    let bytes,body;
    try{bytes=await readFile(join(storageRoot,name+'.json'));body=JSON.parse(bytes.toString('utf8'));}
    catch(error){
      if(legacyRollback&&name!=='dsh_enhancement_suite_v1'&&error.code==='ENOENT'){
        result.push({name,exists:false,sha256:null,tables:{}});continue;
      }
      fail('P2_HEALTH_SCHEMA',`Required data domain is missing or invalid: ${name}`);
    }
    if(!exactKeys(body,['unit','global','tables'])||!exactKeys(body.unit,['name','version'])||body.unit.name!==name||body.unit.version!==1||
      !exactKeys(body.tables,tables)||Object.values(body.tables).some(records=>!object(records)))fail('P2_HEALTH_SCHEMA',`Unknown domain version or unrecognized tables: ${name}`);
    result.push({name,sha256:sha(bytes),tables:Object.fromEntries(tables.map(table=>[table,Object.keys(body.tables[table]??{}).length]))});
  }
  return result;
}

async function assertInstalled(profileRoot,artifact,version){
  if(!artifact?.members?.length||!artifact.entry?.path)fail('P2_HEALTH_CONFIG','Health requires inspected package members and entry.');
  const packageRoot=await realpath(join(profileRoot,'node_modules/dsh-system-enhancement-package'));
  const metadata=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
  if(metadata.name!=='dsh-system-enhancement-package'||metadata.version!==version)fail('P2_HEALTH_PACKAGE','Installed version differs from the plan.');
  for(const member of artifact.members.filter(entry=>entry.type==='file')){
    if(!member.path.startsWith('package/'))fail('P2_HEALTH_PACKAGE','Unrecognized package member.');
    const path=await realpath(join(packageRoot,...member.path.split('/').slice(1)));const rel=relative(packageRoot,path);
    if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)||sha(await readFile(path))!==member.sha256)fail('P2_HEALTH_PACKAGE','Installed package changed before health checking.');
  }
  return {packageRoot,entryPath:join(packageRoot,...artifact.entry.path.split('/').slice(1))};
}

/** Cold maintenance probe of the real installed module and real selected data.
 * This is not a desktop restart, paid model test, or an OS security sandbox. */
export async function healthProfile({plan,profileRoot,storageRoot,phase,version,recoveryAuthority}){
  const runtime=plan?.runtime;
  const configurationSource=phase==='rollback'&&runtime?.currentSuiteConfig?'currentSuiteConfig':'suiteConfig';
  const config=runtime?.[configurationSource];
  let recoveryScope;
  if(config?.recovery?.enabled){
    if(typeof recoveryAuthority!=='function')rejectUnsupportedRecoveryMaintenance(config);
    recoveryScope=await recoveryAuthority();
    if(!recoveryScope?.planHash||recoveryScope.planHash!==plan.hash||recoveryScope.transactionId!==plan.id||!Array.isArray(recoveryScope.projects)||await realpath(recoveryScope.storageRoot)!==await realpath(plan.storageRoot??storageRoot))fail('RECOVERY_MAINTENANCE_CHANGED','Held maintenance scope differs from this plan.');
  }
  if(!isAbsolute(runtime?.hostLibraryRoot??'')||!config?.enabled||!Array.isArray(config.projects)||!config.projects.length||!isAbsolute(plan?.directory??'')){
    fail('P2_HEALTH_CONFIG','An explicit host library root and enabled, scoped suiteConfig are required.');
  }
  profileRoot=await realpath(profileRoot);storageRoot=await realpath(storageRoot);
  const artifact=phase==='rollback'?plan.current:plan.candidate;
  const installed=await assertInstalled(profileRoot,artifact,version);
  const legacyRollback=phase==='rollback'&&version==='0.1.0-alpha.5'&&plan.migration?.id==='alpha5-legacy-to-four-layer-v1'&&!config.memoryLayers?.enabled&&!config.p2?.enabled;
  const domains=await verifyEnvelopes(storageRoot,{legacyRollback});
  const domainPaths=Object.keys(DOMAIN_TABLES).map(name=>join(storageRoot,name+'.json'));
  const before=await fingerprintFiles(domainPaths);
  await mkdir(join(plan.directory,'health'),{recursive:true});const directory=await mkdtemp(join(plan.directory,'health',phase+'-'));
  const payload={profileRoot,storageRoot,phase,version,config,legacyRollback,hostLibraryRoot:runtime.hostLibraryRoot,directory,...installed,...recoveryScope?{recoveryProjects:recoveryScope.projects}:{}};
  const input=join(directory,'input.json');await writeFile(input,JSON.stringify(payload));
  const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','PATHEXT','USERPROFILE','TEMP','TMP','COMSPEC'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
  Object.assign(env,{DSH_HOME:join(directory,'dsh-home'),DSH_TELEMETRY_DISABLED:'1',DSH_TELEMETRY_MODE:'DISABLED',OTEL_SDK_DISABLED:'true'});
  let command,error;
  try{command=await runCommand(runtime.nodePath??process.execPath,[fileURLToPath(import.meta.url),'--p2-health-child',input],
    {cwd:directory,env,timeoutMs:runtime.timeoutMs??60000,logDirectory:directory,label:'native-health'});}
  catch(cause){error=Object.assign(new Error('Native candidate health check failed.'),{code:cause.code==='P2_PROCESS_TREE_UNKNOWN'?cause.code:'P2_HEALTH_FAILED',result:cause.result,cause});}
  const after=await fingerprintFiles(domainPaths);
  if(recoveryScope&&JSON.stringify(await recoveryAuthority())!==JSON.stringify(recoveryScope))fail('RECOVERY_MAINTENANCE_CHANGED','Held maintenance scope changed during health.');
  if(JSON.stringify(before)!==JSON.stringify(after))fail('P2_HEALTH_TARGET_CHANGED','Health probe changed or raced with selected target data.');
  await assertInstalled(profileRoot,artifact,version);
  if(error)throw error;
  let proof;
  try{proof=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));}
  catch{fail('P2_HEALTH_FAILED','Native health process exited without a structured report.');}
  if(proof.status!=='pass'||proof.version!==version||proof.modelCalls!==0)fail('P2_HEALTH_FAILED','Native health proof is incomplete.');
  return {...proof,phase,configurationSource,domains:domains.map(item=>({...item,nativeSchemaValidated:item.exists!==false})),targetFingerprints:after,
    reportPath:join(directory,'result.json'),process:{exitCode:command.exitCode,stdoutPath:command.stdoutPath,stderrPath:command.stderrPath}};
}

async function nativeProbe(input){
  if(!input.recoveryProjects)rejectUnsupportedRecoveryMaintenance(input.config);
  const {hostLibraryRoot,storageRoot,entryPath,directory,version}=input;
  const load=name=>import(pathToFileURL(join(hostLibraryRoot,name,'lib/index.js')).href);
  const modules=['dsh-system-prompt','dsh-tools','dsh-fs-local','dsh-storage','dsh-storage-json','dsh-storage-domain','dsh-llm','dsh-session','dsh-agent','dsh-agent-loop'];
  if(input.config.p1?.enabled)modules.push('dsh-user-approval','dsh-subagent','dsh-subagent-spawn-in-process');
  let hostAdmission;
  try{
    const manifests=[];for(const name of ['cordis',...modules])manifests.push({name,manifest:JSON.parse(await readFile(join(hostLibraryRoot,name,'package.json'),'utf8'))});
    const nativeVersion=manifests.find(row=>row.name==='dsh-storage')?.manifest?.version;
    const protocol=nativeVersion==='0.1.6-alpha.2'?'maintenance-native-read-alpha2-v1':nativeVersion==='0.1.5-rc.2'?'maintenance-native-read-rc2-v1':'maintenance-native-read-v1';
    hostAdmission=assertHostAdmission({protocol,modules:manifests,p1NativeServices:Boolean(input.config.p1?.enabled)});
  }catch{fail('P2_HEALTH_HOST','Host package group is outside the reviewed maintenance adapter baselines.');}
  const {Context}=await load('cordis');const ctx=new Context();let readonlyWritesRejected=0,modelCalls=0;
  try{
    for(const name of modules){
      const plugin=await load(name);
      const config=name==='dsh-tools'?{mode:'native'}:name==='dsh-storage-json'?{root:storageRoot}:name==='dsh-storage-domain'?{backend:'json'}:
        name==='dsh-agent-loop'?{agents:[]}:name==='dsh-subagent-spawn-in-process'?{providerName:'spawn'}:{};
      await ctx.plugin(plugin.default??plugin,config);
    }
    ctx.on('llm/stream',async function*(){modelCalls++;fail('P2_HEALTH_NO_MODEL','Model calls are forbidden in the native health probe.');},{prepend:true});
    const facility=ctx.storageDomain;const openNative=facility.open.bind(facility);
    const deny=()=>{readonlyWritesRejected++;fail('P2_HEALTH_READONLY','Native health data writes are forbidden.');};
    facility.open=async spec=>{
      if(!Object.hasOwn(DOMAIN_TABLES,spec.name))fail('P2_HEALTH_SCHEMA','Candidate requested an unplanned domain.');
      const domain=await openNative(spec);
      return {name:domain.name,close:()=>domain.close(),table(name){
        const table=domain.table(name);
        return {get:key=>structuredClone(table.get(key)),entries:()=>[...table.entries()].map(([key,value])=>[key,structuredClone(value)])[Symbol.iterator](),
          keys:()=>[...table.keys()][Symbol.iterator](),get size(){return table.size;},put:deny,delete:deny,clear:deny};
      }};
    };
    // These are the stable maintenance module's schemas, not candidate self-report.
    const legacy=await facility.open(legacySpec);
    for(const name of DOMAIN_TABLES[legacySpec.name])for(const _entry of legacy.table(name).entries()){}
    await legacy.close();
    if(!input.legacyRollback){
      const layers=await createLayeredMemory({facility,scope:{projects:[]},legacy:{},config:{enabled:true,migrateLegacy:false}});
      await layers.close();
    }
    const config=structuredClone(input.config);const projections=['lockDirectory:isolated-health-lock','storageDomain:read-only-native-target'];
    if(input.recoveryProjects){
      const projects=input.recoveryProjects;
      const selected=p=>{if(!p||p.state!=='ready')fail('RECOVERY_MAINTENANCE_CHANGED','Project is not admitted.');return structuredClone(p);};
      ctx.provide('recoveryHost',{projectById:async({id})=>selected(projects.find(p=>p.id===id)),projectForPath:async({cwd})=>selected(projects.find(p=>{const rel=relative(p.root,cwd);return rel===''||!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);} ))});
      projections.push('recoveryHost:read-only-held-maintenance-scope');
    }
    config.lockDirectory=join(directory,'locks');
    if(config.p2?.enabled){config.p2={...config.p2,enabled:false};projections.push('p2.writer:disabled-under-parent-maintenance-lock');}
    const budgetPath=join(directory,'health-budget.json');
    for(const key of ['p1','vision','memoryAutomation'])if(config[key]?.budgetPath)config[key].budgetPath=budgetPath;
    if(['p1','vision','memoryAutomation'].some(key=>input.config[key]?.budgetPath))projections.push('budgetPaths:isolated-health-ledger');
    const candidate=await import(pathToFileURL(entryPath).href);
    if(candidate.name!=='dsh-system-enhancement-package'||typeof candidate.apply!=='function')fail('P2_HEALTH_CONTRACT','Candidate module contract is invalid.');
    const fiber=ctx.plugin(candidate,config);await fiber;
    const tools=ctx.tools.schemas().map(tool=>tool.name);
    const expected=['suite_status'];
    if(config.modules?.rag!==false)expected.push('suite_index','suite_search');
    if(config.modules?.memory!==false)expected.push('suite_memory_save','suite_memory_revise','suite_memory_revoke','suite_memory_recall','suite_memory_get','suite_memory_export','suite_memory_auto_settings');
    if(config.memoryLayers?.enabled)expected.push('suite_memory_archive','suite_memory_archive_search','suite_memory_archive_get','suite_memory_restore','suite_memory_purge');
    if(config.modules?.media)expected.push('suite_extract','suite_vision');
    if(config.p1?.enabled)expected.push('suite_delegate','suite_tasks','suite_review');
    if(expected.some(name=>!tools.includes(name)))fail('P2_HEALTH_TOOLS','Candidate did not register the required native tools.');
    let callId=0;
    const statuses=[];
    for(const project of config.projects){
      const agent={session:{header:{cwd:project.root,id:'p2-health-session'},events:[]}};
      const execute=async(name,args={})=>{
        const result=await ctx.tools.execute({callId:'p2-health-'+(++callId),name,arguments:args,agent,signal:new AbortController().signal});
        if(result.isError)fail('P2_HEALTH_TOOL_FAILED',`Read-only native health tool failed: ${name}`);return result.value;
      };
      const status=await execute('suite_status');
      if(status.problem||['rag','memory'].some(name=>config.modules?.[name]!==false&&status.modules?.[name]!=='ready'))fail('P2_HEALTH_READINESS','Candidate did not open and read its configured data.');
      if(config.memoryLayers?.enabled&&!status.memoryLayers)fail('P2_HEALTH_READINESS','Four-layer memory did not initialize.');
      if(config.modules?.memory!==false)await execute('suite_memory_export');
      if(config.modules?.rag!==false)await execute('suite_search',{query:'P2 health nonsemantic read'});
      statuses.push({root:project.root,modules:status.modules,problem:status.problem});
    }
    if(readonlyWritesRejected||modelCalls)fail('P2_HEALTH_UNEXPECTED_ACTIVITY','Candidate attempted a write or model call.');
    return {status:'pass',version,hostAdmission,nativeApply:true,actualStorageRead:true,modelCalls,readonlyWritesRejected,tools,statuses,
      p1NativeServices:Boolean(config.p1?.enabled),legacyReadOnlyRollback:Boolean(input.legacyRollback),projections,
      scope:'Installed candidate applied to the admitted native host services against original selected domains through a read-only facade; this is not a running desktop Profile restart, write-path acceptance, complete host integrity check or OS sandbox.'};
  }finally{await ctx.fiber.dispose();}
}

if(process.argv[2]==='--p2-health-child'&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const input=JSON.parse(await readFile(process.argv[3],'utf8'));
    await verifyEnvelopes(input.storageRoot,{legacyRollback:input.legacyRollback===true});
    const result=await nativeProbe(input);await writeFile(join(input.directory,'result.json'),JSON.stringify(result,null,2));
  }catch(error){console.error(`${error.code??'P2_HEALTH_NATIVE'}: ${error.message}`);process.exitCode=1;}
}
