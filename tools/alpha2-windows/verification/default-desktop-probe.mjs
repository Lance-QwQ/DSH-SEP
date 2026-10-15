// Runs the exact installed launch.mjs through its existing --inspect-desktop
// option. Credentials are read normally; the fresh .env remains blank. No
// production entry replacement, profile patch, fake key or model request.
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {stableFile} from './bundle-audit.mjs';
import {connectInspector} from './inspector-client.mjs';
import {isPowerShellPolicyBlock,assertWrapperEnded,assertLauncherClosed,disconnectAndWait} from './desktop-outcomes.mjs';
import {isWorkspaceReady,workspaceExpression} from './workspace-readiness.mjs';
for(const key of Object.keys(process.env))if(/KEY|TOKEN|SECRET|PASSWORD/i.test(key))delete process.env[key];
const P='D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1',under=(root,p)=>{const r=relative(root,p);return !!r&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..\\');};
const [sourceArg,sourceSha,kind,outputArg]=process.argv.slice(2),source=resolve(sourceArg??''),output=resolve(outputArg??'');
assert(under(P,source)&&under(P,output)&&['full','sep'].includes(kind));assert.match(sourceSha,/^[a-f0-9]{64}$/);
const bound=await stableFile(source,{capture:true,maxBytes:16777216});assert.equal(bound.sha256,sourceSha);const input=JSON.parse(bound.bytes);assert.equal(input.status,'pass');assert.equal(input.configurationsFrozen,true);
const installed=input.installations.find(x=>x.kind===kind);assert(installed);const c=JSON.parse(await readFile(installed.configPath,'utf8'));assert.deepEqual(c,installed.config);assert(under(P,c.dailyRoot));
assert.equal((await realpath(dirname(output))).toLowerCase(),dirname(output).toLowerCase());await mkdir(output);
const envBytes=await readFile(c.credentialsPath);assert.deepEqual(envBytes.toString('utf8').split(/\r?\n/).filter(x=>x.trim()&&!x.trim().startsWith('#')),['DEEPSEEK_API_KEY=']);
const report={schema:1,status:'not_run',coreStatus:'not_run',kind,inputSha256:sourceSha,scope:'Actual installed launch.mjs -> launcher.run with normal blank credential read and existing --inspect-desktop observer option. Unchanged Electron entry. Programmatic preload/BrowserWindow/app.quit actions, not physical tray or pointer certification. Overall blocked with coreStatus pass means the separately recorded original PowerShell wrapper was policy-blocked, not accepted as successful.',modelCalls:0,rounds:[],wrapperChecks:[],cleanup:[],notVerified:['initial launch without observer flag','physical tray menu interaction','first window-close background notice','paid model/API','independent process-tree tracking of asynchronous start.vbs descendants']};
let phase='initial',active;
function tick(value){phase=value;console.log(JSON.stringify({phase,kind,at:new Date().toISOString()}));}
async function until(work,ms=120000){const end=Date.now()+ms;while(Date.now()<end){const result=await work();if(result)return result;await delay(150);}throw Error('VERIFY_DESKTOP_DEADLINE');}
function launch(inspect){
 const child=spawn(c.nodeExecutable,[installed.launcherPath,...inspect?['--inspect-desktop']:[]],{cwd:c.dailyRoot,env:{...process.env},windowsHide:true,stdio:['ignore','pipe','pipe']});
 const row={child,stdout:[],stderr:[],size:0,end:null,inspectorURL:null};
 function capture(sink,chunk){row.size+=chunk.length;if(row.size<=8*1024*1024)sink.push(chunk);else row.overflow=true;const text=Buffer.concat(row.stderr).toString('utf8');row.inspectorURL??=text.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[\w-]+)/)?.[1];}
 child.stdout.on('data',chunk=>capture(row.stdout,chunk));child.stderr.on('data',chunk=>capture(row.stderr,chunk));
 row.exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{row.end={code,signal};resolve(row.end);});});row.exit.catch(()=>{});return row;
}
async function evaluate(owned,body){return owned.inspector.evaluate(`(async()=>{const E=process.getBuiltinModule('module').createRequire(${JSON.stringify(join(c.releaseRoot,'node_modules/@deepseek-ai/dsh-desktop/package.json'))})('electron');${body}})()`);}
async function waitExit(owned,ms){await until(()=>owned.end,ms);assert.deepEqual(owned.end,{code:0,signal:null});assert.equal(owned.overflow,undefined);}
async function packagedWrapper(owned,round,windowId,client){
 const script=join(c.dailyRoot,round===1?'start.ps1':'start.vbs');
 const executable=join(process.env.SystemRoot,'System32',round===1?'WindowsPowerShell/v1.0/powershell.exe':'wscript.exe');
 const args=round===1?['-NoProfile','-File',script]:[script];
 const record={round,entry:round===1?'start.ps1':'start.vbs',status:'not_run',existingProcessPolicyArgument:round===2?'Production start.vbs already uses child-process -ExecutionPolicy Bypass; no persistent policy modification or test-added bypass.':'None',descendantScope:round===2?'wscript exit is recorded separately from actual owned window reopen; asynchronous PowerShell descendants are not independently tracked.':'Synchronous packaged PowerShell script waits for its Node command.'};report.wrapperChecks.push(record);
 await evaluate(owned,`E.BrowserWindow.fromId(${windowId}).hide();return true;`);
 assert.equal(await evaluate(owned,`return E.BrowserWindow.fromId(${windowId}).isVisible();`),false);
 const child=spawn(executable,args,{cwd:c.dailyRoot,env:{...process.env},windowsHide:true,stdio:['ignore','pipe','pipe']});
 const run={child,end:null,error:null,out:[],err:[],bytes:0};owned.wrapper=run;
 const capture=(to,data)=>{run.bytes+=data.length;if(run.bytes>1048576){run.overflow=true;return;}to.push(data);};
 child.stdout.on('data',b=>capture(run.out,b));child.stderr.on('data',b=>capture(run.err,b));child.once('error',error=>{run.error=error;});child.once('close',(code,signal)=>{run.end={code,signal};});
 try{
  await until(()=>{if(run.error)throw run.error;return run.end;},30000);assert.equal(run.overflow,undefined);
  if(isPowerShellPolicyBlock(record.entry,run.end,Buffer.concat(run.err))){
   assertWrapperEnded(run.end);assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});
   assert.equal((await client.call('status')).guardian.pid,owned.hostPid);assert.equal(await evaluate(owned,'return process.pid;'),owned.electronPid);
   assert.equal(await evaluate(owned,`const w=E.BrowserWindow.fromId(${windowId});return !!w&&!w.isDestroyed();`),true);
   Object.assign(record,{status:'blocked',reason:'POWERSHELL_EXECUTION_POLICY',pid:child.pid,exit:run.end,windowId,electronPid:owned.electronPid,hostPid:owned.hostPid,originalHostUnchanged:true,windowReopen:'not_run'});
   return record;
  }
  assert.deepEqual(run.end,{code:0,signal:null});
  await until(()=>evaluate(owned,`const w=E.BrowserWindow.fromId(${windowId});return !!w&&!w.isDestroyed()&&w.isVisible();`),30000);
  assert.equal((await client.call('status')).guardian.pid,owned.hostPid);assert.equal(await evaluate(owned,'return process.pid;'),owned.electronPid);
  assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});
  Object.assign(record,{status:'pass',pid:child.pid,exit:run.end,windowId,electronPid:owned.electronPid,hostPid:owned.hostPid});
 }catch(error){record.status='blocked';record.error={code:error.code??error.name,message:String(error.message).slice(0,500)};record.exit=run.end;throw error;}
 finally{await writeFile(join(output,`round-${round}-wrapper.stdout.log`),Buffer.concat(run.out),{flag:'wx'});await writeFile(join(output,`round-${round}-wrapper.stderr.log`),Buffer.concat(run.err),{flag:'wx'});}
 return record;
}
async function factsReleased(owned){
 assert(owned.verifiedOwner&&Number.isInteger(owned.hostPid),'VERIFY_OWNERSHIP_UNCONFIRMED');
 assertLauncherClosed(owned.end);
 if(owned.second)assert.deepEqual(owned.second.end,{code:0,signal:null});
 if(owned.wrapper){assertWrapperEnded(owned.wrapper.end);assert.throws(()=>process.kill(owned.wrapper.child.pid,0),{code:'ESRCH'});}
 for(const pid of [owned.child.pid,owned.electronPid,owned.hostPid,owned.second?.child.pid].filter(Boolean))assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
 await assert.rejects(lstat(join(c.storageRoot,'.suite-memory/p2/owner.lock')),{code:'ENOENT'});
 return {status:'pass',path:'Normal Electron app.quit then exact launcher close0; tracked launcher/Electron/Host PIDs and P2 owner lock absent. No test kill.'};
}
async function cleanup(owned){
 if(!owned||owned.released)return;
 if(owned.inspector&&owned.verifiedOwner&&!owned.end){try{await evaluate(owned,'setImmediate(()=>E.app.quit());return true;');}catch(error){if(!/CLOSED/.test(error.message))owned.cleanupDispatchError=error.message;}}
 try{await disconnectAndWait(owned.inspector,async()=>{if(!owned.end)await waitExit(owned,60000);});}catch(error){report.cleanup.push({status:'blocked',code:error.message,launcherPid:owned.child.pid,electronPid:owned.electronPid,hostPid:owned.hostPid});return;}
 try{const result=await factsReleased(owned);owned.released=true;report.cleanup.push({...result,afterFailedAcceptance:true});}catch(error){report.cleanup.push({status:'blocked',code:error.code??error.message});}
}
try{
 const {verifyDesktopRuntime}=await import(pathToFileURL(join(c.releaseRoot,'build-runtime-helper.mjs')));
 await verifyDesktopRuntime(c.releaseRoot,'0.2.1-alpha.2',{platform:'win32',arch:'x64'});
 const sourceBinding=await stableFile(join(import.meta.dirname,'workspace-sources.json'),{capture:true,maxBytes:16384});
 const workspaceSources=JSON.parse(sourceBinding.bytes);assert.equal(workspaceSources.schema,1);assert.equal(workspaceSources.files.length,4);
 for(const row of workspaceSources.files){const actual=await stableFile(join(c.releaseRoot,row.path),{maxBytes:1048576});assert.equal(actual.sha256,row.sha256);assert.equal(actual.size,row.bytes);}
 report.workspaceSourceBinding={sha256:sourceBinding.sha256,files:workspaceSources.files};
 for(let round=1;round<=2;round++){
  tick(`round${round}-default-entry`);const owned=launch(true);active=owned;const stages=[];
  await until(()=>{if(owned.end)throw Error('VERIFY_DEFAULT_ENTRY_EARLY_EXIT');return owned.inspectorURL;});owned.inspector=await connectInspector(owned.inspectorURL);
  const processIdentity=await owned.inspector.evaluate('({pid:process.pid,execPath:process.execPath,electron:process.versions.electron,type:process.type,argv:process.argv})');
  assert(Number.isInteger(processIdentity.pid));assert.equal(resolve(processIdentity.execPath),join(c.desktopRuntimeRoot,'electron.exe'));assert.equal(processIdentity.type,'browser');assert.equal(typeof processIdentity.electron,'string');assert(processIdentity.argv.some(arg=>resolve(arg)===join(c.releaseRoot,'node_modules/@deepseek-ai/dsh-desktop')));
  const identity=await until(async()=>{
   // Inspector can be listening before Electron's main-module loader exists.
   // Only that exact startup condition is pending; other errors stay failures.
   const value=await owned.inspector.evaluate(`(()=>{let E;try{E=process.getBuiltinModule('module').createRequire(${JSON.stringify(join(c.releaseRoot,'node_modules/@deepseek-ai/dsh-desktop/package.json'))})('electron');}catch(error){if(error?.code==='MODULE_NOT_FOUND')return {pending:'electron-module'};throw error;}return {pid:process.pid,appPath:E.app.getAppPath(),userData:E.app.getPath('userData'),ready:E.app.isReady(),platform:process.platform};})()`);
   return value?.ready?value:null;
  });
  assert.equal(identity.platform,'win32');assert.equal(resolve(identity.appPath),join(c.releaseRoot,'node_modules/@deepseek-ai/dsh-desktop'));assert.equal(resolve(identity.userData),c.electronUserData);assert(Number.isInteger(identity.pid));owned.electronPid=identity.pid;owned.verifiedOwner=true;
  const connection=JSON.parse(await readFile(join(dirname(c.controlRoot),'recovery-connection.json'),'utf8'));const{recoveryClient}=await import(pathToFileURL(join(c.releaseRoot,'node_modules/@deepseek-ai/dsh-recovery/src/client.mjs')));const client=recoveryClient({...connection,timeoutMs:15000});
  const status=await client.call('status');assert.equal(status.guardian.phase,'running');assert.equal(status.writerState,'open');owned.hostPid=status.guardian.pid;
  tick(`round${round}-visible-ui`);
  const initial=await until(()=>evaluate(owned,'const w=E.BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.isVisible()&&(w.webContents.getURL().startsWith("dsh-app://app/")||w.webContents.getURL().endsWith("/welcome.html")));return w?{id:w.id,kind:w.webContents.getURL().endsWith("/welcome.html")?"welcome":"workspace"}:null;'));
  stages.push({step:'visible-initial-window',...initial});
  if(initial.kind==='welcome'){await until(()=>evaluate(owned,`const w=E.BrowserWindow.fromId(${initial.id});return w?await w.webContents.executeJavaScript('typeof window.dshWelcome?.skip === "function"'):false;`));await evaluate(owned,`return E.BrowserWindow.fromId(${initial.id}).webContents.executeJavaScript('window.dshWelcome.skip()');`);stages.push({step:'actual-welcome-skip-preload'});}
  const workspace=await until(async()=>{
   const value=await evaluate(owned,`const w=E.BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.isVisible()&&w.webContents.getURL().startsWith("dsh-app://app/"));if(!w)return null;return {id:w.id,readiness:await w.webContents.executeJavaScript(${JSON.stringify(workspaceExpression)})};`);
   if(value)report.lastWorkspaceObservation={round,...value};
   return value&&isWorkspaceReady(value.readiness)?value:null;
  });
  stages.push({step:'workspace-renderer-and-visible-new-session-ready',...workspace});
  const quit=await client.call('desktopQuitInspection');assert.equal(quit.activeTasks,false);assert.equal(quit.scheduledTasks,false);
  tick(`round${round}-real-second-entry`);
  await evaluate(owned,`E.BrowserWindow.fromId(${workspace.id}).hide();return true;`);assert.equal(await evaluate(owned,`return E.BrowserWindow.fromId(${workspace.id}).isVisible();`),false);
  const second=launch(false);owned.second=second;await waitExit(second,30000);
  await until(()=>evaluate(owned,`const w=E.BrowserWindow.fromId(${workspace.id});return !!w&&!w.isDestroyed()&&w.isVisible();`));
  const after=await client.call('status');assert.equal(after.guardian.pid,owned.hostPid);assert.equal(await evaluate(owned,'return process.pid;'),owned.electronPid);stages.push({step:'actual-second-launch-reopens-same-window-and-host',windowId:workspace.id,secondaryExit:second.end});
  tick(`round${round}-packaged-wrapper`);const wrapper=await packagedWrapper(owned,round,workspace.id,client);stages.push({step:wrapper.status==='pass'?'actual-packaged-wrapper-reopens-same-window-and-host':'packaged-ps1-policy-blocked',entry:wrapper.entry,status:wrapper.status,exit:wrapper.exit,...wrapper.status==='blocked'?{reason:wrapper.reason,windowReopen:'not_run'}:{}});
  tick(`round${round}-normal-quit`);await evaluate(owned,'setImmediate(()=>E.app.quit());return true;');owned.inspector.close();await waitExit(owned,90000);const released=await factsReleased(owned);owned.released=true;
  assert.deepEqual(await readFile(c.credentialsPath),envBytes);report.rounds.push({round,status:'pass',launcherPid:owned.child.pid,electronPid:owned.electronPid,hostPid:owned.hostPid,workspaceReadiness:workspace.readiness,stages,exit:owned.end,resources:released});
  await writeFile(join(output,`round-${round}.stdout.log`),Buffer.concat(owned.stdout),{flag:'wx'});await writeFile(join(output,`round-${round}.stderr.log`),Buffer.concat(owned.stderr),{flag:'wx'});await writeFile(join(output,`round-${round}-secondary.stderr.log`),Buffer.concat(second.stderr),{flag:'wx'});active=null;
 }
 await verifyDesktopRuntime(c.releaseRoot,'0.2.1-alpha.2',{platform:'win32',arch:'x64'});
 for(const row of input.guardsBefore??[]){const observed=await stableFile(row.path,{maxBytes:1048576});assert.equal(observed.sha256,row.sha256);assert.equal(observed.size,row.size);}
 report.programDescriptorReverified=true;report.dailyPublicEntryGuardsUnchanged=true;
 report.coreStatus='pass';report.status=report.wrapperChecks.some(row=>row.status==='blocked')?'blocked':'pass';
 if(report.status==='blocked')report.notVerified.push('direct start.ps1 under current execution policy (POWERSHELL_EXECUTION_POLICY); no policy change or alternate-command retry');
}catch(error){report.status='fail';report.coreStatus='fail';report.failedPhase=phase;report.error={code:error.code??error.message,message:String(error.message).slice(0,1200)};process.exitCode=1;}
finally{
 await cleanup(active);if(active){await writeFile(join(output,'failure.stdout.log'),Buffer.concat(active.stdout),{flag:'wx'});await writeFile(join(output,'failure.stderr.log'),Buffer.concat(active.stderr),{flag:'wx'});active.inspector?.close();}
 report.roundCoverage=[1,2].map(round=>({round,status:report.rounds.some(row=>row.round===round)?'pass':report.failedPhase?.startsWith('round'+round+'-')?'fail':'not_run'}));
 await writeFile(join(output,'RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,phase,result:join(output,'RESULT.json'),error:report.error,cleanup:report.cleanup}));
}
