// Mechanical evidence for the exact additive build/test carriers, not a
// substitute for native application or installation execution.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function replay(root,row){
 const input=await readFile(new URL(row.base??row.source,root));assert.equal(sha(input),row.sourceSha256);
 let text=input.toString('utf8');
 for(const change of row.transformations){assert.equal(change.occurrences,1);assert.equal(text.split(change.before).length,2);text=text.replace(change.before,change.after);}
 const output=await readFile(new URL(row.result,root));assert.equal(sha(output),row.resultSha256);assert.deepEqual(output,Buffer.from(text));
 return {path:row.result,sourceSha256:row.sourceSha256,resultSha256:row.resultSha256,transformations:row.transformations.length};
}
const buildRoot=new URL('.',import.meta.url),testRoot=new URL('../desktop/project-workflow-product/',import.meta.url);
const build=JSON.parse(await readFile(new URL('assemble-pending-application.origin.json',buildRoot))),tests=JSON.parse(await readFile(new URL('NATIVE-PENDING-ORIGIN.json',testRoot)));
assert.equal(build.transformations.length,5);assert.equal(tests.files.length,3);assert.deepEqual(tests.files.map(r=>r.transformations.length),[1,1,3]);
const rows=[await replay(buildRoot,build)];for(const row of tests.files)rows.push(await replay(testRoot,row));
const pending=JSON.parse(await readFile(new URL('pending-startup/package-inputs.json',testRoot)));
assert.equal(pending.totalRuntimeCount,84);assert.equal(pending.baseRuntimeCount,76);assert.equal(pending.extraRuntimeCount,8);
const {EXTRA_RUNTIME,BUSINESS_ENTRY}=await import('../desktop/project-workflow-product/pending-startup/package-inputs.mjs');
assert.equal(EXTRA_RUNTIME.length,26);assert.equal(new Set(EXTRA_RUNTIME).size,26);assert.equal(BUSINESS_ENTRY,'Resources/product/runtime/desktop/project-workflow-product/pending-startup/standalone.mjs');
assert.equal(pending.files.length,8);
const sourceRoot=new URL('../',import.meta.url);
for(const row of pending.files){assert.equal(row.target,row.source);assert(row.target.startsWith('desktop/project-workflow-product/pending-startup/'));const b=await readFile(new URL(row.source,sourceRoot));assert.equal(sha(b),row.sha256);assert.equal(b.length,row.bytes);}
console.log(JSON.stringify({schema:1,status:'pass',scope:'exact additive build and test carrier origins plus runtime input closure; native behavior remains separate',origins:rows,runtime:{base:76,added:8,total:84,originalModulesRetained:true}},null,2));
