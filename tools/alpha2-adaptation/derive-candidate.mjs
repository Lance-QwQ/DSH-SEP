import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
const [repo,base,support]=process.argv.slice(2);
const source=join(base,'candidate-source'),host=join(base,'host-alpha2');
const sha=b=>createHash('sha256').update(b).digest('hex');
const origin={schema:1,baselineCommit:'dfa74e727dd5bfba677d8468c1490714c73e4f87',host:{from:'0.2.1-alpha.1',to:'0.2.1-alpha.2',commit:'d743267388641bc76f17c45ce8b4c231aed1d32c'},scope:'isolated-windows-x64-interface-adaptation',files:[]};
for(const path of ['package.json','bundle/lib/session-persistence.js','bundle/lib/file-protection.js','bundle/lib/protected-file-tools.js','bundle/lib/settings-runtime.js','bundle/lib/business-runtime.js','bundle/lib/p1-runtime.js','bundle/host/p1-policy/index.js','bundle/modules/system-enhancement-package/src/scope.js','bundle/lib/project-binding.js','bundle/host/plugin-group/index.mjs','bundle/host/context-preparation/index.mjs'])await cp(join(repo,path),join(source,path));
async function change(path,transforms){
 const file=join(source,path),before=await readFile(file);let value=before.toString();
 for(const [old,next,count] of transforms){const actual=value.split(old).length-1;if(actual!==count)throw Error('ANCHOR:'+path+':'+actual+':'+old);value=value.split(old).join(next);}
 await writeFile(file,value);origin.files.push({path,sourceSha256:sha(before),resultSha256:sha(value),transforms:transforms.map(([from,to,count])=>({from,to,count}))});
}
// Only a derived candidate changes its host gate; the Alpha.1 baseline stays pinned.
for(const path of ['bundle/lib/session-persistence.js','bundle/lib/file-protection.js','bundle/lib/protected-file-tools.js'])await change(path,[["'0.2.1-alpha.1'","'0.2.1-alpha.2'",1]]);
await change('bundle/lib/protected-file-tools.js',[
 ["return super.writeText(target,content,expected,signal,policy);","// Alpha.2's native tool output is closed. Keep the recovery id in its\n  // durable internal record, outside the native model-facing result schema.\n  const outcome={...await super.writeText(target,content,expected,signal,policy)};delete outcome.mutationId;return outcome;",1],
 ["return super.editText(target,edit,expected,signal,policy);","const outcome={...await super.editText(target,edit,expected,signal,policy)};delete outcome.mutationId;return outcome;",1],
]);
await change('bundle/lib/settings-runtime.js',[["'agents','subagents','approval'","'agents','approval'",1]]);
const p1='bundle/host/p1-policy/index.js';
await cp(join(support,'alpha2-subagent.js'),join(source,'bundle/host/p1-policy/alpha2-subagent.js'));
origin.files.push({path:'bundle/host/p1-policy/alpha2-subagent.js',kind:'added',resultSha256:sha(await readFile(join(support,'alpha2-subagent.js')))});
await change(p1,[["import {z} from 'zod';","import {z} from 'zod';\nimport {startSuiteActivation} from './alpha2-subagent.js';",1],["ctx.subagents.start('spawn',","startSuiteActivation(ctx,",1],["const cwd=agent?.session?.header?.cwd;","const cwd=agent?.session&&ctx.get('workingDirectory').get(agent.session);",1]]);
await change('bundle/modules/system-enhancement-package/src/scope.js',[["const cwd = exec.agent?.session?.header?.cwd;","const cwd = this.recoveryOptions.workingDirectory?.get(exec.agent?.session);",1]]);
for(const path of ['bundle/lib/settings-runtime.js','bundle/lib/business-runtime.js']){
 await change(path,[["const cwd=exec.agent?.session?.header?.cwd;","const cwd=exec.agent?.session&&ctx.get('workingDirectory').get(exec.agent.session);",1],["enabled:true,followRegisteredProjects:false,recoveryHost:ctx.recoveryHost","enabled:true,followRegisteredProjects:false,recoveryHost:ctx.recoveryHost,workingDirectory:ctx.get('workingDirectory')",1]]);
}
await change('bundle/lib/p1-runtime.js',[["const cwd=exec.agent?.session?.header?.cwd;","const cwd=exec.agent?.session&&ctx.get('workingDirectory').get(exec.agent.session);",1],["enabled:true,recoveryHost:ctx.recoveryHost","enabled:true,recoveryHost:ctx.recoveryHost,workingDirectory:ctx.get('workingDirectory')",1]]);
await change('bundle/lib/project-binding.js',[["if(typeof session.header.cwd!=='string'||!same(session.header.cwd,active.result.project.root))","const cwd=ctx.get('workingDirectory').get(session);if(typeof cwd!=='string'||!same(cwd,active.result.project.root))",1]]);
await change('bundle/host/plugin-group/index.mjs',[
 ["session?.header?.cwd??''","ctx.get('workingDirectory').get(session)??''",2],
 ["session.header.cwd??''","ctx.get('workingDirectory').get(session)??''",1],
 ["realpath(session.header.cwd)","realpath(ctx.get('workingDirectory').get(session))",3],
 ["const cwd=exec?.agent?.session?.header?.cwd;","const cwd=exec?.agent?.session&&ctx.get('workingDirectory').get(exec.agent.session);",1],
 ["p=>cwd&&inside(p.root,cwd)","p=>cwd&&inside(p.root,cwd)&&isAbsolute(session.header.cwd??'')&&inside(p.root,session.header.cwd)",1],
 ["p=>inside(p.root,cwd)","p=>inside(p.root,cwd)&&isAbsolute(session.header.cwd??'')&&inside(p.root,session.header.cwd)",2],
 ["p=>inside(p.root,canonical)","p=>inside(p.root,canonical)&&isAbsolute(exec.agent.session.header.cwd??'')&&inside(p.root,exec.agent.session.header.cwd)",1],
]);
await change('bundle/host/context-preparation/index.mjs',[
 ["session.header.cwd??''","ctx.get('workingDirectory').get(session)??''",1],
 ["realpath(session.header.cwd)","realpath(ctx.get('workingDirectory').get(session))",2],
]);
// Refresh the complete released JSONL implementation, then replay the same owned imports.
const captures=[['index.js',[
 ['"@deepseek-ai/dsh-session-format-catalog"','"../../lib/session-catalog.js"',1],
 ['"@deepseek-ai/dsh-session"','"../../lib/session-vocabulary.js"',1],
 ['"@deepseek-ai/dsh-session-persistence"','"../../lib/session-storage-validation.js"',1],
]],['worker.cjs',[[ ')("../package.json")',') ("@deepseek-ai/dsh-llm/package.json")',1]]]];
for(const [name,transforms] of captures){
 const input=await readFile(join(host,'node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib',name));let value=input.toString();
 for(const [old,next,count] of transforms){if(value.split(old).length-1!==count)throw Error('CAPTURE_ANCHOR:'+name);value=value.split(old).join(next);}
 const path='bundle/host/session-jsonl/'+name;await writeFile(join(source,path),value);
 origin.files.push({path,officialPackage:'@deepseek-ai/dsh-session-persistence-jsonl@0.2.1-alpha.2',sourceSha256:sha(input),resultSha256:sha(value),transforms:transforms.map(([from,to,count])=>({from,to,count}))});
}
const manifest=JSON.parse(await readFile(join(source,'package.json')));
const oldManifest=await readFile(join(source,'package.json'));
manifest.version='0.2.1-beta.3-alpha2-adapter.1';
manifest.files.push('ALPHA2-ADAPTATION.json');
for(const name of Object.keys(manifest.peerDependencies??{}))if(manifest.peerDependencies[name].includes('0.2.1-alpha.1'))manifest.peerDependencies[name]=manifest.peerDependencies[name].replaceAll('0.2.1-alpha.1','0.2.1-alpha.2');
// The official gate compares dsh-* peers with the host version, separately
// from the installed leaf version. Alpha.2 has no invariants package; retain
// the reviewed exact union bridge, not an open version range or exemption.
manifest.peerDependencies['@deepseek-ai/dsh-invariants']='0.2.0-rc.2 || 0.2.1-alpha.2';
origin.officialGateBridge={package:'@deepseek-ai/dsh-invariants',installedVersion:'0.2.0-rc.2',hostVersion:'0.2.1-alpha.2',range:manifest.peerDependencies['@deepseek-ai/dsh-invariants'],reason:'fixed-host gate bridge only; no alpha.2 invariants package is asserted'};
// Do not leave baseline pass-labelled contracts as live Alpha.2 certification.
const meta=manifest.dshSepBundle;
for(const [name,path] of Object.entries(meta??{}))if(name.endsWith('Contract')&&typeof path==='string'&&path.includes('bundle/contracts/')){
 const relative=path.replace(/^\.\//,'');const bytes=await readFile(join(repo,relative));const contract=JSON.parse(bytes);
 const historicalStatus=contract.status??null;
 contract.status='not_run';contract.baselineContractStatus=historicalStatus;
 contract.verificationScope='Historical baseline contract only; not an Alpha.2 certification. See ALPHA2-ADAPTATION.json for the isolated native-settings scope.';
 contract.alpha2CandidateContract='ALPHA2-ADAPTATION.json';
 await writeFile(join(source,relative),JSON.stringify(contract,null,2)+'\n');
 origin.files.push({path:relative,kind:'baseline-contract-scope',sourceSha256:sha(bytes),resultSha256:sha(await readFile(join(source,relative)))});
}
if(meta)meta.alpha2CandidateContract='./ALPHA2-ADAPTATION.json';
await writeFile(join(source,'package.json'),JSON.stringify(manifest,null,2)+'\n');
origin.files.push({path:'package.json',kind:'manifest',sourceSha256:sha(oldManifest),resultSha256:sha(await readFile(join(source,'package.json'))),scope:'isolated alpha2 candidate version and exact peers; default admission unchanged'});
for(const path of ['bundle/lib/settings-runtime.origin.json','bundle/lib/business-runtime-origin.json','bundle/host/p1-policy/origin.json','bundle/host/plugin-group/origin.json','bundle/host/context-preparation/origin.json','bundle/host/session-jsonl/origin.json']){
 const bytes=await readFile(join(repo,path));
 const value={schema:2,status:'superseded-for-alpha2-isolated-candidate',currentOrigin:'ALPHA2-ADAPTATION.json at package root',baselineOriginSha256:sha(bytes),historicalOrigin:JSON.parse(bytes)};
 await writeFile(join(source,path),JSON.stringify(value,null,2)+'\n');
 origin.files.push({path,kind:'origin-supersession',sourceSha256:sha(bytes),resultSha256:sha(await readFile(join(source,path)))});
}
await writeFile(join(base,'ADAPTATION-ORIGIN.json'),JSON.stringify(origin,null,2)+'\n');
await writeFile(join(source,'ALPHA2-ADAPTATION.json'),JSON.stringify(origin,null,2)+'\n');
const readme=await readFile(join(repo,'README.md'),'utf8');
await writeFile(join(source,'README.md'),'# Alpha.2 isolated interface candidate\n\nVersion `'+manifest.version+'`; host `0.2.1-alpha.2`. This is an isolated Windows x64 compatibility candidate, not an install/update authorization or a public release. Only the native settings cold composition is being certified. The default bundle admission remains pending. Complete Electron, private-data continuation, updater host migration, Linux/macOS and paid providers are not certified by this candidate. `ALPHA2-ADAPTATION.json` binds its source transformations; superseded origins explicitly preserve historical provenance.\n\nThe baseline README below is historical and must not be used as the Alpha.2 delivery status.\n\n---\n\n'+readme);
// The pnpm-owned installation is disposable and isolated; do not replace any daily package.
const installed=join(host,'node_modules/dsh-sep-bundle');
await cp(join(source,'bundle'),join(installed,'bundle'),{recursive:true});
await cp(join(source,'package.json'),join(installed,'package.json'));
await cp(join(source,'ALPHA2-ADAPTATION.json'),join(installed,'ALPHA2-ADAPTATION.json'));
console.log(JSON.stringify({candidate:source,files:origin.files.length,version:manifest.version}));
