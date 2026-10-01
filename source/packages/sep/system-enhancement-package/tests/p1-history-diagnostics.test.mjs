import test from 'node:test';
import assert from 'node:assert/strict';
import {safeP1Failure} from '../src/p1-failures.js';
test('workflow capacity diagnostics retain their explicit code without native prose',()=>{
 for(const code of ['P1_HISTORY_BYTES_LIMIT','P1_HISTORY_OUTPUT_LIMIT'])assert.deepEqual(safeP1Failure({code,message:'PRIVATE_NATIVE_PROSE'},'history','suite'),{code,stage:'history',source:'suite'});
 assert.equal(safeP1Failure({code:'UNREVIEWED_NATIVE_ERROR'},'history','suite').code,'P1_CHILD_FAILED');
});
