import test from 'node:test';import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {openDesktopRpc} from './desktop-rpc.mjs';
function owner(){let phase='running',calls=0;return{status:()=>({phase,generation:1,pid:process.pid}),ready:async()=>({url:'http://127.0.0.1:32123/?token=abcdefghijklmnop',injections:[]}),start:async()=>({phase,generation:1,pid:process.pid}),inspect:async()=>({activeTasks:true,scheduledTasks:false}),stop:async()=>{calls++;phase='stopped';return{phase,lastExit:{code:0,forced:false}};},calls:()=>calls};}
async function withRpc(fn){const o=owner(),rpc=await openDesktopRpc({projectDir:process.cwd(),owner:o});try{await fn(rpc,o);}finally{assert.equal((await rpc.close()).status,'pass');}}
const request=(r,method,headers={},body)=>fetch(r.connection.endpoint+'rpc',{method:'POST',headers:{authorization:'Bearer '+r.connection.token,'content-type':'application/json',...headers},body:body??JSON.stringify({method,params:{}})});
test('protocol 4 preserves real owner identity and actual task inspection',()=>withRpc(async(r,o)=>{
 const s=await(await request(r,'desktopStatus')).json();assert.equal(s.result.guardian.pid,process.pid);assert.equal(s.result.projectDir,process.cwd());assert.equal(s.result.protocolVersion,4);assert.equal(s.result.transport,'desktop-http');
 const ready=await(await request(r,'desktopReady')).json();assert.equal(ready.result.generation,1);assert.equal(ready.result.pid,process.pid);
 assert.deepEqual((await(await request(r,'desktopQuitInspection')).json()).result,{activeTasks:true,scheduledTasks:false});assert.equal(o.calls(),0);
}));
test('auth, origin, Host, route, method and envelope reject before owner mutations',()=>withRpc(async(r,o)=>{
 for(const headers of [{authorization:'Bearer wrong'},{origin:'https://example.org'}])assert.notEqual((await request(r,'stopHost',headers)).status,200);
 const badHost=await new Promise((resolve,reject)=>{const q=httpRequest(r.connection.endpoint+'rpc',{method:'POST',headers:{host:'example.org',authorization:'Bearer '+r.connection.token,'content-type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});q.once('error',reject);q.end(JSON.stringify({method:'stopHost',params:{}}));});assert.equal(badHost,403);
 for(const body of ['{',JSON.stringify({method:'stopHost',params:{unknown:true}}),JSON.stringify({method:'constructor',params:{}}),JSON.stringify({method:'stopHost',params:{},extra:true})])assert.notEqual((await request(r,'stopHost',{},body)).status,200);
 assert.equal((await fetch(r.connection.endpoint,{headers:{authorization:'Bearer '+r.connection.token}})).status,404);assert.equal(o.calls(),0);
}));
test('request body is bounded and cannot bypass mutation admission',()=>withRpc(async(r,o)=>{assert.equal((await request(r,'stopHost',{},' '.repeat(5000))).status,413);assert.equal(o.calls(),0);}));
test('owner failure text is classified without leaking it',async()=>{
 const o=owner();o.inspect=()=>{throw Error('private project/path/message');};const r=await openDesktopRpc({projectDir:process.cwd(),owner:o});try{const response=await request(r,'desktopQuitInspection');assert.equal(response.status,409);const text=await response.text();assert(!text.includes('private'));assert(text.includes('RECOVERY_OPERATION_FAILED'));}finally{await r.close();}
});
test('blocked HTTP drain can be retried, late success is retained, new calls rejected',async()=>{
 let settle;const o=owner();o.inspect=()=>new Promise(r=>{settle=r;});const r=await openDesktopRpc({projectDir:process.cwd(),owner:o,closeDeadlineMs:10});
 const pending=request(r,'desktopQuitInspection').catch(error=>({error}));try{for(let i=0;i<100&&!settle;i++)await new Promise(r=>setTimeout(r,5));assert(settle);
 assert.equal((await r.close()).status,'blocked');assert.equal((await request(r,'startHost')).status,503);settle({activeTasks:false,scheduledTasks:false});assert.equal((await pending).status,200);assert.equal((await r.close()).status,'pass');assert.equal((await r.whenClosed()).resourcesConfirmedReleased,true);
 }finally{settle?.({activeTasks:false,scheduledTasks:false});await pending;await r.close();}
});
test('invalid ready or inspection result is never replaced with optimistic defaults',async()=>{
 const o=owner();o.ready=async()=>({url:'https://example.org/',injections:[]});o.inspect=async()=>({activeTasks:false});const r=await openDesktopRpc({projectDir:process.cwd(),owner:o});try{assert.equal((await request(r,'desktopReady')).status,409);assert.equal((await request(r,'desktopQuitInspection')).status,409);}finally{await r.close();}
});
