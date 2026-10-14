import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deriveExercise} from './derive.mjs';
const source=await readFile(new URL('../../package/exercise-application.mjs',import.meta.url));
test('derivation accepts exact frozen operator and records its immutable origin',()=>{
 const value=deriveExercise(source);assert.equal(value.origin.inputSha256,'ecb9321b2c23ee9ef4e67117f31fbe6b86de9745c5f5a47994690c124e59d979');
 assert.equal(value.origin.transforms.length,4);assert.equal(value.origin.productModified,false);assert.equal(value.origin.plannedCycles,3);assert.equal(typeof value.source,'string');
});
test('a changed operator is rejected before a derived script can be emitted',()=>{
 const modified=Buffer.concat([source,Buffer.from('\n// different operator\n')]);
 assert.throws(()=>deriveExercise(modified),{code:'SEP_HIDE_ORIGIN_CHANGED'});
});
