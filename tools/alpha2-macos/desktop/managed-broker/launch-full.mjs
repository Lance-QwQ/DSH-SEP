import {mkdir,lstat,realpath,readdir,open} from 'node:fs/promises';import {spawn} from 'node:child_process';import {join,dirname,resolve,isAbsolute} from 'node:path';import {pathToFileURL} from 'node:url';import {randomBytes} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
import {loadProgram} from './program-manifest.mjs';import {createHostOwner} from './host-owner.mjs';import {openDesktopRpc} from './desktop-rpc.mjs';import {validatePreviousGeneration,readGeneration,persistGeneration,closedReceipt,selectBusinessInitialization} from './launch-state.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};const code=e=>/^(SEP_|P2_|P1_|BUDGET_|OWNER_|FS_)[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_MAC_LAUNCH_FAILED';
async function privateDirectory(path){if(!isAbsolute(path)||resolve(path)!==path)fail('SEP_MAC_DATA_PATH');await mkdir(path,{recursive:true,mode:0o700});const st=await lstat(path);if(!st.isDirectory()||st.isSymbolicLink()||await realpath(path)!==path||st.uid!==process.getuid()||(st.mode&0o077)!==0)fail('SEP_MAC_DATA_PERMISSIONS');}
/** Isolated-preview launcher. Exact direct child acknowledgments are checked;
 * this is not a system-wide process-tree or same-user hostile-code sandbox. */
