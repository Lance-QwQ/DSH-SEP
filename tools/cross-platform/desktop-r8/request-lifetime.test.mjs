import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const source=process.env.SEP_R8_SOURCE;
const {forwardWebRequest}=await import(pathToFileURL(join(source,'apps/desktop/src/web-document.ts')));
const lifetime=await import(pathToFileURL(join(source,'apps/desktop/src/request-lifetime.ts'))).catch(()=>null);
test('shutdown aborts accepted pending HTTP and returns a controlled unavailable response',async()=>{
 const server=createServer(()=>{});server.listen(0,'127.0.0.1');await once(server,'listening');
 const controller=new AbortController();const accepted=once(server,'request');
 try{const pending=forwardWebRequest(new Request('dsh-app://app/api/pending'),'http://127.0.0.1:'+server.address().port,'owned',controller.signal);await accepted;controller.abort();const response=await Promise.race([pending,new Promise((_,reject)=>setTimeout(()=>reject(Error('not cancelled')),1000).unref())]);assert.equal(response.status,503)}finally{server.closeAllConnections();server.close()}
});
test('closed HTTP entry does not contact the former Host',async()=>{const c=new AbortController();c.abort();const response=await forwardWebRequest(new Request('dsh-app://app/api/read'),'http://127.0.0.1:1','owned',c.signal);assert.equal(response.status,503)});
test('operational network errors remain errors while desktop is open',async()=>{const c=new AbortController();await assert.rejects(()=>forwardWebRequest(new Request('dsh-app://app/api/read'),'http://127.0.0.1:1','owned',c.signal),/fetch failed/)});
test('request lifetime refuses new IPC and settles late IPC without hiding live failures',async()=>{assert(lifetime,'lifetime module required');const gate=new lifetime.DesktopRequestLifetime();await assert.rejects(()=>gate.run(async()=>{throw Error('live failure')},false),/live failure/);let release;const pending=gate.run(()=>new Promise((_,reject)=>{release=()=>reject(Error('backend gone'))}),false);await Promise.resolve();gate.close();release();assert.equal(await pending,false);let called=false;assert.equal(await gate.run(async()=>{called=true;return true},false),false);assert.equal(called,false);assert.equal(gate.signal.aborted,true)});
test('accepted IPC is bounded by close even if provider never settles',async()=>{assert(lifetime);const gate=new lifetime.DesktopRequestLifetime();const pending=gate.run(()=>new Promise(()=>{}),false);gate.close();assert.equal(await Promise.race([pending,new Promise((_,reject)=>setTimeout(()=>reject(Error('unbounded')),1000).unref())]),false)});

