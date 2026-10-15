// Actual installed coordinated Hosts, synthetic blank libraries. This is a
// service diagnostic with readCredential:false, not the default GUI entry.
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {stableFile} from './bundle-audit.mjs';
import {verifyMemoryProject} from './memory-identity.mjs';
import {verifyFreshMemoryPolicy} from './memory-policy.mjs';
import {verifyFreshComposition} from './fresh-composition.mjs';
for(const key of Object.keys(process.env))if(/KEY|TOKEN|SECRET|PASSWORD/i.test(key))delete process.env[key];
const P='D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1';
const under=(root,value)=>{const r=relative(root,value);return r!==''&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..\\')&&!r.startsWith('../');};
const [inputArg,expectedSha,outputArg]=process.argv.slice(2),input=resolve(inputArg??''),output=resolve(outputArg??'');
assert(under(P,input)&&under(P,output)&&/^[a-f0-9]{64}$/.test(expectedSha));
const bound=await stableFile(input,{maxBytes:16777216,capture:true});assert.equal(bound.sha256,expectedSha);const installation=JSON.parse(bound.bytes);
assert.equal(installation.status,'pass');assert.equal(installation.configurationsFrozen,true);assert.equal(installation.installations.length,2);
assert.equal((await realpath(dirname(output))).toLowerCase(),dirname(output).toLowerCase());await mkdir(output);
const report={schema:1,status:'not_run',inputSha256:expectedSha,scope:'Two concurrently running installed Alpha.2 coordinated Hosts and actual service RPC, then normal exit and persistence reopen. readCredential:false is diagnostic-only; no GUI or paid model call.',modelCalls:0,checks:[],hosts:[],resourceAudit:{status:'not_run'}};
const active=[];let phase='setup',rpcId=0;
function tick(value){phase=value;console.log(JSON.stringify({phase,at:new Date().toISOString()}));}
function check(name,detail={}){report.checks.push({name,status:'pass',...detail});}
async function bounded(promise,ms,code){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Object.assign(Error(code),{code})),ms))]).finally(()=>clearTimeout(timer));}
const load=p=>import(pathToFileURL(p));
async function start(record,round){
 const c=JSON.parse(await readFile(record.configPath,'utf8'));assert.deepEqual(c,record.config);assert(under(P,c.dailyRoot));
 const owned={kind:record.kind,round,config:c,pid:null,closed:false,runtime:null,carrier:null,startOutcome:'not_run',startSettled:true,spawns:[]};active.push(owned);
 const launcher=await load(record.managedLauncherPath),{startCoordinated}=await load(join(dirname(record.managedLauncherPath),'startup-coordinator.mjs'));
 const originalOpen=launcher.openDaily;
 owned.startSettled=false;
 const opening=startCoordinated(record.configPath,{loadDeployment:launcher.loadDeployment,readCredential:false,openDaily:async(path,options)=>{
  const runtime=await originalOpen(path,{...options,onHostSpawn:({child,generation})=>{
   owned.pid=child.pid;owned.spawnObserved=true;const row={pid:child.pid,generation,out:[],err:[],bytes:0,fatal:[],exit:null};owned.spawns.push(row);
   const capture=(target,chunk)=>{row.bytes+=chunk.length;if(row.bytes<=4*1024*1024)target.push(chunk);else row.outputOverflow=true;};
   child.stdout.on('data',chunk=>capture(row.out,chunk));child.stderr.on('data',chunk=>capture(row.err,chunk));child.on('message',message=>{if(message?.type==='fatal')row.fatal.push({type:'fatal',code:typeof message.code==='string'?message.code.slice(0,128):null});});child.once('close',(code,signal)=>{row.exit={code,signal};});
  }});owned.runtime=runtime;return runtime;
 }}).finally(()=>{owned.startSettled=true;});
 try{owned.runtime=await bounded(opening,180000,'VERIFY_HOST_START_DEADLINE');owned.startOutcome='pass';}catch(error){owned.startOutcome='fail';throw error;}
 const state=await owned.runtime.client.call('status');assert.equal(state.guardian.phase,'running');assert.equal(state.writerState,'open');assert(Number.isInteger(state.guardian.pid));if(owned.pid)assert.equal(owned.pid,state.guardian.pid);owned.pid=state.guardian.pid;
 const ready=await owned.runtime.client.call('desktopReady');const url=new URL(ready.url);assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname));owned.port=url.port;
 const{openHttpCarrier}=await load(join(c.releaseRoot,'node_modules/@deepseek-ai/dsh-recovery/src/http-carrier.mjs'));owned.carrier=await openHttpCarrier(ready);
 check(`${record.kind}-round${round}-managed-host-running`,{pid:owned.pid,port:owned.port});return owned;
}
async function rpc(owned,method,payload={}){
 const response=await owned.carrier.fetch(new Request('dsh-app://app/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'alpha2-new-install-'+(++rpcId),method,payload}),signal:AbortSignal.timeout(20000)}));
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.result.ok,true,method+': '+JSON.stringify(body.result));return body.result.value;
}
async function close(owned,source){
 if(owned.closed)return;
 // A caller-side deadline does not end an in-flight start. Do not race a
 // late start with close and then claim the later process was released.
 if(!owned.startSettled)throw Object.assign(Error('VERIFY_START_CLEANUP_UNCONFIRMED'),{code:'VERIFY_START_CLEANUP_UNCONFIRMED'});
 owned.carrier?.close();owned.carrier=null;
 if(owned.runtime){await bounded(owned.runtime.close(),60000,'VERIFY_HOST_CLOSE_DEADLINE');owned.runtimeCloseCompleted=true;const lastExit=owned.runtime.service?.guardian.status().lastExit;owned.lastExit=lastExit;assert.equal(lastExit?.code,0);assert.equal(lastExit?.forced,false);}
 for(const row of owned.spawns){assert(row.exit,'VERIFY_TRACKED_EXIT_UNCONFIRMED');assert.throws(()=>process.kill(row.pid,0),{code:'ESRCH'});assert.equal(row.outputOverflow,undefined);}
 if(owned.pid)assert.throws(()=>process.kill(owned.pid,0),{code:'ESRCH'});
 await assert.rejects(lstat(join(owned.config.storageRoot,'.suite-memory/p2/owner.lock')),{code:'ENOENT'});
 owned.closed=true;owned.closedBy=source;check(`${owned.kind}-round${owned.round}-normal-exit-pid-absent-p2-unlocked`,{source});
}
async function inspect(owned,limit=100){
 const budget=await rpc(owned,'sep-budget/list');assert.equal(budget.available,true);assert.equal(budget.defaults.limitCny,limit);assert.equal(budget.shared.accountedUpperBoundCny,0);assert.equal(budget.taskLimitCny,5);assert.deepEqual(budget.sessions,[]);
 const memory=await rpc(owned,'sep-memory/list'),authority=await owned.runtime.client.call('projectById',{id:owned.config.projects[0].id});
 const memoryKey=verifyMemoryProject(memory,authority,owned.config.projects[0]);
 const settings=await rpc(owned,'sep-memory/get',{projectId:memoryKey});
 (report.memoryObservations??=[]).push({kind:owned.kind,round:owned.round,registeredProjectId:authority.id,memoryKey,settings});
 assert.equal(settings.version,1);assert.equal(settings.projectId,memoryKey);verifyFreshMemoryPolicy(settings);
 const inventory=await rpc(owned,'pluginInventory/list',{args:{}}),composition=verifyFreshComposition(inventory,owned.config.releaseRoot);
 const quit=await owned.runtime.client.call('desktopQuitInspection');assert.equal(quit.activeTasks,false);assert.equal(quit.scheduledTasks,false);
 check(`${owned.kind}-round${owned.round}-budget-memory-composition-idle`,{limitCny:limit,accountedCny:0,registeredProjectId:authority.id,memoryKey,authorityRootMatches:true,composition});return budget;
}
try{
 tick('concurrent-headless-start');const a=await start(installation.installations[0],1),b=await start(installation.installations[1],1);
 assert.notEqual(a.pid,b.pid);assert.notEqual(a.port,b.port);check('concurrent-distinct-host-pids-and-ports');
 tick('settings-services');const ba=await inspect(a);await inspect(b);
 await rpc(a,'sep-budget/updateDefault',{limitCny:80,expectedRevision:ba.defaults.revision});const changed=await rpc(a,'sep-budget/list');assert.equal(changed.defaults.limitCny,80);const untouched=await rpc(b,'sep-budget/list');assert.equal(untouched.defaults.limitCny,100);check('budget-update-affects-only-first-instance');
 await rpc(a,'sep-budget/updateDefault',{limitCny:100,expectedRevision:changed.defaults.revision});
 tick('first-host-normal-close');await close(a,'acceptance');await inspect(b);check('second-instance-survives-first-exit');await close(b,'acceptance');
 tick('cold-reopen');for(const record of installation.installations){const owned=await start(record,2);await inspect(owned);await close(owned,'acceptance');}
 report.status='pass';report.resourceAudit={status:'pass',path:'All four tracked Host lifetimes ended through actual runtime.close; guardian exit0/forcedfalse, exact tracked PID absence and P2 lock absence verified. No forced cleanup.'};
}catch(error){report.status='fail';report.failedPhase=phase;report.error={code:error.code??'VERIFY_ASSERTION',message:String(error.message).slice(0,1200)};process.exitCode=1;}
finally{
 for(const owned of active)if(!owned.closed)try{await close(owned,'finally after failed acceptance');}catch(error){owned.cleanupError=error.code??error.name;report.resourceAudit={status:'blocked',path:'Tracked resources could not be confirmed released. No taskkill or broad process kill used.'};process.exitCode=1;}
 if(report.resourceAudit.status==='not_run')report.resourceAudit={status:active.every(x=>x.closed)?'pass':'blocked',path:'Subsequent test cleanup only; failed acceptance is unchanged.'};
 for(const owned of active)for(const row of owned.spawns){const prefix=`${owned.kind}-round${owned.round}-generation${row.generation}-pid${row.pid}`;await writeFile(join(output,prefix+'.stdout.log'),Buffer.concat(row.out),{flag:'wx'});await writeFile(join(output,prefix+'.stderr.log'),Buffer.concat(row.err),{flag:'wx'});delete row.out;delete row.err;}
 report.hosts=active.map(({kind,round,pid,port,startOutcome,closed,closedBy,lastExit,cleanupError,runtimeCloseCompleted,spawns})=>({kind,round,pid,port,startOutcome,closed,closedBy,lastExit,cleanupError,runtimeCloseCompleted,spawns}));report.rpcRequests=rpcId;
 await writeFile(join(output,'RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,phase,result:join(output,'RESULT.json'),error:report.error,resourceAudit:report.resourceAudit}));
}
