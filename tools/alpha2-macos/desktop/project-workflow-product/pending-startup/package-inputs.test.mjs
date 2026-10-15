// Portable current-source packaging binding, not a Mac native certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PENDING_INPUTS,EXTRA_RUNTIME,BUSINESS_ENTRY} from './package-inputs.mjs';
test('current pending runtime manifest binds all eight actual source files without widening the package',async()=>{
 assert.equal(PENDING_INPUTS.length,8);assert.equal(EXTRA_RUNTIME.length,26);
 assert.equal(new Set(PENDING_INPUTS.map(row=>row.target)).size,8);
 assert.equal(BUSINESS_ENTRY,'Resources/product/runtime/desktop/project-workflow-product/pending-startup/standalone.mjs');
 for(const row of PENDING_INPUTS){
  assert.equal(row.source,row.target);assert.match(row.source,/^desktop\/project-workflow-product\/pending-startup\/[a-z-]+\.mjs$/);
  const bytes=await readFile(new URL('../../../'+row.source,import.meta.url));
  assert.equal(bytes.length,row.bytes,row.source);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,row.source);
 }
});
