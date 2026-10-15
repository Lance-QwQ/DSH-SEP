import test from 'node:test';
import assert from 'node:assert/strict';
import {Duplex,PassThrough} from 'node:stream';
import {createProbeChannel} from './channel.mjs';

const binding={nonce:'a'.repeat(64),programSha256:'b'.repeat(64),generation:'c'.repeat(32)};
function wire(){const a=new PassThrough(),b=new PassThrough();const pair=[Duplex.from({readable:a,writable:b}),Duplex.from({readable:b,writable:a})];for(const stream of pair)stream.on('error',()=>{});return pair;}
function frame(kind,id,changes={}){return JSON.stringify({protocol:1,kind,...binding,requestId:id,...changes})+'\n';}
const first='000000000000000000000001',second='000000000000000000000002';
function pair(){const [a,b]=wire();const controller=createProbeChannel({stream:a,binding,role:'controller',timeoutMs:100});const peer=createProbeChannel({stream:b,binding,role:'responder',timeoutMs:100});return {controller,peer,close(){controller.close();peer.close();a.destroy();b.destroy();}};}
function raw(){const [a,b]=wire();return {controller:createProbeChannel({stream:a,binding,role:'controller',timeoutMs:30}),peer:b,close(){a.destroy();b.destroy();}};}

test('fragmented duplex hello and ping yield only their ordered acknowledgments',async()=>{
  const [a,b]=wire(),controller=createProbeChannel({stream:a,binding,role:'controller',timeoutMs:100});
  try{const firstReply=controller.hello();b.write(frame('ack',first).slice(0,17));b.write(frame('ack',first).slice(17));await assert.doesNotReject(firstReply);assert.deepEqual(await firstReply,{kind:'ack',requestId:first});const reply=controller.ping();b.write(frame('ack',second));assert.deepEqual(await reply,{kind:'ack',requestId:second});assert.equal(controller.status().state,'open');}finally{controller.close();a.destroy();b.destroy();}
});
test('two real duplex endpoints exchange hello then eight concurrent bounded pings',async()=>{
  const p=pair();try{await assert.doesNotReject(p.controller.hello());const replies=await Promise.all(Array.from({length:8},()=>p.controller.ping()));assert.equal(new Set(replies.map(x=>x.requestId)).size,8);assert.equal(p.peer.status().acceptedRequests,9);assert.equal(p.controller.status().pending,0);}finally{p.close();}
});
test('ping cannot precede hello and a repeated hello cannot restart the sequence',async()=>{
  const p=pair();try{await assert.rejects(p.controller.ping(),{code:'SEP_CONTROL_SEQUENCE'});await p.controller.hello();await assert.rejects(p.controller.hello(),{code:'SEP_CONTROL_SEQUENCE'});assert.equal(p.controller.status().acceptedAcks,1);}finally{p.close();}
});
test('wrong nonce program or generation poisons the channel before any ack succeeds',async()=>{
  for(const changes of [{nonce:'d'.repeat(64)},{programSha256:'d'.repeat(64)},{generation:'d'.repeat(32)}]){const p=raw();try{const reply=p.controller.hello();p.peer.write(frame('ack',first,changes));await assert.rejects(reply,{code:'SEP_CONTROL_BINDING'});assert.equal(p.controller.status().state,'blocked');p.peer.write(frame('ack',first));await assert.rejects(p.controller.ping(),{code:'SEP_CONTROL_BINDING'});}finally{p.controller.close();p.close();}}
});
test('unknown extra duplicate-key and malformed UTF8 frames cannot be accepted',async()=>{
  for(const bytes of [frame('ready',first),frame('ack',first,{extra:true}),frame('ack',first).replace('"protocol":1','"protocol":1,"protocol":1'),Buffer.from([0xff,0x0a])]){const p=raw();try{const reply=p.controller.hello();p.peer.write(bytes);await assert.rejects(reply,{code:'SEP_CONTROL_FRAME'});assert.equal(p.controller.status().acceptedAcks,0);}finally{p.controller.close();p.close();}}
});
test('replayed or out-of-order acknowledgments invalidate pending work',async()=>{
  const p=raw();try{const hello=p.controller.hello();p.peer.write(frame('ack',first));await hello;const ping=p.controller.ping();p.peer.write(frame('ack',first));await assert.rejects(ping,{code:'SEP_CONTROL_SEQUENCE'});assert.equal(p.controller.status().acceptedAcks,1);}finally{p.controller.close();p.close();}
  const q=raw();try{const hello=q.controller.hello();q.peer.write(frame('ack',second));await assert.rejects(hello,{code:'SEP_CONTROL_SEQUENCE'});}finally{q.controller.close();q.close();}
});
test('ninth pending request is rejected without growing the queue or dispatching it',async()=>{
  const p=raw();try{const hello=p.controller.hello();p.peer.write(frame('ack',first));await hello;const pending=Array.from({length:8},()=>p.controller.ping());const settled=Promise.allSettled(pending);await assert.rejects(p.controller.ping(),{code:'SEP_CONTROL_QUEUE_FULL'});assert.equal(p.controller.status().pending,8);p.controller.close();assert((await settled).every(x=>x.status==='rejected'));}finally{p.controller.close();p.close();}
});
test('oversized partial line and EOF poison pending work instead of reporting pass',async()=>{
  for(const [code,action] of [['SEP_CONTROL_FRAME_LIMIT',p=>p.peer.write(Buffer.alloc(4097,0x20))],['SEP_CONTROL_EOF',p=>{p.peer.write('{');p.peer.end();}]]){const p=raw();try{const reply=p.controller.hello();action(p);await assert.rejects(reply,{code});assert.equal(p.controller.status().state,'blocked');assert.equal(p.controller.status().acceptedAcks,0);assert.notEqual((await p.controller.whenClosed).status,'pass');}finally{p.controller.close();p.close();}}
});
test('deadline closes admission and local close rejects retained outstanding requests',async()=>{
  const p=raw();try{await assert.rejects(p.controller.hello(),{code:'SEP_CONTROL_TIMEOUT'});await assert.rejects(p.controller.ping(),{code:'SEP_CONTROL_TIMEOUT'});assert.equal(p.controller.status().state,'blocked');}finally{p.controller.close();p.close();}
  const q=raw();try{const reply=q.controller.hello();q.controller.close();await assert.rejects(reply,{code:'SEP_CONTROL_CLOSED'});assert.equal(q.controller.status().state,'closed');}finally{q.controller.close();q.close();}
});
