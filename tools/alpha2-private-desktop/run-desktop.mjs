import assert from 'node:assert/strict';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
const phase=process.env.SEP_BUNDLE_TEST_ROOT,generation=process.argv[2]??'r1';assert(/^r\d+$/.test(generation));
const fixture=JSON.parse(await readFile(join(phase,'PRIVATE-DESKTOP-FIXTURE-r1.json'))),base=fixture.working;
const {openDaily,loadDeployment}=await import(pathToFileURL(fixture.launcher)),{startCoordinated}=await import(new URL('./startup-coordinator.mjs',pathToFileURL(fixture.launcher)));
const sha=b=>createHash('sha256').update(b).digest('hex'),capture=JSON.parse(await readFile(join(phase,'private-capture-r4/CAPTURE.json')));
const report={status:'running',scope:'same controlled private copy + owned launcher + managed Alpha.2 host + unmodified default Electron entry',rounds:[],forcedCleanup:false,notVerified:['actual tray menu click','paid model/API','original workspace file restoration','production adoption/relocation','Linux/macOS','public automatic install positive']};
async function sourceAudit(){for(const row of capture.rows)assert.equal(sha(await readFile(row.path)),row.sha256,'ORIGINAL_SOURCE_CHANGED');}
async function until(work,ms=180000){const end=Date.now()+ms;while(Date.now()<end){const result=await work();if(result)return result;await delay(200);}throw Error('PRIVATE_DESKTOP_DEADLINE');}
async function marker(name){try{const v=JSON.parse(await readFile(join(base,name)));assert.equal(v.ready,true);return v;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
let runtime,electron,hostChild,stdout='',stderr='',stage;
async function setStage(round,value,extra={}){stage=value;await writeFile(join(phase,'PRIVATE-DESKTOP-STATE-'+generation+'.json'),JSON.stringify({round,stage:value,electronPid:electron?.pid,hostPid:hostChild?.pid,working:base,...extra},null,2)+'\n');}
try{
 await sourceAudit();
 for(let round=1;round<=2;round++){
  const name='round-'+generation+'-'+round;hostChild=undefined;
  await setStage(round,'starting');
  runtime=await startCoordinated(fixture.config,{openDaily:(path,options)=>openDaily(path,{...options,onHostSpawn:({child})=>{hostChild=child;child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);}}),loadDeployment,readCredential:true});
  assert(hostChild,'PRIVATE_OWNED_HOST_MISSING');const before=await runtime.client.call('status');assert.equal(before.guardian.phase,'running');
  electron=await runtime.launchDesktop();const exited=new Promise((resolve,reject)=>{electron.once('error',reject);electron.once('exit',(code,signal)=>resolve({code,signal}));});
  await setStage(round,'awaiting-main-ui',{marker:name+'.visible.json'});const visible=await until(()=>marker(name+'.visible.json'));
  const checked=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{hostChild.off('message',receive);reject(Error('PRIVATE_HOST_CHECK_DEADLINE'));},45000);function receive(m){if(m?.type==='sep-private-desktop-result'&&m.round===round){clearTimeout(timer);hostChild.off('message',receive);resolve(m);}}hostChild.on('message',receive);hostChild.send({type:'sep-private-desktop-check',round});});
  assert.equal(checked.status,'pass',checked.code);if(round===2)assert.equal(checked.result.priorSyntheticMemoryReopened,true);
  await setStage(round,'awaiting-window-close',{marker:name+'.hidden.json'});const hidden=await until(()=>marker(name+'.hidden.json'));
  assert.equal(electron.exitCode,null);assert.equal(electron.signalCode,null);assert.equal(hostChild.exitCode,null);assert.equal((await runtime.client.call('status')).guardian.phase,'running');
  const second=await runtime.launchDesktop();const secondExit=await Promise.race([new Promise((resolve,reject)=>{second.once('error',reject);second.once('exit',(code,signal)=>resolve({code,signal}));}),delay(15000).then(()=>{throw Error('SECOND_EXECUTABLE_DEADLINE');})]);assert.equal(secondExit.code,0);
  await setStage(round,'awaiting-reopened-ui',{marker:name+'.reopened.json'});const reopened=await until(()=>marker(name+'.reopened.json'));
  await setStage(round,'awaiting-normal-quit');const exit=await Promise.race([exited,delay(180000).then(()=>{throw Error('NORMAL_QUIT_DEADLINE');})]);assert.equal(exit.code,0);
  await runtime.close();const hostExit=runtime.service.guardian.status().lastExit;assert.equal(hostExit.code,0);assert.equal(hostExit.forced,false);runtime=undefined;
  const config=JSON.parse(await readFile(fixture.config));await assert.rejects(lstat(join(config.storageRoot,'.suite-memory/p2/owner.lock')),{code:'ENOENT'});
  const originalRows=capture.rows.filter(r=>r.domain==='sessions');for(const row of originalRows)assert.equal(sha(await readFile(join(base,'sessions',row.relative))),row.sha256,'PRIVATE_SESSION_BYTES_CHANGED_AFTER_SHUTDOWN');
  report.rounds.push({round,status:'pass',electronPid:electron.pid,hostPid:hostChild.pid,visible,hidden,reopened,privateChecks:checked.result,secondExit,exit,hostExit,oldSessionFilesUnchanged:originalRows.length});
  electron=undefined;await setStage(round,'round-complete');
 }
 await sourceAudit();const host=process.env.SEP_OFFICIAL_HARNESS,{verifyDesktopRuntime}=await import(pathToFileURL(join(host,'build-runtime-helper.mjs')));await verifyDesktopRuntime(host,'0.2.1-alpha.2',{platform:'win32',arch:'x64'});
 assert.equal(JSON.parse(await readFile(join(host,'node_modules/@deepseek-ai/dsh-desktop/package.json'))).main,'lib/main.js');report.status='pass';report.original752FilesUnchanged=true;report.productionRuntimeUnchanged=true;
}catch(error){report.status='fail';report.code=/^[A-Z][A-Z0-9_]+$/.test(error.code??'')?error.code:/^[A-Z][A-Z0-9_]+$/.test(error.message??'')?error.message:'PRIVATE_DESKTOP_FAILED';report.stage=stage;await writeFile(join(base,'failure-'+generation+'.log'),error.stack??error.name);process.exitCode=1;}
finally{
 if(electron&&electron.exitCode===null&&electron.signalCode===null){const c=spawn('C:/Windows/System32/taskkill.exe',['/PID',String(electron.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});await new Promise(r=>c.once('exit',r));report.forcedCleanup=true;}
 try{await runtime?.close();}catch(e){report.cleanupCode=e.code??e.name;process.exitCode=1;}
 await writeFile(join(base,'desktop-'+generation+'.stdout.log'),stdout);await writeFile(join(base,'desktop-'+generation+'.stderr.log'),stderr);
 await writeFile(join(base,'PRIVATE-DESKTOP-RESULT-'+generation+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await setStage(0,'finished',{status:report.status,code:report.code});console.log(JSON.stringify({status:report.status,rounds:report.rounds.length,code:report.code,stage:report.stage,result:join(base,'PRIVATE-DESKTOP-RESULT-'+generation+'.json')}));
}
