import {fork,spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,appendFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {appendFileSync} from 'node:fs';
const root=resolve(process.env.SEP_BUNDLE_TEST_ROOT),f=JSON.parse(await readFile(join(root,'DESKTOP-FIXTURE.json'))),token=randomBytes(32).toString('hex');
let child,electron,ready,exit,phase='starting',server,forced=false;
const result={status:'running',scope:'actual Alpha.2 default desktop main + real official profile boot + controlled Linux tool composition; synthetic data only',notVerified:['native tray menu input','manual titlebar drag','native close-notice confirmation','complete SEP business/Profile certification','paid model','private data','update installation']};
try{
 child=fork(new URL('./linux-desktop-host.mjs',import.meta.url),[f.runtime,f.profile,f.source],{env:{...process.env,DSH_HOME:f.home,DEEPSEEK_API_KEY:'synthetic-not-a-real-key'},stdio:['ignore','pipe','pipe','ipc']});
 child.on('error',error=>{result.childError=error.code;});
 child.on('message',message=>{if(message.type==='sep-verified')result.sep=message;if(message.type==='sep-close')result.sepClose=message.receipt;});
 child.stdout.on('data',x=>appendFileSync(join(root,'host.stdout.log'),x));child.stderr.on('data',x=>appendFileSync(join(root,'host.stderr.log'),x));
 const exited=new Promise(r=>child.once('exit',(code,signal)=>{exit={code,signal};phase='stopped';r(exit);}));
 ready=await Promise.race([new Promise((resolve,reject)=>child.on('message',m=>{if(m.type==='ready')resolve(m);if(m.type==='failed')reject(Error(String(m.code)));})),exited.then(()=>{throw Error('HOST_START_EXIT');}),delay(40000,undefined,{ref:false}).then(()=>{throw Error('HOST_START_DEADLINE');})]);phase='running';
 if(process.env.SEP_LINUX_ATTACHMENT_UI==='1'){
  const endpoint=new URL('/api/session/attachment',ready.url),response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rpcId:'anonymous',method:'session/attachment',payload:{sessionId:'desktop-vision',attachmentId:'not-a-ref'}}),signal:AbortSignal.timeout(3000)});await response.arrayBuffer();if(response.status!==401)throw Error('UPLOAD_HTTP_AUTHENTICATION_MISSING');result.attachmentHttpAuthentication={status:'pass',anonymousStatus:response.status,transport:'independent HTTP without Electron forwarding or cookie'};
 }
 server=createServer(async(req,res)=>{
  try{
   if(req.headers.host!=='127.0.0.1:'+server.address().port||req.headers.authorization!=='Bearer '+token||req.headers.origin||req.url!=='/rpc'||req.method!=='POST')throw Error('RPC_DENIED');
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('RPC_LIMIT');}const body=JSON.parse(raw);let value;
   if(body.method==='desktopStatus')value={projectDir:f.profile,dshVersion:'0.2.1-alpha.2',protocolVersion:4,transport:'desktop-http',guardian:{phase,generation:1,pid:child.pid}};
   else if(body.method==='startHost'){if(phase!=='running')throw Error('HOST_NOT_RUNNING');value={phase,generation:1,pid:child.pid};}
   else if(body.method==='desktopReady')value={...ready,transport:'desktop-http',dshVersion:'0.2.1-alpha.2',generation:1,pid:child.pid};
   else if(body.method==='desktopQuitInspection'){
    const id=randomBytes(8).toString('hex');const inspection=new Promise(resolve=>{const listener=m=>{if(m.type==='inspection'&&m.id===id){child.off('message',listener);resolve(m);}};child.on('message',listener);});child.send({type:'inspect',id});value=await Promise.race([inspection,delay(3000).then(()=>{throw Error('INSPECTION_DEADLINE');})]);
   }else if(body.method==='stopHost'){
    if(phase==='running'){phase='stopping';child.send({type:'stop'});await Promise.race([exited,delay(10000).then(()=>{throw Error('HOST_STOP_DEADLINE');})]);}
    if(!exit)throw Error('HOST_STOP_UNKNOWN');value={phase:'stopped',lastExit:{...exit,forced:false}};
   }else throw Error('RPC_METHOD');
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,result:value}));
  }catch{res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:{code:'RECOVERY_DESKTOP_UNAVAILABLE'}}));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const connection=join(root,'desktop-connection.json');await writeFile(connection,JSON.stringify({endpoint:'http://127.0.0.1:'+server.address().port+'/',token,role:'desktop',projectDir:f.profile,dshVersion:'0.2.1-alpha.2',protocolVersion:4}),{mode:0o600,flag:'wx'});
 const probe=join(root,'desktop-probe.jsonl');await mkdir(join(root,'xdg'),{mode:0o700});await mkdir(join(root,'electron-home'),{mode:0o700});
 electron=spawn(f.electron,[f.app,'--sep-recovery-connection='+connection,'--disable-gpu'],{env:{...process.env,DSH_HOME:f.home,HOME:join(root,'electron-home'),XDG_CONFIG_HOME:join(root,'xdg'),DSH_DESKTOP_DSH_DIR:f.runtime,DSH_DESKTOP_PRIMARY_RUNTIME_DIR:'/opt/dsh-sep-cross-platform/runtime-r5/runtime/primary-runtime',DSH_DESKTOP_NODE_BINARY:process.execPath,DSH_DESKTOP_OPEN_DEVTOOLS:'0',SEP_DESKTOP_PROBE:probe},stdio:['ignore','pipe','pipe']});
 electron.stdout.on('data',x=>void appendFile(join(root,'electron.stdout.log'),x));electron.stderr.on('data',x=>void appendFile(join(root,'electron.stderr.log'),x));
 const ended=await Promise.race([new Promise((resolve,reject)=>{electron.once('error',reject);electron.once('exit',(code,signal)=>resolve({code,signal}));}),delay(60000,undefined,{ref:false}).then(()=>{throw Error('DESKTOP_DEADLINE');})]);
 result.electronExit=ended;result.hostExit=exit;result.hostPid=child.pid;result.electronPid=electron.pid;
 const rows=(await readFile(probe,'utf8')).trim().split('\n').map(JSON.parse);result.events=rows;
 const required=['main-visible','close-hidden','reopened','will-quit'];if(ended.code!==0||!required.every(e=>rows.some(x=>x.event===e))||!rows.some(x=>x.event==='main-visible'&&x.visible===true&&x.textLength>=100&&x.buttons>=3)||exit?.code!==0)throw Error('DESKTOP_LIFECYCLE_INCOMPLETE');
 if(process.env.SEP_LINUX_BUSINESS==='1'&&(result.sep?.status!=='pass'||result.sep.compaction!=='active'||result.sepClose?.status!=='pass'||!['sep-memory-ui','sep-budget-ui'].every(event=>rows.some(r=>r.event===event))))throw Error('DESKTOP_SEP_INCOMPLETE');
 if(process.env.SEP_LINUX_VISION==='1'){
  if(result.sep?.vision?.status!=='pass')throw Error('DESKTOP_VISION_INCOMPLETE');const owner=JSON.parse(await readFile(join(f.memory,'.suite-attachments/owner.json'))),maintenance=await import('./linux-attachment-maintenance.mjs'),plan=await maintenance.prepareAttachmentPurge({storageRoot:f.memory,projectId:owner.projectId});if(plan.files.length<2)throw Error('DESKTOP_ATTACHMENT_RETENTION');result.attachmentAfterShutdown={status:'pass',files:plan.files.length,ownersReleased:true,retained:true};
 }
 if(process.env.SEP_LINUX_ATTACHMENT_UI==='1'&&process.env.SEP_LINUX_FILE_UI!=='1'){
  for(const event of ['upload-oversized-refused','upload-preview','upload-count-refused','upload-draft-removed','upload-desktop-file-reference','upload-file-refused','upload-malformed-refused','upload-sent-history-visible','upload-other-session-refused','upload-reload-history-visible'])if(!rows.some(r=>r.event===event))throw Error('DESKTOP_UPLOAD_INCOMPLETE');
  const ledger=JSON.parse(await readFile(join(f.memory,'../sep-budget/ledger.json')));if(ledger.entries.length!==2||ledger.entries.some(e=>e.status!=='settled'))throw Error('DESKTOP_UPLOAD_ACCOUNTING');result.attachmentUi={status:'pass',syntheticModel:true,settledEntries:ledger.entries.length,osFilePicker:'not_run',independentHostRestart:'not_run'};
 }
 if(process.env.SEP_LINUX_FILE_UI==='1'){
  for(const event of ['file-ui-oversize-refused','file-ui-staged','file-ui-tool-read-verified','file-ui-foreign-or-retired-receipt-refused','file-ui-reload-history-visible'])if(!rows.some(r=>r.event===event))throw Error('DESKTOP_FILE_UPLOAD_INCOMPLETE');
  const ledger=JSON.parse(await readFile(join(f.memory,'../sep-budget/ledger.json')));if(ledger.entries.length!==3||ledger.entries.some(e=>e.status!=='settled'))throw Error('DESKTOP_FILE_ACCOUNTING');if(result.attachmentAfterShutdown.files!==4)throw Error('DESKTOP_FILE_RETENTION');result.fileUi={status:'pass',syntheticModel:true,settledEntries:ledger.entries.length,osFilePicker:'not_run',independentHostRestart:'not_run'};
 }
 result.status='pass';
}catch(error){result.status='fail';result.code=error.message;console.error(error);process.exitCode=1;}
finally{
 if(electron&&electron.exitCode===null&&electron.signalCode===null){electron.kill('SIGKILL');forced=true;await new Promise(r=>electron.once('exit',r));}
 if(child&&child.exitCode===null&&child.signalCode===null){if(child.connected)child.send({type:'stop'},()=>{});await delay(1500);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');forced=true;await new Promise(r=>child.once('exit',r));}}
 await new Promise(r=>server?server.close(r):r());result.forcedCleanup=forced;await writeFile(join(root,'DESKTOP-RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}
