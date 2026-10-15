import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const repo='D:/AIData/ProjectWork/DSH/github-beta-publication-20261001/repository';
const source='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH ENHANCEMENGT SUITE/alpha2-portable-src';
const output='D:/AIData/ProjectWork/DSH/alpha2-portable-transactions-20261012-r1';
const daily='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH SYSTEM ENHANCEMENT PACKAGE/dsh-daily';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=args=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',windowsHide:true}).trim();
const [mode]=process.argv.slice(2);assert(['sync','checkpoint'].includes(mode));
const resultBytes=await readFile(join(output,'linux-evidence/RESULT.json')),result=JSON.parse(resultBytes);
assert.equal(result.status,'pass');assert.equal(result.finalExecutions,123);
for(const input of result.inputs)assert.equal(sha(await readFile(join(source,input.name))),input.sha256,input.name);
const dailyExpected={'launch.mjs':'da140dbad22fa4f6557d98f73e192e1135b29431dba08c0f9b13e4dd3977bf9f','deployment-rc2.json':'29e3d72617ecb35f97849eccca94d03395408be6dfa4ebef2dc350846f0f0175'};
const dailyActual={};for(const [name,expected] of Object.entries(dailyExpected)){dailyActual[name]=sha(await readFile(join(daily,name)));assert.equal(dailyActual[name],expected,'Daily entry unchanged: '+name);}
const unrelated=join(repo,'docs/BUNDLE15-REVIEW-RESPONSE.md'),unrelatedSha256=sha(await readFile(unrelated));
if(mode==='sync'){
 assert.equal(git(['rev-parse','HEAD']),result.sourceBase);assert.equal(git(['branch','--show-current']),'codex/sep-bundle-install-20261008');
 for(const name of [...result.inputs.map(x=>x.name),'finalize-transactions.mjs','export-transactions.mjs','seal-transactions.mjs','README.md','TRANSACTIONS.md'])await copyFile(join(source,name),join(repo,'tools/alpha2-portable',name));
 await copyFile(join(source,'TRANSACTIONS.md'),join(repo,'docs/ALPHA2-LINUX-TRANSACTIONS-20261012.md'));
 for(const name of ['ALPHA2-LINUX-FOUNDATION-20261012.md','BUNDLE-PLATFORM-CI.md']){
  const file=join(repo,'docs',name),old=await readFile(file,'utf8');
  assert(!old.startsWith('最新事务阶段'));
  await writeFile(file,'最新事务阶段见 [Linux 受控副本及提交恢复](ALPHA2-LINUX-TRANSACTIONS-20261012.md)：41 个定义三轮通过，仍仅合成载具；完整 Linux Profile blocked，桌面与 macOS not_run。下文为历史阶段证据。\n\n---\n\n'+old);
 }
 assert.equal(sha(await readFile(unrelated)),unrelatedSha256);git(['diff','--check']);
 await writeFile(join(output,'SYNC-AUDIT.json'),JSON.stringify({sourceBase:result.sourceBase,resultSha256:sha(resultBytes),dailyActual,unrelatedSha256},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({synced:result.inputs.length,unrelatedEditPreserved:true}));
}else{
 const previous=JSON.parse(await readFile(join(output,'SYNC-AUDIT.json'),'utf8'));assert.equal(unrelatedSha256,previous.unrelatedSha256);
 const commit=git(['rev-parse','HEAD']);assert.notEqual(commit,result.sourceBase);
 for(const input of result.inputs)assert.equal(sha(await readFile(join(repo,'tools/alpha2-portable',input.name))),input.sha256,input.name);
 const bundle=join(output,'source-checkpoint.bundle');git(['bundle','create',bundle,'HEAD']);git(['bundle','verify',bundle]);
 const audit={schema:1,status:'pass',scope:result.scope,commit,branch:git(['branch','--show-current']),checkpointSha256:sha(await readFile(bundle)),resultSha256:sha(resultBytes),testedInputs:result.inputs,dailyEntriesUnchanged:dailyActual,unrelatedEditPreserved:true,resourceAudit:result.resourceAudit,notVerified:result.notVerified};
 await writeFile(join(output,'FINAL-AUDIT.json'),JSON.stringify(audit,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({commit,checkpointSha256:audit.checkpointSha256,dailyEntriesUnchanged:true}));
}
