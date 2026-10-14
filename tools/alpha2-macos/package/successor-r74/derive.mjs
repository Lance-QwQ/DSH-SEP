// Author-only mechanical generation from immutable source and actual r74 evidence.
import assert from 'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import{join}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url)),own=fileURLToPath(new URL('./',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(process.argv.length,3);const proof=process.argv[2],raw=await readFile(join(proof,'contents/project-build/RESULT.json')),r=JSON.parse(raw),audit=JSON.parse(await readFile(join(proof,'AUDIT.json'))),metadata=JSON.parse(await readFile(join(proof,'API-METADATA.json')));
assert.equal(sha(raw),'5aa8ddfc6b72141f494eb50e07cdced61e1fc89080368b9edf922389641f2704');assert.equal(raw.length,29900);assert.equal(r.status,'pass');assert.equal(r.sourceCommit,'155f324013fada4caf3ecd15a9631678d4d5c4a7');assert.equal(audit.auditIntegrity,'pass');assert.equal(audit.build.status,'pass');assert.equal(audit.round1.status,'blocked');assert.equal(r.runtime.length,84);
const inventory=await readFile(join(proof,'contents/project-build/PACKAGE-INVENTORY.json'));assert.equal(sha(inventory),'f1059e9360fd48f84fab79ace0c23e50075b0ec345c4b0c58cac84ec2b3c771d');
const artifacts=['evidence','part-one','part-two'].map(label=>{const a=metadata.artifacts.find(a=>a.name==='project-application-r74-'+label);assert(a);assert.equal(a.workflow_run.head_sha,r.sourceCommit);return{label,id:a.id,bytes:a.size_in_bytes,sha256:a.digest.replace(/^sha256:/,'')};});
const pins={schema:1,run:38643383890,commit:r.sourceCommit,assemblySha256:sha(raw),assemblyBytes:raw.length,inventorySha256:sha(inventory),artifact:r.artifact,archiveSha256:r.artifactSha256,archiveBytes:r.artifactBytes,treeSha256:r.treeSha256,programSha256:r.programSha256,bootstrapSha256:r.bootstrapSha256,artifacts};
await writeFile(join(own,'candidate-pins.json'),JSON.stringify(pins,null,2)+'\n');assert.equal(sha(await readFile(join(own,'fixtures/ASSEMBLY-r74.json'))),pins.assemblySha256);
const origins=[];
async function derive(source,expected,result,makeTransforms){const original=await readFile(join(root,source));assert.equal(sha(original),expected);let value=original.toString('utf8');const transforms=makeTransforms(value);for(const t of transforms){assert.equal(value.split(t.from).length-1,1,source+': '+t.from.slice(0,70));value=value.replace(t.from,t.to);}await writeFile(join(own,result),value);origins.push({source,sourceSha256:expected,result:'package/successor-r74/'+result,resultSha256:sha(Buffer.from(value)),transforms});}
await derive('desktop/project-workflow-product/candidate-binding.mjs','d5a4b7e22ea3c42a2a2dd56220e51f3ad396d3442e3581b9cfdafabe0896a6a4','candidate-binding.mjs',()=>[
 {from:'Pin original r61 evidence',to:'Pin original r74 build evidence'},
 {from:'r.runtime.length!==76',to:'r.runtime.length!==84'},
 {from:'new Set(r.runtime.map(row=>row.path)).size!==76',to:'new Set(r.runtime.map(row=>row.path)).size!==84'}]);
await derive('desktop/project-workflow-product/restore-project-application-r61.mjs','d05dc152505e7117e1d1e26eb26477007f199e3eb17aa52dd1b0f9b087376cab','restore-application.mjs',text=>[
 {from:'restore exactly r61,',to:'restore exactly r74 build bytes,'},
 {from:"from '../run-command.mjs'",to:"from '../../desktop/run-command.mjs'"},
 {from:"from '../../package/package-inventory.mjs'",to:"from '../package-inventory.mjs'"},
 {from:text.slice(text.indexOf('const source={'),text.indexOf('const result=')),to:"const source=JSON.parse(await readFile(new URL('./candidate-pins.json',import.meta.url),'utf8'));\n"},
 {from:'restore exact r61 signed application bytes; no new product build',to:'restore exact r74 signed application bytes; original r74 UI round blocked; no new product build'}]);
await derive('package/assemble-installer-application.mjs','90c310d129979a08d832281253d17194c4406de5682e6da61994f6b2625948c4','assemble-installer-application.mjs',()=>[
 {from:"from '../desktop/project-workflow-product/candidate-binding.mjs'",to:"from './candidate-binding.mjs'"},
 {from:"from '../installer-ui/resources/assemble-resources.mjs'",to:"from '../../installer-ui/resources/assemble-resources.mjs'"},
 {from:"from '../installer-ui/bundle-config.mjs'",to:"from '../../installer-ui/bundle-config.mjs'"},
 {from:"from '../installer-entry/candidate.mjs'",to:"from '../../installer-entry/candidate.mjs'"},
 {from:"from './package-inventory.mjs'",to:"from '../package-inventory.mjs'"},
 {from:"from './prepare-installer-signing.mjs'",to:"from '../prepare-installer-signing.mjs'"},
 {from:"new URL('../',import.meta.url)",to:"new URL('../../',import.meta.url)"},
 {from:'Fresh installer application build, ad-hoc signature, archive and exact restore only',to:'Successor installer with exact r74 payload: build, ad-hoc signature, archive and restore only; no UI certification'}]);
const origin={schema:1,status:'generated-not-native-executed',scope:'Additive r74-only source derivatives; historical r61/r71 sources unchanged. The r74 build passed while its original UI round remained blocked.',pinsSha256:sha(await readFile(join(own,'candidate-pins.json'))),sourceAssemblySha256:pins.assemblySha256,origins};await writeFile(join(own,'ORIGIN.json'),JSON.stringify(origin,null,2)+'\n');console.log(JSON.stringify({status:'generated',origins:origins.map(x=>({result:x.result,sha256:x.resultSha256,transforms:x.transforms.length})),pinsSha256:origin.pinsSha256}));
