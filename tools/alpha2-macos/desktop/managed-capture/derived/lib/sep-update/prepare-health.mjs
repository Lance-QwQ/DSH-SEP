import {assertRequiredDesktopEntries} from './desktop-composition.mjs';
import {readFile,writeFile,mkdir,symlink,readdir,realpath} from 'node:fs/promises';
import {join,dirname,isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {auditInstalledGraph} from './runtime/audit-graph.mjs';
const json=async p=>JSON.parse(await readFile(p)),load=p=>import(pathToFileURL(p)),demand=(v,c)=>{if(!v)throw Error(c);};
/** Run owned SEP services using empty data and a fixed Profile, never a private Profile. */
export async function checkPreparedHealth({programRoot,probeRoot,graphHash,installation,signal}){
 demand(isAbsolute(programRoot??'')&&isAbsolute(probeRoot??'')&&/^[a-f0-9]{64}$/.test(graphHash??''),'SEP_HEALTH_INPUT');signal?.throwIfAborted();
 await auditInstalledGraph(programRoot,graphHash);await mkdir(probeRoot);const profile=join(probeRoot,'program-profile'),projectId=randomUUID();
 const config={schema:1,kind:'dsh-sep-managed-daily',dailyRoot:probeRoot,releaseRoot:profile,graphHash,nodeExecutable:installation.nodeExecutable,pnpmEntry:installation.pnpmEntry,home:join(probeRoot,'home'),storageRoot:join(probeRoot,'data/storage'),controlRoot:join(probeRoot,'state/center/control'),lockDirectory:join(probeRoot,'state/locks'),electronUserData:join(probeRoot,'electron'),runtimeUser:join(probeRoot,'user'),credentialsPath:join(probeRoot,'.env'),projects:[{id:projectId,root:join(probeRoot,'workspace')}]};
 for(const path of [profile,config.home,config.storageRoot,config.controlRoot,config.lockDirectory,config.electronUserData,config.runtimeUser,join(config.runtimeUser,'temp'),join(config.home,'sessions'),config.projects[0].root,join(probeRoot,'managed'),join(probeRoot,'launcher')])await mkdir(path,{recursive:true});
 await symlink(join(installation.dailyRoot,'runtime'),join(probeRoot,'runtime'),'junction');await symlink(join(programRoot,'node_modules'),join(profile,'node_modules'),'junction');
 const graph=await json(join(programRoot,'graph.json'));await writeFile(join(profile,'graph.json'),await readFile(join(programRoot,'graph.json')));
 const manifest={name:'sep-isolated-update-health',private:true,type:'module',dependencies:Object.fromEntries(Object.entries(graph.roots).map(([name,id])=>[name,graph.packages.find(p=>p.id===id).version])),dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}};
 function expand(v){if(typeof v==='string'){if(v.startsWith('@program-url@/'))return pathToFileURL(join(programRoot,v.slice(14))).href;if(v.startsWith('@program@/'))return join(programRoot,v.slice(10));if(v.startsWith('@probe@/'))return join(probeRoot,v.slice(8));return v==='202bc849-b52e-4147-bda7-7753368c2d8d'?projectId:v;}if(Array.isArray(v))return v.map(expand);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,expand(x)]));return v;}
 const template=expand(await json(join(import.meta.dirname,'runtime/health-template.json')));
 const files={'package.json':manifest,'cordis.yml':[],'desktop.cordis.yml':[],'cordis.patch.yml':template.patch,'desktop-release.json':{version:'0.2.0-rc.2'}};
 for(const [name,value]of Object.entries(files))await writeFile(join(profile,name),JSON.stringify(value,null,2)+'\n');
 await writeFile(join(probeRoot,'managed/suite-config.json'),JSON.stringify(template.config,null,2)+'\n');await writeFile(config.credentialsPath,'DEEPSEEK_API_KEY=\n');
 const deployment=join(probeRoot,'deployment-rc2.json');await writeFile(deployment,JSON.stringify(config,null,2)+'\n');
 for(const name of await readdir(join(import.meta.dirname,'runtime/launcher')))await writeFile(join(probeRoot,'launcher',name),(await readFile(join(import.meta.dirname,'runtime/launcher',name),'utf8')).replaceAll('@SEP_GRAPH_HASH@',graphHash));
 const {openControl}=await load(join(programRoot,'node_modules/dsh-system-enhancement-package/src/p2/control.js'));let control=await openControl({storageRoot:config.storageRoot,mode:'maintenance',initialize:true});await control.close();control=null;
 const {openDaily,loadDeployment}=await load(join(probeRoot,'launcher/launcher.mjs')),{startCoordinated}=await load(join(probeRoot,'launcher/startup-coordinator.mjs'));let runtime,carrier,pid;
 try{
  signal?.throwIfAborted();runtime=await startCoordinated(deployment,{openDaily,loadDeployment});const status=await runtime.client.call('status');pid=status.guardian?.pid;demand(status.guardian?.phase==='running'&&status.writerState==='open','SEP_HEALTH_HOST');
  const {openHttpCarrier}=await load(join(programRoot,'node_modules/@deepseek-ai/dsh-recovery/src/http-carrier.mjs'));carrier=await openHttpCarrier(await runtime.client.call('desktopReady'));
  const response=await carrier.fetch(new Request('dsh-app://app/api/sep-memory/list',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'sep-update-health',method:'sep-memory/list',payload:{}}),signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])])}));
  demand(response.ok,'SEP_HEALTH_MEMORY');const reply=await response.json();demand(reply.result?.ok&&reply.result.value?.available===true,'SEP_HEALTH_MEMORY');
  const inventoryResponse=await carrier.fetch(new Request('dsh-app://app/api/pluginInventory/list',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'sep-composition-health',method:'pluginInventory/list',payload:{args:{}}}),signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])])}));
  demand(inventoryResponse.ok,'SEP_HEALTH_COMPOSITION');const inventoryReply=await inventoryResponse.json();demand(inventoryReply.result?.ok,'SEP_HEALTH_COMPOSITION');assertRequiredDesktopEntries(inventoryReply.result.value);
  const idle=await runtime.client.call('desktopQuitInspection');demand(idle.activeTasks===false&&idle.scheduledTasks===false,'SEP_HEALTH_NOT_IDLE');signal?.throwIfAborted();
 }finally{carrier?.close();if(runtime)await runtime.close();}
 try{process.kill(pid,0);throw Error('SEP_HEALTH_PROCESS_REMAINS');}catch(e){if(e.code!=='ESRCH')throw e;}
 control=await openControl({storageRoot:config.storageRoot,mode:'maintenance',initialize:false});try{const cp=await control.checkpoint();demand(!cp.barrier.closed&&!cp.pending.length,'SEP_HEALTH_STORAGE');}finally{await control.close();}
 signal?.throwIfAborted();const result={schema:1,status:'pass',targetRoot:programRoot,targetGraphHash:graphHash,targetVersion:'0.2.0-rc.2',testedAt:new Date().toISOString(),checks:['desktop-host','required-desktop-composition','recovery-control','governed-storage'].map(name=>({name,status:'pass'})),memorySettings:true,cleanup:'runtime.close awaited, owned host exited, empty governed store checked',scope:'Fixed empty Profile using candidate program packages. No private plugins, data, credentials, model calls or mouse actions.'};
 await writeFile(join(probeRoot,'health.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
