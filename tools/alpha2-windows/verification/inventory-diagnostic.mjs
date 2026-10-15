// Read-only public service metadata from one previously installed synthetic
// library. No task/model dispatch and no assertion that desktop acceptance passed.
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {join,dirname,resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {stableFile} from './bundle-audit.mjs';
for(const key of Object.keys(process.env))if(/KEY|TOKEN|SECRET|PASSWORD/i.test(key))delete process.env[key];
const P='D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1';
const under=value=>{const r=relative(P,value);return r&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..\\');};
const [input,expectedSha,out]=process.argv.slice(2);assert(under(resolve(input))&&under(resolve(out)));
const bytes=await stableFile(input,{capture:true,maxBytes:16777216});assert.equal(bytes.sha256,expectedSha);
const source=JSON.parse(bytes.bytes);assert.equal(source.status,'pass');const record=source.installations.find(x=>x.kind==='full');
const config=JSON.parse(await readFile(record.configPath,'utf8'));assert.deepEqual(config,record.config);await mkdir(out);
const report={schema:1,status:'not_run',scope:'One synthetic Full installation, actual read-only public service metadata; not desktop acceptance.',inputSha256:expectedSha,modelCalls:0,spawns:[],resourceAudit:{status:'not_run'}};
let runtime,carrier,startSettled=true,rpcId=0;
const load=p=>import(pathToFileURL(p));
async function bounded(promise,ms,code){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Object.assign(Error(code),{code})),ms))]).finally(()=>clearTimeout(timer));}
async function rpc(method,payload={}){const r=await carrier.fetch(new Request('dsh-app://app/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'inventory-diagnostic-'+(++rpcId),method,payload}),signal:AbortSignal.timeout(20000)}));assert.equal(r.status,200);const body=await r.json();assert.equal(body.result.ok,true);return body.result.value;}
try{
 const launcher=await load(record.managedLauncherPath),{startCoordinated}=await load(join(dirname(record.managedLauncherPath),'startup-coordinator.mjs'));
 startSettled=false;
 const opening=startCoordinated(record.configPath,{loadDeployment:launcher.loadDeployment,readCredential:false,openDaily:async(path,options)=>{
  runtime=await launcher.openDaily(path,{...options,onHostSpawn:({child,generation})=>{
   const row={pid:child.pid,generation,outputBytes:0,exit:null};report.spawns.push(row);
   child.stdout.on('data',data=>row.outputBytes+=data.length);child.stderr.on('data',data=>row.outputBytes+=data.length);child.once('close',(code,signal)=>row.exit={code,signal});
  }});return runtime;
 }}).finally(()=>startSettled=true);
 runtime=await bounded(opening,180000,'VERIFY_HOST_START_DEADLINE');
 report.hostStatus=await runtime.client.call('status');assert.equal(report.hostStatus.guardian.phase,'running');
 const ready=await runtime.client.call('desktopReady');const {openHttpCarrier}=await load(join(config.releaseRoot,'node_modules/@deepseek-ai/dsh-recovery/src/http-carrier.mjs'));carrier=await openHttpCarrier(ready);
 report.authority=await runtime.client.call('projectById',{id:config.projects[0].id});
 report.budget=await rpc('sep-budget/list');report.memory=await rpc('sep-memory/list');
 report.memorySettings=await rpc('sep-memory/get',{projectId:report.memory.projects[0].id});
 const inventory=await rpc('pluginInventory/list',{args:{}});
 report.inventory={entries:inventory.entries.map(({entryId,moduleName,enabled,fiberPhase})=>({entryId,moduleName,enabled,fiberPhase})),managementAvailable:inventory.managementAvailable};
 report.quit=await runtime.client.call('desktopQuitInspection');report.status='pass';
}catch(error){report.status='fail';report.error={code:error.code??error.name,message:String(error.message).slice(0,1000)};process.exitCode=1;}
finally{
 try{
  assert(startSettled,'VERIFY_START_CLEANUP_UNCONFIRMED');carrier?.close();
  if(runtime){await bounded(runtime.close(),60000,'VERIFY_HOST_CLOSE_DEADLINE');report.lastExit=runtime.service.guardian.status().lastExit;assert.equal(report.lastExit.code,0);assert.equal(report.lastExit.forced,false);}
  for(const row of report.spawns){assert(row.exit);assert.equal(row.exit.code,0);assert.equal(row.exit.signal,null);assert.throws(()=>process.kill(row.pid,0),{code:'ESRCH'});}
  await assert.rejects(lstat(join(config.storageRoot,'.suite-memory/p2/owner.lock')),{code:'ENOENT'});
  report.resourceAudit={status:'pass',scope:'Actual runtime.close, guardian exit0/forcedfalse, exact tracked Host exit and PID/P2 lock absence; no forced cleanup.'};
 }catch(error){report.resourceAudit={status:'blocked',code:error.code??error.message};report.status='fail';process.exitCode=1;}
 await writeFile(join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,resourceAudit:report.resourceAudit,result:join(out,'RESULT.json')}));
}
