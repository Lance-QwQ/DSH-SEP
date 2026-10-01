import {assertRequiredDesktopEntries} from '../desktop-composition.mjs';
import {readFile,writeFile,mkdir,symlink,readdir,realpath} from 'node:fs/promises';
import {join,dirname,isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {auditInstalledGraph} from '../runtime/audit-graph.mjs';
const json=async p=>JSON.parse(await readFile(p)),load=p=>import(pathToFileURL(p)),demand=(v,c)=>{if(!v)throw Error(c);};
/** Run owned SEP services using empty data and a fixed Profile, never a private Profile. */
export async function checkAssessmentHealth({programRoot,probeRoot,graphHash,installation,signal}){
 demand(isAbsolute(programRoot??'')&&isAbsolute(probeRoot??'')&&/^[a-f0-9]{64}$/.test(graphHash??''),'SEP_HEALTH_INPUT');signal?.throwIfAborted();
 await auditInstalledGraph(programRoot,graphHash);await mkdir(probeRoot);const profile=join(probeRoot,'program-profile'),projectId=randomUUID();
 const config={schema:1,kind:'dsh-sep-managed-daily',dailyRoot:probeRoot,releaseRoot:profile,graphHash,nodeExecutable:installation.nodeExecutable,pnpmEntry:installation.pnpmEntry,home:join(probeRoot,'home'),storageRoot:join(probeRoot,'data/storage'),controlRoot:join(probeRoot,'state/center/control'),lockDirectory:join(probeRoot,'state/locks'),electronUserData:join(probeRoot,'electron'),runtimeUser:join(probeRoot,'user'),credentialsPath:join(probeRoot,'.env'),projects:[{id:projectId,root:join(probeRoot,'workspace')}]};
 for(const path of [profile,config.home,config.storageRoot,config.controlRoot,config.lockDirectory,config.electronUserData,config.runtimeUser,join(config.runtimeUser,'temp'),join(config.home,'sessions'),config.projects[0].root,join(probeRoot,'managed'),join(probeRoot,'launcher')])await mkdir(path,{recursive:true});
 await symlink(join(installation.dailyRoot,'runtime'),join(probeRoot,'runtime'),'junction');await symlink(join(programRoot,'node_modules'),join(profile,'node_modules'),'junction');
 const graph=await json(join(programRoot,'graph.json'));await writeFile(join(profile,'graph.json'),await readFile(join(programRoot,'graph.json')));
 const manifest={name:'sep-isolated-update-health',private:true,type:'module',dependencies:Object.fromEntries(Object.entries(graph.roots).map(([name,id])=>[name,graph.packages.find(p=>p.id===id).version])),dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}};
 function expand(v){if(typeof v==='string'){if(v.startsWith('@program-url@/'))return pathToFileURL(join(programRoot,v.slice(14))).href;if(v.startsWith('@program@/'))return join(programRoot,v.slice(10));if(v.startsWith('@probe@/'))return join(probeRoot,v.slice(8));return v==='202bc849-b52e-4147-bda7-7753368c2d8d'?projectId:v;}if(Array.isArray(v))return v.map(expand);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,expand(x)]));return v;}
 const template=expand(await json(join(join(import.meta.dirname,'..'),'runtime/health-template.json')));
 template.config.p1.enabled=true;template.config.p1.initialSpentCny=100;
 const files={'package.json':manifest,'cordis.yml':[],'desktop.cordis.yml':[],'cordis.patch.yml':template.patch,'desktop-release.json':{version:'0.2.0-rc.2'}};
 for(const [name,value]of Object.entries(files))await writeFile(join(profile,name),JSON.stringify(value,null,2)+'\n');
 await writeFile(join(probeRoot,'managed/suite-config.json'),JSON.stringify(template.config,null,2)+'\n');await writeFile(config.credentialsPath,'DEEPSEEK_API_KEY=synthetic-assessment-test-key\n');
 const deployment=join(probeRoot,'deployment-rc2.json');await writeFile(deployment,JSON.stringify(config,null,2)+'\n');
 for(const name of await readdir(join(join(import.meta.dirname,'..'),'runtime/launcher')))await writeFile(join(probeRoot,'launcher',name),(await readFile(join(join(import.meta.dirname,'..'),'runtime/launcher',name),'utf8')).replaceAll('@SEP_GRAPH_HASH@',graphHash));
 const {openControl}=await load(join(programRoot,'node_modules/dsh-system-enhancement-package/src/p2/control.js'));let control=await openControl({storageRoot:config.storageRoot,mode:'maintenance',initialize:true});await control.close();control=null;
 const {openDaily,loadDeployment}=await load(join(probeRoot,'launcher/launcher.mjs')),{startCoordinated}=await load(join(probeRoot,'launcher/startup-coordinator.mjs'));let runtime,carrier,pid;
 try{
  signal?.throwIfAborted();runtime=await startCoordinated(deployment,{openDaily,loadDeployment});const status=await runtime.client.call('status');pid=status.guardian?.pid;demand(status.guardian?.phase==='running'&&status.writerState==='open','SEP_HEALTH_HOST');
  const {openHttpCarrier}=await load(join(programRoot,'node_modules/@deepseek-ai/dsh-recovery/src/http-carrier.mjs'));carrier=await openHttpCarrier(await runtime.client.call('desktopReady'));
  const response=await carrier.fetch(new Request('dsh-app://app/api/sep-memory/list',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'sep-update-health',method:'sep-memory/list',payload:{}}),signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])])}));
  demand(response.ok,'SEP_HEALTH_MEMORY');const reply=await response.json();demand(reply.result?.ok&&reply.result.value?.available===true,'SEP_HEALTH_MEMORY');
  const inventoryResponse=await carrier.fetch(new Request('dsh-app://app/api/pluginInventory/list',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'sep-composition-health',method:'pluginInventory/list',payload:{args:{}}}),signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])])}));
  demand(inventoryResponse.ok,'SEP_HEALTH_COMPOSITION');const inventoryReply=await inventoryResponse.json();demand(inventoryReply.result?.ok,'SEP_HEALTH_COMPOSITION');assertRequiredDesktopEntries(inventoryReply.result.value);
  const call=async(method,payload={})=>{const response=await carrier.fetch(new Request('dsh-app://app/api/sep-assessment/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'assessment-health',method:'sep-assessment/'+method,payload}),signal:AbortSignal.timeout(15000)}));const value=await response.json();demand(response.ok&&value.result?.ok,'ASSESSMENT_ROUTE_'+method);return value.result.value;};
  const initial=await call('get');demand(initial.available&&initial.enabled===false,'ASSESSMENT_DEFAULT');
  const input={release:{version:'0.2.1',id:'synthetic-release',notes:'Synthetic public release description'},currentBinding:'a'.repeat(64),reportBinding:'b'.repeat(64),plugins:[{name:'synthetic-custom-plugin',version:'1.0.0',fingerprint:'c'.repeat(64),verdict:'unknown',reasonCodes:['NO_CANDIDATE','RUNTIME_UNVERIFIED']}]};
  await call('observe',input);const off=await call('get');demand(off.latest?.status==='not_run'&&off.usage?.reportedRequests===0,'ASSESSMENT_DEFAULT_REQUESTS');
  await call('update',{enabled:true});let assessed;
  for(let n=0;n<100;n++){assessed=await call('get');if(assessed.latest?.phase==='complete')break;await new Promise(r=>setTimeout(r,100));}
  demand(assessed.latest?.status==='blocked'&&assessed.latest?.reason==='BUDGET_EXCEEDED','ASSESSMENT_SHARED_GUARD_'+assessed.latest?.reason);
  demand(assessed.usage?.reportedRequests===0&&assessed.latest?.installable===false,'ASSESSMENT_NO_INSTALL_OR_USAGE');
  const ledger=await json(join(probeRoot,'state/budget.json'));demand(ledger.entries.length===0&&ledger.initialSpent===100,'ASSESSMENT_LEDGER_RETAINED');
  await call('update',{enabled:false});
  carrier.close();carrier=null;await runtime.close();runtime=null;
  runtime=await startCoordinated(deployment,{openDaily,loadDeployment});carrier=await openHttpCarrier(await runtime.client.call('desktopReady'));
  const restarted=await call('get');demand(restarted.enabled===false&&restarted.latest?.attempts===1,'ASSESSMENT_RESTART');await call('observe',input);demand((await call('get')).latest?.attempts===1,'ASSESSMENT_DEDUP');
  pid=(await runtime.client.call('status')).guardian?.pid;
  await writeFile(join(probeRoot,'assessment-observed.json'),JSON.stringify({initial,off,assessed,restarted,ledger},null,2)+'\n');
  const idle=await runtime.client.call('desktopQuitInspection');demand(idle.activeTasks===false&&idle.scheduledTasks===false,'SEP_HEALTH_NOT_IDLE');signal?.throwIfAborted();
 }finally{carrier?.close();if(runtime)await runtime.close();}
 try{process.kill(pid,0);throw Error('SEP_HEALTH_PROCESS_REMAINS');}catch(e){if(e.code!=='ESRCH')throw e;}
 control=await openControl({storageRoot:config.storageRoot,mode:'maintenance',initialize:false});try{const cp=await control.checkpoint();demand(!cp.barrier.closed&&!cp.pending.length,'SEP_HEALTH_STORAGE');}finally{await control.close();}
 signal?.throwIfAborted();const result={schema:1,status:'pass',targetRoot:programRoot,targetGraphHash:graphHash,targetVersion:'0.2.0-rc.2',testedAt:new Date().toISOString(),checks:['desktop-host','required-desktop-composition','recovery-control','governed-storage','assessment-default-off','assessment-persistence-restart','assessment-shared-budget-block','assessment-input-dedup'].map(name=>({name,status:'pass'})),memorySettings:true,cleanup:'runtime.close awaited, owned host exited, empty governed store checked',scope:'Fixed empty Profile using candidate program packages. Synthetic public metadata and an exhausted synthetic ledger; no private data or paid model requests.'};
 await writeFile(join(probeRoot,'health.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
