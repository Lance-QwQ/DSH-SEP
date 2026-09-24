import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {finished} from 'node:stream/promises';
const fixture=fileURLToPath(new URL('./process-fixture.mjs',import.meta.url));
async function run(mode,action,{ipc=true}={}){
 const child=spawn(process.execPath,[fixture,mode],{windowsHide:true,stdio:['ignore','pipe','pipe',...(ipc?['ipc']:[])]});
 const started=Date.now(),messages=[];let stderr='',stdout='',acted=false,timedOut=false,exitValue;
 child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 child.on('message',x=>{messages.push(x);if(x.type==='fixture-entered'&&!acted){acted=true;action?.(child);}});
 let timer;
 const exited=new Promise((resolve,reject)=>{
  child.once('error',reject);child.once('exit',(code,signal)=>{exitValue={code,signal};resolve(exitValue);});
 });
 const result=await new Promise((resolve,reject)=>{
  Promise.all([exited,finished(child.stdout),finished(child.stderr)]).then(([value])=>resolve(value),reject);
  timer=setTimeout(()=>{timedOut=true;child.kill();reject(Error('FIXTURE_DEADLINE '+JSON.stringify({pid:child.pid,exitCode:child.exitCode,signalCode:child.signalCode,connected:child.connected,exitValue,messages,stderr})));},2500);
 });
 clearTimeout(timer);assert.equal(timedOut,false,'fixture must exit itself within bounded deadline');
 return {...result,messages,stderr,stdout,ms:Date.now()-started};
}
test('real child without parent IPC exits failure before profile launch',async()=>{
 const r=await run('normal',null,{ipc:false});assert.equal(r.code,1);assert.match(r.stderr,/SEP_HOST_PARENT_UNAVAILABLE/);
});
for(let round=1;round<=3;round++){
 test(`round ${round}: pending application loses IPC and exits failure without ready`,async()=>{
  const r=await run('pending',c=>c.disconnect());assert.equal(r.code,1);assert.match(r.stderr,/SEP_HOST_SHUTDOWN_TIMEOUT/);assert.equal(r.messages.some(x=>x.type==='ready'),false);
 });
 test(`round ${round}: pending application receives shutdown then late resolution`,async()=>{
  const r=await run('pending',c=>{c.send({type:'shutdown'});c.send({type:'fixture-resolve'});});assert.equal(r.code,0);assert.equal(r.messages.some(x=>x.type==='ready'),false);assert.equal(r.messages.filter(x=>x.type==='shutdown-complete').length,1);
 });
 test(`round ${round}: running application loses IPC and exits interrupted`,async()=>{
  const r=await run('normal',c=>c.disconnect());assert.equal(r.code,1);assert.match(r.stderr,/SEP_HOST_PARENT_DISCONNECTED/);assert.equal(r.messages.some(x=>x.type==='shutdown-complete'),false);
 });
 test(`round ${round}: normal shutdown drains and exits zero`,async()=>{
  const r=await run('normal',c=>c.send({type:'shutdown'}));assert.equal(r.code,0);assert.equal(r.messages.filter(x=>x.type==='shutdown-complete').length,1);assert.equal(r.messages.filter(x=>x.type==='ready').length,1);
 });
 test(`round ${round}: hung shutdown exits deadline failure without clean ack`,async()=>{
  const r=await run('hang-shutdown',c=>c.send({type:'shutdown'}));assert.equal(r.code,1);assert.match(r.stderr,/SEP_HOST_SHUTDOWN_TIMEOUT/);assert.equal(r.messages.some(x=>x.type==='shutdown-complete'),false);
 });
}
test('shutdown rejection is handled, exits failure, and never acknowledges clean',async()=>{
 const r=await run('fail-shutdown',c=>c.send({type:'shutdown'}));assert.equal(r.code,1);assert.match(r.stderr,/SEP_HOST_SHUTDOWN_FAILED/);assert.equal(r.messages.some(x=>x.type==='shutdown-complete'),false);
});
test('startup rejection with partial resource cannot leave an orphan process',async()=>{
 const r=await run('fail-start');assert.equal(r.code,1);assert.match(r.stderr,/SEP_HOST_STARTUP_FAILED/);assert.equal(r.messages.some(x=>x.type==='shutdown-complete'),false);
});
