import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,chmod,copyFile,realpath,open,rename,appendFile} from 'node:fs/promises';
import {constants} from 'node:fs';import {join,dirname} from 'node:path';import {userInfo} from 'node:os';
import {fileURLToPath} from 'node:url';import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';import {createHash} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex'),here=fileURLToPath(new URL('.',import.meta.url));
const roles={program:'Resources/PROGRAM.json',node:'Helpers/DSH SEP Desktop.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node',controller:'Resources/product/runtime/bootstrap/controller.mjs'};
const until=async(fn,ms=10000)=>{const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await delay(30);}throw Error('CONNECTED_TEST_DEADLINE');};
for(const mode of ['long-running','reopen-quit','cancel-retry','startup-late','shutdown-late','failed-startup','receipt-cas'])test('non-test connected AppKit adapter: '+mode,{skip:process.platform!=='darwin'?'native macOS required':false,timeout:30000},async()=>{
 const base=process.env.SEP_BOOTSTRAP_CONNECTED_ROOT;assert(base);assert.equal(await realpath(base),base);const root=join(base,mode);await mkdir(root,{mode:0o700});
 const app=join(root,'SEP Connected Test.app'),contents=join(app,'Contents'),binary=join(contents,'MacOS/DSH SEP'),bundleId='app.dshsep.macos.connected.'+mode;
 await mkdir(dirname(binary),{recursive:true,mode:0o700});await writeFile(join(contents,'Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>DSH SEP</string><key>CFBundleIdentifier</key><string>${bundleId}</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>`,{flag:'wx',mode:0o444});
 for(const path of Object.values(roles))await mkdir(dirname(join(contents,path)),{recursive:true,mode:0o700});
 await copyFile(await realpath(process.execPath),join(contents,roles.node),constants.COPYFILE_EXCL|constants.COPYFILE_FICLONE);await chmod(join(contents,roles.node),0o555);
 await writeFile(join(contents,roles.program),'synthetic controller adapter only\n',{flag:'wx',mode:0o444});
 await writeFile(join(contents,roles.controller),(await readFile(join(here,'connected-fixture.mjs'),'utf8')).replace('@@MODE@@',mode),{flag:'wx',mode:0o444});
 const entry=async role=>({path:roles[role],sha256:hash(await readFile(join(contents,roles[role])))});
 const manifest={schema:1,layout:'macos-app-v1',program:await entry('program'),node:await entry('node'),controller:await entry('controller'),closure:[await entry('controller')]},bytes=Buffer.from(JSON.stringify(manifest)+'\n');
 await writeFile(join(contents,'Resources/BOOTSTRAP.json'),bytes,{flag:'wx',mode:0o444});
 let compiled;try{compiled=await exec('/usr/bin/clang',['-fobjc-arc','-Wall','-Wextra','-Werror',`-DSEP_BOOTSTRAP_MANIFEST_SHA256="${hash(bytes)}"`,'-DSEP_BOOTSTRAP_PRODUCT_CONNECTED=1','-DSEP_BOOTSTRAP_STARTUP_MS=1800','-DSEP_BOOTSTRAP_SHUTDOWN_MS=1800','-framework','AppKit',join(here,'appkit-bootstrap.m'),'-o',binary],{timeout:20000,maxBuffer:1048576});}catch(e){compiled=e;}
 await writeFile(join(root,'compile.log'),String(compiled.stdout??'')+'\n'+String(compiled.stderr??''),{flag:'wx'});assert.equal(compiled.code,undefined,'connected non-test build must compile');
 const stateRoot=join(userInfo().homedir,'Library/Application Support/DSH SEP/alpha2-mac-finder-preview/launcher'),latestPath=join(stateRoot,'bootstrap-ui.json');let holder,holderExit,lockText='';
 const releaseLock=async()=>{if(!holder)return;holder.stdin.end();await until(()=>holderExit);assert.deepEqual(holderExit,{code:0,signal:null});};
 if(mode==='receipt-cas'){
  await mkdir(stateRoot,{recursive:true,mode:0o700});assert(process.env.SEP_BOOTSTRAP_RECEIPT_LOCK);
  holder=spawn(process.env.SEP_BOOTSTRAP_RECEIPT_LOCK,[join(stateRoot,'.bootstrap-ui.lock')],{stdio:['pipe','pipe','pipe']});holder.stdout.on('data',b=>{lockText+=b;});holder.once('exit',(code,signal)=>{holderExit={code,signal};});await until(()=>{if(holderExit)assert.fail('lock fixture exited '+JSON.stringify(holderExit));return lockText==='LOCKED\n';});
 }
 const stdout=await open(join(root,'stdout.log'),'wx',0o600),stderr=await open(join(root,'stderr.log'),'wx',0o600);
 const child=spawn(binary,[],{env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:userInfo().homedir,LANG:'en_US.UTF-8'},stdio:['ignore',stdout.fd,stderr.fd]});await stdout.close();await stderr.close();let exit;child.once('exit',(code,signal)=>{exit={code,signal};});
 const frames=async()=>(await readFile(join(root,'stdout.log'),'utf8')).split('\n').flatMap(line=>{try{return[JSON.parse(line)];}catch{return[];}});
 const event=async(kind,after=0)=>until(async()=>{const rows=await frames();const value=rows.find(x=>x.scope==='macos-app-v1-bootstrap'&&x.bootstrapPid===child.pid&&x.event===kind&&x.sequence>after);if(value)return value;if(exit)assert.fail('bootstrap exited before '+kind+': '+JSON.stringify({exit,rows}));});
 const helper=process.env.SEP_BOOTSTRAP_CONNECTED_OBSERVER;assert(helper);let birth;
 const observe=async(action,expected=birth)=>{
  let result,failure;try{result=await exec(helper,[action,String(child.pid),app,bundleId,...action==='snapshot'?[]:[String(expected)]],{timeout:5000,maxBuffer:65536});}catch(error){result=error;failure=error;}
  await appendFile(join(root,'observer.jsonl'),JSON.stringify({action,expectedBirth:expected??null,exitCode:result.code??0,stdout:String(result.stdout??''),stderr:String(result.stderr??'')})+'\n',{mode:0o600});
  if(failure)throw failure;return JSON.parse(result.stdout);
 };
 let cleanup={status:'not_needed'};
 try{
  const owned=await event('owned');assert.match(owned.sessionId,/^[a-f0-9]{32}$/);assert.match(owned.generation,/^[a-f0-9]{32}$/);assert.equal(owned.resourcesConfirmedReleased,false);const snapshot=await observe('snapshot');assert.equal(snapshot.status,'pass');assert.equal(snapshot.birthSource,'proc_bsdinfo');birth=snapshot.launchTime;assert(birth>0);
  const latest=()=>readFile(latestPath,'utf8').then(JSON.parse);
  if(mode==='startup-late'||mode==='failed-startup'){
   const blocked=await event('blocked');assert.equal(blocked.desktopReady,false);assert.equal(blocked.resourcesConfirmedReleased,false);
   if(mode==='startup-late'){assert.equal(blocked.lastCode,'SEP_BOOTSTRAP_STARTUP_DEADLINE');assert.equal((await observe('snapshot')).status,'pass');process.kill(blocked.controllerPid,0);}
   const closed=await event('closed');assert.equal(closed.resourcesConfirmedReleased,true);assert.equal(closed.desktopReady,false);assert.equal(closed.outcome,'failed');assert.equal((await latest()).sessionId,owned.sessionId);
   await observe('quit');await until(()=>exit);assert.equal(exit.signal,null);assert.notEqual(exit.code,0);return;
  }
  const ready=await event('ready'),initial=await event('activated');assert.equal(ready.desktopReady,true);assert.equal(ready.phase,'running');
  let newer;
  if(mode==='receipt-cas'){
   // The held native flock proves this owner's first publication could not
   // commit. A separately-owned observation is installed while holding it;
   // later old-session events must not claim the latest slot retroactively.
   await delay(80);assert.match(await readFile(join(root,'stderr.log'),'utf8'),/SEP_BOOTSTRAP_DIAGNOSTIC_UNAVAILABLE/);
   newer={...ready,sessionId:'a'.repeat(32),generation:'b'.repeat(32),sequence:700,event:'ready',outcome:'running'};
   assert.notEqual(newer.sessionId,owned.sessionId);assert.notEqual(newer.generation,owned.generation);
   const temp=join(stateRoot,'synthetic-newer-receipt.tmp');await writeFile(temp,JSON.stringify(newer)+'\n',{flag:'wx',mode:0o600});await rename(temp,latestPath);await releaseLock();
  }
  if(mode==='long-running'){await assert.rejects(observe('quit',birth+1),error=>error.code===78&&JSON.parse(error.stdout).code==='SEP_APPLICATION_BIRTH');await delay(2400);assert.equal(exit,undefined);assert.equal((await latest()).phase,'running');}
  if(mode==='reopen-quit'){
   await exec('/usr/bin/open',[app],{timeout:5000});const activated=await event('activated',initial.sequence);assert.equal(activated.sessionId,owned.sessionId);assert.equal(activated.generation,owned.generation);assert.equal((await observe('snapshot')).launchTime,birth);
  }
  await observe('quit');
  if(mode==='cancel-retry'){const cancelled=await event('quit-cancelled');assert.equal(cancelled.phase,'running');assert.equal(cancelled.desktopReady,true);assert.equal(exit,undefined);await observe('quit');}
  if(mode==='shutdown-late'){const blocked=await event('blocked');assert.equal(blocked.lastCode,'SEP_BOOTSTRAP_SHUTDOWN_DEADLINE');assert.equal(blocked.resourcesConfirmedReleased,false);process.kill(blocked.controllerPid,0);}
  const closed=await event('closed');assert.equal(closed.resourcesConfirmedReleased,true);assert.equal(closed.desktopReady,false);assert.equal(closed.sessionId,owned.sessionId);
  if(mode==='shutdown-late'){assert.equal(closed.outcome,'failed');await observe('quit');}
  await until(()=>exit);assert.equal(exit.signal,null);assert.equal(exit.code,mode==='shutdown-late'?1:0);
  const receipt=await latest();
  if(mode==='receipt-cas')assert.deepEqual(receipt,newer,'old session whose owned publication failed must not replace a newer observation');
  else{assert.equal(receipt.sessionId,owned.sessionId);assert.equal(receipt.generation,owned.generation);assert.equal(receipt.phase,'closed');assert.equal(receipt.resourcesConfirmedReleased,true);assert.equal(receipt.desktopReady,false);}
 }finally{
  await releaseLock();
  if(!exit){try{if(birth)await observe('quit');await until(()=>exit,7000);cleanup={status:'normal_exit',exit};}catch{cleanup={status:'unconfirmed',path:'normal exact-app quit only; CI teardown not attributed as product cleanup'};child.unref();}}
  await writeFile(join(root,'cleanup.json'),JSON.stringify(cleanup)+'\n',{flag:'wx',mode:0o600});
 }
});
