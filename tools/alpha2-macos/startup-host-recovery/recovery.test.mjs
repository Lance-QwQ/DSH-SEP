import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {readFile,writeFile,appendFile,mkdir,mkdtemp,copyFile,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
const original=new URL('../desktop/managed-broker/business-host.mjs',import.meta.url);
const override=process.env.SEP_STARTUP_HOST_ENTRY,expected=process.env.SEP_STARTUP_HOST_EXPECTED_SHA;
assert.equal(Boolean(override),Boolean(expected),'entry override and expected SHA must be supplied together');
const host=override?await realpath(override):process.env.SEP_STARTUP_HOST_BASELINE==='1'?fileURLToPath(original):fileURLToPath(new URL('./business-host.candidate.mjs',import.meta.url));
if(override){assert.match(expected,/^[a-f0-9]{64}$/);assert.equal(createHash('sha256').update(await readFile(host)).digest('hex'),expected,'startup host entry changed');}
const modulePath=await realpath(fileURLToPath(new URL('./fixture-business.mjs',import.meta.url)));
const moduleSha256=createHash('sha256').update(await readFile(modulePath)).digest('hex');
assert(process.env.SEP_STARTUP_HOST_TEST_ROOT,'explicit D-backed/native temp root required');
const output=resolve(process.env.SEP_STARTUP_HOST_TEST_ROOT);await mkdir(output,{recursive:true});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,ms=3000){const end=Date.now()+ms;while(Date.now()<end){const result=check();if(result)return result;await pause(10);}throw Error('fixture condition deadline');}
async function held(root){const {port}=JSON.parse(await readFile(join(root,'resource.json'),'utf8'));return (await fetch('http://127.0.0.1:'+port,{signal:AbortSignal.timeout(1000)})).text();}
async function childFixture(t,input={}){
 const root=await mkdtemp(join(output,'ipc-')),child=fork(host,[],{execPath:process.execPath,execArgv:[],stdio:['ignore','pipe','pipe','ipc']}),messages=[];let exit,stderr='';
 child.on('message',m=>messages.push(m));child.on('exit',(code,signal)=>{exit={code,signal};});child.stderr.on('data',b=>{stderr+=b;});
 t.after(async()=>{const forced=!exit;if(forced)child.kill();await until(()=>exit);await writeFile(join(root,'TRACE.json'),JSON.stringify({pid:child.pid,messages,exit,forcedTestCleanup:forced,stderr},null,2));});
 const send=m=>new Promise((resolve,reject)=>child.send(m,e=>e?reject(e):resolve()));
 const wait=predicate=>until(()=>messages.find(predicate));
 const request=async type=>{const id=randomBytes(12).toString('hex');await send({type,id});return wait(m=>m.type==='reply'&&m.id===id);};
 await send({type:'initialize',modulePath,moduleSha256,input:{root,...input}});
 return {root,child,messages,send,wait,request,exit:()=>exit,failed:()=>wait(m=>m.type==='failed')};
}

test('startup cleanup blocked retains real socket, IPC and trusted retry until confirmed release',async t=>{
 const f=await childFixture(t);assert.deepEqual(await f.failed(),{type:'failed',code:'SEP_MAC_BUSINESS_STARTUP_CLEANUP_BLOCKED'});
 const inspection=await f.request('inspect');assert.equal(inspection.error,'SEP_MAC_BUSINESS_STARTUP_CLEANUP_BLOCKED');
 assert.equal(await held(f.root),'held');assert.equal(f.exit(),undefined);
 assert.deepEqual((await f.request('stop')).receipt,{status:'blocked',resourcesConfirmedReleased:false,owner:'sepMacRuntime'});
 assert.equal(await held(f.root),'held');assert.equal(f.child.connected,true);
 await writeFile(join(f.root,'gate'),'release');assert.deepEqual((await f.request('stop')).receipt,{status:'pass',resourcesConfirmedReleased:true});
 assert.deepEqual(await until(f.exit),{code:0,signal:null});assert.equal(f.messages.some(m=>m.type==='ready'),false);
 assert.deepEqual((await readFile(join(f.root,'events.log'),'utf8')).trim().split('\n'),['runtime-close','runtime-close','runtime-close','socket-released','profile-close','host-shutdown']);
});

