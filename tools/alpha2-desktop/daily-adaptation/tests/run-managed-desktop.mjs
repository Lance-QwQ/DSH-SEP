import {readFile,writeFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.env.SEP_BUNDLE_TEST_ROOT,generation=process.argv[2]??'r1',fixture=JSON.parse(await readFile(join(root,'MANAGED-DESKTOP-FIXTURE-'+generation+'.json')));
const {openDaily,loadDeployment}=await import(pathToFileURL(fixture.launcher));
const {startCoordinated}=await import(new URL('./startup-coordinator.mjs',pathToFileURL(fixture.launcher)));
let runtime,child,result,stdout='',stderr='';const started=Date.now();
try{
 runtime=await startCoordinated(fixture.config,{openDaily:(path,options)=>openDaily(path,{...options,onHostSpawn:({child})=>{child.stdout.on('data',v=>stdout=(stdout+v).slice(-16384));child.stderr.on('data',v=>stderr=(stderr+v).slice(-16384));}}),loadDeployment,readCredential:false});
 const before=await runtime.client.call('status');assert.equal(before.guardian.phase,'running');
 if(fixture.externalDesktopEntry){
  const {verifyDesktopPayload}=await import(new URL('./desktop-payload.mjs',pathToFileURL(fixture.launcher))),{desktopEnvironment}=await import(new URL('./desktop-temp.mjs',pathToFileURL(fixture.launcher)));
  const config=runtime.config,executable=await verifyDesktopPayload(config.desktopRuntimeRoot,JSON.parse(await readFile(config.desktopPayloadPath)));
  child=spawn(executable,[fixture.externalDesktopEntry,'--user-data-dir='+config.electronUserData,'--sep-recovery-connection='+runtime.connectionFile],{cwd:config.dailyRoot,env:await desktopEnvironment(config,runtime.env),stdio:'ignore',windowsHide:false});
 }else child=await runtime.launchDesktop();
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
 let timer;const ended=await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('MANAGED_DESKTOP_DEADLINE')),910000);})]).finally(()=>clearTimeout(timer));
 assert.equal(ended.code,0,JSON.stringify(ended));
 const receipt=JSON.parse(await readFile(fixture.receipt));assert.equal(receipt.status,'pass',JSON.stringify(receipt));
 await runtime.close();const hostExit=runtime.service?.guardian.status().lastExit;assert.equal(hostExit?.code,0,JSON.stringify(hostExit));assert.equal(hostExit?.forced,false,JSON.stringify(hostExit));runtime=undefined;
 if(fixture.externalDesktopEntry){const config=JSON.parse(await readFile(fixture.config)),{verifyDesktopRuntime}=await import(pathToFileURL(join(config.releaseRoot,'build-runtime-helper.mjs')));await verifyDesktopRuntime(config.releaseRoot,'0.2.1-alpha.2',{platform:'win32',arch:'x64'});assert.equal(JSON.parse(await readFile(join(config.releaseRoot,'node_modules/@deepseek-ai/dsh-desktop/package.json'))).main,'lib/main.js');}
 const config=JSON.parse(await readFile(fixture.config));await assert.rejects(lstat(join(config.storageRoot,'.suite-memory/p2/owner.lock')),{code:'ENOENT'});
 result={status:'pass',scope:'actual coordinated launcher + managed alpha.2 host + Electron, synthetic data',elapsedMs:Date.now()-started,exit:ended,hostExit,...(fixture.externalDesktopEntry?{programBytesUnchanged:true,productionDesktopEntry:'lib/main.js',probeOutsideProgram:true}:{}),receipt,forcedCleanup:false};
}catch(error){result={status:'fail',code:error.code??error.message,elapsedMs:Date.now()-started,forcedCleanup:false};process.exitCode=1;}
finally{
 if(child&&child.exitCode===null&&child.signalCode===null){
  const cleanup=spawn('C:/Windows/System32/taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});await new Promise(resolve=>cleanup.once('exit',resolve));result.forcedCleanup=true;
 }
 try{await runtime?.close();}catch(error){result.cleanupCode=error.code??error.name;process.exitCode=1;}
 await writeFile(join(fixture.base,'managed-desktop-'+generation+'.stdout.log'),stdout);await writeFile(join(fixture.base,'managed-desktop-'+generation+'.stderr.log'),stderr);
 await writeFile(join(root,'MANAGED-DESKTOP-RESULT-'+generation+'.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}
