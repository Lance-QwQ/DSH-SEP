// Build-source derivation only. It cannot build, install, sign or launch an app.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const base=new URL('./assemble-project-application.mjs',import.meta.url);
const bytes=await readFile(base);
assert.equal(sha(bytes),'7c5ebf6e339615f9d65aee632d71559516132af051b61f7f39e8a83137faabde');
let source=bytes.toString('utf8');
const transformations=[
 ['../desktop/project-workflow-product/package-inputs.mjs','../desktop/project-workflow-product/pending-startup/package-inputs.mjs'],
 ['assert.equal(EXTRA_RUNTIME.length,18);','assert.equal(EXTRA_RUNTIME.length,26);'],
 ['assert.equal(new Set(rows.map(r=>r.path)).size,76);','assert.equal(new Set(rows.map(r=>r.path)).size,84);'],
 ["scope:'fresh r44 current-project application derivative; build and restore only'","scope:'fresh r44 project application with pending-plan startup derivative; build and restore only'"],
 ["info.CFBundleVersion='2';","info.CFBundleVersion='3';"],
];
for(const [before,after] of transformations){assert.equal(source.split(before).length,2,before);source=source.replace(before,after);}
const out=new URL('./assemble-pending-application.mjs',import.meta.url);
await writeFile(out,source,{flag:'wx'});
await writeFile(new URL('./assemble-pending-application.origin.json',import.meta.url),JSON.stringify({schema:1,source:'assemble-project-application.mjs',sourceSha256:sha(bytes),result:'assemble-pending-application.mjs',resultSha256:sha(source),transformations:transformations.map(([before,after])=>({before,after,occurrences:1})),scope:'Build operator derivative only; preserves original r61 operator and base application. Eight additive runtime modules; no existing runtime override except the original r61 controller mapping. Native build/signature/restore and actual product execution remain separate evidence.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'pass',transformations:transformations.length,sha256:sha(source)}));
