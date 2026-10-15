import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {performWelcomeAction,verifyWorkspaceInspector} from './workspace-diagnostic-worker.mjs';
import {classifyDiagnostic} from './workspace-diagnostic.mjs';
const complete={status:'pass',cleanup:{status:'pass',resourcesConfirmedReleased:true},workspaceReady:{surface:'workspace',ready:true,blocked:false},badge:{width:32,height:14,officialHarnessPreserved:true}};
test('diagnostic pass requires its own workspace, dimensions and exact clean worker exit',()=>{
 assert.equal(classifyDiagnostic(complete,{code:0,signal:null}).status,'pass');
 assert.equal(classifyDiagnostic({...complete,workspaceReady:{surface:'welcome'}},{code:0,signal:null}).status,'fail');
 assert.equal(classifyDiagnostic({...complete,badge:{width:31,height:14,officialHarnessPreserved:true}},{code:0,signal:null}).status,'fail');
});
test('missing or unconfirmed cleanup remains blocked even if UI checks passed',()=>{
 assert.equal(classifyDiagnostic(complete,null).status,'blocked');
 assert.equal(classifyDiagnostic({...complete,cleanup:{status:'blocked'}},{code:0,signal:null}).status,'blocked');
});
test('successful later cleanup cannot turn the original failed diagnostic into a pass',()=>{
 assert.equal(classifyDiagnostic({...complete,status:'fail',code:'SEP_WORKSPACE_ACTION_UNKNOWN'},{code:0,signal:null}).status,'fail');
 assert.equal(classifyDiagnostic(complete,{code:1,signal:null}).status,'fail');
});
function actionFixture({hidden=false,inert=false,disabled=false,duplicates=false}={}){
 let clicks=0;const button={tagName:'BUTTON',disabled,isConnected:true,getAttribute:()=>null,closest:()=>inert?{}:null,checkVisibility:()=>!hidden,getBoundingClientRect:()=>({width:120,height:30,left:10,top:10,right:130,bottom:40}),click(){clicks++;}};
 const sandbox={document:{querySelectorAll:()=>duplicates?[button,button]:[button]},location:{protocol:'file:',pathname:'/app.asar/renderer/welcome.html'},innerWidth:600,innerHeight:700};
 const invoke=(id,dispatch=true)=>vm.runInNewContext('('+performWelcomeAction.toString()+')('+JSON.stringify(id)+','+dispatch+')',sandbox,{timeout:500});return {invoke,clicks:()=>clicks};
}
test('only the real allowed button action is dispatched once; readiness observation does not click',()=>{
 const f=actionFixture();assert.equal(f.invoke('api-key',false).ready,true);assert.equal(f.clicks(),0);
 assert.equal(f.invoke('api-key').dispatched,true);assert.equal(f.clicks(),1);
});
test('hidden, inert, disabled and ambiguous controls do not receive synthetic clicks',()=>{
 for(const options of [{hidden:true},{inert:true},{disabled:true},{duplicates:true}]){const f=actionFixture(options);assert.throws(()=>f.invoke('skip-key'),e=>e.code==='SEP_WORKSPACE_ACTION_UNAVAILABLE');assert.equal(f.clicks(),0);}
});
test('unexpected controls cannot invoke account login, save-key or arbitrary DOM actions',()=>{
 for(const id of ['sign-in','save-key','anything']){const f=actionFixture();assert.throws(()=>f.invoke(id),e=>e.code==='SEP_WORKSPACE_ACTION_REJECTED');assert.equal(f.clicks(),0);}
});
test('Inspector identity is recorded before exact PID, path and ready acceptance',async()=>{
 const observed={observedPid:101,appPath:'/fixed.app/Contents/Resources/app.asar',isReady:true},saved=[];
 const receipt=await verifyWorkspaceInspector({phase:'welcome-ready',read:async()=>observed,save:async(name,value)=>saved.push({name,value}),expectedPid:101,expectedAppPath:observed.appPath});
 assert.deepEqual(saved,[{name:'IDENTITY-welcome-ready.json',value:{schema:1,phase:'welcome-ready',...observed,expectedPid:101,expectedAppPath:observed.appPath}}]);assert.deepEqual(receipt,saved[0].value);
});
test('Inspector mismatches retain the original observation and never count as identity acceptance',async()=>{
 for(const [patch,code] of [[{observedPid:102},'SEP_WORKSPACE_INSPECTOR_PID'],[{appPath:'/other/app.asar'},'SEP_WORKSPACE_INSPECTOR_PATH'],[{isReady:false},'SEP_WORKSPACE_INSPECTOR_NOT_READY']]){
  const observed={observedPid:101,appPath:'/fixed/app.asar',isReady:true,...patch},saved=[];
  await assert.rejects(verifyWorkspaceInspector({phase:'welcome-ready',read:async()=>observed,save:async(name,value)=>saved.push({name,value}),expectedPid:101,expectedAppPath:'/fixed/app.asar'}),e=>e.code===code);
  assert.equal(saved.length,1);assert.equal(saved[0].name,'IDENTITY-welcome-ready.json');assert.deepEqual(saved[0].value,{schema:1,phase:'welcome-ready',...observed,expectedPid:101,expectedAppPath:'/fixed/app.asar'});
 }
});
test('Inspector identity persistence failure cannot silently pass',async()=>{
 const failure=Error('synthetic storage failure');
 await assert.rejects(verifyWorkspaceInspector({phase:'welcome-ready',read:async()=>({observedPid:101,appPath:'/fixed/app.asar',isReady:true}),save:async()=>{throw failure;},expectedPid:101,expectedAppPath:'/fixed/app.asar'}),e=>e===failure);
});
test('early observation can retain unfinished app initialization but wrong PID always refuses',async()=>{
 const seen=[];const read=async()=>({observedPid:101,appPath:null,isReady:false}),save=async(name,value)=>seen.push({name,value});
 const early=await verifyWorkspaceInspector({phase:'early',read,save,expectedPid:101,expectedAppPath:'/fixed/app.asar'});assert.equal(early.phase,'early');assert.equal(early.isReady,false);assert.equal(seen[0].name,'IDENTITY-early.json');
 await assert.rejects(verifyWorkspaceInspector({phase:'early',read,save,expectedPid:102,expectedAppPath:'/fixed/app.asar'}),e=>e.code==='SEP_WORKSPACE_INSPECTOR_PID');assert.equal(seen.length,2);
});
