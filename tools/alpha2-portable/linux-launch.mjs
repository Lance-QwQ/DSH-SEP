import {fork,spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {appendFileSync,writeSync} from 'node:fs';
import {join} from 'node:path';
import {assertInstalled} from './linux-install.mjs';
import {initializeProfile} from './linux-standalone-profile.mjs';
import {desktopReply} from './linux-desktop-contract.mjs';
import {bounded,ownChild,parseLaunchArgs,sendHostMessage,waitForDesktop} from './linux-launch-lifecycle.mjs';
process.umask(0o077);
let child,hostOwner,electronOwner,receipt,server,stopHost,signalCleanup,electronTermination,phase='starting',closing;
let stopNotified=false;
function notifyOwnerStop(){
 if(stopNotified)return;
 const value=process.env.SEP_LINUX_OWNER_CONTROL_FD;
 if(value===undefined)return;
 if(!/^[0-9]{1,6}$/.test(value)||Number(value)<3)throw Error('SEP_LINUX_OWNER_CONTROL_INVALID');
 writeSync(Number(value),'S');stopNotified=true;
}
try{
 const {program,data,headless}=parseLaunchArgs(process.argv.slice(2));await assertInstalled(program,data);await initializeProfile(program,data);const f=JSON.parse(await readFile(join(data,'PROFILE.json')));if(f.program!==program)throw Error('SEP_LINUX_PROFILE_PROGRAM_CHANGED');
 await mkdir(join(data,'logs'),{recursive:true,mode:0o700});const token=randomBytes(32).toString('hex');
 child=fork(new URL('./linux-standalone-host.mjs',import.meta.url),[program,data],{env:{...process.env,SEP_OFFICIAL_HARNESS:join(program,'host'),SEP_PORTABLE_ROOT:program,DSH_HOME:join(data,'home')},stdio:['ignore','pipe','pipe','ipc']});hostOwner=ownChild(child);
 child.stdout.on('data',b=>appendFileSync(join(data,'logs/host.stdout.log'),b));child.stderr.on('data',b=>appendFileSync(join(data,'logs/host.stderr.log'),b));child.on('message',m=>{if(m.type==='close')receipt=m.receipt;});
 stopHost=()=>closing??=(async()=>{notifyOwnerStop();phase='stopping';if(!hostOwner.exit){receipt=undefined;if(child.connected)await sendHostMessage(child,{type:'stop'}).catch(()=>{});}await bounded(hostOwner.completion,30000,'SEP_LINUX_HOST_STOP_UNCONFIRMED');if(hostOwner.exit.code!==0||receipt?.status!=='pass')throw Error('SEP_LINUX_HOST_STOP_BLOCKED');phase='stopped';return {phase:'stopped',lastExit:{...hostOwner.exit,forced:false}};})().catch(e=>{phase='blocked';throw e;}).finally(()=>{closing=undefined;});
 const ready=await bounded(Promise.race([new Promise((r,j)=>child.on('message',m=>{if(m.type==='ready')r(m);if(m.type==='failed')j(Object.assign(Error(m.code),{code:m.code}));})),hostOwner.completion.then(()=>{throw Error('SEP_LINUX_HOST_START_EXIT');})]),40000,'SEP_LINUX_HOST_START_TIMEOUT');phase='running';
 server=createServer(async(req,res)=>{try{
  const auth=req.headers.authorization??'',expected='Bearer '+token;if(req.headers.host!=='127.0.0.1:'+server.address().port||req.headers.origin||req.method!=='POST'||req.url!=='/rpc'||Buffer.byteLength(auth)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(auth),Buffer.from(expected)))throw Error('RPC_DENIED');let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>4096)throw Error('RPC_LIMIT');}const body=JSON.parse(raw);let result;
  if(['desktopStatus','startHost','desktopReady'].includes(body.method))result=desktopReply({method:body.method,profile:f.profile,phase,pid:child.pid,generation:1,ready});
  else if(body.method==='desktopQuitInspection'){const id=randomBytes(8).toString('hex');let listener;try{const response=new Promise(r=>{listener=m=>{if(m.type==='inspection'&&m.id===id)r({activeTasks:m.activeTasks,scheduledTasks:m.scheduledTasks});};child.on('message',listener);});await sendHostMessage(child,{type:'inspect',id});result=await bounded(response,3000,'INSPECTION_UNCONFIRMED');}finally{if(listener)child.off('message',listener);}}
  else if(body.method==='stopHost')result=await stopHost();else throw Error('RPC_METHOD');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,result}));
 }catch{res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:{code:phase==='blocked'?'SEP_LINUX_SHUTDOWN_BLOCKED':'SEP_LINUX_LAUNCHER_REQUEST_REFUSED'}}));}});
 server.requestTimeout=5000;server.headersTimeout=5000;await new Promise(r=>server.listen(0,'127.0.0.1',r));const connection=join(data,'desktop-connection.json');await writeFile(connection,JSON.stringify({endpoint:'http://127.0.0.1:'+server.address().port+'/',token,role:'desktop',projectDir:f.profile,dshVersion:'0.2.1-alpha.2',protocolVersion:4})+'\n',{mode:0o600});
 console.log(JSON.stringify({status:'pass',phase:'ready',scope:'isolated Linux preview',dataRoot:data,hostPid:child.pid,connectionFile:connection}));
 let signalStop;const stopping=new Promise(r=>{signalStop=r;});const onSignal=()=>{signalCleanup??=(async()=>{const parts=await Promise.allSettled([stopHost(),electronOwner?.stop()]);if(parts[1].status==='fulfilled')electronTermination=parts[1].value;if(parts.some(p=>p.status==='rejected')||electronTermination?.status==='blocked')throw Error('SEP_LINUX_SHUTDOWN_BLOCKED');})().finally(signalStop);signalCleanup.catch(()=>{});};process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
 if(!headless){
  if(!process.env.DISPLAY&&!process.env.WAYLAND_DISPLAY)throw Object.assign(Error('SEP_LINUX_DISPLAY_UNAVAILABLE'),{code:'SEP_LINUX_DISPLAY_UNAVAILABLE'});
  const env={...process.env,DSH_HOME:join(data,'home'),HOME:join(data,'electron-home'),XDG_CONFIG_HOME:join(data,'xdg'),FONTCONFIG_FILE:join(data,'fonts.conf'),DSH_DESKTOP_DSH_DIR:join(program,'host'),DSH_DESKTOP_PRIMARY_RUNTIME_DIR:join(program,'primary-runtime'),DSH_DESKTOP_NODE_BINARY:process.execPath,DSH_DESKTOP_OPEN_DEVTOOLS:'0'};
  const electron=spawn(join(program,'electron/electron'),[join(program,'desktop'),'--sep-recovery-connection='+connection,'--disable-gpu'],{env,stdio:['ignore','pipe','pipe']});electronOwner=ownChild(electron);electron.stdout.on('data',b=>appendFileSync(join(data,'logs/electron.stdout.log'),b));electron.stderr.on('data',b=>appendFileSync(join(data,'logs/electron.stderr.log'),b));await waitForDesktop({host:hostOwner,desktop:electronOwner,stopping,phase:()=>phase});
 }else await Promise.race([hostOwner.completion,stopping]);
 if(signalCleanup)await signalCleanup;if(!hostOwner.exit)await stopHost();if(receipt?.status!=='pass'||electronOwner&&!signalCleanup&&electronOwner.exit?.code!==0)throw Error('SEP_LINUX_SHUTDOWN_BLOCKED');console.log(JSON.stringify({status:'pass',phase:'closed',hostExit:hostOwner.exit,electronExit:electronOwner?.exit,electronTermination,receipt}));
}catch(e){
 console.error(JSON.stringify({status:'blocked',code:/^[A-Z_]{1,64}$/.test(e.code??e.message??'')?(e.code??e.message):'SEP_LINUX_LAUNCH_FAILED'}));process.exitCode=1;
 const cleanup=await Promise.allSettled([electronOwner?.stop(),stopHost?.()]);if(cleanup.some(r=>r.status==='rejected')||cleanup[0].value?.status==='blocked')console.error(JSON.stringify({status:'blocked',code:'SEP_LINUX_CLEANUP_UNCONFIRMED'}));
}finally{if(server)try{await bounded(new Promise(r=>server.close(r)),5000,'SEP_LINUX_RPC_CLOSE_DEADLINE');}catch{server.closeAllConnections();process.exitCode=1;console.error(JSON.stringify({status:'blocked',code:'SEP_LINUX_RPC_CLOSE_DEADLINE'}));}}
