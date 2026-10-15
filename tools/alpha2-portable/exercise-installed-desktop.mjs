// Runs the installed start.sh DEFAULT entry, without changing desktop main or
// injecting a preload/renderer observer. Native window close must stop Host.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {withPrivateDisplay} from './private-xorg.mjs';
import {inspectProcess} from './linux-process-owner.mjs';
const [installation,root]=process.argv.slice(2),program=join(installation,'program'),data=join(installation,'data');process.umask(0o077);await mkdir(root,{mode:0o700});
const originalLedger=JSON.parse(await readFile(join(data,'budget/ledger.json'))),rounds=[];
await withPrivateDisplay(root,async()=>{for(const round of [1,2]){
 let stderrOffset=0;try{stderrOffset=(await readFile(join(data,'logs/electron.stderr.log'))).length;}catch(e){if(e.code!=='ENOENT')throw e;}
 const child=spawn(join(program,'start.sh'),[data],{env:process.env,stdio:['ignore','pipe','pipe']}),out=[],err=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));let exit;const ended=new Promise(r=>child.once('close',(code,signal)=>{exit={code,signal};r(exit);}));let electron;
 try{
  let ready;const until=Date.now()+90000;while(Date.now()<until&&!exit){for(const line of Buffer.concat(out).toString().split('\n'))try{const v=JSON.parse(line);if(v.phase==='ready')ready=v;}catch{}if(ready)break;await delay(100);}assert(ready,'installed desktop Host readiness missing: '+Buffer.concat(err));
  const connection=JSON.parse(await readFile(join(data,'desktop-connection.json'))),rpc=async method=>{const r=await fetch(connection.endpoint+'rpc',{method:'POST',headers:{authorization:'Bearer '+connection.token,'content-type':'application/json'},body:JSON.stringify({method}),signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);return (await r.json()).result;};assert.equal((await rpc('desktopReady')).phase,'active');
  const scanUntil=Date.now()+30000;let captured,lastDriverError;while(Date.now()<scanUntil&&!exit){
   for(const name of await readdir('/proc'))if(/^\d+$/.test(name))try{const cmd=(await readFile('/proc/'+name+'/cmdline')).toString().split('\0');if(cmd[0]===join(program,'electron/electron')&&cmd[1]===join(program,'desktop'))electron=await inspectProcess(Number(name));}catch{}
   if(electron)try{await delay(3000);const r=await promisify(execFile)('/usr/bin/python3',['-I','-B',fileURLToPath(new URL('./linux-installed-window.py',import.meta.url)),String(electron.pid),electron.birth,'capture',join(root,'round-'+round+'.png')],{env:process.env,timeout:15000});captured=JSON.parse(r.stdout);break;}catch(e){lastDriverError={code:e.code,stdout:e.stdout,stderr:e.stderr};if(e.code==='EEXIST')throw e;}
   await delay(100);
  }await writeFile(join(root,'round-'+round+'.observer.json'),JSON.stringify({electron,lastDriverError,captured},null,2)+'\n');assert(captured,'installed default desktop window not observed: '+JSON.stringify({electron,lastDriverError}));
  const electronStderr=await readFile(join(data,'logs/electron.stderr.log')).then(b=>b.subarray(stderrOffset).toString()).catch(error=>{if(error.code==='ENOENT')return '';throw error;});assert.doesNotMatch(electronStderr,/Error: web boot:|Desktop backend failed|DeepSeek Harness is unavailable/);await writeFile(join(root,'round-'+round+'.electron.stderr.log'),electronStderr);
  await promisify(execFile)('/usr/bin/python3',['-I','-B',fileURLToPath(new URL('./linux-installed-window.py',import.meta.url)),String(electron.pid),electron.birth,'close','unused'],{env:process.env,timeout:5000});await Promise.race([ended,delay(35000).then(()=>{throw Error('DEFAULT_DESKTOP_CLOSE_DEADLINE');})]);assert.equal(exit.code,0);const closed=Buffer.concat(out).toString().split('\n').filter(Boolean).map(JSON.parse).find(v=>v.phase==='closed');assert.equal(closed?.receipt?.status,'pass');assert.equal(closed.electronExit.code,0);assert.equal(closed.hostExit.code,0);assert.deepEqual(JSON.parse(await readFile(join(data,'budget/ledger.json'))),originalLedger);rounds.push({round,status:'pass',window:captured,hostPid:ready.hostPid,electronPid:electron.pid,exit,closed,ledgerPreserved:true});
 }finally{if(!exit){child.kill('SIGTERM');await Promise.race([ended,delay(35000)]);}await writeFile(join(root,'round-'+round+'.stdout.log'),Buffer.concat(out));await writeFile(join(root,'round-'+round+'.stderr.log'),Buffer.concat(err));}
}});
await writeFile(join(root,'RESULT.json'),JSON.stringify({status:'pass',scope:'installed default Electron main, private authenticated Xorg, native window close, two cold boots; physical desktop/tray not certified',rounds},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'pass',rounds:rounds.length}));
