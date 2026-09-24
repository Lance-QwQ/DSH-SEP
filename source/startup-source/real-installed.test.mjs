import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,realpath,lstat,access} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
import {join,relative,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {inspectWindowsProcess} from './ownership/owner-file.mjs';
const execFileAsync=promisify(execFile),work=await realpath(fileURLToPath(new URL('.',import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
if(!process.env.SEP_TEST_INSTALL_ROOT)throw Error('SEP_TEST_INSTALL_ROOT_REQUIRED');
const root=await realpath(resolve(process.env.SEP_TEST_INSTALL_ROOT)),rel=relative(work,root);
assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel)&&/^installed-[^\\/]+$/.test(rel),'Only a dedicated installed-* directory immediately inside this synthetic work is permitted');
let configName='deployment.json';try{await access(join(root,configName));}catch{configName='deployment-rc2.json';}
const config=JSON.parse(await readFile(join(root,configName),'utf8'));
for(const key of ['dailyRoot','releaseRoot','nodeExecutable','home','storageRoot','controlRoot','lockDirectory','electronUserData','runtimeUser','credentialsPath']){const r=relative(root,config[key]);assert.ok(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..\\'),'Installation escapes isolated root: '+key);}
assert.equal(resolve(config.dailyRoot).toLowerCase(),root.toLowerCase());
assert.equal((await lstat(root)).isSymbolicLink(),false);
const envText=await readFile(config.credentialsPath,'utf8');assert.match(envText,/^DEEPSEEK_API_KEY=\s*$/m,'Real credentials are prohibited in this test installation');
const evidence=join(work,'real-installed-evidence',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());await mkdir(evidence,{recursive:true});
const workers=[],events=[];let sequence=0;
async function audit(event){events.push({...event,at:new Date().toISOString()});await writeFile(join(evidence,'events.json'),JSON.stringify(events,null,2)+'\n');}
const preservePaths=['.env','home/user-plugins/synthetic-plugin.txt','workspace/中文 保留资料.txt'];
for(const name of preservePaths.slice(1)){try{await access(join(root,name));}catch{await mkdir(join(root,name,'..'),{recursive:true});await writeFile(join(root,name),'synthetic user content to preserve\n',{flag:'wx'});}}
const preserved=await Promise.all(preservePaths.map(async path=>({path,sha256:sha(await readFile(join(root,path)))})));
async function matches(identity){const current=await inspectWindowsProcess(identity.pid);return current.state==='alive'&&current.startTimeUtcTicks===identity.startTimeUtcTicks;}
async function hostIdentity(worker){
 if(worker.ready?.reused)return null;
 if(worker.ready){const identity=await inspectWindowsProcess(worker.ready.host);assert.equal(identity.state,'alive');return identity;}
 const spec=Buffer.from(JSON.stringify({parent:worker.child.pid,program:config.releaseRoot,node:config.nodeExecutable})).toString('base64');
 const ps=`$ErrorActionPreference='Stop';$s=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${spec}'))|ConvertFrom-Json;$v=@(Get-CimInstance Win32_Process -Filter ('ParentProcessId = '+$s.parent)|Where-Object {$_.ExecutablePath -eq $s.node -and $_.CommandLine -and $_.CommandLine.IndexOf($s.program,[StringComparison]::OrdinalIgnoreCase) -ge 0}|ForEach-Object {$p=Get-Process -Id $_.ProcessId -ErrorAction Stop;@{state='alive';pid=$_.ProcessId;startTimeUtcTicks=$p.StartTime.ToUniversalTime().Ticks.ToString()}});ConvertTo-Json -InputObject $v -Compress`;
 const out=await execFileAsync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{windowsHide:true,timeout:8000,maxBuffer:65536});
 const rows=JSON.parse(out.stdout);assert.ok(rows.length<=1,'Ambiguous synthetic host descendants');return rows[0]??null;
}
async function waitMessage(worker,type,cursor=0,timeout=60000){
 const until=Date.now()+timeout;
 while(Date.now()<until){const next=worker.messages.slice(cursor).find(m=>m.type===type||m.type==='failed');if(next){if(next.type==='failed')throw Error(next.code);return next;}if(worker.exit)throw Error('TEST_WORKER_EARLY_EXIT '+JSON.stringify(worker.exit));await delay(25);}
 throw Error('TEST_MESSAGE_TIMEOUT '+type);
}
async function launch(label){
 const id=++sequence,child=spawn(config.nodeExecutable,[join(work,'installed-worker.mjs'),root,'managed'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
 const worker={id,label,child,messages:[],ready:null,exit:null,centerIdentity:null,hostIdentity:null};workers.push(worker);
 const log=createWriteStream(join(evidence,String(id).padStart(2,'0')+'-'+label+'.log'),{flags:'wx'});
 child.stdout.on('data',b=>log.write(b));child.stderr.on('data',b=>log.write(b));
 const drained=Promise.all([finished(child.stdout),finished(child.stderr)]).then(()=>new Promise((yes,no)=>{log.once('error',no);log.end(yes);}));
 worker.exited=new Promise((yes,no)=>{child.once('error',no);child.once('exit',(code,signal)=>{worker.exit={code,signal};yes(worker.exit);});});worker.exited.catch(()=>{});
 worker.done=Promise.all([worker.exited,drained]);worker.done.catch(()=>{});child.on('message',m=>worker.messages.push(m));
 worker.centerIdentity=await inspectWindowsProcess(child.pid);assert.equal(worker.centerIdentity.state,'alive');
 worker.ready=await waitMessage(worker,'ready');if(!worker.ready.reused)worker.hostIdentity=await hostIdentity(worker);
 await audit({event:'ready',label,worker:child.pid,...worker.ready});return worker;
}
async function request(worker,type,result,payload={}){const cursor=worker.messages.length;worker.child.send({type,...payload});return waitMessage(worker,result,cursor,65000);}
async function waitExit(worker,timeout=65000){let timer;try{await Promise.race([worker.done,new Promise((_,no)=>{timer=setTimeout(()=>no(Error('TEST_EXIT_TIMEOUT')),timeout);})]);}finally{clearTimeout(timer);}return worker.exit;}
async function stop(worker){await request(worker,'stop','stopped');const exit=await waitExit(worker);assert.equal(exit.code,0);await audit({event:'normal-stop',label:worker.label,worker:worker.child.pid,exit});}
async function crash(worker){
 assert.equal(worker.ready.reused,false);const status=await request(worker,'status','status');assert.equal(status.value.guardian.pid,worker.ready.host);assert.equal(status.value.guardian.ownerPid,worker.child.pid);
 assert.equal(await matches(worker.hostIdentity),true);assert.equal(await matches(worker.centerIdentity),true);
 worker.child.send({type:'crash-owned',expectedHost:worker.ready.host});const exit=await waitExit(worker);assert.equal(exit.code,31);
 for(let i=0;i<10&&await matches(worker.hostIdentity);i++)await delay(100);assert.equal(await matches(worker.hostIdentity),false,'Crash injection did not terminate the owned host');
 await audit({event:'intentional-crash',label:worker.label,worker:worker.child.pid,host:worker.ready.host,exit,cleanup:'owned worker verified guardian PID, force-terminated that host, then exited 31'});
}
async function cleanup(){
 for(const w of [...workers].reverse()){
  if(!w.exit)try{await stop(w);continue;}catch(error){await audit({event:'normal-cleanup-failed',worker:w.child.pid,code:error.message});}
  try{w.hostIdentity??=await hostIdentity(w);}catch(error){await audit({event:'host-identity-unconfirmed',worker:w.child.pid,code:error.message});}
  for(const [role,identity] of [['host',w.hostIdentity],['worker',w.centerIdentity]])if(identity){
   try{if(await matches(identity)){process.kill(identity.pid);await audit({event:'forced-test-cleanup',role,pid:identity.pid,startTimeUtcTicks:identity.startTimeUtcTicks});}}
   catch(error){await audit({event:'cleanup-blocked',role,pid:identity.pid,code:error.code??error.message});}
  }
 }
}
test('real installed bootstrap: 3 clean rounds, 3 crash/recovery rounds, concurrent reuse and preservation',{timeout:600000},async()=>{
 let status='fail',failure;
 try{
  for(let round=1;round<=3;round++){const w=await launch('clean-'+round);await stop(w);}
  for(let round=1;round<=3;round++){const w=await launch('crash-'+round);await crash(w);const recovered=await launch('recovered-'+round);await stop(recovered);}
  const concurrent=await Promise.all([1,2,3].map(n=>launch('parallel-'+n)));
  assert.equal(new Set(concurrent.map(w=>w.ready.host)).size,1);assert.equal(concurrent.filter(w=>!w.ready.reused).length,1);
  const primary=concurrent.find(w=>!w.ready.reused);
  for(const w of concurrent){const state=(await request(w,'status','status')).value;assert.equal(state.guardian.ownerPid,primary.child.pid);assert.equal(state.guardian.phase,'running');}
  for(const w of concurrent.filter(w=>w!==primary))await stop(w);
  assert.equal((await request(primary,'status','status')).value.guardian.phase,'running');await stop(primary);
  for(const saved of preserved)assert.equal(sha(await readFile(join(root,saved.path))),saved.sha256,'Preserved file changed: '+saved.path);
  status='pass';
 }catch(error){failure=error.message;throw error;}
 finally{
  await cleanup();const residue=[];
  for(const w of workers)for(const [role,identity] of [['worker',w.centerIdentity],['host',w.hostIdentity]])if(identity&&await matches(identity))residue.push({role,pid:identity.pid});
  const report={schema:1,status:residue.length?'fail':status,failure,scope:'Real installed bootstrap and actual host with synthetic Windows data; no GUI mouse test or model call',root,graphHash:config.graphHash,cleanRounds:3,crashRecoveryRounds:3,concurrentLaunches:3,preserved,userPluginScope:'preserved unactivated synthetic user-plugin file',residue,cleanupEvents:events.filter(e=>e.event.includes('cleanup')),sources:await Promise.all([join(root,configName),join(root,'managed/launcher.mjs'),join(root,'program/graph.json'),join(work,'installed-worker.mjs'),fileURLToPath(import.meta.url)].map(async path=>({path,sha256:sha(await readFile(path))})))};
  await writeFile(join(evidence,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({evidence,status:report.status,residue:residue.length}));assert.equal(residue.length,0,'Owned test processes remain');
 }
});
