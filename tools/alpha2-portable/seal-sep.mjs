import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const repo='D:/AIData/ProjectWork/DSH/github-beta-publication-20261001/repository',source='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH ENHANCEMENGT SUITE/alpha2-portable-src',output='D:/AIData/ProjectWork/DSH/alpha2-linux-full-sep-20261012-r1',daily='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH SYSTEM ENHANCEMENT PACKAGE/dsh-daily';
const sha=x=>createHash('sha256').update(x).digest('hex'),git=args=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',windowsHide:true}).trim();
const [mode]=process.argv.slice(2);assert(['sync','checkpoint'].includes(mode));
const resultBytes=await readFile(join(output,'linux-evidence-reviewed/RESULT.json')),result=JSON.parse(resultBytes);assert.equal(result.status,'pass');assert.equal(result.uniqueFinalDefinitions,79);assert.equal(result.desktopRounds.length,2);
for(const input of result.inputs)assert.equal(sha(await readFile(join(source,input.name))),input.sha256,'tested/source input: '+input.name);
const dailyActual={};for(const [name,expected]of Object.entries({'launch.mjs':'da140dbad22fa4f6557d98f73e192e1135b29431dba08c0f9b13e4dd3977bf9f','deployment-rc2.json':'29e3d72617ecb35f97849eccca94d03395408be6dfa4ebef2dc350846f0f0175'})){dailyActual[name]=sha(await readFile(join(daily,name)));assert.equal(dailyActual[name],expected,'daily unchanged');}
const unrelated='docs/BUNDLE15-REVIEW-RESPONSE.md',unrelatedSha256=sha(await readFile(join(repo,unrelated)));
if(mode==='sync'){
 assert.equal(git(['rev-parse','HEAD']),result.sourceBase);assert.equal(git(['branch','--show-current']),'codex/sep-bundle-install-20261008');assert.equal(git(['diff','--cached','--name-only']),'');
 const previous=JSON.parse(await readFile(join(output,'SYNC-AUDIT.json')));assert.equal(unrelatedSha256,previous.unrelatedSha256);
 for(const row of previous.synced)assert.equal(sha(await readFile(join(repo,row.path))),row.sha256,'prior synchronized copy: '+row.path);
 assert(git(['diff','--name-only']).split('\n').every(p=>p===unrelated||previous.synced.some(row=>row.path===p)),'preserve external edits');
 const names=[...result.inputs.map(x=>x.name),'export-sep.mjs','seal-sep.mjs','SEP-CORE.md','README.md'];
 const owned=[];for(const name of names){const path='tools/alpha2-portable/'+name;await copyFile(join(source,name),join(repo,path));owned.push(path);}
 for(const [from,to]of [[join(source,'SEP-CORE.md'),'docs/ALPHA2-LINUX-SEP-CORE-20261012.md'],[join(output,'linux-evidence-reviewed/RESULT.json'),'docs/ALPHA2-LINUX-SEP-CORE-VERIFICATION.json']]){await copyFile(from,join(repo,to));owned.push(to);}
 const prefix='最新 Linux SEP 业务核心组合见 [本轮适配](ALPHA2-LINUX-SEP-CORE-20261012.md)：79 项回归及两轮真实桌面记忆/预算设置验证通过；已补入显式 userProfile 接线。完整 Linux SEP 仍 blocked，文档删除、视觉附件与平台服务等仍待适配。Windows 日常版未改动，未上传 GitHub。以下为历史阶段证据。\n\n---\n\n';
 for(const name of ['ALPHA2-LINUX-PROFILE-20261012.md','ALPHA2-LINUX-FOUNDATION-20261012.md','ALPHA2-LINUX-TRANSACTIONS-20261012.md','BUNDLE-PLATFORM-CI.md','BUNDLE-CURRENT-INDEX.md']){const path='docs/'+name,old=await readFile(join(repo,path),'utf8');assert(!old.startsWith(prefix));await writeFile(join(repo,path),prefix+old);owned.push(path);}
 const readme=await readFile(join(repo,'README.md'),'utf8');assert(readme.startsWith('# 最新本地阶段：Alpha.2 Linux SEP 业务核心组合'));const boundary=readme.indexOf('\n---\n');assert(boundary>0);
 await writeFile(join(repo,'README.md'),'# 最新本地阶段：Alpha.2 Linux SEP 业务核心组合\n\n已接入真实 SEP 四层记忆、BM25、Mem0/自动捕获、预算设置、PinchBench/委派和桌面设置页：79 项回归、两轮真实桌面验证通过，显式 userProfile 接线已修复。完整 Linux SEP 仍 blocked，文档删除、视觉附件、点击/判题后端及通用安装/更新待适配。仅专用 WSL2/ext4 合成范围；私人库、付费模型和 macOS 未认证。见 [本轮报告](docs/ALPHA2-LINUX-SEP-CORE-20261012.md) 与 [逐文件证据](docs/ALPHA2-LINUX-SEP-CORE-VERIFICATION.json)。Windows 日常版未改动，未上传 GitHub。下文为历史版本记录。\n'+readme.slice(boundary));owned.push('README.md');
 assert.equal(sha(await readFile(join(repo,unrelated))),unrelatedSha256);git(['diff','--check']);
 const synced=[];for(const path of owned)synced.push({path,sha256:sha(await readFile(join(repo,path)))});
 await writeFile(join(output,'SYNC-REVIEWED-AUDIT.json'),JSON.stringify({status:'pass',sourceBase:result.sourceBase,resultSha256:sha(resultBytes),dailyActual,unrelatedSha256,synced},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({synced:synced.length,dailyUnchanged:true,userEditPreserved:true}));
}else{
 const sync=JSON.parse(await readFile(join(output,'SYNC-REVIEWED-AUDIT.json')));assert.equal(unrelatedSha256,sync.unrelatedSha256);const commit=git(['rev-parse','HEAD']);assert.equal(git(['rev-parse','HEAD^']),result.sourceBase);
 for(const row of sync.synced)assert.equal(sha(await readFile(join(repo,row.path))),row.sha256,row.path);
 const bundle=join(output,'source-checkpoint.bundle');await assert.rejects(access(bundle),{code:'ENOENT'});git(['bundle','create',bundle,'HEAD']);git(['bundle','verify',bundle]);
 const restored=join(output,'checkpoint-restore');await assert.rejects(access(restored),{code:'ENOENT'});git(['clone','--no-checkout','--config','core.autocrlf=false',bundle,restored]);
 const restoredGit=args=>execFileSync('git',['-C',restored,...args],{encoding:'utf8',windowsHide:true}).trim();restoredGit(['checkout','--detach',commit]);
 for(const row of sync.synced)assert.equal(sha(await readFile(join(restored,row.path))),row.sha256,'restored '+row.path);
 const audit={schema:1,status:'pass',commit,branch:git(['branch','--show-current']),checkpointFile:'source-checkpoint.bundle',checkpointSha256:sha(await readFile(bundle)),restoredCommit:restoredGit(['rev-parse','HEAD']),restoredFiles:sync.synced.length,resultSha256:sha(resultBytes),dailyActual,userEditPreserved:true,resourceAudit:result.resourceAudit,notVerified:result.notVerified};
 await writeFile(join(output,'FINAL-AUDIT.json'),JSON.stringify(audit,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({commit,checkpointSha256:audit.checkpointSha256,restoredFiles:audit.restoredFiles,dailyUnchanged:true}));
}
