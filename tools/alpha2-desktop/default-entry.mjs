// Test operator: launch the unchanged production Electron entry, no bootstrap.
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const phase=process.env.SEP_BUNDLE_TEST_ROOT,fixtureGeneration=process.env.SEP_DESKTOP_FIXTURE??'r4';assert(/^r[1-9][0-9]*$/.test(fixtureGeneration));const fixture=JSON.parse(await readFile(join(phase,'MANAGED-DESKTOP-FIXTURE-'+fixtureGeneration+'.json')));
const generation=process.argv[2]??'r1';assert(/^r[1-9][0-9]*$/.test(generation));const suffix=generation==='r1'?'':'-'+generation;
const output=name=>join(phase,name+suffix+'.json');
const {openDaily,loadDeployment}=await import(pathToFileURL(fixture.launcher));
const {startCoordinated}=await import(new URL('./startup-coordinator.mjs',pathToFileURL(fixture.launcher)));
const {verifyDesktopRuntime}=await import(pathToFileURL(join(process.env.SEP_OFFICIAL_HARNESS,'build-runtime-helper.mjs')));
let runtime,child,stdout='',stderr='',stage='start',report={status:'blocked',kind:'unchanged production Electron entry + existing synthetic profile',forcedCleanup:false};const start=Date.now();
let diagnosticPatch;
try{
 if(process.env.SEP_DIAG_CLOSE==='1'){
  const config=JSON.parse(await readFile(fixture.config)),path=join(config.profileRoot,'cordis.patch.yml'),bytes=await readFile(path),probe=join(fixture.base,'close-receipt-probe.mjs');
  await writeFile(probe,`import{symbols}from${JSON.stringify(pathToFileURL(join(process.env.SEP_OFFICIAL_HARNESS,'node_modules/@deepseek-ai/cordis/lib/index.js')).href)};import{createHash}from'node:crypto';export const name='synthetic-close-observer';export const inject=['sepControlledInstallation'];export function apply(ctx){const snap=()=>{try{const e=[...ctx.loader.entries()].find(e=>e.options.id==='native'),v=ctx.get('compaction'),engine=v?.[symbols.original]??v;return{nativeOptionsSha256:e?createHash('sha256').update(JSON.stringify(e.options)).digest('hex'):null,nativeOptionKeys:e?Object.keys(e.options):[],nativeDisabled:e?.options.disabled,nativeFiber:e?.fiber?.uid,nativeFiberState:e?.fiber?.state,enginePresent:!!v,engineName:engine?.constructor?.name,engineFiber:engine?.ctx?.fiber?.uid};}catch(error){return{code:'DIAGNOSTIC_SNAPSHOT_UNAVAILABLE',errorType:error.name};}};const mounted=snap(),api=ctx.sepControlledInstallation,original=api.close;const wrapped=async(...args)=>{const before=snap(),r=await original(...args);process.send?.({type:'synthetic-close-receipt',receipt:{status:r.status,phase:r.phase,code:r.code,runtime:r.runtime?{phase:r.runtime.phase,code:r.runtime.code,pending:r.runtime.pending}:null,mounted,before,after:snap()}});return r;};api.close=wrapped;ctx.effect(()=>()=>{if(api.close===wrapped)api.close=original;});}`);
  let source=await readFile(probe,'utf8');
  source=source.replace("const snap=()=>", "const trace=[];const target=[...ctx.loader.entries()].find(e=>e.options.id==='native'),update=target.update;target.update=async function(value,...args){trace.push({at:Date.now(),event:'update',disabled:value.disabled,phase:ctx.get('sepNativeCompaction')?.status().phase});try{return await update.call(this,value,...args);}finally{trace.push({at:Date.now(),event:'updated',disabled:this.options.disabled,phase:ctx.get('sepNativeCompaction')?.status().phase,fiber:this.fiber?.uid,state:this.fiber?.state});}};const snap=()=>");
  source=source.replace("event:'update',disabled:value.disabled,", "event:'update',keys:Object.keys(value),create:args[0],stack:new Error().stack?.split('\\n').slice(1,8),disabled:value.disabled,");
  source=source.replace("return{nativeOptionsSha256:", "return{phase:ctx.get('sepNativeCompaction')?.status().phase,nativeOptionsSha256:");
  source=source.replace("mounted,before,after:snap()", "mounted,before,after:snap(),trace");
  await writeFile(probe,source);
  const patch=JSON.parse(bytes);patch.push({insert:[{id:'synthetic-close-observer',name:pathToFileURL(probe).href,config:{}}]});await writeFile(path,JSON.stringify(patch)+'\n');diagnosticPatch={path,bytes};
 }
 if(generation!=='r1'){const config=JSON.parse(await readFile(fixture.config));assert.equal(await readFile(config.credentialsPath,'utf8'),'DEEPSEEK_API_KEY=synthetic-not-a-real-key\n');}
 runtime=await startCoordinated(fixture.config,{openDaily:(path,options)=>openDaily(path,{...options,onHostSpawn:({child})=>{child.stdout.on('data',v=>stdout=(stdout+v).slice(-16384));child.stderr.on('data',v=>stderr=(stderr+v).slice(-16384));child.on('message',m=>{if(m?.type==='synthetic-close-receipt')report.closeReceipt=m.receipt;});}}),loadDeployment,readCredential:generation!=='r1'});
 assert.equal((await runtime.client.call('status')).guardian.phase,'running');
 child=await runtime.launchDesktop();
 await writeFile(output('DEFAULT-ENTRY-STARTED'),JSON.stringify({pid:child.pid,stage:'awaiting-observed-UI-and-normal-quit',main:'lib/main.js',fixture:fixture.base},null,2)+'\n',{flag:'wx'});
 let timer;const exit=await Promise.race([new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));}),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('DEFAULT_ENTRY_DEADLINE')),300000))]).finally(()=>clearTimeout(timer));
 report.exit=exit;stage='electron-exit';assert.equal(exit.code,0);const observed=JSON.parse(await readFile(output('DEFAULT-ENTRY-UI-OBSERVED')));report.observed=observed;assert.equal(observed.ready,true);
 stage='host-close';await runtime.close();const hostExit=runtime.service.guardian.status().lastExit;report.hostExit=hostExit;assert.equal(hostExit.code,0);assert.equal(hostExit.forced,false);runtime=undefined;
 stage='program-verification';
 await verifyDesktopRuntime(process.env.SEP_OFFICIAL_HARNESS,'0.2.1-alpha.2',{platform:'win32',arch:'x64'});
 assert.equal(JSON.parse(await readFile(join(process.env.SEP_OFFICIAL_HARNESS,'node_modules/@deepseek-ai/dsh-desktop/package.json'))).main,'lib/main.js');
 report={...report,status:'pass',observed,exit,hostExit,programBytesUnchanged:true};
 const config=JSON.parse(await readFile(fixture.config));await assert.rejects(lstat(join(config.storageRoot,'.suite-memory/p2/owner.lock')),{code:'ENOENT'});
}catch(error){report.status='fail';report.code=error.code??error.message;report.failedAt=stage;report.assertion={actual:typeof error.actual==='object'?'object':error.actual,expected:typeof error.expected==='object'?'object':error.expected};process.exitCode=1;}
finally{
 if(child&&child.exitCode===null&&child.signalCode===null){const cleanup=spawn('C:/Windows/System32/taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});await new Promise(resolve=>cleanup.once('exit',resolve));report.forcedCleanup=true;}
 try{await runtime?.close();}catch(error){report.cleanupCode=error.code??error.name;process.exitCode=1;}
 if(diagnosticPatch)await writeFile(diagnosticPatch.path,diagnosticPatch.bytes);
 await writeFile(join(phase,'default-entry'+suffix+'.stdout.log'),stdout);await writeFile(join(phase,'default-entry'+suffix+'.stderr.log'),stderr);
 report.elapsedMs=Date.now()-start;await writeFile(output('DEFAULT-ENTRY-RESULT'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}
