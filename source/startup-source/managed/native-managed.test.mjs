import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const dir=fileURLToPath(new URL('.',import.meta.url));
const runtime=fileURLToPath(new URL('../core/test-runtime/',import.meta.url));
const suiteRoot=join(runtime,'p0501');
const {openManagedService}=await import(pathToFileURL(process.env.SEP_MANAGED_ENTRY??join(runtime,'p0500/src/managed.mjs')));
const {openControl}=await import(pathToFileURL(join(suiteRoot,'src/p2/control.js')));
async function setup(){
 const root=await mkdtemp(join(dir,'fixture-')),storageRoot=join(root,'storage'),lockDirectory=join(root,'locks'),projectRoot=join(root,'project'),controlRoot=join(root,'center');
 for(const p of [storageRoot,lockDirectory,projectRoot])await mkdir(p);
 const control=await openControl({storageRoot,initialize:true});await control.close();
 return {root,storageRoot,lockDirectory,projectRoot,controlRoot,projectId:randomUUID()};
}
function command(f,mode){return {file:process.execPath,args:[join(dir,'child.mjs'),suiteRoot,f.storageRoot,f.lockDirectory,mode],cwd:f.root};}
async function open(f,mode){
 const service=await openManagedService({controlRoot:f.controlRoot,host:{command:command(f,mode),suiteRoot,suiteLockDirectory:f.lockDirectory,storageRoot:f.storageRoot,projectIds:[f.projectId],restartLimit:0,readinessTimeoutMs:20000,afterExitTimeoutMs:20000,prerequisiteTimeoutMs:20000,shutdownTimeoutMs:2000}});
 await service.controller.addProject({id:f.projectId,root:f.projectRoot});return service;
}
async function wait(service,fn){for(let i=0;i<150;i++){const s=await service.status();if(fn(s))return s;await delay(100);}throw Error('STATUS_TIMEOUT '+JSON.stringify(await service.status()));}
async function seed(f,mode){
 const cmd=command(f,mode),child=spawn(cmd.file,cmd.args,{cwd:cmd.cwd,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
 child.stdout.resume();child.stderr.resume();
 const ready=new Promise(resolve=>child.on('message',m=>{if(m.type==='dsh-guardian-ready')resolve();}));
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
 if(mode==='ready')await ready;else await done;
 return {child,done,async close(){if(child.exitCode===null&&child.connected)child.send({type:'dsh-daily-shutdown'});await done;}};
}
test('legacy/no-ready dead locks are admitted by native ownership before next managed start',async()=>{
 const f=await setup();await seed(f,'legacy');const service=await open(f,'ready');
 try{await service.guardian.start();const state=await service.status();assert.equal(state.guardian.phase,'running');}
 finally{await service.close();}
});
for(const mode of ['before-ready','p2-only','suite-only'])test(`${mode} crash does not require a ready receipt for exit fencing`,async()=>{
 const f=await setup(),service=await open(f,mode);
 try{await service.guardian.start().catch(()=>{});const state=await wait(service,s=>['blocked','exhausted'].includes(s.guardian.phase));assert.equal(state.managedRecovery.lastRecovery?.status,'pass');assert.equal(state.guardian.phase,'exhausted');}
 finally{await service.close();}
});
test('native lifecycle rejects JSON exit claims without an observed child',async()=>{
 const f=await setup();const {createNativeSepLifecycle}=await import(pathToFileURL(join(runtime,'p0500/src/sep-lock-native.mjs')));
 const guard=createNativeSepLifecycle({suiteLockDirectory:f.lockDirectory,storageRoot:f.storageRoot,openControl});
 assert.deepEqual(await guard.afterExit({generation:1,code:1,signal:null}),{status:'blocked',reason:'SEP_EXIT_UNPROVEN',dataReplayed:false});
 assert.throws(()=>guard.observeChild({child:{pid:123,exitCode:1},generation:1}),/SEP_CHILD_UNPROVEN/);
});
test('ready IPC without complete suite ownership cannot open business',async()=>{
 const f=await setup(),service=await open(f,'ready-no-suite');
 try{await assert.rejects(service.guardian.start(),/GUARDIAN_NOT_READY/);const state=await wait(service,s=>['blocked','exhausted'].includes(s.guardian.phase));assert.equal(state.managedRecovery.lastRecovery?.status,'pass');}
 finally{await service.close();}
});
for(const observer of ['throw','promise'])test(`guardian ${observer} observer failure terminates only its exact child`,async()=>{
 const f=await setup();const {openGuardian}=await import(pathToFileURL(join(runtime,'p0500/src/guardian.mjs')));let owned;
 const guardian=await openGuardian({controlRoot:f.controlRoot,command:{file:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:f.root},restartLimit:0,beforeStart:async()=>true,onSpawn:({child})=>{owned=child;if(observer==='throw')throw Error('synthetic observer');return Promise.resolve();},readinessTimeoutMs:1000});
 try{await guardian.start().catch(()=>{});for(let i=0;i<100&&!guardian.status().lastExit;i++)await delay(20);const s=guardian.status();assert.equal(s.lastExit.forced,true);assert.notEqual(owned.exitCode??owned.signalCode,null);assert.equal(s.lastExit.errorCode,observer==='throw'?'GUARDIAN_SPAWN_OBSERVER_FAILED':'GUARDIAN_SPAWN_OBSERVER_ASYNC');}
 finally{await guardian.close();}
});
test('live owner refuses managed start and is not killed or displaced',async()=>{
 const f=await setup(),seeded=await seed(f,'ready'),service=await open(f,'ready');
 try{await service.guardian.start();const state=await service.status();assert.equal(state.guardian.phase,'blocked');assert.equal(seeded.child.exitCode,null);}
 finally{await service.close();await seeded.close();}
});
test('unknown business intent remains pending and blocks next managed start',async()=>{
 const f=await setup(),control=await openControl({storageRoot:f.storageRoot});
 await control.business({kind:'synthetic-uncertain'},async()=>{throw Error('synthetic lost result');}).catch(()=>{});const before=await control.checkpoint();assert.equal(before.pending.length,1);await control.close();
 const service=await open(f,'ready');
 try{await service.guardian.start().catch(()=>{});const state=await wait(service,s=>s.guardian.phase==='blocked');assert.equal(state.guardian.generation,0);}
 finally{await service.close();}
 const afterControl=await openControl({storageRoot:f.storageRoot,mode:'maintenance'});const after=await afterControl.checkpoint();await afterControl.close();assert.deepEqual(after.pending,before.pending);assert.deepEqual(after.head,before.head);
});
