import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeConfirmation} from './native-confirmation.mjs';
const review={reviewId:'review',reviewSha256:'a'.repeat(64),binding:{projectId:'current-project',planHash:'b'.repeat(64),baseGeneration:1},changes:[{path:'a.txt',kind:'modified'}],coverage:{omitted:[]}};
test('native confirmation is parented, cancel-default, signal-bound, with retained review identity',async()=>{
 const window={},abort=new AbortController();let options;
 const confirm=createNativeConfirmation({showMessageBox:async(parent,input)=>{assert.equal(parent,window);options=input;return {response:1,checkboxChecked:false};}});
 assert.deepEqual(await confirm({window,review,signal:abort.signal}),{accepted:true,omissionsAcknowledged:false});assert.equal(options.signal,abort.signal);assert.equal(options.cancelId,0);assert.equal(options.defaultId,0);assert.match(options.detail,new RegExp(review.reviewSha256));
});
test('omissions acknowledgement is read only from the native dialog result',async()=>{
 const confirm=createNativeConfirmation({showMessageBox:async(_,options)=>{assert.equal(options.checkboxChecked,false);assert.equal(typeof options.checkboxLabel,'string');return {response:0,checkboxChecked:true};}});
 assert.deepEqual(await confirm({window:{},review:{...review,coverage:{omitted:[{path:'binary',reason:'binary'}]}},signal:new AbortController().signal}),{accepted:false,omissionsAcknowledged:false});
});
