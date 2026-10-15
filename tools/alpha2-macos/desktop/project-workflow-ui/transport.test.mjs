import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createClient,serveHost} from './transport.mjs';
import {binding,defer} from './portable-fixture.mjs';
function pair(){const a=new PassThrough(),b=new PassThrough();return [{on:(...args)=>a.on(...args),write:(...args)=>b.write(...args)},{on:(...args)=>b.on(...args),write:(...args)=>a.write(...args)},a,b];}
const raw=(id=1,patch={})=>JSON.stringify({schema:1,...binding,type:'request',id,method:'status',payload:{},...patch})+'\n';
test('private duplex correlates a bounded response and never returns authority objects',async()=>{
 const [a,b]=pair();let revoked=0;const host=serveHost(b,{request:async()=>({status:'pass'}),closeAdmission(){revoked++;}},binding),client=createClient(a,binding);
 assert.deepEqual(await client.request('status',{}),{status:'pass'});client.closeAdmission();assert.equal(client.status().admissionOpen,false);host.closeAdmission();assert.equal(revoked,1);
});
test('wrong nonce poisons host admission before dispatch',async()=>{
 const [,b,,intoHost]=pair();let calls=0,revoked=0;const host=serveHost(b,{request:async()=>{calls++;},closeAdmission(){revoked++;}},binding);intoHost.write(raw(1,{nonce:'e'.repeat(64)}));await new Promise(setImmediate);assert.equal(calls,0);assert.equal(revoked,1);assert.equal(host.status().admissionOpen,false);
});
test('request replay cannot dispatch twice',async()=>{
 const [,b,,intoHost]=pair();let calls=0;const host=serveHost(b,{request:async()=>{calls++;return {};},closeAdmission(){}},binding);intoHost.write(raw());await new Promise(setImmediate);intoHost.write(raw());await new Promise(setImmediate);assert.equal(calls,1);assert.equal(host.status().admissionOpen,false);
});
test('oversized frame closes admission before parsing or dispatch',async()=>{
 const [,b,,intoHost]=pair();let calls=0;const host=serveHost(b,{request:async()=>{calls++;},closeAdmission(){}},binding);intoHost.write('x'.repeat(4097));await new Promise(setImmediate);assert.equal(calls,0);assert.equal(host.status().admissionOpen,false);
});
test('EOF rejects pending work without claiming workflow resource release',async()=>{
 const [a,,intoClient]=pair(),client=createClient(a,binding);const pending=assert.rejects(client.request('status',{}),{code:'SEP_PROJECT_UI_CHANNEL'});intoClient.end();await pending;assert.equal(client.status().admissionOpen,false);assert.equal('resourcesConfirmedReleased' in client.status(),false);
});
test('ninth outstanding request is refused while eight bounded requests retain ownership',async()=>{
 const [a,b]=pair(),held=defer();const host=serveHost(b,{request:()=>held.promise,closeAdmission(){}},binding),client=createClient(a,binding);const requests=Array.from({length:8},()=>client.request('status',{}));await assert.rejects(client.request('status',{}),{code:'SEP_PROJECT_UI_BUSY'});held.resolve({status:'pass'});assert.equal((await Promise.all(requests)).length,8);client.closeAdmission();host.closeAdmission();
});
