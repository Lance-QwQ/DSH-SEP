import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function verifyWorkflowOrigin(){
 const origin=JSON.parse(await readFile(new URL('./WORKFLOW-ORIGIN.json',import.meta.url),'utf8'));assert.equal(origin.schema,1);assert.equal(origin.definitions.length,2);
 for(const row of origin.definitions){assert.match(row.source,/^project-workflow\/native-(?:fixture\.mjs|workflow\.test\.mjs)$/);assert.match(row.target,/^workflow(?:-fixture\.mjs|\.test\.mjs)$/);let source=await readFile(new URL('../'+row.source,import.meta.url),'utf8');assert.equal(hash(source),row.sourceSha256);for(const [before,after,count=1]of row.changes){assert.equal(source.split(before).length-1,count);source=source.split(before).join(after);}assert.equal(hash(source),row.resultSha256);assert.equal(await readFile(new URL('./'+row.target,import.meta.url),'utf8'),source);}
 return {status:'pass',definitions:2};
}
