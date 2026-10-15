import './lifecycle-dependencies.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {executeQueued} from '../update-worker.mjs';
import * as update from '../update-process.mjs';
import {sign} from '../update-admission.mjs';
import * as launcher from '../runtime/launcher/launcher.mjs';
import {healthy} from '../update-transaction.mjs';
import {openGuardian} from '../../../../../packages/sep/recovery/src/guardian.mjs';
const parent=await realpath(process.env.SEP_TEST_TMP||tmpdir());
const fresh=()=>mkdtemp(join(parent,'sep-lifecycle-中文-'));
const exits=new Set();
async function ownedChild(code){
 const p=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 p.stdout.resume();p.stderr.resume();const done=once(p,'close');exits.add(p);
 const ready=once(p,'message');let timer;
 try{await Promise.race([ready,done.then(()=>{throw Error('CHILD_EXIT_BEFORE_READY')}),new Promise((_,rej)=>{timer=setTimeout(()=>rej(Error('CHILD_READY_TIMEOUT')),10000)})]);}
 catch(e){if(p.exitCode===null&&p.signalCode===null)p.kill('SIGKILL');await done;throw e;}finally{clearTimeout(timer)}
 return {p,done,async close(){if(p.exitCode===null&&p.signalCode===null)p.kill('SIGKILL');await done;exits.delete(p);}};
}
test('self identity is alive and invalid PIDs are rejected',async()=>{const id=await update.processIdentity(process.pid);assert(id);assert.equal(await update.isProcessAlive(id),true);for(const pid of [0,-1,1.2,NaN,0x100000000])await assert.rejects(update.processIdentity(pid),/IDENTITY_INVALID/);});
test('unsupported OS cannot infer process absence from missing procfs',async()=>{const p=Object.getOwnPropertyDescriptor(process,'platform');try{Object.defineProperty(process,'platform',{value:'freebsd'});await assert.rejects(update.processIdentity(process.pid),/PLATFORM_UNSUPPORTED/);}finally{Object.defineProperty(process,'platform',p)}});
test('POSIX identity contains boot and PID-namespace evidence', {skip:process.platform==='win32'}, async()=>{const id=await update.processIdentity(process.pid);assert.equal(id.identityVersion,2);assert.equal(id.platform,process.platform);assert.match(id.bootId,/^[0-9a-f-]{36}$/);assert(id.namespace);});
test('foreign POSIX identity blocks even when PID refers to self', {skip:process.platform==='win32'},async()=>{const id=await update.processIdentity(process.pid);await assert.rejects(update.isProcessAlive({...id,identityVersion:2,platform:process.platform==='linux'?'darwin':'linux'}),/IDENTITY_UNKNOWN/)});
test('a child stays alive until observed close; exited identity is no longer alive',async()=>{const c=await ownedChild('process.send({ready:true});setInterval(()=>{},1000)');try{const id=await update.processIdentity(c.p.pid);assert.equal(await update.isProcessAlive(id),true);await c.close();assert.equal(await update.isProcessAlive(id),false);}finally{await c.close();}});
test('worker lease rejects a live owner and reacquires after release',async()=>{const root=await fresh(),key=randomBytes(32);const release=await update.acquireWorkerLease(root,key);try{await assert.rejects(update.acquireWorkerLease(root,key),/UPDATE_WORKER_BUSY/)}finally{await release()};await (await update.acquireWorkerLease(root,key))();});
test('worker lease retires only an observed exited signed owner',async()=>{const c=await ownedChild('process.send({ready:true});setInterval(()=>{},1000)');let id;try{id=await update.processIdentity(c.p.pid);}finally{await c.close()};const root=await fresh(),key=randomBytes(32);await mkdir(join(root,'worker-lease'));await writeFile(join(root,'worker-lease/owner.json'),JSON.stringify(sign({token:'old-fixture',identity:id},key)));await (await update.acquireWorkerLease(root,key))();});
test('unknown legacy POSIX worker record is preserved', {skip:process.platform==='win32'}, async()=>{const root=await fresh(),key=randomBytes(32);await mkdir(join(root,'worker-lease'));const bytes=JSON.stringify(sign({token:'legacy',identity:{pid:process.pid,birth:'unverified',exe:process.execPath}},key));await writeFile(join(root,'worker-lease/owner.json'),bytes);await assert.rejects(update.acquireWorkerLease(root,key),/IDENTITY_UNKNOWN/);assert.equal(await readFile(join(root,'worker-lease/owner.json'),'utf8'),bytes);});
test('publisher drains output without retaining plaintext',async()=>{const root=await fresh(),release=join(root,'release'),records=[];const code=`import{existsSync}from'node:fs';process.stdout.write('x'.repeat(262144));process.stderr.write('y'.repeat(262144));const t=setInterval(()=>{if(existsSync(${JSON.stringify(release)})){clearInterval(t);process.exit(0)}},10);setTimeout(()=>process.exit(19),15000).unref();`;await update.runPublisher({file:process.execPath,args:['--input-type=module','-e',code],onStarted:async id=>{assert(id.birth);await writeFile(release,'ok')},record:async r=>records.push(r),timeoutMs:10000});assert.equal(records.length,1);assert.equal(records[0].bytes,524288);assert.equal(records[0].code,0);assert(!JSON.stringify(records).includes('xxx'));});
test('publisher timeout preserves a live child and unknown outcome until test cleanup',async()=>{const records=[];let id;try{await assert.rejects(update.runPublisher({file:process.execPath,args:['-e','setTimeout(()=>process.exit(0),15000)'],onStarted:async x=>{id=x},record:async r=>records.push(r),timeoutMs:25}),/TIMEOUT_OUTCOME_UNKNOWN/);assert(id);assert.equal(await update.isProcessAlive(id),true);assert.equal(records.at(-1).status,'blocked');}finally{if(id&&await update.isProcessAlive(id)){process.kill(id.pid,'SIGKILL');for(let i=0;i<100;i++){try{process.kill(id.pid,0)}catch(e){if(e.code==='ESRCH')break;throw e}await delay(20)}}}});
test('launcher selects platform executable layout',()=>{assert.equal(typeof launcher.desktopExecutable,'function');assert.equal(launcher.desktopExecutable('/pkg','linux'),join('/pkg','dist/electron'));assert.equal(launcher.desktopExecutable('/pkg','darwin'),join('/pkg','dist/Electron.app/Contents/MacOS/Electron'));assert.equal(launcher.desktopExecutable('/pkg','win32'),join('/pkg','dist/electron.exe'));assert.throws(()=>launcher.desktopExecutable('/pkg','freebsd'),/PLATFORM_UNSUPPORTED/);});
test('POSIX launcher isolates XDG paths and preserves graphical-session connection', {skip:process.platform==='win32'},()=>{const c={runtimeUser:'/sep/user',home:'/sep/home',releaseRoot:'/sep/release',nodeExecutable:'/node',pnpmEntry:'/pnpm',dailyRoot:'/sep'};const env=launcher.buildEnvironment(c,{PATH:'/usr/bin',DISPLAY:':88',WAYLAND_DISPLAY:'wayland-7',DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/1000/bus',XDG_RUNTIME_DIR:'/run/user/1000',HOME:'/other',XDG_CONFIG_HOME:'/other/conf',DEEPSEEK_API_KEY:'must-not-inherit'});assert.equal(env.XDG_CONFIG_HOME,'/sep/user/config');assert.equal(env.XDG_DATA_HOME,'/sep/user/data');assert.equal(env.XDG_CACHE_HOME,'/sep/user/cache');assert.equal(env.TMPDIR,'/sep/user/temp');assert.equal(env.DISPLAY,':88');assert.equal(env.HOME,'/sep/user');assert.equal(env.DEEPSEEK_API_KEY,undefined);});
test('POSIX update health does not merge distinct case-sensitive paths', {skip:process.platform==='win32'},()=>{const target={root:'/sep/Case',version:'test',graphHash:'a'};const proof={...target,checkedAt:Date.now(),services:{'desktop-host':true,'recovery-control':true,'governed-storage':true}};assert.equal(healthy(proof,target),true);assert.equal(healthy({...proof,root:'/sep/case'},target),false)});
for(const hostile of [false,true])test(`guardian ${hostile?'deadline forces owned child':'normal IPC stop'} and never kills peer`, {skip:hostile&&process.platform==='win32'?'POSIX SIGTERM refusal':false},async()=>{
 const root=await fresh(),peer=await ownedChild('process.send({ready:true});setInterval(()=>{},1000)');let child,guardian,stop;
 try{guardian=await openGuardian({controlRoot:root,command:{file:process.execPath,args:['-e',hostile?"process.on('SIGTERM',()=>{});process.on('message',()=>{});process.send({type:'dsh-guardian-ready'});setInterval(()=>{},1000)":"process.on('message',m=>{if(m.type==='dsh-daily-shutdown')process.exit(0)});process.send({type:'dsh-guardian-ready'});setInterval(()=>{},1000)"],cwd:root},beforeStart:async()=>true,onSpawn:x=>{child=x.child},shutdownTimeoutMs:100,afterExitTimeoutMs:1000,restartLimit:0});assert.equal((await guardian.start()).phase,'running');stop=guardian.stop();let timer;try{const s=await Promise.race([stop,new Promise((_,rej)=>{timer=setTimeout(()=>rej(Error('STOP_DID_NOT_SETTLE')),4000)})]);assert.equal(s.phase,'stopped');assert.equal(s.lastExit.forced,hostile);assert.equal(peer.p.exitCode,null);assert.equal(peer.p.signalCode,null);}finally{clearTimeout(timer)}}finally{if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'close');child.kill('SIGKILL');await done}await stop?.catch(()=>{});await guardian?.close();await peer.close()}
});
test('queued updater waits for its live parent and honors cancellation before any adapter effect',async()=>{
 const c=await ownedChild('process.send({ready:true});setInterval(()=>{},1000)'),root=await fresh(),key=randomBytes(32),id=randomUUID();let calls=0,job;
 try{
  const request={schema:3,id,queuedAt:new Date().toISOString(),parentIdentity:await update.processIdentity(c.p.pid)};
  await writeFile(join(root,'control-key'),key);await writeFile(join(root,'queued-request.json'),JSON.stringify(sign(request,key)));
  job=executeQueued(root,id,{adapter:async()=>{calls++;throw Error('MUST_NOT_REACH_ADAPTER')}});job.catch(()=>{});
  // A durable cancel record is checked while the parent is alive; no model, profile or publisher runs.
  await writeFile(join(root,'cancel-request.json'),JSON.stringify({cancelledAt:new Date(Date.now()+1000).toISOString()}));
  await assert.rejects(job,/UPDATE_CANCELLED/);assert.equal(calls,0);assert.equal(c.p.exitCode,null);
 }finally{await c.close();await job?.catch(()=>{})}
});
test('POSIX PID reuse and namespace ambiguity are distinct', {skip:process.platform==='win32'},async()=>{
 const id=await update.processIdentity(process.pid);
 const oldBirth=process.platform==='linux'?(BigInt(id.birth)+1n).toString():'Mon Jan 01 00:00:00 2001';
 assert.equal(await update.isProcessAlive({...id,birth:oldBirth}),false);
 if(process.platform==='linux')await assert.rejects(update.isProcessAlive({...id,namespace:'pid:[1]'}),/IDENTITY_UNKNOWN/);
 await assert.rejects(update.isProcessAlive({...id,exe:id.exe+'.different'}),/IDENTITY_UNKNOWN/);
});
test('guardian reports blocked when termination cannot be confirmed; recovery cleanup is separate',async()=>{
 const root=await fresh();let child,kill,guardian;
 try{
  guardian=await openGuardian({controlRoot:root,command:{file:process.execPath,args:['-e',"process.on('message',()=>{});process.send({type:'dsh-guardian-ready'});setInterval(()=>{},1000)"],cwd:root},beforeStart:async()=>true,shutdownTimeoutMs:10,afterExitTimeoutMs:10,restartLimit:0,onSpawn:x=>{child=x.child;kill=child.kill.bind(child);child.kill=()=>false}});
  await guardian.start();await assert.rejects(guardian.close(),/GUARDIAN_STOP_TIMEOUT/);
  assert.equal(guardian.status().phase,'blocked');assert.equal(child.exitCode,null);assert.equal(child.signalCode,null);
 }finally{
  // The blocked close did not clean up: this controlled test cleanup does.
  if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'close');kill('SIGKILL');await done}
  await guardian?.close();
 }
});
test('terminal close failure preserves its original error on repeat instead of closing a null journal',async()=>{
 const root=await fresh();const guardian=await openGuardian({controlRoot:root,command:{file:process.execPath,args:[],cwd:root},beforeStart:async()=>false});
 await writeFile(join(root,'guardian/owner.json'),'changed synthetic owner');
 let first;try{await guardian.close();assert.fail('close should detect changed owner')}catch(e){first=e;assert.equal(e.code,'OWNER_CHANGED')}
 await assert.rejects(guardian.close(),e=>e===first);
});