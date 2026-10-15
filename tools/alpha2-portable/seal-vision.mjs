import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const repo='D:/AIData/ProjectWork/DSH/github-beta-publication-20261001/repository',source='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH ENHANCEMENGT SUITE/alpha2-portable-src',output='D:/AIData/ProjectWork/DSH/alpha2-linux-vision-20261012-r1',daily='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH SYSTEM ENHANCEMENT PACKAGE/dsh-daily';
const sha=x=>createHash('sha256').update(x).digest('hex'),git=args=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',windowsHide:true}).trim();
const mode=process.argv[2];assert(['sync','checkpoint'].includes(mode));
const resultBytes=await readFile(join(output,'linux-evidence/RESULT.json')),result=JSON.parse(resultBytes);assert.equal(result.status,'pass');assert.equal(result.final.tests,116);assert.equal(result.desktopRounds.length,2);
for(const input of result.inputs)assert.equal(sha(await readFile(join(source,input.name))),input.sha256,'tested source: '+input.name);
const dailyActual={};for(const [name,expected]of Object.entries({'launch.mjs':'da140dbad22fa4f6557d98f73e192e1135b29431dba08c0f9b13e4dd3977bf9f','deployment-rc2.json':'29e3d72617ecb35f97849eccca94d03395408be6dfa4ebef2dc350846f0f0175'})){dailyActual[name]=sha(await readFile(join(daily,name)));assert.equal(dailyActual[name],expected,'daily unchanged');}
const unrelated='docs/BUNDLE15-REVIEW-RESPONSE.md',unrelatedSha256=sha(await readFile(join(repo,unrelated))),prior=JSON.parse(await readFile('D:/AIData/ProjectWork/DSH/alpha2-linux-documents-20261012-r1/SYNC-AUDIT.json'));assert.equal(unrelatedSha256,prior.unrelatedSha256,'preserve user edit');
if(mode==='sync'){
 assert.equal(git(['rev-parse','HEAD']),result.sourceBase);assert.equal(git(['branch','--show-current']),'codex/sep-bundle-install-20261008');assert.equal(git(['diff','--cached','--name-only']),'');assert.equal(git(['diff','--name-only']),unrelated);
 const names=[...result.inputs.map(x=>x.name),'finalize-vision.mjs','export-vision.mjs','seal-vision.mjs','collect-vision.ps1','VISION.md','README.md'],owned=[];
 for(const name of names){const path='tools/alpha2-portable/'+name;await copyFile(join(source,name),join(repo,path));owned.push(path);}
 for(const [from,to]of [[join(source,'VISION.md'),'docs/ALPHA2-LINUX-VISION-20261012.md'],[join(output,'linux-evidence/RESULT.json'),'docs/ALPHA2-LINUX-VISION-VERIFICATION.json']]){await copyFile(from,join(repo,to));owned.push(to);}
 const prefix='最新 Linux 视觉与图像附件治理见 [本轮报告](ALPHA2-LINUX-VISION-20261012.md)：116 项相关回归及两轮真实 Electron 桌面检查通过；在线模型响应合成，非图像原生文件附件 blocked，完整 Linux SEP 仍 blocked。Windows 日常版未改动，未上传 GitHub。下文为历史阶段证据。\n\n---\n\n';
 const index='docs/BUNDLE-CURRENT-INDEX.md';await writeFile(join(repo,index),prefix+await readFile(join(repo,index),'utf8'));owned.push(index);
 const readme=await readFile(join(repo,'README.md'),'utf8'),boundary=readme.indexOf('\n---\n');assert(readme.startsWith('# 最新本地阶段：Alpha.2 Linux 文档删除事务'));assert(boundary>0);
 await writeFile(join(repo,'README.md'),'# 最新本地阶段：Alpha.2 Linux 视觉与图像附件治理\n\n已接入受控候选图像读取、官方原生附件归一化与请求变体、现有共享账本、私有附件域和离线精确确认清除。116/116 项相关回归通过，两轮真实 Linux Electron 桌面及退出后独立租约检查通过；三个真实 SIGKILL 切点的清除恢复已验证。模型响应合成，在线视觉效果未验证；非图像原生文件附件明确拒绝。完整 Linux SEP 仍 blocked，原生附件 UI、点击/后端及通用安装更新待适配。仅专用 WSL2/ext4 合成范围。见 [报告](docs/ALPHA2-LINUX-VISION-20261012.md) 与 [输入/日志索引](docs/ALPHA2-LINUX-VISION-VERIFICATION.json)。Windows 日常版未改动，未上传 GitHub。下文保留历史版本记录。\n'+readme.slice(boundary));owned.push('README.md');
 assert.equal(sha(await readFile(join(repo,unrelated))),unrelatedSha256);git(['diff','--check']);
 const synced=[];for(const path of owned)synced.push({path,sha256:sha(await readFile(join(repo,path)))});
 await writeFile(join(output,'SYNC-AUDIT.json'),JSON.stringify({status:'pass',sourceBase:result.sourceBase,resultSha256:sha(resultBytes),dailyActual,unrelatedSha256,synced},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({synced:synced.length,dailyUnchanged:true,userEditPreserved:true}));
}else{
 const sync=JSON.parse(await readFile(join(output,'SYNC-AUDIT.json')));assert.equal(unrelatedSha256,sync.unrelatedSha256);const commit=git(['rev-parse','HEAD']);assert.equal(git(['rev-parse','HEAD^']),result.sourceBase);for(const row of sync.synced)assert.equal(sha(await readFile(join(repo,row.path))),row.sha256,row.path);
 const bundle=join(output,'source-checkpoint.bundle');await assert.rejects(access(bundle),{code:'ENOENT'});git(['bundle','create',bundle,'HEAD']);git(['bundle','verify',bundle]);
 const restored=join(output,'checkpoint-restore');await assert.rejects(access(restored),{code:'ENOENT'});git(['clone','--no-checkout','--config','core.autocrlf=false',bundle,restored]);const restoredGit=args=>execFileSync('git',['-C',restored,...args],{encoding:'utf8',windowsHide:true}).trim();restoredGit(['checkout','--detach',commit]);for(const row of sync.synced)assert.equal(sha(await readFile(join(restored,row.path))),row.sha256,'restored '+row.path);
 const audit={schema:1,status:'pass',commit,branch:git(['branch','--show-current']),checkpointFile:'source-checkpoint.bundle',checkpointSha256:sha(await readFile(bundle)),restoredCommit:restoredGit(['rev-parse','HEAD']),restoredFiles:sync.synced.length,resultSha256:sha(resultBytes),dailyActual,userEditPreserved:true,resourceAudit:result.resourceAudit,notVerified:result.notVerified};await writeFile(join(output,'FINAL-AUDIT.json'),JSON.stringify(audit,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({commit,checkpointSha256:audit.checkpointSha256,restoredFiles:audit.restoredFiles,dailyUnchanged:true}));
}
