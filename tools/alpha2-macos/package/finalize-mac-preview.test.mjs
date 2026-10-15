import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,readdir,unlink} from 'node:fs/promises';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {finalizeMacPreview} from './finalize-mac-preview.mjs';
const root=process.env.SEP_DELIVERY_TEST_ROOT;if(!root||!root.startsWith('D:'))throw Error('SEP_DELIVERY_TEST_ROOT_REQUIRED');
const sha=b=>createHash('sha256').update(b).digest('hex'),h=x=>x.repeat(64),commit=x=>x.repeat(40);
function evidenceBinding(audit,resultSha256){const b=audit.deliveryBinding;return{schema:1,testCommit:audit.sourceCommit,runId:audit.runId,jobId:audit.jobId,installerArchiveSha256:b.installer.archiveSha256,installerManifestSha256:b.installer.manifestSha256,payloadProgramSha256:b.payload.programSha256,payloadBootstrapSha256:b.payload.bootstrapSha256,payloadTreeSha256:b.payload.treeSha256,resultSha256};}
async function fixture(change){
 const base=await mkdtemp(join(root,'case-')),archive=join(base,'DSH-SEP-macOS-Alpha2-installer-preview.zip'),bytes=Buffer.from('synthetic archive; no executable');await writeFile(archive,bytes);
 const download={schema:1,status:'pass',archive,bytes:bytes.length,sha256:sha(bytes),sourceCommit:commit('a')};
 const cycles=[1,2].map(i=>({index:i,status:'pass',ready:{generation:String(i).repeat(32),desktopPid:100+i,bootstrapPid:200+i},profile:{sha256:h('5'),installedPathBound:true,sameAcrossRestart:i===2},closed:{generation:String(i).repeat(32),resourcesConfirmedReleased:true,normalLaunchServicesWaitExit:{code:0,signal:null}}}));
 const audit={schema:1,status:'pass',sourceCommit:commit('b'),runId:500,jobId:600,scope:'Synthetic fixed installation evidence, never native certification',deliveryBinding:{schema:1,installer:{buildCommit:commit('a'),archiveSha256:sha(bytes),archiveBytes:bytes.length,manifestSha256:h('1'),inventorySha256:h('2')},payload:{buildCommit:commit('c'),archiveSha256:h('3'),programSha256:h('4'),bootstrapSha256:h('6'),treeSha256:h('7')},build:{status:'pass',archiveRestored:true,signaturesVerified:true,sourceUnchanged:true}},evidenceRows:[
  {kind:'separate-test-entry-installation',status:'pass',fixedDefinitions:{tests:6,pass:6,fail:0,cancelled:0,skipped:0},planHash:h('8'),close:{controllerClosedReceipt:true,controllerSignalled:false,controllerExitCode:0,uiResourcesReleased:true,controllerOutputEOF:true,controllerExited:true,forcedTermination:false,cleanupUnconfirmed:false,path:'normal scenario close',testEntryExitCode:0},payload:{fullInventoryVerified:true,signatureVerified:true,sourceUnchanged:true,applicationStarted:false,dataRootAbsent:true}},
  {kind:'installed-product',status:'pass',cycles}
 ]};
 audit.deliveryBinding.nativeResults={installationSha256:h('9'),installedStartupSha256:h('a')};
 audit.evidenceRows[0].evidenceBinding=evidenceBinding(audit,audit.deliveryBinding.nativeResults.installationSha256);
 audit.evidenceRows[1].evidenceBinding=evidenceBinding(audit,audit.deliveryBinding.nativeResults.installedStartupSha256);
 const assembly={schema:1,status:'pass',sourceCommit:commit('a'),artifact:'DSH-SEP-macOS-Alpha2-installer-preview.zip',artifactSha256:sha(bytes),artifactBytes:bytes.length,manifestSha256:h('1'),treeSha256:h('b'),payload:{archiveSha256:h('3'),programSha256:h('4'),bootstrapSha256:h('6'),treeSha256:h('7')}};
 const assemblyPath=join(base,'SOURCE-ASSEMBLY.json');await writeFile(assemblyPath,JSON.stringify(assembly));
 download.assemblyResultSha256=sha(await readFile(assemblyPath));Object.assign(audit.deliveryBinding.installer,{assemblySha256:download.assemblyResultSha256,treeSha256:h('b')});
 if(change)await change({download,audit,archive,assembly,assemblyPath});
 const downloadPath=join(base,'DOWNLOAD.json'),auditPath=join(base,'AUDIT.json');await writeFile(downloadPath,JSON.stringify(download));await writeFile(auditPath,JSON.stringify(audit));
 return {base,archive,bytes,download,audit,downloadPath,auditPath,outputRoot:join(base,'delivery')};
}
const rejects=async(f,code)=>{await assert.rejects(finalizeMacPreview(f),{code});assert(!((await readdir(f.base)).includes('delivery')));};
test('copies only the exact verified installer plus three external files; preserves separate build/test commits',async()=>{
 const f=await fixture(),r=await finalizeMacPreview(f);assert.equal(r.status,'pass');assert.deepEqual((await readdir(f.outputRoot)).sort(),['DSH-SEP-macOS-Alpha2-installer-preview.zip','MANIFEST.json','README.md','SHA256SUMS'].sort());assert.deepEqual(await readFile(join(f.outputRoot,'DSH-SEP-macOS-Alpha2-installer-preview.zip')),f.bytes);
 const manifest=JSON.parse(await readFile(join(f.outputRoot,'MANIFEST.json'))),readme=await readFile(join(f.outputRoot,'README.md'),'utf8');assert.equal(manifest.installer.buildCommit,commit('a'));assert.equal(manifest.verification.testCommit,commit('b'));assert.equal(manifest.fullMacCertification,'blocked');assert.match(readme,/隐私/);assert.match(readme,/未完成全面/);assert.doesNotMatch(readme,/已完成全部认证|保证不含私人/);assert.equal(manifest.archive.sha256,sha(f.bytes));
 const sums=await readFile(join(f.outputRoot,'SHA256SUMS'),'utf8');for(const n of ['README.md','MANIFEST.json','DSH-SEP-macOS-Alpha2-installer-preview.zip'])assert(sums.includes(`${sha(await readFile(join(f.outputRoot,n)))}  ${n}`));
});
test('build-only audit cannot qualify when the UI round is blocked',async()=>{const f=await fixture(({audit})=>{audit.evidenceRows[0].status='blocked';});await rejects(f,'SEP_DELIVERY_UI_INSTALL');});
test('only one installed cold start cannot qualify as two',async()=>{const f=await fixture(({audit})=>{audit.evidenceRows[1].cycles.pop();});await rejects(f,'SEP_DELIVERY_STARTUP');});
test('later cleanup cannot replace normal scenario closure',async()=>{const f=await fixture(({audit})=>{audit.evidenceRows[0].close.path='subsequent cleanup';});await rejects(f,'SEP_DELIVERY_UI_INSTALL');});
test('a stale installer binding cannot borrow a newer audit',async()=>{const f=await fixture(({audit})=>{audit.deliveryBinding.installer.archiveSha256=h('0');});await rejects(f,'SEP_DELIVERY_BINDING');});
test('a modified archive is refused despite a pass JSON record',async()=>{const f=await fixture(async({archive})=>writeFile(archive,'different archive bytes'));await rejects(f,'SEP_DELIVERY_ARCHIVE');});
test('missing explicit native build/restoration facts are not defaulted to pass',async()=>{const f=await fixture(({audit})=>{delete audit.deliveryBinding.build.archiveRestored;});await rejects(f,'SEP_DELIVERY_BUILD');});
test('existing destination files are preserved and delivery refuses',async()=>{const f=await fixture();await mkdir(f.outputRoot);await writeFile(join(f.outputRoot,'keep'),'original');await assert.rejects(finalizeMacPreview(f),{code:'SEP_DELIVERY_OUTPUT'});assert.equal(await readFile(join(f.outputRoot,'keep'),'utf8'),'original');});
test('missing actual native run identity cannot become an anonymous pass manifest',async()=>{const f=await fixture(({audit})=>{delete audit.runId;});await rejects(f,'SEP_DELIVERY_RECORD');});
test('real old r72 installation/startup rows cannot borrow a new installer and payload binding',async()=>{
 const bytes=await readFile(resolve('D:/AIData/ProjectWork/DSH/alpha2-macos-package-20261014-r1/installer-integration-native-r72/AUDIT.json'));
 assert.equal(sha(bytes),'6e331b71a7e77e61adfa04712956ca7f8edb04c3517dccdff626bc5b5dbc0899');
 const old=JSON.parse(bytes);assert.equal(old.sourceCommit,'25f2a7934494a9639e32e99f326bef1c6b7b627a');assert.equal(old.runId,38641060442);
 const rows=old.evidenceRows.filter(r=>r.kind==='separate-test-entry-installation'||r.kind.startsWith('installed-'));assert.equal(rows.length,2);assert.equal(rows[1].kind,'installed-r61-product');
 const f=await fixture(({audit})=>{audit.evidenceRows=structuredClone(rows);});
 assert.deepEqual(f.audit.evidenceRows,rows);await rejects(f,'SEP_DELIVERY_EVIDENCE_BINDING');
});
test('each row rejects mismatched test identity, installer, payload and raw result digest',async()=>{
 const patches={schema:2,testCommit:commit('d'),runId:501,jobId:601,installerArchiveSha256:h('d'),installerManifestSha256:h('d'),payloadProgramSha256:h('d'),payloadBootstrapSha256:h('d'),payloadTreeSha256:h('d'),resultSha256:h('d')};
 for(const index of[0,1])for(const [field,value]of Object.entries(patches)){const f=await fixture(({audit})=>{audit.evidenceRows[index].evidenceBinding[field]=value;});await rejects(f,'SEP_DELIVERY_EVIDENCE_BINDING');}
});
test('missing or substituted expected native result digests cannot qualify a row',async()=>{
 for(const change of[b=>{delete b.nativeResults;},b=>{delete b.nativeResults.installationSha256;},b=>{b.nativeResults.installedStartupSha256=h('e');}]){const f=await fixture(({audit})=>change(audit.deliveryBinding));await rejects(f,'SEP_DELIVERY_EVIDENCE_BINDING');}
});
test('delivered manifest retains both separately bound native result records',async()=>{
 const f=await fixture();await finalizeMacPreview(f);const m=JSON.parse(await readFile(join(f.outputRoot,'MANIFEST.json')));
 assert.deepEqual(m.verification.nativeResults,f.audit.deliveryBinding.nativeResults);
 assert.deepEqual(m.verification.evidenceBindings.installation,f.audit.evidenceRows[0].evidenceBinding);
 assert.deepEqual(m.verification.evidenceBindings.installedStartup,f.audit.evidenceRows[1].evidenceBinding);
});

