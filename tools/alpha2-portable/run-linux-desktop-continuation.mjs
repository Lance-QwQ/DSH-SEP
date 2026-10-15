import assert from 'node:assert/strict';
import {fork,spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
process.umask(0o077);
const root=resolve(process.env.SEP_BUNDLE_TEST_ROOT),f=JSON.parse(await readFile(join(root,'DESKTOP-FIXTURE.json'))),result={status:'running',display:process.env.SEP_VIRTUAL_DISPLAY??'WSLg',scope:'isolated Alpha.2 desktop: actual GTK OS picker + private CJK font + two independent host/Electron boots; synthetic model only',rounds:[]};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
let oldUrl;
await mkdir(join(root,'xdg'),{mode:0o700});await mkdir(join(root,'electron-home'),{mode:0o700});
for(const generation of [1,2]){
 let child,electron,server,exit,phase='starting',forced=false,driverStop=false,driver;const round={generation,status:'running'},token=randomBytes(32).toString('hex'),base=join(root,'round-'+generation);await mkdir(base,{mode:0o700});result.rounds.push(round);
 const env={...process.env,DSH_HOME:f.home,DEEPSEEK_API_KEY:'synthetic-not-a-real-key',SEP_DESKTOP_CONTINUATION:String(generation)};
 try{
  child=fork(new URL('./linux-desktop-host.mjs',import.meta.url),[f.runtime,f.profile,f.source],{env,stdio:['ignore','pipe','pipe','ipc']});
  child.stdout.on('data',x=>appendFileSync(join(base,'host.stdout.log'),x));child.stderr.on('data',x=>appendFileSync(join(base,'host.stderr.log'),x));
  child.on('message',m=>{if(m.type==='sep-close')round.close=m.receipt;if(m.type==='continuation-recovered')round.recovered=m;if(m.type==='sep-verified')round.verified=m;});
  const exited=new Promise(r=>child.once('exit',(code,signal)=>{exit={code,signal};phase='stopped';r(exit);}));
  const ready=await Promise.race([new Promise((resolve,reject)=>child.on('message',m=>{if(m.type==='ready')resolve(m);if(m.type==='failed')reject(Error(m.code));})),exited.then(()=>{throw Error('HOST_START_EXIT');}),delay(40000,undefined,{ref:false}).then(()=>{throw Error('HOST_START_DEADLINE');})]);phase='running';
  round.hostPid=child.pid;round.hostBirth=(await readFile('/proc/'+child.pid+'/stat','utf8')).split(' ')[21];round.urlOrigin=new URL(ready.url).origin;
  if(process.env.SEP_LINUX_CONTEXT==='1'){assert.equal(round.verified?.context?.status,'pass');assert.equal(round.verified.context.ledgerUnchanged,true);assert.equal(round.verified.context.snapshotSha256,f.contextSnapshotSha256);}
  if(generation===2){assert.notEqual(child.pid,result.rounds[0].hostPid);assert.notEqual(round.hostBirth,result.rounds[0].hostBirth);assert.equal(round.recovered?.status,'pass');try{const response=await fetch(oldUrl,{signal:AbortSignal.timeout(1000)});await response.arrayBuffer();throw Error('OLD_HOST_STILL_ACCEPTS');}catch(e){if(e.message==='OLD_HOST_STILL_ACCEPTS')throw e;round.oldHostConnection='refused after process exit';}}
  oldUrl=ready.url;
  server=createServer(async(req,res)=>{try{
   if(req.headers.host!=='127.0.0.1:'+server.address().port||req.headers.authorization!=='Bearer '+token||req.headers.origin||req.url!=='/rpc'||req.method!=='POST')throw Error('RPC_DENIED');let raw='';for await(const c of req){raw+=c;if(raw.length>4096)throw Error('RPC_LIMIT');}const body=JSON.parse(raw);let value;
   if(body.method==='desktopStatus')value={projectDir:f.profile,dshVersion:'0.2.1-alpha.2',protocolVersion:4,transport:'desktop-http',guardian:{phase,generation,pid:child.pid}};
   else if(body.method==='startHost'){if(phase!=='running')throw Error('HOST_NOT_RUNNING');value={phase,generation,pid:child.pid};}
   else if(body.method==='desktopReady')value={...ready,transport:'desktop-http',dshVersion:'0.2.1-alpha.2',generation,pid:child.pid};
   else if(body.method==='desktopQuitInspection'){value={activeTasks:false,scheduledTasks:false};}
   else if(body.method==='stopHost'){
    let snapshotError;try{if(generation===1&&phase==='running'){
     const id=randomBytes(8).toString('hex'),route=JSON.parse(await readFile(join(root,'UI-SESSION.json'))),response=new Promise(resolve=>{const listener=m=>{if(m.type==='continuation-snapshot'&&m.id===id){child.off('message',listener);resolve(m);}};child.on('message',listener);});child.send({type:'continuation-snapshot',id,route});round.persisted=await Promise.race([response,delay(5000).then(()=>{throw Error('SNAPSHOT_DEADLINE');})]);assert.equal(round.persisted.status,'pass');
    }}catch(error){snapshotError=error;}
    if(phase==='running'){phase='stopping';child.send({type:'stop'});await Promise.race([exited,delay(10000).then(()=>{throw Error('HOST_STOP_DEADLINE');})]);}if(snapshotError)throw snapshotError;if(!exit)throw Error('HOST_STOP_UNKNOWN');value={phase:'stopped',lastExit:{...exit,forced:false}};
   }else throw Error('RPC_METHOD');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,result:value}));
  }catch(e){round.rpcError=e.message;res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:{code:'RECOVERY_DESKTOP_UNAVAILABLE'}}));}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const connection=join(base,'desktop-connection.json');await writeFile(connection,JSON.stringify({endpoint:'http://127.0.0.1:'+server.address().port+'/',token,role:'desktop',projectDir:f.profile,dshVersion:'0.2.1-alpha.2',protocolVersion:4}),{mode:0o600,flag:'wx'});
  const probe=join(base,'desktop-probe.jsonl');electron=spawn(f.electron,[f.app,'--sep-recovery-connection='+connection,'--disable-gpu','--ozone-platform=x11'],{env:{...env,GDK_BACKEND:'x11',GSETTINGS_BACKEND:'memory',FONTCONFIG_FILE:f.font.config,HOME:join(root,'electron-home'),XDG_CONFIG_HOME:join(root,'xdg'),DSH_DESKTOP_DSH_DIR:f.runtime,DSH_DESKTOP_PRIMARY_RUNTIME_DIR:'/opt/dsh-sep-cross-platform/runtime-r5/runtime/primary-runtime',DSH_DESKTOP_NODE_BINARY:process.execPath,DSH_DESKTOP_OPEN_DEVTOOLS:'0',SEP_DESKTOP_PROBE:probe},stdio:['ignore','pipe','pipe']});
  electron.stdout.on('data',x=>appendFileSync(join(base,'electron.stdout.log'),x));electron.stderr.on('data',x=>appendFileSync(join(base,'electron.stderr.log'),x));
  round.electronPid=electron.pid;await writeFile(join(root,'LIVE.json'),JSON.stringify({generation,hostPid:child.pid,electronPid:electron.pid,probe,root}));
  if(generation===1)driver=(async()=>{const handled=new Set();while(!driverStop){let rows=[];try{rows=(await readFile(probe,'utf8')).trim().split('\n').map(JSON.parse);}catch{}for(const request of rows.filter(r=>r.event==='os-picker-request'&&!handled.has(r.kind))){handled.add(request.kind);await delay(450);const output=await promisify(execFile)('python3',[new URL('./linux-picker-driver.py',import.meta.url).pathname,request.kind==='cancel'?'cancel':'select',String(electron.pid),...request.path?[request.path]:[]],{env:{...env,SEP_PICKER_INPUT_ROOT:f.uploads,SEP_PICKER_SCREENSHOT:join(base,'os-picker-'+request.kind+'.png')},timeout:30000});appendFileSync(join(base,'picker-driver.jsonl'),output.stdout);if(request.kind==='cancel')await writeFile(join(root,'picker-cancelled'),'native dialog dismissed',{mode:0o600,flag:'wx'});}await delay(150);}})().catch(e=>{round.driverError={code:e.code,stderr:e.stderr};});
  round.electronExit=await Promise.race([new Promise((resolve,reject)=>{electron.once('error',reject);electron.once('exit',(code,signal)=>resolve({code,signal}));}),delay(360000,undefined,{ref:false}).then(()=>{throw Error('DESKTOP_DEADLINE');})]);
  if(!exit)await Promise.race([exited,delay(3000)]);round.hostExit=exit;assert.equal(round.electronExit.code,0);assert.equal(exit?.code,0);assert.equal(round.close?.status,'pass');
  round.events=(await readFile(probe,'utf8')).trim().split('\n').map(JSON.parse);assert(!round.events.some(r=>/failure|error/.test(r.event)),'observer must not report failures');for(const name of ['close-hidden','reopened','will-quit'])assert(round.events.some(r=>r.event===name),name);
  if(generation===1)for(const name of ['os-picker-path-reference','os-picker-image-upload-verified','continuation-first-round-complete'])assert(round.events.some(r=>r.event===name),name);else assert(round.events.some(r=>r.event==='restart-ui-history-visible'));
  const ledgerBytes=await readFile(join(root,'sep-budget/ledger.json')),ledger=JSON.parse(ledgerBytes),saved=JSON.parse(await readFile(join(root,'PERSISTED-PROBE.json')));assert.deepEqual(ledger,saved.ledger,'entries, charges, reservations and settings survive both complete shutdowns');round.ledgerSha256=digest(ledgerBytes);round.ledgerContentUnchanged=true;round.status='pass';
 }catch(e){round.status='fail';round.code=e.code??e.message;result.status='fail';process.exitCode=1;console.error(e);}
 finally{
  driverStop=true;await driver;
  if(electron&&electron.exitCode===null&&electron.signalCode===null){electron.kill('SIGKILL');forced=true;await new Promise(r=>electron.once('exit',r));}
  if(child&&child.exitCode===null&&child.signalCode===null){if(child.connected)child.send({type:'stop'},()=>{});await delay(1500);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');forced=true;await new Promise(r=>child.once('exit',r));}}
  await new Promise(r=>server?server.close(r):r());round.forcedCleanup=forced;await writeFile(join(base,'RESULT.json'),JSON.stringify(round,null,2)+'\n',{flag:'wx'});
 }
 if(round.status!=='pass')break;
}
if(result.rounds.length===2&&result.rounds.every(r=>r.status==='pass')){result.status='pass';result.ledgerComparison='deep equality of complete parsed ledger; raw hashes retained separately because native load can normalize JSON property order';}
await writeFile(join(root,'CONTINUATION-RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
