// Operator only. Fixed r61 supplies immutable native dependencies; candidate
// modules live in the CI source tree. The application itself is never edited.
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir,realpath,open} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawn,execFileSync} from 'node:child_process';import {userInfo} from 'node:os';import {setTimeout as delay} from 'node:timers/promises';
import {readCandidate} from '../candidate-binding.mjs';import {verifyPackage} from '../../../package/package-inventory.mjs';import {loadProgram} from '../../managed-broker/program-manifest.mjs';
const {files:PENDING_INPUTS}=JSON.parse(await readFile(new URL('./package-inputs.json',import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,4);
const temp=await realpath(process.env.RUNNER_TEMP),restoredRoot=await realpath(process.argv[2]),output=resolve(process.argv[3]),source=fileURLToPath(new URL('../../../',import.meta.url));
assert(output.startsWith(temp+sep));assert.equal(await realpath(resolve(output,'..')),resolve(output,'..'));await mkdir(output,{mode:0o700});
let child,exit=null,result={schema:1,status:'fail',scope:'actual official Loader, production Mac workflow factory, P2, parser and cold attachments; not full application UI',expectedTests:8,paidCalls:0,forcedTermination:false};
try{
 const pins=JSON.parse(await readFile(new URL('../candidate-pins.json',import.meta.url))),assembly=await readCandidate({resultPath:join(restoredRoot,'evidence/project-build/RESULT.json'),resultSha256:pins.assemblySha256,restoredRoot,runnerTemp:temp}),inventory=JSON.parse(await readFile(join(restoredRoot,'PACKAGE-INVENTORY.json')));
 await verifyPackage(assembly.restoredApplication,inventory);const p=await loadProgram(join(assembly.restoredApplication,'Contents/Resources/PROGRAM.json'),assembly.programSha256);
 const inputs=[];for(const row of assembly.runtime){const bytes=await readFile(join(source,row.source));assert.equal(sha(bytes),row.sha256,'old runtime '+row.source);inputs.push({path:row.source,sha256:row.sha256,bytes:bytes.length,origin:'r61-runtime'});}
 for(const row of PENDING_INPUTS){const bytes=await readFile(join(source,row.source));assert.equal(sha(bytes),row.sha256,'candidate '+row.source);assert.equal(bytes.length,row.bytes);inputs.push({...row,origin:'pending-candidate'});}
 const here=fileURLToPath(new URL('.',import.meta.url));for(const name of ['loader-fixture.mjs','loader-repro.test.mjs','layout.test.mjs','run-native.mjs','package-inputs.json']){const bytes=await readFile(join(here,name));inputs.push({path:'desktop/project-workflow-product/pending-startup/'+name,sha256:sha(bytes),bytes:bytes.length,origin:'operator'});}
 const inputBytes=JSON.stringify({schema:1,programSha256:assembly.programSha256,assemblySha256:pins.assemblySha256,inputs},null,2)+'\n';await writeFile(join(output,'INPUTS.json'),inputBytes,{flag:'wx',mode:0o600});
 const fixture=join(output,'parser-fixture.json');await writeFile(fixture,JSON.stringify({runtimeRoot:p.parserRoot,manifestSha256:p.entries.parserManifest.sha256})+'\n',{flag:'wx',mode:0o600});
 await mkdir(join(output,'tmp'),{mode:0o700});await mkdir(join(output,'receipts'),{mode:0o700});
 const env={PATH:'/usr/bin:/bin',HOME:userInfo().homedir,LANG:'en_US.UTF-8',RUNNER_TEMP:temp,TMPDIR:join(output,'tmp'),TMP:join(output,'tmp'),TEMP:join(output,'tmp'),SEP_PENDING_CANDIDATE:'1',SEP_PENDING_NATIVE:'1',SEP_MAC_BUSINESS_TEST_ROOT:join(output,'testdata'),SEP_PENDING_REPRO_OUTPUT:join(output,'receipts'),SEP_OFFICIAL_HARNESS:p.hostRoot,SEP_MAC_BUNDLE_ROOT:p.bundleRoot,SEP_MAC_PROGRAM_ROOT:source,SEP_MAC_TREE_HELPER:p.entries.helper.path,SEP_MAC_ATTACHMENT_HELPER:p.entries.attachmentHelper.path,SEP_PARSER_ASSEMBLY_FIXTURE:fixture};
 const stdout=await open(join(output,'native.tap'),'wx',0o600),stderr=await open(join(output,'native.stderr'),'wx',0o600);
 try{
  child=spawn(p.entries.node.path,['--test','--test-reporter=tap',join(here,'loader-repro.test.mjs'),join(here,'layout.test.mjs')],{cwd:output,env,stdio:['ignore',stdout.fd,stderr.fd]});
  child.once('close',(code,signal)=>{exit={code,signal};});child.once('error',()=>{exit={code:null,signal:null,spawnError:true};});
  const deadline=Date.now()+180000;while(!exit&&Date.now()<deadline)await delay(50);
 }finally{await stdout.close();await stderr.close();}
 const tap=await readFile(join(output,'native.tap'),'utf8'),counts=Object.fromEntries(['tests','pass','fail','skipped','cancelled'].map(key=>[key,Number(tap.match(new RegExp('^# '+key+' (\\d+)$','m'))?.[1]??-1)]));
 result={...result,status:exit?.code===0&&exit.signal===null&&!exit.spawnError&&JSON.stringify(counts)===JSON.stringify({tests:8,pass:8,fail:0,skipped:0,cancelled:0})?'pass':exit?'fail':'blocked',exit,pid:child.pid??null,counts,inputsSha256:sha(inputBytes),programSha256:assembly.programSha256,parserManifestSha256:p.entries.parserManifest.sha256,nodeSha256:p.entries.node.sha256,mac:execFileSync('/usr/bin/sw_vers',[],{encoding:'utf8'}).trim(),notVerified:['new signed application','two-round project DOM','native user confirmation','physical interaction']};
 if(!exit)child.unref();
 if(exit){await verifyPackage(assembly.restoredApplication,inventory);result.originalApplicationUnchanged=true;}
}catch(e){result={...result,status:child&&!exit?'blocked':'fail',code:/^(?:SEP|P2|FS)_[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_PENDING_NATIVE_OPERATOR',errorType:e.name,exit,pid:child?.pid??null};if(child&&!exit)child.unref();}
await writeFile(join(output,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,code:result.code,counts:result.counts}));if(result.status!=='pass')process.exitCode=1;
