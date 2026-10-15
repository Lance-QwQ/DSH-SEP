// Separate two-cycle installed first-boot/restart test; hide/reopen is NOT covered.
// Tests the installed bytes via LaunchServices. No inspector, fake ready frame,
// test bootstrap switch, provider call or force-kill is used by this probe.
import assert from 'node:assert/strict';import{readFile,writeFile,appendFile,mkdir,realpath,lstat}from'node:fs/promises';
import{join,resolve,dirname}from'node:path';import{userInfo}from'node:os';import{spawn,execFile}from'node:child_process';import{promisify}from'node:util';import{setTimeout as delay}from'node:timers/promises';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import{verifyPackage}from'../package/package-inventory.mjs';
import{verifyInstalledProfileBinding}from'../package/installed-profile-binding.mjs';
import{payloadPins}from'./installer-binding.mjs';const fixedPayload=await payloadPins();
const exec=promisify(execFile),digest=b=>createHash('sha256').update(b).digest('hex');assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const[assembledArg,outArg]=process.argv.slice(2),assembled=await realpath(assembledArg),out=resolve(outArg),temp=await realpath(process.env.RUNNER_TEMP);assert(assembled.startsWith(temp+'/')&&out.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const result={schema:1,status:'fail',scope:'installed first boot and same-account restart through LaunchServices, readiness and normal quit only; hide/reopen not tested',plannedCycles:2,cycles:[],cleanup:[],modelGenerated:false,paidProviderCalls:0};
const env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:userInfo().homedir,TMPDIR:process.env.TMPDIR,LANG:'en_US.UTF-8'},dataRoot=join(env.HOME,'Library/Application Support/DSH SEP/alpha2-mac-finder-preview'),receiptPath=join(dataRoot,'launcher/bootstrap-ui.json'),generationPath=join(dataRoot,'launcher/generation.json');
const deadline=async(test,ms=90000)=>{const until=Date.now()+ms;while(Date.now()<until){const value=await test();if(value)return value;await delay(150);}throw Object.assign(Error('SEP_APPLICATION_PROBE_DEADLINE'),{code:'SEP_APPLICATION_PROBE_DEADLINE'});};
async function json(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return undefined;throw e;}}
let current,app,inner,helper,observationSequence=0;
async function observe(action,pid,path,birth){
 const args=[action,String(pid),path,path===app?'app.dshsep.macos.alpha2.preview':'-',...birth===undefined?[]:[String(birth)]];
 let command,failure;try{command=await exec(helper,args,{env,timeout:5000,maxBuffer:65536});}catch(error){failure=error;command=error;}
 const stdout=String(command.stdout??''),stderr=String(command.stderr??'');let parsed=null;try{parsed=JSON.parse(stdout);}catch{}
 // Preserve the native result before propagating any command/parse error. This
 // diagnostic does not relax identities or repeat a failed hide request.
 const observation={schema:1,sequence:++observationSequence,action,pid,bundlePath:path,args,expectedLaunchTimeArgument:birth===undefined?null:String(birth),exitCode:failure?(Number.isInteger(failure.code)?failure.code:null):0,signal:failure?.signal??null,errorCode:typeof failure?.code==='string'?failure.code:null,killed:failure?.killed===true,stdout,stderr,parsed};
 await appendFile(join(out,'observation.jsonl'),JSON.stringify(observation)+'\n',{mode:0o600});
 if(failure)throw failure;
 return JSON.parse(stdout);
}
async function frames(path){return(await readFile(path,'utf8')).split('\n').flatMap(line=>{try{return[JSON.parse(line)];}catch{return[];}});}
try{
 const assembly=await json(join(assembled,'RESULT.json'));assert.equal(assembly.status,'pass');assert.equal(assembly.phase,'committed');assert.equal(assembly.applicationStarted,false);assert.equal(assembly.source.archiveSha256,fixedPayload.archiveSha256);app=assembly.restoredApplication;assert.equal(app,join(userInfo().homedir,'Applications/DSH SEP.app'));assert.equal(await realpath(app),app);inner=join(app,'Contents/Helpers/DSH SEP Desktop.app');
 const inventory=await json(join(assembled,'PACKAGE-INVENTORY.json'));await verifyPackage(app,inventory);result.programSha256=assembly.programSha256;result.treeSha256=inventory.treeSha256;
 try{await lstat(dataRoot);throw Error('SEP_APPLICATION_DATA_NOT_FRESH');}catch(e){if(e.code!=='ENOENT')throw e;}
 helper=join(out,'application-observer');const helperSource=fileURLToPath(new URL('../package/application-observer.m',import.meta.url));result.observerSourceSha256=digest(await readFile(helperSource));await exec('/usr/bin/clang',['-fobjc-arc','-framework','AppKit','-lproc',helperSource,'-o',helper],{env,timeout:120000});
 const sessions=new Set(),generations=new Set();let firstProfileSha=null;
 for(let index=0;index<2;index++){
  const cycle={index:index+1,status:'fail',startedAt:new Date().toISOString()},stdout=join(out,`cycle-${index+1}.stdout.log`),stderr=join(out,`cycle-${index+1}.stderr.log`);result.cycles.push(cycle);await writeFile(stdout,'',{flag:'wx',mode:0o600});await writeFile(stderr,'',{flag:'wx',mode:0o600});
  const open=spawn('/usr/bin/open',['-n','-W','--stdout',stdout,'--stderr',stderr,app],{env,stdio:'ignore'});current={open,cycle,stdout,stderr};open.once('exit',(code,signal)=>{current&&current.open===open&&(current.openExit={code,signal});});open.once('error',e=>{current&&current.open===open&&(current.openError=e.code);});
  const ready=await deadline(async()=>{const r=await json(receiptPath);return r?.phase==='running'&&r.desktopReady===true&&r.programSha256===assembly.programSha256&&!sessions.has(r.sessionId)?r:undefined;});assert.equal(ready.resourcesConfirmedReleased,false);assert.match(ready.generation,/^[a-f0-9]{32}$/);assert(!generations.has(ready.generation));sessions.add(ready.sessionId);generations.add(ready.generation);current.ready=ready;
  const generation=await json(generationPath);assert.equal(generation.generation,ready.generation);assert.equal(generation.launcherPid,ready.controllerPid);assert.equal(generation.phase,'active');assert.equal(generation.resourcesConfirmedReleased,false);current.desktopPid=generation.desktopPid;
  const outer=await observe('snapshot',ready.bootstrapPid,app),desktop=await observe('snapshot',generation.desktopPid,inner);assert.equal(outer.status,'pass');assert.equal(desktop.status,'pass');assert.equal(desktop.hidden,false);cycle.ready={sessionId:ready.sessionId,generation:ready.generation,bootstrapPid:ready.bootstrapPid,controllerPid:ready.controllerPid,desktopPid:generation.desktopPid,outerLaunchTime:outer.launchTime,desktopLaunchTime:desktop.launchTime};
  assert(outer.launchTime>0&&desktop.launchTime>0);const initialActivation=await deadline(async()=>(await frames(stdout)).find(r=>r.event==='activated'&&r.sessionId===ready.sessionId&&r.generation===ready.generation),15000);assert(Number.isSafeInteger(initialActivation.sequence));
  const profileBytes=await readFile(join(dataRoot,'business/PROFILE.json')),profile=JSON.parse(profileBytes),profileSha=digest(profileBytes);verifyInstalledProfileBinding(profile,{programBytes:await readFile(join(app,'Contents/Resources/PROGRAM.json')),programSha256:assembly.programSha256,app,dataRoot});if(firstProfileSha===null)firstProfileSha=profileSha;else assert.equal(profileSha,firstProfileSha);cycle.profile={sha256:profileSha,installedPathBound:true,sameAcrossRestart:index>0};
  cycle.initialActivation={acknowledged:true,sequence:initialActivation.sequence};
  // Deliberately no hide or reopen request: those original failed samples remain separate.
  const request=await observe('quit',ready.bootstrapPid,app,outer.launchTime);assert.equal(request.requestSent,true);const closed=await deadline(async()=>{const r=await json(receiptPath);return r?.sessionId===ready.sessionId&&r.generation===ready.generation&&r.phase==='closed'&&r.resourcesConfirmedReleased===true?r:undefined;},75000);assert.equal(closed.desktopReady,false);assert.equal(closed.outcome,'pass');
  await deadline(async()=>current.openExit!==undefined,15000);assert.equal(current.openExit.code,0);assert.equal(current.openExit.signal,null);assert.equal((await observe('snapshot',ready.bootstrapPid,app)).status,'absent');assert.equal((await observe('snapshot',generation.desktopPid,inner)).status,'absent');const final=await json(generationPath);assert.equal(final.generation,ready.generation);assert.equal(final.phase,'closed');assert.equal(final.resourcesConfirmedReleased,true);cycle.closed={normalLaunchServicesWaitExit:current.openExit,resourcesConfirmedReleased:true,generation:final.generation};cycle.status='pass';current=undefined;
 }
 await verifyPackage(app,inventory);result.status='pass';result.notVerified=['hide/reopen certification','physical Finder or Dock mouse input','workspace transition through the Skip button','active-task user confirmation UI','all protected features in same desktop instance','private environment continuation','paid models','Developer ID and notarization'];
}catch(e){result.code=/^[A-Z][A-Z0-9_]{1,90}$/.test(e.code??e.message??'')?e.code??e.message:'SEP_APPLICATION_PROBE_FAILED';result.errorType=e.name;result.diagnostic=String(e.message).slice(0,250);process.exitCode=1;}
finally{
 if(current){let receipt;try{const ready=current.ready??await json(receiptPath);if(ready?.bootstrapPid&&ready.programSha256===result.programSha256){const snapshot=await observe('snapshot',ready.bootstrapPid,app);assert.equal(snapshot.status,'pass');const birth=current.cycle.ready?.outerLaunchTime??snapshot.launchTime;const request=await observe('quit',ready.bootstrapPid,app,birth);receipt={path:'subsequent exact-app normal termination request',request};const closed=await deadline(async()=>{const r=await json(receiptPath);return r?.sessionId===ready.sessionId&&r.phase==='closed'&&r.resourcesConfirmedReleased===true?r:undefined;},65000);receipt.confirmedReleased=closed.resourcesConfirmedReleased;}else receipt={path:'no bound owned receipt',confirmedReleased:false};}catch(e){receipt={path:'subsequent normal termination not confirmed',confirmedReleased:false,code:e.code??'SEP_APPLICATION_CLEANUP_UNKNOWN'};}result.cleanup.push(receipt);current.open.unref();}
 while(result.cycles.length<result.plannedCycles)result.cycles.push({index:result.cycles.length+1,status:'not_run',reason:'earlier setup or cycle did not pass'});
 await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,code:result.code,cycles:result.cycles.map(c=>c.status),cleanup:result.cleanup}));
}
