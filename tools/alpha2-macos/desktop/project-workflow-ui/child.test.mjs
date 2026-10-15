import test from 'node:test';
import assert from 'node:assert/strict';
import {childFixture} from './child-harness.mjs';
import {defer} from './portable-fixture.mjs';
test('exact child duplex carries review and native confirmation fact; approval remains in host',async()=>{
 const f=await childFixture();try{const {planHash}=await f.command('stage');await f.main.begin(f.event);const r=await f.main.call(f.event,'review',{planHash});await f.main.presented(f.event,{reviewId:r.reviewId,reviewSha256:r.reviewSha256});assert.equal((await f.main.commit(f.event,{reviewId:r.reviewId})).status,'committed');assert.equal((await f.command('observe')).generation,2);}finally{await f.cleanup();}
});
test('real child IPC navigation during native confirmation cannot commit a later generation',async()=>{
 const entered=defer(),release=defer(),f=await childFixture({confirm:async()=>{entered.resolve();return release.promise;}});
 try{const {planHash}=await f.command('stage');await f.main.begin(f.event);const r=await f.main.call(f.event,'review',{planHash});await f.main.presented(f.event,{reviewId:r.reviewId,reviewSha256:r.reviewSha256});const action=assert.rejects(f.main.commit(f.event,{reviewId:r.reviewId}));await entered.promise;f.main.navigate();release.resolve({accepted:true,omissionsAcknowledged:false});await action;assert.equal((await f.command('observe')).generation,1);}finally{await f.cleanup();}
});
