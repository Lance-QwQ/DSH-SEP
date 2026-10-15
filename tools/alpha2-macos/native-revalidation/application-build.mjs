// Reuse the actual signed assembler only after current native tests pass.
// This writes a new candidate; it never changes the fixed carrier or daily app.
import assert from 'node:assert/strict';
import {readFile,realpath,lstat} from 'node:fs/promises';
import {join,resolve,dirname,sep} from 'node:path';
import {runOwnedCommand} from '../desktop/run-command.mjs';
import {verifyPackage} from '../package/package-inventory.mjs';
import {applicationEnvironment,runtimeRows,operatorSource,save,hash} from './application-environment.mjs';
import {validateRuntimeReceipt} from './application-contract.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,7);
const [baseArg,sourceArg,asarArg,outArg,verifiedArg]=process.argv.slice(2),source=await realpath(sourceArg),base=await realpath(baseArg),asar=await realpath(asarArg),out=resolve(outArg),verified=await realpath(verifiedArg),temp=await realpath(process.env.RUNNER_TEMP),git=await realpath(process.env.GITHUB_WORKSPACE);
assert.equal(source,await realpath(operatorSource));assert(source.startsWith(git+sep));for(const p of [base,asar,out,verified])assert(p.startsWith(temp+sep));assert.equal(await realpath(dirname(out)),dirname(out));await assert.rejects(lstat(out),{code:'ENOENT'});
const result={schema:1,status:'fail',scope:'current 84 runtime bytes in freshly rebuilt and ad-hoc signed r44 derivative; source native tests gated build',sourceCommit:process.env.GITHUB_SHA,fullMacCertification:'blocked'};
try{
 const verifiedBytes=await readFile(join(verified,'RESULT.json')),verification=JSON.parse(verifiedBytes),sourceInventory=JSON.parse(await readFile(join(verified,'SOURCE-INVENTORY.json'))),rows=await runtimeRows(source);
 assert.equal(verification.status,'pass');assert.equal(verification.mode,'fixed');assert.equal(verification.sourceCommit,process.env.GITHUB_SHA);assert.equal(verification.source,source);assert.equal(verification.sourceUnchanged,true);assert.equal(verification.applicationUnchanged,true);assert.deepEqual(verification.counts,{tests:41,pass:41,fail:0,skipped:0,cancelled:0});assert.equal(verification.sourceTreeSha256,sourceInventory.treeSha256);assert.equal(verification.runtimeInputsSha256,hash(JSON.stringify(rows)));await verifyPackage(source,sourceInventory);
 const context=await applicationEnvironment('fixed',base,source);assert.equal(verification.applicationResultSha256,context.resultSha256);assert.equal(verification.programSha256,context.programSha256);
 const command=await runOwnedCommand({file:context.p.entries.node.path,args:[join(source,'package/assemble-pending-application.mjs'),base,source,asar,out],cwd:dirname(out),env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,RUNNER_TEMP:temp,GITHUB_WORKSPACE:git,GITHUB_SHA:process.env.GITHUB_SHA,LANG:'en_US.UTF-8'},logPath:out+'-build.log',timeoutMs:1800000});result.command={...command,tail:undefined};assert.equal(command.status,'pass','SEP_NATIVE_APPLICATION_BUILD');
 const built=await applicationEnvironment('built',out,source);validateRuntimeReceipt(built.result.runtime,rows);await verifyPackage(source,sourceInventory);
 Object.assign(result,{status:'pass',verificationSha256:hash(verifiedBytes),assemblyResultSha256:built.resultSha256,sourceTreeSha256:sourceInventory.treeSha256,runtimeFiles:84,programSha256:built.programSha256,bootstrapSha256:built.result.bootstrapSha256,treeSha256:built.inventory.treeSha256,artifact:built.result.artifact,artifactSha256:built.result.artifactSha256,artifactBytes:built.result.artifactBytes,sourceUnchanged:true,originalUnchanged:true,notVerified:['new application runtime post-build replay (separate application-verify built invocation)','physical desktop interaction','Gatekeeper/Developer ID/notarization','existing user private data']});
}catch(e){result.status=result.command?.status==='blocked'?'blocked':'fail';result.code=/^SEP_[A-Z0-9_]{1,100}$/.test(e.code??e.message??'')?e.code??e.message:'SEP_NATIVE_APPLICATION_BUILD';result.errorType=e.name;process.exitCode=1;}
await save(out+'-REVALIDATION.json',result);console.log(JSON.stringify({status:result.status,code:result.code,artifact:result.artifact}));
