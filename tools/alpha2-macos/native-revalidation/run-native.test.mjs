import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {access} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const runner=fileURLToPath(new URL('./run-native.mjs',import.meta.url));
const tap=(changes={})=>Object.entries({tests:3,pass:3,fail:0,cancelled:0,skipped:0,todo:0,...changes}).map(([k,v])=>'# '+k+' '+v).join('\n')+'\n';
for(const [name,input,expected]of [['complete',tap(),true],['missing summary','TAP version 13\nok 1 - incomplete\n',false],['skip',tap({pass:2,skipped:1}),false],['failed',tap({pass:2,fail:1}),false],['wrong count',tap({tests:2,pass:2}),false],['duplicate summary',tap()+tap(),false]])test('TAP acceptance '+name,async()=>{
 const {verifyTap}=await import('./runner-contract.mjs');if(expected)assert.deepEqual(verifyTap(input,3),{tests:3,pass:3,fail:0,cancelled:0,skipped:0,todo:0});else assert.throws(()=>verifyTap(input,3),{code:'SEP_NATIVE_TEST_COUNTS'});
});
test('actual unsupported host cannot create native output or emulate Darwin',async t=>{
 if(process.platform==='darwin'&&process.arch==='arm64'){t.skip('This negative path needs a genuinely unsupported host');return;}
 const root=process.env.SEP_NATIVE_RUNNER_TEST_ROOT;assert(root,'explicit temporary path required');const output=join(root,'must-not-create');const r=spawnSync(process.execPath,[runner,output],{encoding:'utf8',timeout:10000});assert.equal(r.status,78);assert.equal(JSON.parse(r.stdout).code,'NATIVE_MAC_REQUIRED');await assert.rejects(access(output),{code:'ENOENT'});
});

test('new workflow generation exactly replays the original fixture and definitions',async()=>{const {verifyWorkflowOrigin}=await import('./workflow-origin.mjs');assert.deepEqual(await verifyWorkflowOrigin(),{status:'pass',definitions:2});});
const dfSample='Filesystem 512-blocks Used Available Capacity Mounted on\n/dev/disk3s5 100000 10000 90000 10% /System/Volumes/Data\n';
const volumeFixture=()=>({df:{device:'/dev/disk3s5',mountPoint:'/System/Volumes/Data'},info:{FilesystemType:'apfs',Mounted:true,DeviceNode:'/dev/disk3s5',MountPoint:'/System/Volumes/Data'},root:'/Users/runner/work/_temp/native',rootDev:123n,mountDev:123n,mountReal:'/System/Volumes/Data'});
test('native volume query resolves df device before calling diskutil',async()=>{
 const {parseDfVolume}=await import('./runner-contract.mjs');assert.deepEqual(parseDfVolume(dfSample),{device:'/dev/disk3s5',mountPoint:'/System/Volumes/Data'});
 assert.deepEqual(parseDfVolume(dfSample.replace('/System/Volumes/Data','/Volumes/Test Volume')),{device:'/dev/disk3s5',mountPoint:'/Volumes/Test Volume'});
});
test('native volume mapping rejects absent, ambiguous and non-device df results',async()=>{
 const {parseDfVolume}=await import('./runner-contract.mjs');for(const value of ['',dfSample.split('\n')[0]+'\n',dfSample+dfSample.split('\n')[1]+'\n',dfSample.replace('/dev/disk3s5','/tmp/device'),dfSample.replace('10%','bad')])assert.throws(()=>parseDfVolume(value),{code:'SEP_NATIVE_VOLUME_MAPPING'});
});
test('APFS admission binds mounted device and actual root and mount filesystem identities',async()=>{
 const {verifyVolumeBinding}=await import('./runner-contract.mjs');assert.deepEqual(verifyVolumeBinding(volumeFixture()),{type:'apfs',device:'/dev/disk3s5',mountPoint:'/System/Volumes/Data',deviceId:'123'});
 const v=volumeFixture();v.df.mountPoint='/';v.info.MountPoint='/';v.mountReal='/';assert.equal(verifyVolumeBinding(v).mountPoint,'/');
});
test('APFS admission rejects wrong device, mount, filesystem and stat identity',async()=>{
 const {verifyVolumeBinding}=await import('./runner-contract.mjs');for(const change of [v=>v.info.DeviceNode='/dev/disk9s1',v=>v.info.Mounted=false,v=>v.info.FilesystemType='hfs',v=>v.info.MountPoint='/other',v=>v.mountReal='/aliased',v=>v.mountDev=124n,v=>v.root='relative',v=>v.info.Error=true]){const v=volumeFixture();change(v);assert.throws(()=>verifyVolumeBinding(v),{code:'SEP_NATIVE_VOLUME_BINDING'});}
});
test('native runner queries discovered device and binds live stat.dev before helper compilation',async()=>{
 const {readFile}=await import('node:fs/promises'),source=await readFile(runner,'utf8');assert(source.includes("'/bin/df',['-P',root]"));assert(source.includes("['info','-plist',volume.device]"));assert(source.includes('rootDev:rootStat.dev'));assert(source.includes('mountDev:mountStat.dev'));assert(source.indexOf('verifyVolumeBinding({')<source.indexOf("await run('compile-tree'"));
});