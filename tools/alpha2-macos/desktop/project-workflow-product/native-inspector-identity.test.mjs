// Test-only: execute the actual worker reader seam in a minimal runtime where
// Electron import is unavailable until the trusted surface-ready boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Script,createContext} from 'node:vm';

const entry=process.env.SEP_IDENTITY_TEST_WORKER??'native-worker-r5.mjs';
assert(['native-worker-r4.mjs','native-worker-r5.mjs'].includes(entry));
const {verifyWorkspaceInspector}=await import(new URL(entry,import.meta.url));
const source=await readFile(new URL(entry,import.meta.url),'utf8');
const start=source.indexOf('  const asar=join(input.application,');
const end=source.indexOf("  result.stage='surface-ready';",start);
assert(start>0&&end>start);
const seam=source.slice(start,end);
const appPath=join('/fixture/DSH SEP.app','Contents/Helpers/DSH SEP Desktop.app/Contents/Resources/app.asar');

async function fixture({pid=42,available=false,path=appPath,ready=true}={}){
 const calls=[],samples=[];let electronAvailable=available;
 const runtime=createContext({process:{pid,execPath:'/fixture/DSH SEP',versions:{electron:'fixed-fixture'},type:'browser',getBuiltinModule(name){calls.push(name);assert.equal(name,'module');return {createRequire(){return spec=>{calls.push(spec);if(!electronAvailable)throw Object.assign(Error("Cannot find module 'electron'"),{code:'MODULE_NOT_FOUND'});return {app:{getAppPath:()=>path,isReady:()=>ready}};};}};}}});
 const client={eval:code=>new Script(code).runInContext(runtime,{timeout:1000})};
 const save=async(name,value)=>samples.push({name,value});
 const context=createContext({join,input:{application:'/fixture/DSH SEP.app'},app:{desktopPid:42},client,verifyWorkspaceInspector,save,result:{}});
 const run=()=>new Script('(async()=>{'+seam+';return {readIdentity,early:result.earlyIdentity};})()').runInContext(context,{timeout:1000});
 return {calls,samples,run,setAvailable:()=>{electronAvailable=true;},later:read=>verifyWorkspaceInspector({phase:'surface-ready',read,save,expectedPid:42,expectedAppPath:appPath})};
}

test('early actual reader persists import-free process identity before Electron is available',async()=>{
 const f=await fixture(),r=await f.run();
 assert.deepEqual(f.calls,[]);assert.equal(r.early.observedPid,42);
 assert.equal(r.early.execPath,'/fixture/DSH SEP');assert.equal(r.early.electronVersion,'fixed-fixture');assert.equal(r.early.processType,'browser');
 assert.equal(f.samples[0].name,'IDENTITY-early.json');
});

test('wrong actual early PID is saved then rejected without importing Electron',async()=>{
 const f=await fixture({pid:43,available:true});
 await assert.rejects(f.run(),{code:'SEP_WORKSPACE_INSPECTOR_PID'});
 assert.equal(f.samples[0].value.observedPid,43);assert.deepEqual(f.calls,[]);
});

test('later phase still rejects an unavailable Electron module',async()=>{
 const f=await fixture(),r=await f.run();
 await assert.rejects(f.later(r.readIdentity),{code:'MODULE_NOT_FOUND'});assert.equal(f.samples.length,1);
});

test('trusted later reader retains exact installed app path rejection',async()=>{
 const f=await fixture({available:true,path:'/other/app.asar'}),r=await f.run();
 await assert.rejects(f.later(r.readIdentity),{code:'SEP_WORKSPACE_INSPECTOR_PATH'});
 assert.equal(f.samples.at(-1).name,'IDENTITY-surface-ready.json');
});

test('trusted later reader still rejects Electron not ready',async()=>{
 const f=await fixture({available:true,ready:false}),r=await f.run();
 await assert.rejects(f.later(r.readIdentity),{code:'SEP_WORKSPACE_INSPECTOR_NOT_READY'});
});

test('only later actual reader imports Electron and accepts exact ready identity',async()=>{
 const f=await fixture({available:true}),r=await f.run();
 f.calls.length=0;const later=await f.later(r.readIdentity);
 assert.equal(later.appPath,appPath);assert.equal(later.isReady,true);assert.deepEqual(f.calls,['module','electron']);
});