// Regression: audit-only installer tree/assembly values must not be copied into
// a completed manifest without matching the verified original assembly bytes.
test('rejects missing or substituted installer assembly and tree pins before publishing',async()=>{
 for(const field of ['treeSha256','assemblySha256'])for(const value of [undefined,'not-a-hash',h('c')]){
  const f=await fixture(({audit})=>{audit.deliveryBinding.installer[field]=value;});await rejects(f,'SEP_DELIVERY_ASSEMBLY');
 }
});
test('requires the download assembly binding and the original assembly file',async()=>{
 for(const mutate of [({download})=>{delete download.assemblyResultSha256;},({download})=>{download.assemblyResultSha256=h('c');},async({assemblyPath})=>unlink(assemblyPath),async({assemblyPath})=>writeFile(assemblyPath,'{}')]){
  const f=await fixture(mutate);await rejects(f,'SEP_DELIVERY_ASSEMBLY');
 }
});
test('rejects a rehashed assembly inconsistent with the installer or payload claims',async()=>{
 const mutations=[a=>{a.status='fail';},a=>{a.sourceCommit=commit('d');},a=>{a.artifact='other.zip';},a=>{a.artifactBytes++;},a=>{a.artifactSha256=h('d');},a=>{a.manifestSha256=h('d');},a=>{a.treeSha256=h('d');}];
 for(const field of ['archiveSha256','programSha256','bootstrapSha256','treeSha256'])mutations.push(a=>{a.payload[field]=h('d');});
 for(const mutate of mutations){const f=await fixture(async({download,audit,assembly,assemblyPath})=>{mutate(assembly);const bytes=JSON.stringify(assembly);await writeFile(assemblyPath,bytes);download.assemblyResultSha256=sha(bytes);audit.deliveryBinding.installer.assemblySha256=sha(bytes);});await rejects(f,'SEP_DELIVERY_ASSEMBLY');}
});
test('accepted manifest retains verified installer assembly and installer tree pins',async()=>{
 const f=await fixture();await finalizeMacPreview(f);const m=JSON.parse(await readFile(join(f.outputRoot,'MANIFEST.json')));
 assert.equal(m.installer.treeSha256,h('b'));assert.equal(m.installer.assemblySha256,f.download.assemblyResultSha256);
});