export async function launchFull({programPath,programSha256,dataRoot,desktopArgs=[],diagnosticInspector=false,control}){
 if(process.platform!=='darwin'||process.arch!=='arm64')fail('SEP_MAC_PLATFORM');if(!Array.isArray(desktopArgs)||desktopArgs.length||typeof diagnosticInspector!=='boolean')fail('SEP_MAC_LAUNCH_ARGUMENT');
 if(control!==undefined)(await import('../product-control/launch-control.mjs')).assertLaunchControl(control);
 const p=await loadProgram(programPath,programSha256);if(control&&p.schema.schema!==4)fail('SEP_PRODUCT_LAYOUT');dataRoot=resolve(dataRoot);if(dataRoot===p.root||dataRoot.startsWith(p.root+'/'))fail('SEP_MAC_DATA_INSIDE_PROGRAM');
 await privateDirectory(dataRoot);const stateRoot=join(dataRoot,'launcher');await privateDirectory(stateRoot);const statePath=join(stateRoot,'generation.json'),generation=randomBytes(16).toString('hex');
 const {acquireOwnerFile}=await import(pathToFileURL(p.entries.ownerLease.path));
 let lease,owner,rpc,desktop,desktopExit,closing,finishedResolve,inspectorEndpoint,diagnosticTail='';const finished=new Promise(r=>{finishedResolve=r;}),keepAlive=setInterval(()=>{},1000);let stateWritten=false;
 const state=phase=>({schema:1,generation,phase,programSha256,launcherPid:process.pid,businessPid:owner?.status().pid??null,desktopPid:desktop?.pid??null,resourcesConfirmedReleased:phase==='closed'});
 async function close({requestDesktop=false}={}){
  if(closing)return closing;
  closing=(async()=>{
   // A signal may request shutdown only of this exact ChildProcess. It cannot
   // establish a clean desktop receipt and never kills by name or reused PID.
   if(control&&desktop){
    // The product path enters Electron's existing confirmation flow. Keep its
    // host/RPC/lease alive while a window may still cancel or complete work.
    if(requestDesktop&&!desktopExit&&!control.status().quitting){try{control.requestQuit();}catch{}}
    const until=Date.now()+10000;while(control.desktopReceipt().status!=='pass'&&!control.status().childClosed&&Date.now()<until)await delay(50);
    const receipt=control.desktopReceipt();if(receipt.status!=='pass'){if(stateWritten)await persistGeneration(statePath,state('blocked'));return receipt;}
   }else if(requestDesktop&&desktop&&!desktopExit)desktop.kill('SIGTERM');
   const host=owner?await owner.stop():{phase:'stopped',lastExit:{code:0,forced:false}};
   const until=Date.now()+10000;while(desktop&&!desktopExit&&Date.now()<until)await delay(50);
   const proof=closedReceipt(desktop?desktopExit:{code:0,signal:null},host);if(proof.status!=='pass'){if(stateWritten)await persistGeneration(statePath,state('blocked'));return proof;}
   const r=rpc?await rpc.close():{status:'pass'};if(r.status!=='pass'){if(stateWritten)await persistGeneration(statePath,state('blocked'));return r;}
   await lease?.assertOwned();if(stateWritten)await persistGeneration(statePath,state('closed'));await lease?.release();clearInterval(keepAlive);process.removeListener('SIGTERM',onSignal);process.removeListener('SIGINT',onSignal);finishedResolve(proof);return proof;
  })().catch(e=>({status:'blocked',code:code(e),resourcesConfirmedReleased:false})).finally(()=>{closing=undefined;});return closing;
 }
 function onSignal(){void close({requestDesktop:true}).then(r=>{if(r.status!=='pass')process.stderr.write(JSON.stringify({status:'blocked',code:'SEP_MAC_SHUTDOWN_UNCONFIRMED'})+'\n');});}
 try{
  // An active marker is stronger than stale launcher PID evidence: a crashed
  // launcher can leave live children after its OS SQLite lease was released.
  lease=await acquireOwnerFile({path:join(stateRoot,'owner.json'),payload:{pid:process.pid,purpose:'sep-macos-desktop',generation},validatePrior:async prior=>{validatePreviousGeneration(await readGeneration(statePath));return prior.purpose==='sep-macos-desktop';}});
  const prior=await readGeneration(statePath);validatePreviousGeneration(prior);await persistGeneration(statePath,state('starting'));stateWritten=true;
  if(control)await(await import('../product-control/owned-observer.mjs')).observeOwned({lease,statePath,generation,programSha256,control});
  const businessRoot=join(dataRoot,'business'),projectRoot=join(dataRoot,'project');await privateDirectory(businessRoot);await privateDirectory(projectRoot);const initialize=selectBusinessInitialization(prior,await readdir(businessRoot));
  const env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:join(dataRoot,'home'),TMPDIR:join(dataRoot,'tmp'),LANG:'en_US.UTF-8'};await privateDirectory(env.HOME);await privateDirectory(env.TMPDIR);
  const attachment=p.schema.schema>=2?{attachmentHelperPath:p.entries.attachmentHelper.path,attachmentHelperSha256:p.entries.attachmentHelper.sha256}:{};
  const parser=[3,4].includes(p.schema.schema)?{parser:{runtimeRoot:p.parserRoot,manifestSha256:p.entries.parserManifest.sha256,stateRoot:join(businessRoot,'parser')}}:{};
  owner=createHostOwner({nodeExecutable:p.entries.node.path,modulePath:p.entries.business.path,moduleSha256:p.entries.business.sha256,input:{programRoot:p.root,hostRoot:p.hostRoot,bundleRoot:p.bundleRoot,dataRoot:businessRoot,projectRoot,helperPath:p.entries.helper.path,helperSha256:p.entries.helper.sha256,...attachment,...parser,initialize,shutdownMs:5000},env});
  await owner.start();await lease.assertOwned();await persistGeneration(statePath,state('active'));rpc=await openDesktopRpc({projectDir:projectRoot,owner});
  const connectionFile=join(stateRoot,'connection-'+generation+'.json'),fh=await open(connectionFile,'wx',0o600);try{await fh.writeFile(JSON.stringify({desktop:rpc.connection})+'\n');await fh.sync();}finally{await fh.close();}
  desktop=spawn(p.entries.electron.path,[...(diagnosticInspector?['--inspect=127.0.0.1:0']:[]),'--sep-recovery-connection='+connectionFile],{cwd:projectRoot,env:{...env,DSH_SEP_DATA_ROOT:dataRoot,DSH_DESKTOP_DSH_DIR:p.hostRoot,DSH_DESKTOP_NODE_BINARY:p.entries.node.path,DSH_TELEMETRY_DISABLED:'1'},stdio:control?['ignore','pipe','pipe','pipe']:['ignore','pipe','pipe']});desktop.stdout.resume();desktop.stderr.resume();if(diagnosticInspector)desktop.stderr.on('data',b=>{diagnosticTail=(diagnosticTail+b).slice(-8192);inspectorEndpoint??=diagnosticTail.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-z0-9-]+)/i)?.[1];});
  desktop.once('error',()=>{desktopExit={code:null,signal:null,spawnError:true};void close();});desktop.once('exit',(code,signal)=>{desktopExit={code,signal};});desktop.once('close',()=>{void close();});
  if(control)control.attach(desktop);
  await persistGeneration(statePath,state('active'));process.on('SIGTERM',onSignal);process.on('SIGINT',onSignal);
  return Object.freeze({status:'running',generation,desktopPid:desktop.pid,hostPid:owner.status().pid,close,whenClosed:()=>finished,...(diagnosticInspector?{diagnostics:()=>({inspectorEndpoint,desktopExit,host:owner.status(),stderrTail:diagnosticTail})}:{})});
 }catch(e){const result=await close({requestDesktop:true});if(result.status!=='pass'){process.stderr.write(JSON.stringify({status:'blocked',code:code(e),cleanup:'SEP_MAC_SHUTDOWN_UNCONFIRMED'})+'\n');return Object.freeze({status:'blocked',code:code(e),close,whenClosed:()=>finished});}if(control&&control.status().owned)return Object.freeze({status:'failed',code:code(e),generation,close,whenClosed:()=>finished});throw e;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{if(process.argv.length!==5)fail('SEP_MAC_LAUNCH_ARGUMENT');const result=await launchFull({programPath:process.argv[2],programSha256:process.argv[3],dataRoot:process.argv[4]});console.log(JSON.stringify({status:result.status,code:result.code,scope:'isolated-macos-preview',desktopPid:result.desktopPid,hostPid:result.hostPid}));await result.whenClosed();}
 catch(e){console.error(JSON.stringify({status:'blocked',code:code(e)}));process.exitCode=1;}
}
