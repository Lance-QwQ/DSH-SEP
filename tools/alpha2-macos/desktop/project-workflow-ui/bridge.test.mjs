import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,planHash,defer} from './portable-fixture.mjs';
test('displayed current review and native confirmation commit once through host-private approval',async()=>{
 const f=await fixture();try{const r=await f.review();const value=await f.main.commit(f.event,{reviewId:r.reviewId});assert.equal(value.status,'committed');assert.equal(f.commits,1);assert.equal(f.confirms,1);await assert.rejects(f.main.commit(f.event,{reviewId:r.reviewId}));assert.equal(f.commits,1);}finally{await f.cleanup();}
});
test('renderer serialized approval and unrecognized management fields never authorize mutation',async()=>{
 const f=await fixture();try{const r=await f.review();await assert.rejects(f.main.commit(f.event,{reviewId:r.reviewId,approval:{accepted:true}}));assert.equal(f.commits,0);assert.equal(f.confirms,0);await assert.rejects(f.main.call(f.event,'commit',{planHash,approval:true}));}finally{await f.cleanup();}
});
test('subframes and stale documents cannot bind or consume a review',async()=>{
 const f=await fixture();try{await assert.rejects(f.main.begin({...f.event,senderFrame:{url:f.event.senderFrame.url}}),{code:'SEP_PROJECT_UI_SENDER'});const r=await f.review();f.main.navigate();await assert.rejects(f.main.commit(f.event,{reviewId:r.reviewId}));assert.equal(f.commits,0);}finally{await f.cleanup();}
});
test('native cancellation preserves the candidate and performs no commit',async()=>{
 const f=await fixture({confirm:async()=>({accepted:false,omissionsAcknowledged:false})});try{const r=await f.review();assert.equal((await f.main.commit(f.event,{reviewId:r.reviewId})).status,'cancelled');assert.equal(f.commits,0);assert.equal((await f.main.call(f.event,'plans',{}))[0].planHash,planHash);}finally{await f.cleanup();}
});
test('navigation while the native dialog is pending revokes approval before dispatch',async()=>{
 const entered=defer(),release=defer(),f=await fixture({confirm:async()=>{entered.resolve();return release.promise;}});
 try{const r=await f.review(),action=f.main.commit(f.event,{reviewId:r.reviewId}),rejection=assert.rejects(action);await entered.promise;assert.equal(f.main.inspectQuit().activeTasks,true);f.main.navigate();release.resolve({accepted:true,omissionsAcknowledged:false});await rejection;assert.equal(f.commits,0);}finally{await f.cleanup();}
});
test('omitted content needs the native checkbox, not renderer supplied acknowledgement',async()=>{
 const f=await fixture({omissions:true,confirm:async()=>({accepted:true,omissionsAcknowledged:false})});try{const r=await f.review();await assert.rejects(f.main.commit(f.event,{reviewId:r.reviewId}));assert.equal(f.commits,0);}finally{await f.cleanup();}
});
test('large bounded review crosses pages and preserves exact text and review binding',async()=>{
 const text='非 ASCII diff\n'.repeat(1200),f=await fixture({body:text});try{const r=await f.review();assert.equal(r.diff[0].after,text);assert.equal(r.binding.windowId,17);assert.equal(r.binding.planHash,planHash);assert.equal(JSON.stringify(r).includes(f.source),false);}finally{await f.cleanup();}
});
test('unpresented review cannot launch native confirmation',async()=>{
 const f=await fixture();try{await f.main.begin(f.event);const r=await f.main.call(f.event,'review',{planHash});await assert.rejects(f.main.commit(f.event,{reviewId:r.reviewId}));assert.equal(f.confirms,0);assert.equal(f.commits,0);}finally{await f.cleanup();}
});
test('admission close aborts pending native confirmation and keeps pending visible until settled',async()=>{
 const entered=defer(),release=defer();let signal;
 const f=await fixture({confirm:async input=>{signal=input.signal;entered.resolve();return release.promise;}});
 try{const r=await f.review(),action=f.main.commit(f.event,{reviewId:r.reviewId}),rejection=assert.rejects(action);await entered.promise;f.main.closeAdmission();assert.equal(signal.aborted,true);assert.equal(f.main.inspectQuit().activeTasks,true);release.resolve({accepted:true,omissionsAcknowledged:false});await rejection;assert.equal(f.commits,0);assert.equal(f.main.inspectQuit().activeTasks,false);}finally{await f.cleanup();}
});
test('host close never promotes unknown workflow release',async()=>{
 const f=await fixture({holdClose:true});try{await f.main.begin(f.event);const receipt=await f.host.close();assert.equal(receipt.status,'blocked');assert.equal(receipt.resourcesConfirmedReleased,false);await assert.rejects(f.main.call(f.event,'status',{}));}finally{f.main.closeAdmission();}
});

test('navigation during the asynchronous document bind cannot revive the old document',async()=>{
 const f=await fixture();try{const opening=f.main.begin(f.event);f.main.navigate();await assert.rejects(opening);await assert.rejects(f.main.call(f.event,'status',{}));assert.equal(f.commits,0);}finally{await f.cleanup();}
});

test('late page after a new document bind cannot restore the old review',async()=>{
 const entered=defer(),release=defer();let first=true;
 const f=await fixture({rpcFilter:async(method,_payload,forward)=>{const value=await forward();if(method==='page'&&first){first=false;entered.resolve();await release.promise;}return value;}});
 try{await f.main.begin(f.event);const pending=assert.rejects(f.main.call(f.event,'review',{planHash}));await entered.promise;f.main.navigate();await f.main.begin(f.event);release.resolve();await pending;assert.equal(f.confirms,0);const r=await f.main.call(f.event,'review',{planHash});await f.main.presented(f.event,{reviewId:r.reviewId,reviewSha256:r.reviewSha256});assert.equal((await f.main.commit(f.event,{reviewId:r.reviewId})).status,'committed');}finally{release.resolve();await f.cleanup();}
});

test('corrupted page hash never becomes a presented review or native confirmation',async()=>{
 const f=await fixture({rpcFilter:async(method,_payload,forward)=>{const value=await forward();if(method==='page'){const b=Buffer.from(value.data,'base64');b[0]^=1;value.data=b.toString('base64');}return value;}});
 try{await f.main.begin(f.event);await assert.rejects(f.main.call(f.event,'review',{planHash}),{code:'SEP_PROJECT_UI_PAGE'});assert.equal(f.confirms,0);assert.equal(f.commits,0);}finally{await f.cleanup();}
});
