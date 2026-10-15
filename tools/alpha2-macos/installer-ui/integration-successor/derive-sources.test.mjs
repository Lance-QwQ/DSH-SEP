// Synthetic build identifiers are used only in memory. They are not release pins.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deriveSuccessorSources} from './derive-sources.mjs';
const paths=['package/restore-installer-application.mjs','installer-ui/integration/run-full.mjs','installer-ui/integration/main-result.test.mjs','installer-ui/integration/installed-startup.mjs','installer-ui/integration/test-main.m','installer-ui/integration/installer-observer.m','installer-ui/integration/ci-job.yml'];
const source=new Map(await Promise.all(paths.map(async p=>[p,await readFile(new URL('../../'+p,import.meta.url))])));
const sha=b=>createHash('sha256').update(b).digest('hex');
const synthetic={installerBuildCommit:'1234567890abcdef1234567890abcdef12345678',installerArchiveSha256:'a5'.repeat(32)};
const derive=()=>deriveSuccessorSources(source,synthetic),body=(r,p)=>r.files.find(f=>f.path===p)?.bytes.toString('utf8');

test('generates only additive test operators and unchanged native test entry copies',()=>{
 const r=derive();assert.equal(r.files.length,8);assert.equal(r.pinsGenerated,false);
 for(const name of ['test-main.m','installer-observer.m'])assert.deepEqual(r.files.find(f=>f.path==='installer-ui/integration-r79/'+name).bytes,source.get('installer-ui/integration/'+name));
 assert(r.files.every(f=>f.path.startsWith('installer-ui/integration-r79/')||f.path==='package/restore-installer-application-r78.mjs'));
});
test('refuses any drift in a verified r72 input instead of generating an unreviewed carrier',()=>{
 const changed=new Map(source);changed.set(paths[1],Buffer.concat([changed.get(paths[1]),Buffer.from('\n')]));
 assert.throws(()=>deriveSuccessorSources(changed,synthetic),{code:'SEP_INSTALLER_DERIVATION_SOURCE'});
});
test('refuses missing, malformed or the historical installer build identity',()=>{
 for(const options of [{},{...synthetic,installerBuildCommit:'not-ready'},{...synthetic,installerArchiveSha256:'pending'},{...synthetic,installerBuildCommit:'1b5bcfa5c8a88fda7ad5727ee104eef8f8f0ad04'}])assert.throws(()=>deriveSuccessorSources(source,options),{code:'SEP_INSTALLER_DERIVATION_BINDING'});
});
test('binds new known r74 payload facts while preserving six behavioral definitions',()=>{
 const r=derive(),run=body(r,'installer-ui/integration-r79/run-full.mjs'),tests=body(r,'installer-ui/integration-r79/main-result.test.mjs');
 for(const value of ['e3d13eb3ce1dcc45e3afdb755682d3c56db25d47c7811159860cbb298c026834','ff97b34568f4cdf3d380191256b5523f1f27049b7e0c3a9afba16060da9fbc2b','eadad5720380302d460bea68f77d9cdfdf5dc4f7b7f77dd9cf0d10df3f7713a1','20dd042cdf53752e0ce4f6c93ae919bf895c844f0772cdf9f5b881b29b654107',synthetic.installerBuildCommit])assert(run.includes(value));
 assert.equal((tests.match(/^test\(/gm)??[]).length,6);assert(tests.includes('entries,29374'));assert(tests.includes('totalBytes,1794083023'));assert(!tests.includes('29365'));
});
test('does not alter same-account paths, operation deadlines or actual failure cleanup',()=>{
 const r=derive(),before=source.get(paths[1]).toString('utf8'),after=body(r,'installer-ui/integration-r79/run-full.mjs');
 for(const name of ['originalLifecycle','realButtons','normalClose','account']){const a=before.indexOf('function '+name+'('),b=after.indexOf('function '+name+'(');assert(a>=0&&b>=0);}
 const timing=s=>[...s.replace(/assert\.equal\(config\.receipt\.inventory\.(?:entries\.length|totalBytes),\d+\);/g,'').matchAll(/(?:ms=|timeout=|},|,)(\d{4,})\)/g)].map(x=>x[0]);
 assert.deepEqual(timing(after),timing(before));
 const cleanup=s=>s.slice(s.lastIndexOf('\nfinally{'),s.lastIndexOf('\n result.inputs='));assert.equal(cleanup(after),cleanup(before));
 for(const value of ['Applications/DSH SEP.app','Library/Application Support/DSH SEP/alpha2-mac-finder-preview','Library/Application Support/DSH SEP Installer'])assert.equal(after.split(value).length,before.split(value).length);
});
test('workflow keeps fresh account and download-only token while separating r79 outputs',()=>{
 const workflow=body(derive(),'installer-ui/integration-r79/ci-job.yml');assert(workflow.includes('timeout-minutes: 60'));assert.equal(workflow.match(/SEP_ARTIFACT_TOKEN/g).length,1);assert(workflow.includes('fixed-installer-r79'));assert(workflow.includes('installer-integration-r79'));assert(workflow.includes('restore-installer-application-r78.mjs'));assert(workflow.includes('integration-r79/run-full.mjs'));
});
test('all source transformations independently replay to exact output bytes',()=>{
 const r=derive();for(const o of r.origins){let bytes=source.get(o.source);assert.equal(sha(bytes),o.sourceSha256);let text=bytes.toString('utf8');for(const t of o.transforms){assert.equal(text.split(t.from).length-1,t.occurrences);text=text.split(t.from).join(t.to);}assert.equal(sha(Buffer.from(text)),o.resultSha256);assert.deepEqual(Buffer.from(text),r.files.find(f=>f.path===o.result).bytes);}
});
test('installed startup origin remains traceable to r72 and only replaces archive binding',()=>{
 const r=derive(),o=JSON.parse(body(r,'installer-ui/integration-r79/installed-startup.origin.json'));assert.equal(o.source,'installer-ui/integration/installed-startup.mjs');assert.equal(o.sourceSha256,sha(source.get(o.source)));assert.equal(o.transforms.length,1);assert.equal(o.resultSha256,sha(r.files.find(f=>f.path===o.result).bytes));
});
