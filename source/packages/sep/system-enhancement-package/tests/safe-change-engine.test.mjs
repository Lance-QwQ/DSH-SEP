import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createSafeChanges} from '../src/sep-safe-change/safe-change.js';

const base=process.env.SEP_WORKFLOW_TEST_ROOT;
assert.ok(base,'Set SEP_WORKFLOW_TEST_ROOT to an isolated test directory');
await mkdir(base,{recursive:true});
const version=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
async function fixture(t,format='text',checks=[{kind:'contains',value:'candidate'}]) {
 const root=await mkdtemp(join(resolve(base),'engine-')),target=join(root,'example.txt');
 await writeFile(target,'original');let now=1000,writes=0;
 const fs={recoveryStatus:'ready',resolve:async p=>p,processPath:p=>p,
  stat:async p=>({type:'file',version:version(await lstat(p,{bigint:true}))}),
  readBytes:async p=>readFile(p),
  async writeText(p,content,mode) {assert.equal(mode.version,version(await lstat(p,{bigint:true})));await writeFile(p,content);writes++;return{version:version(await lstat(p,{bigint:true})),mutationId:'synthetic-mutation'};}};
 const engine=createSafeChanges({fs,clock:()=>now,ttlMs:1000});t.after(async()=>{engine.close();await engine.idle();});
 const context={root,key:'root-scope',sessionId:'session-a',policy:{mode:'workspace-write'}};
 const call=(args,extra={})=>engine.execute(args,{...context,...extra});
 const p=await call({action:'prepare',path:'example.txt',format,checks});
 const stage=content=>call({action:'stage',id:p.id,content});
 const verify=()=>call({action:'verify',id:p.id});
 const publish=(v,extra={})=>call({action:'publish',id:p.id,planHash:v.planHash},{confirmedHash:v.planHash,confirmedRevision:v.revision,...extra});
 return{engine,call,p,stage,verify,publish,target,setTime:v=>{now=v;},writes:()=>writes};
}
test('text candidates retain unrun syntax and runtime without blocking their explicit content gate',async t=>{
 const f=await fixture(t);await f.stage('candidate invalid python: def :');const v=await f.verify();
 assert.equal(v.validation.languageSyntax,'not_run');assert.equal(v.validation.runtimeTests,'not_run');
 assert.equal(v.validation.status,'not_run');assert.equal(v.validation.publishEligible,true);
 assert.equal(v.validation.revision,v.revision);assert.ok(v.planHash);
 const r=await f.publish(v);assert.equal(r.status,'committed');assert.equal(await readFile(f.target,'utf8'),'candidate invalid python: def :');
});
test('failed content blocks publication and preserves target bytes',async t=>{
 const f=await fixture(t);await f.stage('wrong');const v=await f.verify();
 assert.equal(v.validation.status,'fail');assert.equal(v.validation.publishEligible,false);assert.equal(v.planHash,null);
 await assert.rejects(f.publish(v),{code:'SC_NOT_VERIFIED'});assert.equal(await readFile(f.target,'utf8'),'original');
});
test('invalid JSON stays failed even when content check passes',async t=>{
 const f=await fixture(t,'json');await f.stage('{candidate');const v=await f.verify();
 assert.equal(v.validation.languageSyntax,'fail');assert.equal(v.validation.publishEligible,false);
 await assert.rejects(f.publish(v),{code:'SC_NOT_VERIFIED'});
});
test('valid JSON syntax is distinct from absent runtime tests',async t=>{
 const f=await fixture(t,'json');await f.stage('{"candidate":true}');const v=await f.verify();
 assert.equal(v.validation.languageSyntax,'pass');assert.equal(v.validation.status,'not_run');
 assert.equal(v.validation.publishEligible,true);assert.equal((await f.publish(v)).status,'committed');
});
test('stage invalidates successful evidence and prior confirmation',async t=>{
 const f=await fixture(t);await f.stage('candidate');const v=await f.verify();const next=await f.stage('candidate revision two');
 assert.equal(next.validation,null);assert.equal(next.planHash,null);
 await assert.rejects(f.publish(v),{code:'SC_NOT_VERIFIED'});const current=await f.verify();
 assert.notEqual(current.planHash,v.planHash);await assert.rejects(f.publish(v),{code:'SC_PLAN_CHANGED'});
 assert.equal((await f.publish(current)).status,'committed');
});
test('confirmation from a different revision cannot publish',async t=>{
 const f=await fixture(t);await f.stage('candidate');const v=await f.verify();
 await assert.rejects(f.publish(v,{confirmedRevision:v.revision-1}),{code:'SC_PLAN_CHANGED'});assert.equal(f.writes(),0);
});
test('current plan without trusted approval still refuses publication',async t=>{
 const f=await fixture(t);await f.stage('candidate');const v=await f.verify();
 await assert.rejects(f.publish(v,{confirmedHash:null}),{code:'SC_CONFIRMATION_REQUIRED'});assert.equal(f.writes(),0);
});
test('source edit while user is deciding refuses stale publication',async t=>{
 const f=await fixture(t);await f.stage('candidate');const v=await f.verify();await writeFile(f.target,'independent edit');
 await assert.rejects(f.publish(v),{code:'SC_SOURCE_CHANGED'});assert.equal(await readFile(f.target,'utf8'),'independent edit');
});
test('expired plan cannot publish even with matching receipt',async t=>{
 const f=await fixture(t);await f.stage('candidate');const v=await f.verify();f.setTime(2000);
 await assert.rejects(f.publish(v),{code:'SC_PLAN_GONE'});assert.equal(f.writes(),0);
});
test('session and read-only policy remain enforced',async t=>{
 const f=await fixture(t);await f.stage('candidate');const v=await f.verify();
 await assert.rejects(f.publish(v,{sessionId:'other'}),{code:'SC_OWNER'});
 await assert.rejects(f.publish(v,{policy:{mode:'read-only'}}),{code:'SC_READ_ONLY'});assert.equal(f.writes(),0);
});
test('repeated publication returns committed receipt without a second write',async t=>{
 const f=await fixture(t);await f.stage('candidate');const v=await f.verify();const first=await f.publish(v);
 assert.deepEqual(await f.publish(v),first);assert.equal(f.writes(),1);
});
