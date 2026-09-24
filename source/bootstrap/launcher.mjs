import {startCoordinated} from './startup-coordinator.mjs';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const fail=code=>{throw Object.assign(Error(code),{code});};
const same=(a,b)=>resolve(a).toLowerCase()===resolve(b).toLowerCase();
async function regular(path,limit=65536){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>limit||!same(await realpath(path),path))fail('DAILY_FILE_INVALID');return readFile(path,'utf8');}
async function gate(root){try{await lstat(join(root,'state/sep-deployment-in-progress.json'));}catch(e){if(e.code==='ENOENT')return;throw e;}fail('DAILY_MAINTENANCE');}
export async function loadDeployment(path){
 if(!isAbsolute(path))fail('DAILY_CONFIG');const c=JSON.parse(await regular(path));
 if(c.schema!==1||c.kind!=='dsh-sep-managed-daily'||!Array.isArray(c.projects)||!c.projects.length)fail('DAILY_CONFIG');
 for(const field of ['dailyRoot','releaseRoot','nodeExecutable','home','storageRoot','controlRoot','lockDirectory','electronUserData','runtimeUser','credentialsPath','pnpmEntry'])if(!isAbsolute(c[field]??''))fail('DAILY_CONFIG');
 await gate(c.dailyRoot);
 for(const field of ['dailyRoot','releaseRoot','home','storageRoot','controlRoot','lockDirectory','electronUserData','runtimeUser']){const s=await lstat(c[field]);if(!s.isDirectory()||s.isSymbolicLink()||!same(await realpath(c[field]),c[field]))fail('DAILY_DIRECTORY_CHANGED');}
 if(c.projects.some(p=>!isAbsolute(p.root??'')||!/^[a-f0-9-]{36}$/.test(p.id??'')))fail('DAILY_CONFIG');
 const graph=await regular(join(c.releaseRoot,'graph.json'),16*1024*1024);
 if(c.graphHash!=='@GRAPH_HASH@'||createHash('sha256').update(graph).digest('hex')!==c.graphHash)fail('DAILY_RELEASE_CHANGED');
 return c;
}
export function buildEnvironment(c,parent={},key){
 const values=new Map(Object.entries(parent).map(([k,v])=>[k.toLowerCase(),v])),env={};
 for(const name of ['SystemRoot','WINDIR','PATH','ComSpec','PATHEXT','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','ProgramFiles','ProgramFiles(x86)','ProgramData','ALLUSERSPROFILE','TZ','LANG']){const value=values.get(name.toLowerCase());if(typeof value==='string')env[name]=value;}
 Object.assign(env,{HOME:c.runtimeUser,USERPROFILE:c.runtimeUser,APPDATA:c.runtimeUser,LOCALAPPDATA:c.runtimeUser,TEMP:join(c.runtimeUser,'temp'),TMP:join(c.runtimeUser,'temp'),DSH_HOME:c.home,DSH_PERMISSION_MODE:'workspace-write',DSH_TOOLS_MODE:'native',DSH_TELEMETRY_DISABLED:'1',DSH_TELEMETRY_MODE:'DISABLED',OTEL_SDK_DISABLED:'true',DSH_DESKTOP_DSH_DIR:c.releaseRoot,DSH_DESKTOP_DEV_PROJECT_DIR:c.releaseRoot,DSH_DESKTOP_NODE_BINARY:c.nodeExecutable,DSH_DESKTOP_PNPM_ENTRY:c.pnpmEntry,DSH_DESKTOP_OPEN_DEVTOOLS:'0'});
 if(key!==undefined)env.DEEPSEEK_API_KEY=key;return env;
}
async function credential(path){const rows=(await regular(path)).replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>/^\s*(?:export\s+)?DEEPSEEK_API_KEY\s*=/.test(s));if(rows.length!==1)fail('DAILY_CREDENTIAL_INVALID');let value=rows[0].replace(/^\s*(?:export\s+)?DEEPSEEK_API_KEY\s*=\s*/,'').trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);if(value==='')return undefined;if(!/^[A-Za-z0-9_-]{11,256}$/.test(value))fail('DAILY_CREDENTIAL_INVALID');return value;}
export async function openDaily(configPath,{readCredential=true,parentEnv=process.env}={}){
 const config=await loadDeployment(configPath),pkg=name=>join(config.releaseRoot,'node_modules',name),load=p=>import(pathToFileURL(p));
 const {recoveryClient}=await load(join(pkg('@deepseek-ai/dsh-recovery'),'src/client.mjs'));
 const connectionFile=join(dirname(config.controlRoot),'recovery-connection.json');
 // Reuse only a live center for this exact release and these project identities.
 let existing;
 try{const connection=JSON.parse(await regular(connectionFile));const client=recoveryClient({...connection,timeoutMs:3000});const [state,desktop]=await Promise.all([client.call('status'),client.call('desktopStatus')]);if(!same(desktop.projectDir,config.releaseRoot)||desktop.dshVersion!=='0.1.6-alpha.2'||config.projects.some(p=>!state.projects.some(v=>v.id===p.id&&same(v.root,p.root))))fail('DAILY_CENTER_MISMATCH');existing={connection,client};}
 catch(error){if(error.code==='DAILY_CENTER_MISMATCH')throw error;if(!['ENOENT','ECONNREFUSED','RECOVERY_TIMEOUT','ECONNRESET','UND_ERR_CONNECT_TIMEOUT'].includes(error.code))throw error;}
 let service,connection,client;const env=buildEnvironment(config,parentEnv,readCredential?await credential(config.credentialsPath):undefined);
 if(existing){({connection,client}=existing);}else{
  const {openManagedService}=await load(join(pkg('@deepseek-ai/dsh-recovery'),'src/managed.mjs'));
  service=await openManagedService({controlRoot:config.controlRoot,host:{transport:'desktop-http',desktop:{projectDir:config.releaseRoot,dshVersion:'0.1.6-alpha.2'},command:{file:config.nodeExecutable,args:[join(pkg('@deepseek-ai/dsh-desktop-host'),'lib/index.js'),config.releaseRoot,config.releaseRoot,join(config.dailyRoot,'runtime/primary-runtime'),'runtime'],cwd:config.dailyRoot,env},suiteRoot:await realpath(pkg('dsh-system-enhancement-package')),suiteLockDirectory:config.lockDirectory,storageRoot:config.storageRoot,projectIds:config.projects.map(p=>p.id),restartLimit:2,restartDelayMs:1500,readinessTimeoutMs:30000,shutdownTimeoutMs:45000}});
  try{
   if(!service.controller){const state=await service.status();fail(state.recoveryState?.ownerReason??state.recoveryState?.reason??'RECOVERY_UNAVAILABLE');}
   for(const p of config.projects)if(!service.controller.status().projects.some(v=>v.id===p.id))await service.controller.addProject(p);
  }catch(e){await service.close();throw e;}
  connection=service.connection;client=recoveryClient({...connection,timeoutMs:45000});
 }
 return {config,service,client,connectionFile,env,
  async start(){await gate(config.dailyRoot);return client.call('startHost',{manual:true});},
  async close(){if(service)await service.close();else await client.call('stopHost');},
  async launchDesktop(){await gate(config.dailyRoot);return spawn(join(pkg('electron'),'dist/electron.exe'),[pkg('@deepseek-ai/dsh-desktop'),'--user-data-dir='+config.electronUserData,'--sep-recovery-connection='+connectionFile],{cwd:config.dailyRoot,env,windowsHide:false,stdio:'ignore'});},
 };
}
export async function run(configPath){
 const runtime=await startCoordinated(configPath,{openDaily,loadDeployment});let child;
 // A secondary shortcut only focuses the owning Electron instance. Its normal
 // exit must never stop the recovery center/host owned by the first launcher.
 let closing;const close=()=>closing??=(async()=>{try{if(runtime.service)await runtime.close();process.exitCode=0;}catch(error){console.error('DSH SEP shutdown incomplete: '+(error.code??'DAILY_SHUTDOWN_FAILED'));process.exitCode=1;}})();
 process.once('SIGINT',close);process.once('SIGTERM',close);process.on('message',m=>{if(m?.type==='dsh-daily-shutdown')void close();});
 try{child=await runtime.launchDesktop();}
 catch(e){if(runtime.service)await runtime.close();throw e;}
 child.once('error',error=>{console.error('DSH SEP desktop failed: '+(error.code??'DAILY_DESKTOP_FAILED'));void close().finally(()=>{process.exitCode=1;});});
 child.once('exit',(code)=>{if(code===0)void close();else console.error('DSH 桌面异常退出；恢复中心保留。重新打开原快捷方式可连接。');});
 return runtime;
}
if(process.argv[1]&&same(process.argv[1],fileURLToPath(import.meta.url))){const path=process.argv[2];run(resolve(path??join(import.meta.dirname,'../deployment.json'))).catch(error=>{console.error('DSH SEP 启动未完成：'+(error.code??'DAILY_START_FAILED'));process.exitCode=1;});}

