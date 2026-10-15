import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {portableImports,stableBytes} from './program-files.mjs';
import {redactBuildLabels} from './redact-labels.mjs';
const output=resolve(process.argv[2]??''),source=resolve(process.argv[3]??'');
if(!/^D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1$/i.test(output))throw Error('OUTPUT_SCOPE');
const root=join(output,'program'),graph=JSON.parse(await readFile(join(output,'BASE-PROGRAM-GRAPH.json'))),inventory=JSON.parse(await readFile(join(output,'privacy/R6-RAW-PATTERN-INVENTORY-r2.json')));
const rows=new Map(graph.files.map(x=>[x.path,x])),changes=new Map(),records=[];
const sha=b=>createHash('sha256').update(b).digest('hex'),json=o=>JSON.stringify(o,null,2)+'\n';
async function bytes(path){return stableBytes(join(root,path),rows.get(path));}
async function change(path,body,reason){const old=await bytes(path);if(changes.has(path))throw Error('DUPLICATE_CHANGE');changes.set(path,body);records.push({path,reason,inputSha256:sha(old),outputSha256:body===null?null:sha(body)});}
const adapterRecords=[];
for(const row of graph.files.filter(x=>x.path.startsWith('daily-adapter/')&&x.path.endsWith('.js'))){const old=await bytes(row.path),r=portableImports(old.toString('utf8'),source);if(r.transforms.length){await change(row.path,r.text,'replace pinned local file imports with package-relative imports');adapterRecords.push({path:row.path,inputSha256:row.sha256,outputSha256:sha(r.text),imports:r.transforms.length});}}
await change('daily-adapter/ORIGIN.json',json({schema:1,kind:'windows-package-portable-adapter',originalOriginSha256:rows.get('daily-adapter/ORIGIN.json').sha256,sourceGraphSha256:sha(await readFile(join(output,'BASE-PROGRAM-GRAPH.json'))),transform:'exact local core import prefixes to ../node_modules/dsh-sep-bundle/',files:adapterRecords,originalOriginContainsLocalPaths:true,originalPreservedInBuildEvidence:true}),'replace local-path provenance with public hash-bound provenance');
for(const finding of inventory.findings.filter(x=>x.rules['local-build-root']&&!x.path.startsWith('daily-adapter/'))){
 if(finding.path==='node_modules/@deepseek-ai/dsh-recovery/DAILY-ORIGIN.json'){
  const origin=JSON.parse(await bytes(finding.path));origin.coreRoot='../../dsh-sep-bundle';origin.pathRedaction={originalSha256:finding.sha256,role:'package-relative SEP core'};await change(finding.path,json(origin),'redact local build origin root');continue;
 }
 const original=(await bytes(finding.path)).toString('utf8'),r=redactBuildLabels(original);
 if(r.count!==finding.rules['local-build-root'])throw Error('LABEL_COUNT_CHANGED: '+finding.path);
 await change(finding.path,r.text,'redact bundler comments and non-functional bundled-method labels');
}
for(const row of inventory.sourceMaps){
 await change(row.path,null,'exclude developer source map and embedded sourcesContent');
 const js=row.path.slice(0,-4),body=changes.get(js)??(await bytes(js)).toString('utf8');
 const mapName=row.path.slice(row.path.lastIndexOf('/')+1),escaped=mapName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const re=new RegExp('^//# sourceMappingURL='+escaped+'\\r?\\n?','mg'),count=[...body.matchAll(re)].length;
 if(count!==1)throw Error('SOURCE_MAP_REFERENCE_CHANGED: '+js);
 if(changes.has(js)){const next=body.replace(re,'');changes.set(js,next);const record=records.find(x=>x.path===js);record.outputSha256=sha(next);record.reason+='; remove source-map reference';}else await change(js,body.replace(re,''),'remove source-map reference');
}
// Retire the historical fingerprint of a private effective input. The public
// preset verification is produced separately from official defaults.
await change('DAILY-PRESET-ORIGIN.json',json({schema:1,kind:'public-preset-provenance',historicalOriginSha256:rows.get('DAILY-PRESET-ORIGIN.json').sha256,policyPath:'node_modules/@deepseek-ai/dsh-desktop-host/lib/sep-policy.json',policySha256:rows.get('node_modules/@deepseek-ai/dsh-desktop-host/lib/sep-policy.json').sha256,verification:'PUBLIC-PRESET-VERIFICATION.json',privateEffectiveInputFingerprintOmitted:true}),'remove private effective-input fingerprint');
// All transformations are checked before any copied program member is changed.
await writeFile(join(output,'PROGRAM-REDACTION-PLAN.json'),json({schema:1,records}),{flag:'wx'});
for(const[path,body]of changes){const target=join(root,path),r=relative(root,target);if(r.startsWith('..'))throw Error('PATH_ESCAPE');if(body===null)await unlink(target);else await writeFile(target,body);}
await writeFile(join(output,'PROGRAM-REDACTION.json'),json({schema:1,status:'pass',records}),{flag:'wx'});
console.log(JSON.stringify({status:'pass',changed:changes.size,removed:records.filter(x=>x.outputSha256===null).length,adapterImports:adapterRecords.reduce((n,x)=>n+x.imports,0)}));
