import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {preflight} from '../../project-workflow/native-fixture.mjs';
import {childFixture} from './child-harness.mjs';
import {defer} from './portable-fixture.mjs';
before(preflight);
async function review(f){const {planHash}=await f.command('stage');await f.main.begin(f.event);const r=await f.main.call(f.event,'review',{planHash});await f.main.presented(f.event,{reviewId:r.reviewId,reviewSha256:r.reviewSha256});return r;}
test('native single Profile commits reviewed bytes over exact owned child IPC and preserves source',async()=>{
 const f=await childFixture({native:true});try{const r=await review(f);await f.main.commit(f.event,{reviewId:r.reviewId});const after=await f.command('observe');assert.equal(after.text,'changed\n');assert.equal(after.original,'original\n');await assert.rejects(f.main.commit(f.event,{reviewId:r.reviewId}));}finally{await f.cleanup();}
});
test('native single Profile cancellation leaves the review candidate and original generation intact',async()=>{
 const f=await childFixture({native:true,confirm:async()=>({accepted:false,omissionsAcknowledged:false})});try{const r=await review(f);assert.equal((await f.main.commit(f.event,{reviewId:r.reviewId})).status,'cancelled');assert.equal((await f.main.call(f.event,'plans',{})).length,1);const after=await f.command('observe');assert.equal(after.text,'original\n');assert.equal(after.original,'original\n');}finally{await f.cleanup();}
});
test('native host closes only after pending main confirmation is revoked; no late commit',async()=>{
 const entered=defer(),release=defer(),f=await childFixture({native:true,confirm:async()=>{entered.resolve();return release.promise;}});
 try{const r=await review(f),action=assert.rejects(f.main.commit(f.event,{reviewId:r.reviewId}));await entered.promise;f.main.closeAdmission();assert.equal(f.main.inspectQuit().activeTasks,true);release.resolve({accepted:true,omissionsAcknowledged:false});await action;assert.equal((await f.command('observe')).text,'original\n');}finally{await f.cleanup();}
});
