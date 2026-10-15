// Acceptance operator: real sealed archives -> independent extraction/audit ->
// package-owned installer. It does not launch a Host or Electron.
import {mkdir,readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {auditBundle,stableFile,verifyRecord,listRegularFiles} from './bundle-audit.mjs';
import {runtimeSmoke} from './runtime-smoke.mjs';
import {exerciseInstallerRefusals} from './installer-refusals.mjs';
for(const key of Object.keys(process.env))if(/KEY|TOKEN|SECRET|PASSWORD/i.test(key))delete process.env[key];
const P='D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1';
const inside=(root,path)=>{const r=relative(root,path);return r!==''&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..\\')&&!r.startsWith('../');};
const fail=code=>{throw Object.assign(Error(code),{code});};
const json=async path=>JSON.parse((await stableFile(path,{maxBytes:32*1024*1024,capture:true})).bytes.toString('utf8'));
const configPath=resolve(process.argv[2]??'');
assert(inside(P,configPath),'verification specification must reside below the designated D: output root');
const specRecord=await stableFile(configPath,{maxBytes:1048576,capture:true}),spec=JSON.parse(specRecord.bytes.toString('utf8'));
assert.equal(spec.schema,1);assert.equal(spec.expected.hostVersion,'0.2.1-alpha.2');assert.equal(spec.expected.sepVersion,'0.2.1-beta.3-alpha2-adapter.1');assert.equal(spec.expected.revision,'windows-package.2');
assert.equal(spec.archives.length,2);assert.deepEqual(spec.archives.map(x=>x.kind).sort(),['full','sep']);
const output=resolve(spec.outputRoot);assert(inside(P,output));assert.equal((await realpath(dirname(output))).toLowerCase(),dirname(output).toLowerCase());
for(const archive of spec.archives){assert(inside(P,resolve(archive.path)));assert(/^[a-f0-9]{64}$/.test(archive.sha256));assert(Number.isSafeInteger(archive.size)&&archive.size>0);}
assert(typeof spec.python==='string'&&isAbsolute(spec.python));assert(typeof spec.hostRoot==='string'&&isAbsolute(spec.hostRoot));
await mkdir(output);await mkdir(join(output,'unpacked'));await mkdir(join(output,'installations'));
const report={schema:1,status:'not_run',scope:'Real ZIP extraction and fresh installation, no Host/Electron/model launch. Empty credentials and public fresh-profile configuration only.',specSha256:specRecord.sha256,expected:spec.expected,archives:[],installations:[],checks:[],resourceAudit:{status:'pass',path:'No Host or desktop is launched by this phase.'}};
let phase='guards-before';
const tick=value=>{phase=value;console.log(JSON.stringify({phase,at:new Date().toISOString()}));};
const check=(name)=>report.checks.push({name,status:'pass'});
async function guardPublicEntries(){
 const results=[];
 for(const row of spec.guardRecords??[]){assert(/(?:^|[\\/])(?:launch\.mjs|deployment-rc2\.json)$/.test(row.path),'guard may read public launcher/config metadata only');const current=await stableFile(row.path,{maxBytes:1048576});assert.equal(current.sha256,row.sha256);assert.equal(current.size,row.size);results.push({path:row.path,...current});}
 return results;
}
async function extract(archive,destination,label){
 const exe=spec.python,script=join(import.meta.dirname,'safe_extract.py'),receipt=join(output,`extract-${label}.json`);
 const args=['-B',script,archive.path,archive.sha256,destination,receipt];
 const child=spawn(exe,args,{windowsHide:true,cwd:output,stdio:['ignore','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:output,TMP:output,PYTHONDONTWRITEBYTECODE:'1'}});
 const stdout=[],stderr=[];let total=0,timedOut=false,overflow=false;
 const accept=(sink,data)=>{total+=data.length;if(total>8*1024*1024){overflow=true;child.kill();return;}sink.push(data);};
 child.stdout.on('data',data=>accept(stdout,data));child.stderr.on('data',data=>accept(stderr,data));
 const timer=setTimeout(()=>{timedOut=true;child.kill();},30*60000);
 let result;
 try{result=await new Promise((ok,no)=>{child.once('error',no);child.once('close',(code,signal)=>ok({code,signal}));});}
 finally{clearTimeout(timer);await writeFile(join(output,`extract-${label}.stdout.log`),Buffer.concat(stdout),{flag:'wx'});await writeFile(join(output,`extract-${label}.stderr.log`),Buffer.concat(stderr),{flag:'wx'});}
 assert.deepEqual(result,{code:0,signal:null});assert.equal(timedOut,false);assert.equal(overflow,false);
 const parsed=await json(receipt);assert.equal(parsed.status,'pass');assert.equal(parsed.archiveSha256,archive.sha256);assert.equal(parsed.archiveBytes,archive.size);return parsed;
}
async function donorSnapshot(meta){
 const records=[];for(const row of meta.manifest.required){const actual=await verifyRecord(spec.hostRoot,{...row,path:row.sourcePath});records.push({path:row.sourcePath,...actual});}
 return records;
}
async function verifyInstallation(receipt,meta,destination){
 assert.equal(receipt.status,'pass');assert.equal(receipt.installationRoot,destination);assert.equal(receipt.programGraphSha256,meta.graphSha256);assert.equal(receipt.hostVersion,spec.expected.hostVersion);assert.equal(receipt.sepVersion,spec.expected.sepVersion);
 for(const key of ['privateDataImported','originalHostModified','applicationStarted'])assert.equal(receipt[key],false);assert.equal(receipt.modelCalls,0);
 for(const key of ['configPath','launcherPath','managedLauncherPath'])assert(inside(destination,receipt[key]));
 const c=await json(receipt.configPath);assert.equal(c.dailyRoot,destination);assert.equal(c.graphHash,meta.graphSha256);
 for(const key of ['releaseRoot','home','storageRoot','controlRoot','lockDirectory','electronUserData','runtimeUser','credentialsPath','profileRoot','dailySelectionPath','desktopPayloadPath','nodeExecutable','pnpmEntry','desktopRuntimeRoot'])assert(inside(destination,c[key]),`escaped config field ${key}`);
 assert.equal((await realpath(destination)).toLowerCase(),destination.toLowerCase());
 for(const row of meta.graph.files)await verifyRecord(c.releaseRoot,row);
 await verifyRecord(c.releaseRoot,meta.manifest.graph);await verifyRecord(c.releaseRoot,meta.manifest.descriptor);
 assert.deepEqual(await listRegularFiles(c.releaseRoot),[...meta.graph.files.map(x=>x.path),'graph.json','desktop-runtime.json'].sort());
 for(const row of meta.manifest.support)await verifyRecord(destination,row);
 // This is the newly generated credential template, never another instance's key.
 const env=(await readFile(c.credentialsPath,'utf8')).split(/\r?\n/).filter(x=>x.trim()&&!x.trim().startsWith('#'));assert.deepEqual(env,['DEEPSEEK_API_KEY=']);
 const selection=await stableFile(c.dailySelectionPath,{maxBytes:1048576,capture:true});assert.equal(selection.sha256,c.dailySelectionSha256);const selected=JSON.parse(selection.bytes);
 assert.equal(selected.schema,2);assert.equal(selected.dsh,spec.expected.hostVersion);assert.equal(selected.sep,spec.expected.sepVersion);
 const runtime=selected.configuration.runtime,profileSelection=runtime.profile.selection,budgetPath=profileSelection.budgetPath;
 assert.equal(runtime.p1.budgetPath,budgetPath);assert(inside(destination,budgetPath));
 const ownerRoots=[...Object.values(profileSelection.roots),dirname(budgetPath)];
 for(let i=0;i<ownerRoots.length;i++){assert(inside(destination,ownerRoots[i]));for(let j=0;j<i;j++)assert(ownerRoots[i]!==ownerRoots[j]&&!inside(ownerRoots[i],ownerRoots[j])&&!inside(ownerRoots[j],ownerRoots[i]),'fresh budget/root ownership overlap');}
 const ledger=await json(budgetPath);assert.equal(ledger.version,3);assert.equal(ledger.currency,'CNY');assert.equal(ledger.initialSpent,0);assert.equal(ledger.limit,100);assert.deepEqual(ledger.entries,[]);assert.deepEqual(ledger.reconciliations,[]);assert.deepEqual(ledger.sessionLimits,{});assert.equal(ledger.sessionDefault.limitCny,100);
 assert(c.projects.length===1&&inside(destination,c.projects[0].root));
 assert.deepEqual(await listRegularFiles(join(c.home,'sessions')),[]);
 assert.deepEqual(await listRegularFiles(join(c.projects[0].root,'knowledge')),[]);
 assert.deepEqual(await json(join(destination,'installed.json')),receipt);
 await assert.rejects(lstat(join(destination,'INSTALLING.json')),{code:'ENOENT'});
 return {kind:meta.kind,root:destination,configPath:receipt.configPath,launcherPath:receipt.launcherPath,managedLauncherPath:receipt.managedLauncherPath,programGraphSha256:meta.graphSha256,config:c,receipt,blankCredential:true,emptySessions:true,emptyKnowledge:true,budgetPath,emptyBudget:true,ownerRootsDisjoint:true};
}
try{
 report.guardsBefore=await guardPublicEntries();check('daily-public-entry-fingerprints-before');
 for(const archive of spec.archives){
  tick('archive-sha-'+archive.kind);const actual=await stableFile(archive.path);assert.equal(actual.sha256,archive.sha256);assert.equal(actual.size,archive.size);
  const unpacked=join(output,'unpacked',archive.kind),destination=join(output,'installations',archive.kind);
  tick('extract-'+archive.kind);const extracted=await extract(archive,unpacked,archive.kind);
  tick('manifest-audit-'+archive.kind);const meta=await auditBundle(unpacked,spec.expected);assert.equal(meta.kind,archive.kind);assert.equal(meta.archiveRegularFiles,extracted.regularFiles);
  report.archives.push({kind:archive.kind,path:archive.path,sha256:archive.sha256,size:archive.size,unpacked,manifestSha256:meta.manifestSha256,graphSha256:meta.graphSha256,regularFiles:meta.archiveRegularFiles});
  tick('installer-refusals-'+archive.kind);const refusals=await exerciseInstallerRefusals({bundle:unpacked,meta,hostRoot:spec.hostRoot,output:join(output,'refusals-'+archive.kind)});report.checks.push(...refusals.checks);
  const donor=await donorSnapshot(meta);
  tick('install-'+archive.kind);const {install}=await import(pathToFileURL(join(unpacked,'installer.mjs')));
  const receipt=await install({bundle:unpacked,destination,...archive.kind==='sep'?{hostRoot:spec.hostRoot}:{}});
  tick('installed-program-audit-'+archive.kind);const installed=await verifyInstallation(receipt,meta,destination);report.installations.push(installed);
  tick('installed-runtime-smoke-'+archive.kind);installed.runtimeSmoke=await runtimeSmoke(installed.config,join(output,'runtime-'+archive.kind));check(archive.kind+'-actual-node-pnpm-python-runtime-smoke');
  assert.deepEqual(await donorSnapshot(meta),donor);check(archive.kind+'-exact-required-donor-bytes-unchanged');
 }
 const [a,b]=report.installations.map(x=>x.config);for(const field of ['dailyRoot','releaseRoot','home','storageRoot','controlRoot','lockDirectory','electronUserData','runtimeUser','credentialsPath'])assert.notEqual(a[field],b[field]);assert.notEqual(a.projects[0].id,b.projects[0].id);check('full-only-independent-configurations');
 report.guardsAfter=await guardPublicEntries();assert.deepEqual(report.guardsAfter,report.guardsBefore);check('daily-public-entry-fingerprints-after');
 report.status='pass';report.configurationsFrozen=true;report.hostValidation='not_run';report.desktopValidation='not_run';
}catch(error){report.status='fail';report.failedPhase=phase;report.error={code:error.code??'VERIFY_ASSERTION',message:String(error.message).slice(0,1000)};process.exitCode=1;}
finally{report.completedAt=new Date().toISOString();await writeFile(join(output,'RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,phase,result:join(output,'RESULT.json'),error:report.error}));}
