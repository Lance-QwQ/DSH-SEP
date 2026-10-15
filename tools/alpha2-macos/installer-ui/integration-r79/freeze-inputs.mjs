// Capture the exact successor operator closure; no product build or execution.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url)),own=fileURLToPath(new URL('./',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const native=JSON.parse(await readFile(resolve(root,'package/installer-native-inputs.json'),'utf8')),origin=JSON.parse(await readFile(resolve(own,'ORIGIN.json'),'utf8'));
const explicit=[...native.files.map(r=>r.path),'package/installer-native-inputs.json','package/restore-installer-application-r78.mjs','package/installer-restore-pins-r78.json','package/application-observer.m',...origin.origins.map(x=>x.source),...['run-full.mjs','test-main.m','installer-observer.m','main-result.test.mjs','installed-startup.mjs','installed-startup.origin.json','CONTRACT.json','README.md','ORIGIN.json','ci-job.yml','freeze-inputs.mjs'].map(p=>'installer-ui/integration-r79/'+p),...['derive-sources.mjs','derive-sources.test.mjs','generate-r79.mjs'].map(p=>'installer-ui/integration-successor/'+p)];
const seen=new Map();
explicit.push(origin.contractSource.path);
async function add(path){assert(!path.includes('..')&&!path.startsWith('/'));if(seen.has(path))return;const absolute=resolve(root,path),bytes=await readFile(absolute);seen.set(path,{path,sha256:hash(bytes),bytes:bytes.length});if(path.endsWith('.mjs'))for(const m of bytes.toString('utf8').matchAll(/(?:^|[;\n])\s*import\s*(?:[^'";\n]+?\s*from\s*)?['"](\.[^'"]+)['"]/g)){const p=resolve(dirname(absolute),m[1]);assert(p.startsWith(root));await add(relative(root,p).replaceAll('\\','/'));}}
for(const path of explicit)await add(path);
assert.equal(seen.get(origin.contractSource.path).sha256,origin.contractSource.sha256);
for(const row of native.files)assert.equal(seen.get(row.path).sha256,row.sha256);
for(const row of origin.origins){assert.equal(seen.get(row.source).sha256,row.sourceSha256);const b=await readFile(resolve(root,row.result));assert.equal(hash(b),row.resultSha256);let text=(await readFile(resolve(root,row.source))).toString('utf8');for(const t of row.transforms){assert.equal(text.split(t.from).length-1,t.occurrences);text=text.split(t.from).join(t.to);}assert.deepEqual(Buffer.from(text),b);}
const pins=JSON.parse(await readFile(resolve(root,'package/installer-restore-pins-r78.json'),'utf8'));
assert.equal(pins.status,'ready');assert.equal(pins.commit,'e2cdf833051e9ff0b451d0885549f38690220acd');assert.equal(pins.archiveSha256,'6043ddd8305009e9013de46f85f7660cdc775d4320987553808eb9f8ec01db4f');assert.equal(origin.bindings.installerBuildCommit,pins.commit);assert.equal(origin.bindings.installerArchiveSha256,pins.archiveSha256);
const files=[...seen.values()].sort((a,b)=>a.path.localeCompare(b.path));assert(files.length>=30&&files.length<60);assert(!files.some(f=>f.path.endsWith('/run-red.mjs')));
const manifest={schema:1,status:'not_run',preparation:'ready-for-native-integration',scope:'Exact r78 signed installer with r74 payload; original installer lifecycle, separate test entry actual-button install, then installed lifecycle; native r79 not_run',installerBuildCommit:pins.commit,payloadBuildCommit:origin.bindings.payloadBuildCommit,installerArchiveSha256:pins.archiveSha256,installerManifestSha256:pins.manifestSha256,originSha256:hash(await readFile(resolve(own,'ORIGIN.json'))),files,productionSources:11,integrationDefinitions:6,generatorDefinitions:8,tokenScope:'download step only',outputRoot:'RUNNER_TEMP',native:'not_run'};
await writeFile(resolve(own,'CI-INPUTS.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:manifest.status,files:files.length,sha256:hash(await readFile(resolve(own,'CI-INPUTS.json')))}));
