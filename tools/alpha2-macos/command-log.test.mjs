import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {loggedCommand} from './command-log.mjs';
test('a failed real child preserves phase, exit and bounded synthetic diagnostic',{timeout:10000},async()=>{
 const root=process.env.SEP_MACOS_DIAGNOSTIC_TEST_ROOT;assert(root&&isAbsolute(root));await mkdir(root,{mode:0o700});
 await assert.rejects(loggedCommand(root,'synthetic-failure',process.execPath,['-e','process.stdout.write("synthetic-out");process.stderr.write("synthetic-err");process.exitCode=7;']),e=>e.code===7&&e.testStage==='synthetic-failure');
 const log=await readFile(join(root,'synthetic-failure.log'),'utf8');assert(log.includes('synthetic-out'));assert(log.includes('synthetic-err'));
});
