// Resume only the byte-verified local publication after its whitespace check.
// No re-prefixing of indexes and no test/source changes are permitted here.
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const repo='D:/AIData/ProjectWork/DSH/github-beta-publication-20261001/repository',source='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH ENHANCEMENGT SUITE/alpha2-portable-src',output='D:/AIData/ProjectWork/DSH/alpha2-linux-vision-20261012-r1',daily='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH SYSTEM ENHANCEMENT PACKAGE/dsh-daily';
const sha=b=>createHash('sha256').update(b).digest('hex'),git=args=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',windowsHide:true}).trim();
const resultBytes=await readFile(join(output,'linux-evidence/RESULT.json')),result=JSON.parse(resultBytes);assert.equal(result.final.tests,116);assert.equal(result.final.pass,116);assert.equal(result.desktopRounds.length,2);assert.equal(git(['rev-parse','HEAD']),result.sourceBase);assert.equal(git(['branch','--show-current']),'codex/sep-bundle-install-20261008');assert.equal(git(['diff','--cached','--name-only']),'');
const names=[...result.inputs.map(x=>x.name),'finalize-vision.mjs','export-vision.mjs','seal-vision.mjs','collect-vision.ps1','VISION.md','README.md'],owned=names.map(x=>'tools/alpha2-portable/'+x);
for(const row of result.inputs){assert.equal(sha(await readFile(join(source,row.name))),row.sha256);assert.equal(sha(await readFile(join(repo,'tools/alpha2-portable',row.name))),row.sha256);}
for(const name of names){const a=await readFile(join(source,name)),b=await readFile(join(repo,'tools/alpha2-portable',name));if(name==='README.md'){assert.equal(a.toString().trimEnd(),b.toString().trimEnd());await writeFile(join(repo,'tools/alpha2-portable',name),a);}else assert.equal(sha(a),sha(b),name);}
for(const [a,b]of [[join(source,'VISION.md'),'docs/ALPHA2-LINUX-VISION-20261012.md'],[join(output,'linux-evidence/RESULT.json'),'docs/ALPHA2-LINUX-VISION-VERIFICATION.json']]){assert.equal(sha(await readFile(a)),sha(await readFile(join(repo,b))));owned.push(b);}
for(const path of ['README.md','docs/BUNDLE-CURRENT-INDEX.md']){const current=await readFile(join(repo,path),'utf8'),old=execFileSync('git',['-C',repo,'show','HEAD:'+path],{encoding:'utf8',windowsHide:true});assert(current.includes('116'));assert.equal(current.split('下文保留历史版本记录。').length,path==='README.md'?2:1);const boundary=old.indexOf('\n---\n');assert(path==='README.md'?current.endsWith(old.slice(boundary)):current.endsWith(old));owned.push(path);}
const self='tools/alpha2-portable/finish-vision-sync.mjs';await copyFile(join(source,'finish-vision-sync.mjs'),join(repo,self));owned.push(self);
const prior=JSON.parse(await readFile('D:/AIData/ProjectWork/DSH/alpha2-linux-documents-20261012-r1/SYNC-AUDIT.json')),unrelated='docs/BUNDLE15-REVIEW-RESPONSE.md',unrelatedSha256=sha(await readFile(join(repo,unrelated)));assert.equal(unrelatedSha256,prior.unrelatedSha256);
for(const path of git(['diff','--name-only']).split('\n'))assert(path===unrelated||owned.includes(path),'unrelated tracked change: '+path);
const dailyActual={};for(const [name,expected]of Object.entries(prior.dailyActual)){dailyActual[name]=sha(await readFile(join(daily,name)));assert.equal(dailyActual[name],expected);}
git(['diff','--check']);const synced=[];for(const path of owned)synced.push({path,sha256:sha(await readFile(join(repo,path)))});
await writeFile(join(output,'SYNC-AUDIT.json'),JSON.stringify({status:'pass',sourceBase:result.sourceBase,resultSha256:sha(resultBytes),dailyActual,unrelatedSha256,synced,resumeReason:'Initial sync copied the verified source; diff --check then rejected a README trailing blank line. Resume verifies every core byte and fixes whitespace only.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'pass',synced:synced.length,dailyUnchanged:true,userEditPreserved:true}));
