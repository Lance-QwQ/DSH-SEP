import {readFile,writeFile,mkdir,realpath,copyFile} from 'node:fs/promises';
import {join,resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {analyzeCases} from './analysis.mjs';
const here=dirname(fileURLToPath(import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const originalSha='bb37b6fae94465da6646609f48d444fc16957f884dfb265c0044b7fce1d99995';
const variants=['cli','runloop','shared','shared-runloop'];
const failure=message=>Object.assign(Error(message),{code:message});
function once(source,before,after){assert.equal(source.split(before).length,2,'HIDE_ORIGIN_ANCHOR');return source.replace(before,after);}
const pump='NSDate *probeUntil=[NSDate dateWithTimeIntervalSinceNow:0.25]; while(probeUntil.timeIntervalSinceNow>0) { [[NSRunLoop mainRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.01]]; }';
function derive(source,variant){
 if(variant==='cli')return source;
 const init=(variant.includes('shared')?'[NSApplication sharedApplication]; ':'')+(variant.includes('runloop')?pump:'');
 let result=once(source,' NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:(pid_t)value];',init+'\n NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:(pid_t)value];');
 // Pump only after the single mutation, never re-issue hide; later evidence
 // comes from a fresh snapshot process and the target's own AppKit delegate.
 if(variant.includes('runloop'))result=once(result,' NSDictionary *receipt=',pump.replaceAll('probeUntil','probeAfter')+'\n NSDictionary *receipt=');
 return result;
}
const json=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
function releaseUnknown(child){child.stdin?.destroy();child.stdout?.unref?.();child.stderr?.unref?.();child.unref();}
async function command(output,label,exe,args,{allow=[0],deadline=30000}={}){
 let text='',errors='',exit,overflow=false;
 const child=spawn(exe,args,{env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME,LANG:'en_US.UTF-8',TMPDIR:process.env.RUNNER_TEMP},stdio:['ignore','pipe','pipe']});
 child.on('error',e=>{exit={code:null,signal:null,error:e.code};});
 child.stdout.on('data',b=>{if(text.length+b.length>1048576)overflow=true;else text+=b;});
 child.stderr.on('data',b=>{if(errors.length+b.length>1048576)overflow=true;else errors+=b;});
 child.on('close',(code,signal)=>{exit={...exit,code,signal};});
 const end=Date.now()+deadline;while(!exit&&Date.now()<end)await delay(25);
 const result={executable:exe,args,pid:child.pid??null,...exit,deadline:!exit,overflow,forced:false};
 await writeFile(join(output,label+'.stdout'),text,{flag:'wx'});await writeFile(join(output,label+'.stderr'),errors,{flag:'wx'});await json(join(output,label+'.json'),result);
 if(!exit){releaseUnknown(child);throw failure('HIDE_COMMAND_DEADLINE');}
 if(overflow||exit.signal||!allow.includes(exit.code))throw failure('HIDE_COMMAND_FAILED');return {...result,stdout:text};
}
async function until(predicate,ms,code){const end=Date.now()+ms;while(Date.now()<end){const v=predicate();if(v)return v;await delay(25);}throw failure(code);}
async function main(output){
 assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,3);
 const temp=await realpath(process.env.RUNNER_TEMP);assert.equal(resolve(process.env.RUNNER_TEMP),temp);assert.equal(resolve(output),output);assert(!['','..'].includes(relative(temp,output))&&!relative(temp,output).startsWith('../'));
 await mkdir(output,{mode:0o700});assert.equal(await realpath(output),output);
 const rows=[],inputs=[],origins=[],metadata={schema:1,scope:'test-only AppKit 2x2 hide comparison; no product mutation',node:process.version,platform:process.platform,arch:process.arch,productRetested:false};
 let failureCode;
 try{
  for(const name of ['run-native.mjs','fixture.m','policy-state.h','policy-state.test.c','json-bool.h','json-bool.test.m','analysis.mjs','analysis.test.mjs']){const b=await readFile(join(here,name));inputs.push({file:name,sha256:hash(b),bytes:b.length});}
  const source=await readFile(join(here,'../../package/application-observer.m'),'utf8');assert.equal(hash(source),originalSha);inputs.push({file:'../../package/application-observer.m',sha256:hash(source),bytes:Buffer.byteLength(source)});
  await json(join(output,'INPUTS.json'),inputs);
  metadata.swVers=(await command(output,'sw-vers','/usr/bin/sw_vers',[])).stdout;
  metadata.uname=(await command(output,'uname','/usr/bin/uname',['-a'])).stdout;
  const sdk=(await command(output,'sdk','/usr/bin/xcrun',['--show-sdk-path'])).stdout.trim();
  metadata.sdk=sdk;metadata.headers=[];
  for(const name of ['NSRunningApplication.h','NSApplication.h','NSWindow.h']){const bytes=await readFile(join(sdk,'System/Library/Frameworks/AppKit.framework/Headers',name));await writeFile(join(output,name),bytes,{flag:'wx'});metadata.headers.push({file:name,sha256:hash(bytes),bytes:bytes.length});}
  const policyBinary=join(output,'policy-test');await command(output,'compile-policy','/usr/bin/xcrun',['clang','-std=c11','-Wall','-Wextra','-Werror',join(here,'policy-state.test.c'),'-o',policyBinary]);
  const policy=await command(output,'policy-contracts',policyBinary,[]);for(const [key,n] of Object.entries({tests:5,pass:5,fail:0}))assert.match(policy.stdout,new RegExp('^# '+key+' '+n+'$','m'));
  const boolBinary=join(output,'json-bool-test');await command(output,'compile-json-bool','/usr/bin/xcrun',['clang','-fobjc-arc','-framework','Foundation','-framework','CoreFoundation',join(here,'json-bool.test.m'),'-o',boolBinary]);
  const boolean=await command(output,'json-bool-contracts',boolBinary,[]);for(const [key,n] of Object.entries({tests:2,pass:2,fail:0}))assert.match(boolean.stdout,new RegExp('^# '+key+' '+n+'$','m'));
  const fixtureBinary=join(output,'fixture-binary');await command(output,'compile-fixture','/usr/bin/xcrun',['clang','-fobjc-arc','-framework','AppKit','-framework','Foundation','-lproc',join(here,'fixture.m'),'-o',fixtureBinary]);
  for(const variant of variants){
   const generated=derive(source,variant),sourcePath=join(output,'observer-'+variant+'.m'),binary=join(output,'observer-'+variant);
   await writeFile(sourcePath,generated,{flag:'wx'});origins.push({variant,inputSha256:originalSha,outputSha256:hash(generated),sharedApplication:variant.includes('shared'),runloop:variant.includes('runloop'),hideCallsInSource:1});
   await command(output,'compile-'+variant,'/usr/bin/xcrun',['clang','-fobjc-arc','-framework','AppKit','-framework','Foundation','-lproc',sourcePath,'-o',binary]);
  }
  await json(join(output,'ORIGIN.json'),origins);
  for(const variant of variants){
   const app=join(output,variant+'.app'),contents=join(app,'Contents'),macos=join(contents,'MacOS'),identifier='ai.dshsep.test.hide.'+variant.replaceAll('-','.');
   await mkdir(macos,{recursive:true,mode:0o700});await copyFile(fixtureBinary,join(macos,'fixture'));
   await writeFile(join(contents,'Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${identifier}</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleName</key><string>SEP Hide Fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>NSPrincipalClass</key><string>NSApplication</string><key>LSUIElement</key><false/><key>LSBackgroundOnly</key><false/></dict></plist>`,{flag:'wx'});
   await command(output,'sign-'+variant,'/usr/bin/codesign',['--force','--sign','-',app]);await command(output,'verify-'+variant,'/usr/bin/codesign',['--verify','--deep','--strict',app]);
   const row={variant,bundlePath:app,hideCalls:0,cleanup:{exitCode:null,signal:null,forced:false,terminated:false}},events=[];rows.push(row);
   let stdout='',stderr='',pending='',exit,invalid=false;
   const child=spawn(join(macos,'fixture'),[],{cwd:output,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,LANG:'en_US.UTF-8',TMPDIR:temp},stdio:['pipe','pipe','pipe']});
   child.stdin.on('error',()=>{});child.on('error',e=>{exit={exitCode:null,signal:null,error:e.code};});
   child.stdout.on('data',b=>{stdout+=b;pending+=b;if(stdout.length>1048576){invalid=true;return;}let n;while((n=pending.indexOf('\n'))>=0){const line=pending.slice(0,n);pending=pending.slice(n+1);try{events.push(JSON.parse(line));}catch{invalid=true;}}});child.stderr.on('data',b=>{if(stderr.length<1048576)stderr+=b;});child.on('close',(code,signal)=>{exit={exitCode:code,signal};});
   const observer=async(action,birth)=>{const args=[action,String(child.pid),app,identifier,...birth===undefined?[]:[String(birth)]];const r=await command(output,variant+'-'+action,join(output,'observer-'+(action==='hide'?variant:'cli')),args,{allow:[0,1,78],deadline:5000});return {...r,parsed:JSON.parse(r.stdout)};};
   try{
    const ready=await until(()=>events.find(e=>e.event==='ready'),7000,'HIDE_FIXTURE_NOT_READY');row.ready=ready;row.pid=child.pid;row.birthSeconds=ready.birthSeconds;row.birthMicroseconds=ready.birthMicroseconds;
    assert.equal(ready.pid,child.pid);assert.equal(ready.bundlePath,app);assert.equal(ready.bundleIdentifier,identifier);assert.equal(ready.birthValid,true);assert.equal(ready.visible,true);assert.equal(ready.active,true);assert.equal(ready.hidden,false);assert.equal(ready.activationPolicy,0);assert.equal(ready.runningActivationPolicy,0);assert.equal(ready.windowCanHide,true);assert.equal(ready.finishedLaunching,true);
    const before=await observer('snapshot');row.before=before.parsed;assert.equal(before.code,0);assert.equal(before.parsed.status,'pass');assert.equal(before.parsed.pid,child.pid);assert.equal(before.parsed.birthSeconds,ready.birthSeconds);assert.equal(before.parsed.birthMicroseconds,ready.birthMicroseconds);assert.equal(before.parsed.hidden,false);
    row.hideCalls++;const action=await observer('hide',before.parsed.launchTime);row.action={exitCode:action.code,...action.parsed};assert([0,1].includes(action.code));assert.equal(action.parsed.status,'pass');assert.equal(typeof action.parsed.requestSent,'boolean');
    // Observe delivery once; no repeated hide/unhide or product retry.
    await delay(750);const after=await command(output,variant+'-after',''+join(output,'observer-cli'),['snapshot',String(child.pid),app,identifier],{allow:[0,78],deadline:5000});const value=JSON.parse(after.stdout);
    row.after={...value,sameIdentity:after.code===0&&value.status==='pass'&&value.pid===child.pid&&value.birthSeconds===ready.birthSeconds&&value.birthMicroseconds===ready.birthMicroseconds};
    const count=events.length;child.stdin.write('snapshot\n');row.fixture=await until(()=>events.slice(count).find(e=>e.event==='snapshot'),2000,'HIDE_FIXTURE_SNAPSHOT');assert.equal(invalid,false);
   }catch(e){row.failure=e.code??e.message;throw e;}
   finally{
    row.initialization=events.filter(e=>['policyInitial','policyAfter','policyRequest','policyDecision'].includes(e.event));row.pid??=child.pid??null;
    if(!exit)child.stdin.write('quit\n');
    try{await until(()=>exit,5000,'HIDE_FIXTURE_CLOSE_UNKNOWN');}catch{releaseUnknown(child);}
    row.cleanup={...row.cleanup,...exit,terminated:events.some(e=>e.event==='willTerminate')&&events.some(e=>e.event==='quitRequested')&&!events.some(e=>['fixtureDeadline','inputEOF','invalidInput'].includes(e.event))};
    await writeFile(join(output,variant+'-fixture.stdout'),stdout,{flag:'wx'});await writeFile(join(output,variant+'-fixture.stderr'),stderr,{flag:'wx'});await json(join(output,variant+'-CASE.json'),row);
    if(row.cleanup.exitCode!==0||row.cleanup.signal!==null||!row.cleanup.terminated)throw failure('HIDE_FIXTURE_CLOSE_UNCONFIRMED');
   }
  }
 }catch(e){failureCode=/^[A-Z0-9_]+$/.test(e.code??e.message)?e.code??e.message:'HIDE_EXPERIMENT_FAILED';metadata.failureMessage=String(e.message).slice(0,1000);}
 let analysis;try{analysis=analyzeCases(rows);}catch{analysis={schema:1,status:'blocked',scope:metadata.scope,pattern:'incomplete',productRootCause:'not_run',productRetested:false};}
 if(failureCode)analysis={...analysis,status:'blocked',code:failureCode};
 await json(join(output,'METADATA.json'),metadata);await json(join(output,'RESULT.json'),{...analysis,observations:rows,inputManifestSha256:hash(await readFile(join(output,'INPUTS.json')).catch(()=>Buffer.alloc(0)))});
 if(analysis.status!=='pass')process.exitCode=1;
}
main(process.argv[2]).catch(e=>{console.error(JSON.stringify({status:'blocked',code:e.code??'HIDE_PROBE_ARGUMENT'}));process.exitCode=1;});
