// Test-only inspector observes the unchanged-built carrier. No model requests.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {finished} from 'node:stream/promises';
import {instrumentAtAppEntry} from './inspector-entry.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const [appArg,outArg]=process.argv.slice(2),app=await realpath(appArg),out=resolve(outArg),temp=await realpath(process.env.RUNNER_TEMP);
assert(out.startsWith(temp+'/')&&app.startsWith(temp+'/'));
await mkdir(out,{mode:0o700});process.umask(0o077);
const executable=join(app,'Contents/MacOS/DSH SEP'),rounds=[],cleanup=[];
const wait=async(fn,ms,code)=>{const end=Date.now()+ms;while(Date.now()<end){const r=await fn();if(r)return r;await delay(100);}throw Error(code);};
async function connect(url){
 assert(/^ws:\/\/127\.0\.0\.1:\d+\/[a-z0-9-]+$/i.test(url));
 const ws=new WebSocket(url),pending=new Map(),listeners=new Set();let seq=0;
 await new Promise((res,rej)=>{const timer=setTimeout(()=>rej(Error('INSPECTOR_CONNECT_DEADLINE')),5000);ws.addEventListener('open',()=>{clearTimeout(timer);res();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);rej(Error('INSPECTOR_CONNECT_FAILED'));},{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);for(const listener of listeners)listener(m);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('INSPECTOR_RPC_FAILED')):p.resolve(m.result);});
 ws.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('INSPECTOR_CLOSED'));}pending.clear();});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(Error('INSPECTOR_RPC_DEADLINE'),{diagnostic:{method,awaitPromise:params.awaitPromise}}));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 return {call,onEvent:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},close:()=>ws.close(),eval:async (expression,{awaitPromise=true}={})=>{const r=await call('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});if(r.exceptionDetails)throw Object.assign(Error('INSPECTOR_EVALUATION_FAILED'),{diagnostic:{text:r.exceptionDetails.text,type:r.exceptionDetails.exception?.className,description:String(r.exceptionDetails.exception?.description??'').slice(0,2048)}});return r.result?.value;}};
}
function instrumentation(appPath,receipt){return `(()=>{
 const Module=process.getBuiltinModule('module'),require=Module.createRequire(${JSON.stringify(join(appPath,'Contents/Resources/app.asar/package.json'))});
 const electron=require('electron'),cp=process.getBuiltinModule('child_process'),fs=process.getBuiltinModule('fs');
 const probe={hosts:[],electron,uncaught:0};globalThis.__sepCarrierProbe=probe;
 const original=cp.spawn;cp.spawn=function(...args){const child=Reflect.apply(original,this,args);if(Array.isArray(args[1])&&args[1].some(x=>typeof x==='string'&&x.includes('/dsh-desktop-host/lib/index.js'))){const row={pid:child.pid,ready:false,shutdownComplete:false,exit:null};probe.hosts.push(row);child.on('message',m=>{if(m?.type==='ready')row.ready=true;if(m?.type==='shutdown-complete')row.shutdownComplete=true;});child.on('exit',(code,signal)=>row.exit={code,signal});}return child;};Module.syncBuiltinESMExports();
 process.on('uncaughtExceptionMonitor',()=>{probe.uncaught++;});
 process.on('exit',code=>fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify({code,hosts:probe.hosts,uncaught:probe.uncaught})+'\\n',{mode:0o600}));return true;
})()`;}
const snapshot=`(()=>{const p=globalThis.__sepCarrierProbe,{app,BrowserWindow}=p.electron;return {ready:app.isReady(),name:app.name,version:app.getVersion(),userData:app.getPath('userData'),home:process.env.DSH_HOME,hosts:p.hosts,windows:BrowserWindow.getAllWindows().map(w=>({id:w.id,visible:w.isVisible(),url:w.webContents.getURL(),loading:w.webContents.isLoading()}))};})()`;
for(let index=1;index<=3;index++){
 const round={index,status:'fail'},data=join(out,'round-'+index),receipt=join(data,'exit.json');await mkdir(data,{mode:0o700});
 const profile=join(data,'home/profiles/desktop'),workspace=join(data,'workspace');
 await mkdir(profile,{recursive:true,mode:0o700});await mkdir(workspace,{mode:0o700});
 await writeFile(join(profile,'cordis.patch.yml'),JSON.stringify([{id:'workspace-controller',config:{documentsDirectory:workspace}}])+'\n',{flag:'wx',mode:0o600});
 let child,exit,client,logs=[],endpoint;
 try{
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(TOKEN|SECRET|PASSWORD|API_KEY|^APPLE_|^CSC_|^ELECTRON_RUN_AS_NODE$)/i.test(k)));
  env.DSH_SEP_DATA_ROOT=data;env.DSH_TELEMETRY_DISABLED='1';
  child=spawn(executable,['--inspect-brk=127.0.0.1:0'],{env,stdio:['ignore','pipe','pipe'],detached:true});
  child.once('exit',(code,signal)=>{exit={code,signal};});
  for(const [name,stream]of [['stdout',child.stdout],['stderr',child.stderr]]){const log=createWriteStream(join(data,name+'.log'),{flags:'wx'});logs.push({log,done:finished(log).then(()=>true,()=>false)});stream.pipe(log);stream.on('data',b=>{endpoint??=b.toString().match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-z0-9-]+)/i)?.[1];});}
  await wait(()=>{if(exit)throw Error('DESKTOP_EARLY_EXIT');return endpoint;},30000,'INSPECTOR_NOT_STARTED');
  client=await connect(endpoint);await client.call('Runtime.enable');round.stage='attach-instrumentation';await instrumentAtAppEntry(client,async()=>{assert.equal(await client.eval(instrumentation(app,receipt),{awaitPromise:false}),true);});round.stage='desktop-ready';
  await wait(async()=>{if(exit)throw Error('DESKTOP_EARLY_EXIT');const state=await client.eval(snapshot);return state.ready&&state.windows.some(w=>w.visible&&!w.loading);},120000,'DESKTOP_NOT_READY');
  let state=await client.eval(snapshot);assert.equal(state.name,'DSH SEP');assert.equal(state.version,'0.2.1-alpha.2');assert.equal(state.userData,join(data,'electron'));assert.equal(state.home,join(data,'home'));round.identity='pass';
  // Use the native welcome API without storing a fake credential.
  await client.eval(`(async()=>{for(const w of __sepCarrierProbe.electron.BrowserWindow.getAllWindows()){if(w.isVisible()){const yes=await w.webContents.executeJavaScript('typeof window.dshWelcome?.skip === "function"');if(yes){await w.webContents.executeJavaScript('window.dshWelcome.skip()');return true;}}}return false;})()`);
  await wait(async()=>{const s=await client.eval(snapshot);return s.hosts.some(h=>h.ready)&&s.windows.some(w=>w.url.startsWith('dsh-app://app/')&&w.visible&&!w.loading);},120000,'HOST_WORKSPACE_NOT_READY');
  state=await client.eval(snapshot);const win=state.windows.find(w=>w.url.startsWith('dsh-app://app/')&&w.visible),host=state.hosts.find(h=>h.ready);round.hostReady=true;round.windowId=win.id;round.hostPid=host.pid;
  await client.eval(`__sepCarrierProbe.electron.BrowserWindow.fromId(${win.id}).close();true`);
  await wait(async()=>{const s=await client.eval(snapshot);return s.windows.some(w=>w.id===win.id&&!w.visible)&&s.hosts.some(h=>h.pid===host.pid&&h.exit===null);},10000,'CLOSE_DID_NOT_RETAIN');round.closeRetainsHost=true;
  // Electron's native Dock activation callback is exercised; no physical click claimed.
  await client.eval(`__sepCarrierProbe.electron.app.emit('activate',{},false);true`);
  await wait(async()=>{const s=await client.eval(snapshot);return s.windows.some(w=>w.id===win.id&&w.visible)&&s.hosts.some(h=>h.pid===host.pid&&h.exit===null);},10000,'REOPEN_CHANGED_OWNER');round.reopenSameWindowAndHost=true;
  await client.eval(`setImmediate(()=>__sepCarrierProbe.electron.app.quit());true`);client.close();client=undefined;
  await wait(()=>exit,45000,'DESKTOP_QUIT_DEADLINE');assert.deepEqual(exit,{code:0,signal:null});
  const final=JSON.parse(await readFile(receipt,'utf8'));assert.equal(final.code,0);assert.equal(final.uncaught,0);assert(final.hosts.length>0);assert(final.hosts.every(h=>h.shutdownComplete&&h.exit?.code===0&&h.exit?.signal===null));round.gracefulHostAcknowledged=true;round.status='pass';
 }catch(e){round.code=/^[A-Z_]+$/.test(e.message)?e.message:'DESKTOP_SMOKE_ASSERTION';round.errorType=e.name;if(e.diagnostic)await writeFile(join(data,'probe-failure.json'),JSON.stringify(e.diagnostic,null,2)+'\n');process.exitCode=1;}
 finally{client?.close();if(child&&!exit){cleanup.push({round:index,path:'test-owned-process-group-SIGKILL',pid:child.pid});try{process.kill(-child.pid,'SIGKILL');}catch{}await wait(()=>exit,10000,'TEST_CLEANUP_UNCONFIRMED').catch(()=>cleanup.push({round:index,status:'blocked'}));}
  const logDone=await Promise.race([Promise.all(logs.map(x=>x.done)),delay(5000).then(()=>undefined)]);if(!logDone?.every(Boolean)){cleanup.push({round:index,path:'test-log-drain',status:'blocked'});for(const x of logs)x.log.destroy();}
  round.exit=exit;rounds.push(round);await writeFile(join(out,'RESULT.json'),JSON.stringify({schema:1,status:rounds.every(r=>r.status==='pass')&&cleanup.length===0?'pass':'fail',scope:'actual native carrier and official Host in synthetic roots',rounds,cleanup,instrumentation:'Inspector records actual child process IPC without replacing results; direct BrowserWindow close and app activate/quit callbacks',notVerified:['full SEP protected Profile','real Dock mouse click','TCC permissions','Developer ID signing/notarization','public installer','paid models']},null,2)+'\n');
  if(child&&!exit){for(let remaining=index+1;remaining<=3;remaining++)rounds.push({index:remaining,status:'not_run',code:'PREVIOUS_CLEANUP_UNCONFIRMED'});await writeFile(join(out,'RESULT.json'),JSON.stringify({schema:1,status:'blocked',rounds,cleanup,fullSepCertification:'not_run'},null,2)+'\n');break;}
 }
}
console.log(JSON.stringify({rounds:rounds.map(r=>({index:r.index,status:r.status,code:r.code})),cleanup:cleanup.length}));