test('unknown retry or incomplete pass cannot release ownership and a later retry remains possible',async t=>{
 const f=await childFixture(t);await f.failed();
 for(const value of ['unknown','unconfirmed','throw']){await writeFile(join(f.root,'gate'),value);const {receipt}=await f.request('stop');assert.notEqual(receipt?.resourcesConfirmedReleased,true);assert.equal(f.exit(),undefined);assert.equal(await held(f.root),'held');assert.equal(JSON.stringify(f.messages).includes('private'),false);}
 await writeFile(join(f.root,'gate'),'release');assert.equal((await f.request('stop')).receipt.resourcesConfirmedReleased,true);assert.deepEqual(await until(f.exit),{code:0,signal:null});
});

test('stop racing unresolved opening reaches the retained cleanup owner',async t=>{
 const f=await childFixture(t,{openDelayMs:150}),stopping=f.request('stop');await f.failed();assert.equal((await stopping).receipt.status,'blocked');assert.equal(await held(f.root),'held');
 await writeFile(join(f.root,'gate'),'release');assert.equal((await f.request('stop')).receipt.status,'pass');assert.deepEqual(await until(f.exit),{code:0,signal:null});
});

test('parent disconnect with unknown cleanup keeps the owned child alive without a false release',async t=>{
 const f=await childFixture(t);await f.failed();assert.equal((await f.request('stop')).receipt.status,'blocked');f.child.disconnect();await pause(100);
 assert.equal(f.exit(),undefined);assert.equal(await held(f.root),'held');const events=await readFile(join(f.root,'events.log'),'utf8');assert.equal(events.includes('socket-released'),false);
});

test('ordinary errors and malformed cleanup capabilities do not gain recovery privileges',async t=>{
 for(const mode of ['ordinary','wrong-code','missing-function']){const f=await childFixture(t,{mode});const message=await f.failed();assert.equal(message.code,mode==='ordinary'?'SEP_MAC_HOST_OPERATION_FAILED':mode==='wrong-code'?'SEP_MAC_OTHER_FAILURE':'SEP_MAC_BUSINESS_STARTUP_CLEANUP_BLOCKED');assert.deepEqual(await until(f.exit),{code:1,signal:null});assert.equal(f.messages.some(m=>m.type==='ready'),false);assert.equal(await readFile(join(f.root,'events.log'),'utf8').catch(()=>''),'');}
});

test('unchanged host-owner reports stopped only after retry pass plus real child exit zero',async t=>{
 const root=await mkdtemp(join(output,'owner-'));let ownerUrl=new URL('../desktop/managed-broker/host-owner.mjs',import.meta.url);
 if(await realpath(host)!==await realpath(fileURLToPath(original))){await copyFile(ownerUrl,join(root,'host-owner.mjs'));await copyFile(host,join(root,'business-host.mjs'));ownerUrl=pathToFileURL(join(root,'host-owner.mjs'));}
 const {createHostOwner}=await import(ownerUrl),owner=createHostOwner({nodeExecutable:process.execPath,modulePath,moduleSha256,input:{root},startDeadlineMs:3000,stopDeadlineMs:1000});
 let stopped=false;owner.whenStopped().then(()=>{stopped=true;});
 t.after(async()=>{const state=owner.status();if(state.pid&&!state.lastExit){process.kill(state.pid);await until(()=>owner.status().lastExit);}await writeFile(join(root,'OWNER.json'),JSON.stringify(owner.status(),null,2));});
 await assert.rejects(owner.start(),{code:'SEP_MAC_BUSINESS_STARTUP_CLEANUP_BLOCKED'});assert.equal((await owner.stop()).phase,'blocked');assert.equal(stopped,false);assert.equal(await held(root),'held');
 await writeFile(join(root,'gate'),'release');const result=await owner.stop();assert.equal(result.phase,'stopped');assert.deepEqual(result.lastExit,{code:0,signal:null,forced:false});assert.deepEqual(await owner.whenStopped(),{status:'pass',resourcesConfirmedReleased:true});assert.equal(stopped,true);
});
