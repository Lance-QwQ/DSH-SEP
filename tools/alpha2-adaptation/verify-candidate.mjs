import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const [repo,base]=process.argv.slice(2);
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=path=>readFile(path);
const origin=JSON.parse(await read(join(base,'ADAPTATION-ORIGIN.json'))),state=new Map();
let replayed=0;
for(const row of origin.files){
 let input;
 if(row.kind==='added')input=await read(join(base,'candidate-source',row.path));
 else if(state.has(row.path))input=state.get(row.path);
 else if(row.officialPackage)input=await read(join(base,'host-alpha2/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib',row.path.split('/').at(-1)));
 else input=await read(join(repo,row.path));
 if(row.sourceSha256)assert.equal(sha(input),row.sourceSha256,'source:'+row.path);
 let output=await read(join(base,'candidate-source',row.path));
 if(row.transforms){
  let value=input.toString();for(const t of row.transforms){assert.equal(value.split(t.from).length-1,t.count,'anchor:'+row.path);value=value.split(t.from).join(t.to);}
  output=Buffer.from(value);assert.equal(sha(output),row.resultSha256,'replay:'+row.path);replayed++;
 }
 state.set(row.path,output);
}
// Earlier entries can describe an intermediate transform; bind the final leaf.
for(const [path,bytes] of state){
 const last=origin.files.findLast(r=>r.path===path);
 assert.equal(sha(bytes),last.resultSha256,'final source:'+path);
 const installed=await read(join(base,'host-alpha2/node_modules/dsh-sep-bundle',path));
 if(path==='package.json'){
  // pnpm pack removes the terminal LF from package.json only. Check precisely
  // that byte transform, rather than silently normalizing arbitrary content.
  assert.equal(bytes.at(-1),10);assert.deepEqual(installed,bytes.subarray(0,-1),'packed manifest LF-only transform');
 }else assert.equal(sha(installed),last.resultSha256,'installed:'+path);
}
assert.deepEqual(await read(join(base,'host-alpha2/node_modules/dsh-sep-bundle/ALPHA2-ADAPTATION.json')),await read(join(base,'ADAPTATION-ORIGIN.json')));
const log=await readFile(join(base,'packaged-final-r3.tap'),'utf8');
for(const [key,value] of Object.entries({tests:43,pass:43,fail:0,cancelled:0,skipped:0,todo:0}))assert.match(log,new RegExp('^# '+key+' '+value+'$','m'));
const inventory=JSON.parse(await read(join(base,'SOURCE-INVENTORY.json')));
for(const path of ['packages/fs/fs/src/index.ts','packages/fs/fs-local/src/index.ts','packages/fs/fs-local/src/recovery.ts'])assert(!inventory.files.some(r=>r.path===path),'native filesystem API changed:'+path);
const inputs={};for(const name of ['fixture.mjs','host-compatibility.test.mjs','full-profile.test.mjs','profile-worker.mjs','daily-startup.mjs','daily-presets.mjs','native-settings.test.mjs','shared-consumers.test.mjs'])inputs[name]=sha(await read(join(base,'tests',name)));
const artifact=join(base,'artifacts/r2/dsh-sep-bundle-0.2.1-beta.3-alpha2-adapter.1.tgz');
const peerBytes=await read(join(base,'peer-check-final.log'));assert.equal(peerBytes.toString().trim(),'No peer dependency issues found');
const auditBytes=await read(join(base,'RESOURCE-AUDIT.json')),audit=JSON.parse(auditBytes.toString().replace(/^\uFEFF/,''));assert.equal(audit.status,'pass');assert.equal(audit.remaining.length,0);
const packedManifest={normalization:'pnpm pack removes exactly one terminal LF from source package.json',sourceSha256:sha(await read(join(base,'candidate-source/package.json'))),installedSha256:sha(await read(join(base,'host-alpha2/node_modules/dsh-sep-bundle/package.json')))};
const daily='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH SYSTEM ENHANCEMENT PACKAGE/dsh-daily';
const dailyHashes={};
for(const [file,expected] of Object.entries({'deployment-rc2.json':'6be63c927bb34c583b2ee60e28c66935e191d5aa6605ebe7b37706477b96079d','launch.mjs':'b7743453923f84913efaa96c1a8e846ed3ec205d9706d4d49163d9cad7c91ef1'})){
 const actual=sha(await read(join(daily,file)));assert.equal(actual,expected,'daily changed:'+file);dailyHashes[file]=actual;
}
const result={schema:1,status:'pass',scope:'Windows x64 isolated Alpha.2 native-settings interface candidate; not deployment certification',baselineSourceCommit:origin.baselineCommit,officialHost:origin.host,candidateVersion:'0.2.1-beta.3-alpha2-adapter.1',testResult:{status:'pass',uniqueTests:43,failed:0,skipped:0,log:'packaged-final-r3.tap',sha256:sha(Buffer.from(log)),inputs},origin:{rows:origin.files.length,uniqueLeaves:state.size,textTransformsReplayed:replayed,sha256:sha(await read(join(base,'ADAPTATION-ORIGIN.json')))},artifact:{path:artifact,sha256:sha(await read(artifact)),packedManifest},checkpoint:{path:join(base,'source-before.bundle'),sha256:sha(await read(join(base,'source-before.bundle')))},officialSourceArchiveSha256:sha(await read(join(base,'downloads/alpha2-source.zip'))),hostLockSha256:sha(await read(join(base,'host-alpha2/pnpm-lock.yaml'))),dailyHashes,notVerified:['Alpha.2 Electron main/preload/desktop host packaging and real desktop lifecycle','existing private-data continuation or host migration rollback','full Linux/macOS protected Profile and desktop','real paid provider/model requests','TLS-configured carrier','new Alpha.2 agent-team/inbox workflows beyond suite_delegate','same-run public download/native confirmation/default Electron updater installation'],gitHubPublication:false,dailySwitched:false};
result.peerCheck={status:'pass',log:'peer-check-final.log',sha256:sha(peerBytes)};
result.resourceAudit={status:'pass',file:'RESOURCE-AUDIT.json',sha256:sha(auditBytes),scope:audit.scope,installerCleanup:audit.installerCleanup};
result.hostManifestSha256=sha(await read(join(base,'host-alpha2/package.json')));
await writeFile(join(base,'RESULT.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,tests:43,origins:result.origin,artifactSha256:result.artifact.sha256,dailyUnchanged:true}));
