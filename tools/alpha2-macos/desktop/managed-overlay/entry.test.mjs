import test from 'node:test';
import assert from 'node:assert/strict';
import {requireManagedInvocation,configureManagedIdentity} from './sep-mac-entry.mjs';
import {macInstallUnavailable} from './sep-mac-update-admission.mjs';
const args=['electron','--sep-recovery-connection=/tmp/sep/desktop.json'];
const env={DSH_SEP_DATA_ROOT:'/Users/test/Library/Application Support/DSH SEP',DSH_DESKTOP_NODE_BINARY:'/opt/sep/runtime/node/node',DSH_DESKTOP_DSH_DIR:'/opt/sep/program'};
test('Mac invocation binds explicit independent roots and controlled connection',()=>{
 const v=requireManagedInvocation(args,env,'darwin');assert.equal(v.connectionFile,'/tmp/sep/desktop.json');assert.equal(v.dataRoot,env.DSH_SEP_DATA_ROOT);
});
for(const bad of [[],['electron'],[...args,args[1]],['electron','--sep-recovery-connection='],['electron','--sep-recovery-connection=relative.json']])test('missing, duplicate or invalid controlled entry refuses '+JSON.stringify(bad),()=>assert.throws(()=>requireManagedInvocation(bad,env,'darwin'),/SEP_MAC_CONTROLLED_ENTRY_REQUIRED/));
for(const bad of ['/', '/tmp/../sep', '/tmp//sep', '/tmp/sep/', '/tmp/sep\0x', 'C:\\sep'])test('invalid data root refuses '+JSON.stringify(bad),()=>assert.throws(()=>requireManagedInvocation(args,{...env,DSH_SEP_DATA_ROOT:bad},'darwin'),/SEP_MAC_ROOT_REQUIRED/));
test('foreign platform and missing immutable/runtime roots refuse',()=>{
 assert.throws(()=>requireManagedInvocation(args,env,'win32'),/SEP_MAC_PLATFORM/);
 assert.throws(()=>requireManagedInvocation(args,{},'darwin'),/SEP_MAC_ROOT_REQUIRED/);
 assert.throws(()=>requireManagedInvocation(args,{...env,DSH_DESKTOP_NODE_BINARY:'/opt/sep/Electron'},'darwin'),/SEP_MAC_NODE_REQUIRED/);
});
test('configuration writes only explicit independent Electron identity',()=>{
 const paths=[],names=[],logs=[],state={};const app={setName:v=>names.push(v),setPath:(...v)=>paths.push(v),setAppLogsPath:v=>logs.push(v)};
 configureManagedIdentity(app,requireManagedInvocation(args,env,'darwin'),state);
 assert.deepEqual(names,['DSH SEP']);assert.deepEqual(paths,[['userData',env.DSH_SEP_DATA_ROOT+'/electron']]);assert.deepEqual(logs,[env.DSH_SEP_DATA_ROOT+'/logs']);assert.equal(state.DSH_HOME,env.DSH_SEP_DATA_ROOT+'/home');
});
test('unintegrated install gate rejects before calling any supplied work',()=>{let called=false;assert.throws(()=>macInstallUnavailable(()=>{called=true;}),/SEP_MAC_UPDATE_INSTALL_NOT_INTEGRATED/);assert.equal(called,false);});
