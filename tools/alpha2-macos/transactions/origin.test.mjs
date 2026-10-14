import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const origin=JSON.parse(await readFile(join(root,'origin.json'),'utf8'));
for(const row of origin.derivations)test('exact recorded derivation: '+row.resultPath,async()=>{
 assert.match(row.sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(basename(row.resultPath),row.resultPath);
 let source=await readFile(join(root,'origin-source',basename(row.sourcePath)));
 assert.equal(digest(source),row.sourceSha256);
 let result=source.toString('utf8');
 for(const change of row.changes){
  assert.equal(typeof change.before,'string');assert(change.before.length>0);
  assert.equal(result.split(change.before).length-1,1,'unique transform anchor');
  result=result.replace(change.before,()=>change.after);
 }
 assert.equal(digest(Buffer.from(result)),row.resultSha256);
 assert.equal(result,await readFile(join(root,row.resultPath),'utf8'));
});
