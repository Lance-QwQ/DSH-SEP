import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {setTimeout as delay} from 'node:timers/promises';import {instrumentAtAppEntry} from './inspector-entry.mjs';
const fixture=fileURLToPath(new URL('./inspector-fixture/app.asar/lib/main.js',import.meta.url));
test('real Node Inspector reaches the entry and permits synchronous paused instrumentation',{timeout:15000},async()=>{
 const child=spawn(process.execPath,['--inspect-brk=127.0.0.1:0',fixture],{stdio:['ignore','pipe','pipe']});const exited=new Promise(r=>child.once('exit',r));let endpoint,ws,seq=0;const calls=new Map(),listeners=new Set();let stderr='';child.stdout.resume();child.stderr.on('data',b=>{stderr+=b;endpoint??=stderr.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-z0-9-]+/)?.[0];});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{calls.delete(id);reject(Error(method+' timed out'));},2000);calls.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 try{
  for(let i=0;i<100&&!endpoint;i++)await delay(20);assert(endpoint);ws=new WebSocket(endpoint);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);for(const f of listeners)f(m);const c=calls.get(m.id);if(c){calls.delete(m.id);clearTimeout(c.timer);m.error?c.reject(Error(JSON.stringify(m.error))):c.resolve(m.result);}});
  await call('Runtime.enable');await instrumentAtAppEntry({call,onEvent:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}},async()=>{const r=await call('Runtime.evaluate',{expression:'globalThis.sepProbe=true; true',awaitPromise:false,returnByValue:true});assert.equal(r.result.value,true);},{timeoutMs:3000});
  const r=await call('Runtime.evaluate',{expression:'({probe:globalThis.sepProbe,entry:globalThis.sepFixtureEntered})',awaitPromise:true,returnByValue:true});assert.deepEqual(r.result.value,{probe:true,entry:true});
 }finally{ws?.close();for(const c of calls.values()){clearTimeout(c.timer);c.reject(Error('cleanup'));}child.kill('SIGKILL');await exited;}
});
