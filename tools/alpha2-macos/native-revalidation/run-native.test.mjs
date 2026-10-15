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
