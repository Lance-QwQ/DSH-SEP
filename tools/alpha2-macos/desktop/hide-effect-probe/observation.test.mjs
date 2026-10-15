import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {admitVisibleSnapshot,observeHiddenEffect} from './observation.mjs';
const input=JSON.parse(await readFile(new URL('./r48-cases.json',import.meta.url)));
const envelope=(row,phase)=>{const r=row.records[phase],c=r.command;return {action:c.args[0],pid:Number(c.args[1]),bundlePath:c.args[2],exitCode:c.code,signal:c.signal,errorCode:null,killed:c.forced||c.deadline,stdout:r.stdout,stderr:r.stderr,parsed:JSON.parse(r.stdout)};};
const specimen=()=>{const row=input.rows[0];return {before:envelope(row,'snapshot'),request:envelope(row,'hide'),after:envelope(row,'after')};};
const mutate=(r,patch)=>{r.parsed={...r.parsed,...patch};r.stdout=JSON.stringify(r.parsed);return r;};
for(const row of input.rows)test('r48 '+row.case.variant+' records observed hide despite false API Boolean',async()=>{
 const identity=admitVisibleSnapshot(envelope(row,'snapshot'));
 const actual=await observeHiddenEffect({identity,request:envelope(row,'hide'),snapshot:async()=>envelope(row,'after')});
 assert.equal(actual.status,'pass');assert.equal(actual.observedHidden,true);assert.equal(actual.apiRequestSent,false);assert.equal(actual.actionExitCode,1);assert.equal(actual.beforeHidden,false);
});
test('an already hidden baseline cannot prove a new hide effect',()=>{
 const {before}=specimen();mutate(before,{hidden:true});assert.throws(()=>admitVisibleSnapshot(before),{code:'SEP_HIDE_BASELINE'});
});
test('exact identity is enforced for action and fresh snapshot',async()=>{
 for(const stage of ['request','after'])for(const field of ['pid','birthSeconds','birthMicroseconds','bundleIdentifier','bundlePath']){
  const x=specimen();
  if(field==='bundlePath')x[stage].bundlePath+='.other';else mutate(x[stage],{[field]:typeof x[stage].parsed[field]==='number'?x[stage].parsed[field]+1:x[stage].parsed[field]+'.other'});
  await assert.rejects(observeHiddenEffect({identity:admitVisibleSnapshot(x.before),request:x.request,snapshot:async()=>x.after}),{code:'SEP_HIDE_IDENTITY'});
 }
 const x=specimen();mutate(x.before,{pid:x.before.pid+1});assert.throws(()=>admitVisibleSnapshot(x.before),{code:'SEP_HIDE_IDENTITY'});
});
test('exit1 is permitted only for a parsed pass hide receipt with Boolean false',async()=>{
 for(const change of [
  r=>{r.exitCode=78;},r=>{r.exitCode='1';},r=>{r.signal='SIGTERM';},r=>{r.killed=true;},
  r=>{r.errorCode='ETIMEDOUT';},r=>{r.action='quit';},r=>mutate(r,{status:'fail'}),
  r=>mutate(r,{requestSent:0}),r=>mutate(r,{requestSent:true}),r=>{r.stdout='{'},r=>mutate(r,{terminated:true})
 ]){
  const x=specimen();change(x.request);let snapshots=0;
  await assert.rejects(observeHiddenEffect({identity:admitVisibleSnapshot(x.before),request:x.request,snapshot:async()=>{snapshots++;return x.after;}}));assert.equal(snapshots,0);
 }
});
test('snapshot requires clean exit0 and cannot use the action process cached hidden value',async()=>{
 for(const change of [r=>{r.exitCode=1;},r=>{r.killed=true;},r=>{r.signal='SIGTERM';},r=>{r.errorCode='EPIPE';},r=>{r.stdout='{}';},r=>{r.action='hide';}]){
  const x=specimen();change(x.after);
  await assert.rejects(observeHiddenEffect({identity:admitVisibleSnapshot(x.before),request:x.request,snapshot:async()=>x.after}));
 }
});
test('API accepted true alone cannot pass when fresh snapshots stay visible',async()=>{
 const x=specimen();x.request.exitCode=0;mutate(x.request,{requestSent:true});mutate(x.after,{hidden:false,active:true});
 await assert.rejects(observeHiddenEffect({identity:admitVisibleSnapshot(x.before),request:x.request,snapshot:async()=>x.after,timeoutMs:20,intervalMs:1}),{code:'SEP_HIDE_EFFECT_DEADLINE'});
});
test('bounded fresh observation can establish a delayed effect without resending hide',async()=>{
 const x=specimen();let calls=0;
 const result=await observeHiddenEffect({identity:admitVisibleSnapshot(x.before),request:x.request,snapshot:async()=>{calls++;return calls===1?mutate(structuredClone(x.after),{hidden:false}):x.after;},timeoutMs:100,intervalMs:1});
 assert.equal(result.status,'pass');assert.equal(calls,2);assert.equal(result.snapshots,2);
});
