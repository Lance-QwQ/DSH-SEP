import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {reviewInstallation,install} from './linux-install.mjs';
const [packageRoot,caseRoot]=process.argv.slice(2),pack=JSON.parse(await readFile(join(packageRoot,'PACKAGE.json')));await mkdir(caseRoot,{mode:0o700});process.umask(0o077);const request={payload:pack.payload,destination:join(caseRoot,'program'),dataRoot:join(caseRoot,'data'),manifestSha256:pack.manifestSha256},plan=await reviewInstallation(request);await writeFile(join(caseRoot,'INSTALL-PLAN.json'),JSON.stringify(plan,null,2)+'\n');const installed=await install({...request,planHash:plan.planHash});assert.equal(installed.status,'pass');const results=[];
let previousConnection;for(const round of [1,2]){
 const startedAt=Date.now();
 const child=spawn(join(request.destination,'start.sh'),[request.dataRoot,'--headless'],{env:process.env,stdio:['ignore','pipe','pipe']}),out=[],err=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));let exit;const ended=new Promise(r=>child.once('close',(code,signal)=>{exit={code,signal};r(exit);}));
 try{
  const until=Date.now()+90000;let ready;while(Date.now()<until&&!exit){for(const line of Buffer.concat(out).toString().split('\n')){try{const m=JSON.parse(line);if(m.phase==='ready')ready=m;}catch{}}if(ready)break;await delay(100);}assert(ready,'installed start did not become ready: '+Buffer.concat(err));
  const connection=JSON.parse(await readFile(join(request.dataRoot,'desktop-connection.json'))),status=await fetch(connection.endpoint+'rpc',{method:'POST',headers:{authorization:'Bearer '+connection.token,'content-type':'application/json'},body:JSON.stringify({method:'desktopReady'})});assert.equal(status.status,200);const current=await status.json();assert.equal(current.result.phase,'active');assert.equal(current.result.generation,1);const readyMs=Date.now()-startedAt;
  if(previousConnection){assert.notEqual(connection.token,previousConnection.token);try{const old=await fetch(previousConnection.endpoint+'rpc',{method:'POST',headers:{authorization:'Bearer '+previousConnection.token,'content-type':'application/json'},body:JSON.stringify({method:'desktopReady'}),signal:AbortSignal.timeout(1000)});assert.notEqual(old.status,200);}catch(e){if(e.code==='ERR_ASSERTION')throw e;}}previousConnection=connection;
  const duplicate=spawn(join(request.destination,'start.sh'),[request.dataRoot,'--headless'],{stdio:['ignore','pipe','pipe']}),dup=await new Promise(r=>duplicate.once('close',r));assert.equal(dup,73);
  const before=await readFile(join(request.dataRoot,'budget/ledger.json'));if(round===1)await writeFile(join(caseRoot,'LEDGER-BEFORE.json'),before);else assert.deepEqual(JSON.parse(before),JSON.parse(await readFile(join(caseRoot,'LEDGER-BEFORE.json'))));
  const response=await fetch(connection.endpoint+'rpc',{method:'POST',headers:{authorization:'Bearer '+connection.token,'content-type':'application/json'},body:JSON.stringify({method:'stopHost'}),signal:AbortSignal.timeout(35000)});assert.equal(response.status,200);await Promise.race([ended,delay(10000).then(()=>{throw Error('INSTALLED_STOP_TIMEOUT');})]);assert.equal(exit.code,0);results.push({round,status:'pass',hostPid:ready.hostPid,readyMs,exit,duplicateExit:dup,ledgerPreserved:true,oldConnection:round===2?'refused':'not applicable'});
 }finally{if(!exit){child.kill('SIGTERM');await Promise.race([ended,delay(35000)]);}await writeFile(join(caseRoot,'round-'+round+'.stdout.log'),Buffer.concat(out));await writeFile(join(caseRoot,'round-'+round+'.stderr.log'),Buffer.concat(err));}
}
// The launcher creates this file on the first stderr byte. A quiet host has no file.
const hostStderr=await readFile(join(request.dataRoot,'logs/host.stderr.log'),'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
assert.doesNotMatch(hostStderr,/did not activate|invalid config/);
await writeFile(join(caseRoot,'HOST-STDERR.log'),hostStderr,{flag:'wx'});
await writeFile(join(caseRoot,'RESULT.json'),JSON.stringify({status:'pass',scope:'actual independent payload install and two native host boots; no Electron or paid API claims',installed,results,hostStderrBytes:Buffer.byteLength(hostStderr),startupWarningsAbsent:true},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'pass',rounds:results.length}));
