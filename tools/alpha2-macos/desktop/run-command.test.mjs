import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {runOwnedCommand} from './run-command.mjs';
const root=process.env.SEP_MAC_COMMAND_TEST_ROOT??process.env.RUNNER_TEMP;
assert(root,'explicit synthetic output root required');
test('command completion includes log stream finish before caller reads',async()=>{
 const dir=await mkdtemp(join(root,'carrier-drain-')),file=join(dir,'command.log'),size=8*1024*1024;
 const result=await runOwnedCommand({file:process.execPath,args:['-e',`process.stdout.write('x'.repeat(${size}));`],logPath:file,timeoutMs:10000});
 assert.equal(result.exitCode,0);assert.equal(result.logFinished,true);assert.equal((await readFile(file)).length,size);
});
test('deadline marks failure and joins owned child termination',async()=>{
 const dir=await mkdtemp(join(root,'carrier-timeout-'));
 const result=await runOwnedCommand({file:process.execPath,args:['-e','setTimeout(()=>{},1000)'],logPath:join(dir,'command.log'),timeoutMs:30,killWaitMs:1000});
 assert.equal(result.timedOut,true);assert.equal(result.status,'fail');assert.equal(result.cleanupConfirmed,true);
});
