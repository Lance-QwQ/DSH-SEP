import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const repo='D:/AIData/ProjectWork/DSH/github-beta-publication-20261001/repository';
const source='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH ENHANCEMENGT SUITE/alpha2-portable-src';
const output='D:/AIData/ProjectWork/DSH/alpha2-portable-profile-20261012-r1';
const daily='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH SYSTEM ENHANCEMENT PACKAGE/dsh-daily';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=args=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',windowsHide:true}).trim();
const [mode]=process.argv.slice(2);assert(['sync','checkpoint'].includes(mode));
const resultBytes=await readFile(join(output,'linux-evidence-reviewed/RESULT.json')),result=JSON.parse(resultBytes);
assert.equal(result.status,'pass');assert.equal(result.uniqueFinalDefinitions,60);assert.equal(result.desktopRounds.length,2);
for(const input of result.inputs)assert.equal(sha(await readFile(join(source,input.name))),input.sha256,input.name);
assert.equal(sha(await readFile(join(source,'finalize-profile.mjs'))),result.evidenceControllerSha256);
const dailyExpected={'launch.mjs':'da140dbad22fa4f6557d98f73e192e1135b29431dba08c0f9b13e4dd3977bf9f','deployment-rc2.json':'29e3d72617ecb35f97849eccca94d03395408be6dfa4ebef2dc350846f0f0175'};
const dailyActual={};for(const [name,expected] of Object.entries(dailyExpected)){dailyActual[name]=sha(await readFile(join(daily,name)));assert.equal(dailyActual[name],expected,'Daily entry unchanged: '+name);}
const unrelated=join(repo,'docs/BUNDLE15-REVIEW-RESPONSE.md'),unrelatedSha256=sha(await readFile(unrelated));
const names=[...result.inputs.map(x=>x.name),'export-linux-desktop.mjs','run-profile.ps1','finalize-profile.mjs','export-profile.mjs','seal-profile.mjs','PROFILE.md','README.md','TRANSACTIONS.md','PHASE-REPORT.md'];
if(mode==='sync'){
 assert.equal(git(['rev-parse','HEAD']),result.sourceBase);assert.equal(git(['branch','--show-current']),'codex/sep-bundle-install-20261008');
 const prior=JSON.parse(await readFile(join(output,'SYNC-AUDIT.json'),'utf8'));
 assert.equal(unrelatedSha256,prior.unrelatedSha256);
 for(const input of prior.synced)assert.equal(sha(await readFile(join(repo,input.path))),input.sha256,'prior synchronized source unchanged: '+input.path);
 for(const name of names)await copyFile(join(source,name),join(repo,'tools/alpha2-portable',name));
 await copyFile(join(source,'PROFILE.md'),join(repo,'docs/ALPHA2-LINUX-PROFILE-20261012.md'));
 await copyFile(join(output,'linux-evidence-reviewed/RESULT.json'),join(repo,'docs/ALPHA2-LINUX-PROFILE-VERIFICATION.json'));
 await copyFile(join(output,'linux-evidence-reviewed/RESULT.json'),join(repo,'tools/alpha2-portable/ALPHA2-LINUX-PROFILE-VERIFICATION.json'));
 const current='最新 Linux 受控 Profile 阶段见 [恢复、工具隔离与真实桌面](ALPHA2-LINUX-PROFILE-20261012.md)：60 项事务/工具回归通过，真实 Linux 桌面两轮通过；完整 SEP 业务/受保护 Profile 仍 blocked，macOS not_run。Windows 日常 Alpha.2 保持原位，本轮未上传 GitHub。下文为历史阶段证据。\n\n---\n\n';
 for(const name of ['ALPHA2-LINUX-FOUNDATION-20261012.md','ALPHA2-LINUX-TRANSACTIONS-20261012.md','BUNDLE-PLATFORM-CI.md','BUNDLE-CURRENT-INDEX.md']){const file=join(repo,'docs',name),old=await readFile(file,'utf8');assert(old.startsWith(current));}
 assert((await readFile(join(repo,'README.md'),'utf8')).startsWith('# 最新本地阶段：Alpha.2 Linux'));
 assert.equal(sha(await readFile(unrelated)),unrelatedSha256);git(['diff','--check']);
 const synced=[];for(const name of names)synced.push({path:'tools/alpha2-portable/'+name,sha256:sha(await readFile(join(repo,'tools/alpha2-portable',name)))});
 await writeFile(join(output,'SYNC-REVIEWED-AUDIT.json'),JSON.stringify({sourceBase:result.sourceBase,resultSha256:sha(resultBytes),dailyActual,unrelatedSha256,synced},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({synced:names.length,unrelatedEditPreserved:true}));
}else{
 const previous=JSON.parse(await readFile(join(output,'SYNC-REPRODUCTION-AUDIT.json'),'utf8'));assert.equal(unrelatedSha256,previous.unrelatedSha256);
 const commit=git(['rev-parse','HEAD']);assert.notEqual(commit,result.sourceBase);
 for(const input of previous.synced)assert.equal(sha(await readFile(join(repo,input.path))),input.sha256,input.path);
 const bundle=join(output,'source-checkpoint-verified.bundle');await assert.rejects(access(bundle),{code:'ENOENT'});git(['bundle','create',bundle,'HEAD']);git(['bundle','verify',bundle]);
 const restored=join(output,'checkpoint-restore-verified');await assert.rejects(access(restored),{code:'ENOENT'});git(['clone','--no-checkout','--config','core.autocrlf=false',bundle,restored]);
 const restoredGit=args=>execFileSync('git',['-C',restored,...args],{encoding:'utf8',windowsHide:true}).trim();restoredGit(['checkout','--detach',commit]);
 for(const input of previous.synced)assert.equal(sha(await readFile(join(restored,input.path))),input.sha256,'restore: '+input.path);
 assert.equal(sha(await readFile(join(restored,'docs/ALPHA2-LINUX-PROFILE-VERIFICATION.json'))),sha(resultBytes));
 const audit={schema:1,status:'pass',scope:result.scope,commit,branch:git(['branch','--show-current']),checkpointFile:'source-checkpoint-verified.bundle',restoreCoreAutocrlf:restoredGit(['config','--get','core.autocrlf']),checkpointSha256:sha(await readFile(bundle)),restoredCommit:restoredGit(['rev-parse','HEAD']),restoredSyncedFiles:previous.synced.length,resultSha256:sha(resultBytes),testedInputs:result.inputs,dailyEntriesUnchanged:dailyActual,unrelatedEditPreserved:true,resourceAudit:result.resourceAudit,notVerified:result.notVerified};
 await writeFile(join(output,'FINAL-AUDIT.json'),JSON.stringify(audit,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({commit,checkpointSha256:audit.checkpointSha256,restoredFiles:audit.restoredSyncedFiles,dailyEntriesUnchanged:true}));
}
