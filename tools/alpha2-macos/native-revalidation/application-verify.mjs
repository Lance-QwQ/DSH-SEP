// New validation generation. Historical r61/r74 runners and receipts are not edited.
import assert from 'node:assert/strict';
import {readFile,mkdir,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {userInfo} from 'node:os';
import {execFileSync} from 'node:child_process';
import {runOwnedCommand} from '../desktop/run-command.mjs';
import {inventoryPackage,verifyPackage} from '../package/package-inventory.mjs';
import {applicationEnvironment,writeEnvironment,outputDirectory,save,hash,runtimeRows,operatorSource} from './application-environment.mjs';
import {tapCounts,assertTapPass} from './application-contract.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,6);
const [mode,rootArg,sourceArg,outArg]=process.argv.slice(2),source=await realpath(sourceArg),out=await outputDirectory(outArg),temp=await realpath(process.env.RUNNER_TEMP);
assert.equal(source,await realpath(operatorSource));assert(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA??''));
const result={schema:1,status:'fail',scope:'current source using actual official Loader, blank governed Profile, native tree/parser/attachments and pending restart; synthetic LLM adapter, no paid endpoint',mode,sourceCommit:process.env.GITHUB_SHA,source,checks:[],expectedTests:41,fullMacCertification:'blocked'};
try{
 const sourceInventory=await inventoryPackage(source);await save(join(out,'SOURCE-INVENTORY.json'),sourceInventory);const rows=await runtimeRows(source);await save(join(out,'RUNTIME-INPUTS.json'),rows);
 const context=await applicationEnvironment(mode,rootArg,source),dependencyEnv=await writeEnvironment(context,out),p=context.p;
 Object.assign(result,{sourceTreeSha256:sourceInventory.treeSha256,runtimeInputsSha256:hash(JSON.stringify(rows)),applicationResultSha256:context.resultSha256,programSha256:context.programSha256,nodeSha256:p.entries.node.sha256,parserManifestSha256:p.entries.parserManifest.sha256,mac:execFileSync('/usr/bin/sw_vers',[],{encoding:'utf8'}).trim()});
 await mkdir(join(out,'tmp'),{mode:0o700});
 const clean={PATH:'/usr/bin:/bin',HOME:userInfo().homedir,LANG:'en_US.UTF-8',RUNNER_TEMP:temp,TMPDIR:join(out,'tmp'),TMP:join(out,'tmp'),TEMP:join(out,'tmp'),PYTHONDONTWRITEBYTECODE:'1',...dependencyEnv,SEP_MAC_PROGRAM_ROOT:source};
 const suites=[
  {name:'pending-loader-restart',count:8,files:['desktop/project-workflow-product/pending-startup/loader-repro.test.mjs','desktop/project-workflow-product/pending-startup/layout.test.mjs'],pending:true},
  {name:'document-contracts',count:22,files:['document-business/contracts.test.mjs'],realParser:false},
  {name:'document-vision-loader',count:7,files:['document-business/vision.test.mjs'],realParser:true},
  {name:'document-native-context',count:3,files:['document-business/native.test.mjs'],realParser:true},
  {name:'document-standalone',count:1,files:['document-business/standalone.test.mjs'],realParser:true},
 ];
 for(const suite of suites){
  const dir=join(out,suite.name);await mkdir(dir,{mode:0o700});let env={...clean,SEP_DOCUMENT_BASELINE:'0',SEP_DOCUMENT_REAL_PARSER:suite.realParser?'1':'0',SEP_DOCUMENT_TEST_ROOT:join(dir,'testdata')};
  if(suite.pending){await mkdir(join(dir,'receipts'),{mode:0o700});env={...env,SEP_PENDING_CANDIDATE:'1',SEP_PENDING_NATIVE:'1',SEP_MAC_BUSINESS_TEST_ROOT:join(dir,'testdata'),SEP_PENDING_REPRO_OUTPUT:join(dir,'receipts')};}
  const log=join(dir,'native.tap'),command=await runOwnedCommand({file:p.entries.node.path,args:['--test','--test-reporter=tap',...suite.files.map(f=>join(source,f))],cwd:dir,env,logPath:log,timeoutMs:240000}),tap=await readFile(log,'utf8'),row={name:suite.name,expectedTests:suite.count,realParser:suite.pending||suite.realParser,counts:tapCounts(tap),...command,tail:undefined,logSha256:hash(tap)};
  result.checks.push(row);assert.equal(command.status,'pass','SEP_NATIVE_APPLICATION_COMMAND');assertTapPass(tap,suite.count);
 }
 await verifyPackage(context.application,context.inventory);await verifyPackage(source,sourceInventory);assert.deepEqual(await runtimeRows(source),rows);
 Object.assign(result,{status:'pass',counts:{tests:41,pass:41,fail:0,skipped:0,cancelled:0},sourceUnchanged:true,applicationUnchanged:true,paidProviderCalls:0,notVerified:['AppKit or Electron UI lifecycle/physical gestures in this operator','existing private user data','Developer ID and notarization','other macOS/architecture','arbitrary descendant families after deadline; runner-local cleanup is not a global process audit']});
}catch(e){result.status=result.checks.some(r=>r.status==='blocked')?'blocked':'fail';result.code=/^(?:SEP|P2|FS)_[A-Z0-9_]{1,100}$/.test(e.code??e.message??'')?e.code??e.message:'SEP_NATIVE_APPLICATION_VERIFY';result.errorType=e.name;process.exitCode=1;}
await save(join(out,'RESULT.json'),result);console.log(JSON.stringify({status:result.status,code:result.code,counts:result.counts,checks:result.checks.map(c=>({name:c.name,status:c.status,counts:c.counts}))}));
