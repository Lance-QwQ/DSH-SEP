// One-time recovery of this owned, staged checkpoint after Git's CRLF diagnostic.
// Refuses any changed prior source, unrelated index entry or different repository HEAD.
import {readFile,writeFile,readdir,lstat,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const P='D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1';
const R='D:\\AIData\\ProjectWork\\DSH\\github-beta-publication-20261001\\repository';
const S=dirname(import.meta.dirname),sub='tools/alpha2-windows',dest=join(R,sub),out=join(P,'source-checkpoint');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trimEnd();
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const base=await json(join(P,'BASELINE.json')),old=await json(join(out,'SOURCE-INPUTS.json'));
const changed='build/checkpoint-source.mjs',added='build/resume-checkpoint.mjs';
for(const root of [P,R,dest,out])assert.equal((await realpath(root)).toLowerCase(),root.toLowerCase());
assert.equal(old.baseCommit,base.sourceCommit);assert.equal(old.sourceRoot,S);assert.equal(old.repositorySubdirectory,sub);
assert.equal(git(R,'rev-parse','HEAD'),base.sourceCommit);assert.equal(git(R,'branch','--show-current'),base.sourceBranch);
assert.deepEqual(git(R,'diff','--cached','--name-only').split(/\r?\n/).sort(),old.files.map(r=>sub+'/'+r.path).sort());
const untouched=git(R,'status','--porcelain').split(/\r?\n/).filter(row=>!row.startsWith('A  '+sub+'/'));
assert.deepEqual(untouched,base.gitStatus);
for(const row of old.files){
 const full=join(dest,row.path),stat=await lstat(full);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);assert.equal((await realpath(full)).toLowerCase(),full.toLowerCase());
 const previous=await readFile(join(dest,row.path));assert.equal(previous.length,row.size);assert.equal(sha(previous),row.sha256);
 if(row.path!==changed)assert.equal(sha(await readFile(join(S,row.path))),row.sha256);
}
const previous=await readFile(join(dest,changed),'utf8'),current=await readFile(join(S,changed),'utf8');
const before="git(R,'diff','--cached','--check');";
assert.equal(previous.split(before).length,2);
assert.equal(current,previous.replace(before,"// Preserve the hash-bound CRLF origin record; recognize CRLF only for this check.\ngit(R,'-c','core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol','diff','--cached','--check');"));
assert.equal(sha(await readFile(join(dest,'installer/DAILY-PROFILE-ORIGIN.json'))),'dba05a978d1fce394aa4e9ecd523cca8542138ff89c9ef89309e69763fd33d53');
await assert.rejects(lstat(join(dest,added)),{code:'ENOENT'});await assert.rejects(lstat(join(out,'CHECKPOINT.json')),{code:'ENOENT'});
const rows=[];
async function collect(rel=''){
 for(const name of (await readdir(join(S,rel))).sort()){
  assert(name!=='__pycache__'&&!name.startsWith('.'));const path=rel?rel+'/'+name:name,s=await lstat(join(S,path));assert(!s.isSymbolicLink());
  if(s.isDirectory())await collect(path);else{assert(s.isFile()&&s.nlink===1&&/\.(?:mjs|js|py|md|json)$/.test(name)&&s.size<16777216);const bytes=await readFile(join(S,path));rows.push({path,size:bytes.length,sha256:sha(bytes)});}
 }
}
await collect();assert.deepEqual(rows.map(r=>r.path).sort(),[...old.files.map(r=>r.path),added].sort());
const userDoc=join(R,'docs/BUNDLE15-REVIEW-RESPONSE.md');assert.equal(sha(await readFile(userDoc)),base.userDocumentSha256);
const daily='C:\\Users\\PUBLIC_USER\\Documents\\ChatGPT\\DSH SYSTEM ENHANCEMENT PACKAGE\\dsh-daily';
async function guards(){assert.equal(sha(await readFile(join(daily,'launch.mjs'))),base.dailyEntryHashes.launch);assert.equal(sha(await readFile(join(daily,'deployment-rc2.json'))),base.dailyEntryHashes.deployment);}
await guards();assert.deepEqual(await readFile(join(S,'CLOSEOUT.json')),await readFile(join(P,'DELIVERY-RESULT.json')));
await writeFile(join(out,'CHECKPOINT-ATTEMPT1.json'),JSON.stringify({schema:1,status:'blocked',reason:'Git default whitespace check classified CR in the unchanged origin JSON as trailing whitespace',codeChangesCommitted:false,originSha256:'dba05a978d1fce394aa4e9ecd523cca8542138ff89c9ef89309e69763fd33d53',sourceInputSha256:sha(await readFile(join(out,'SOURCE-INPUTS.json'))),resolution:'Per-command cr-at-eol; remaining whitespace checks retained; no Git config mutation, no origin/package changes'},null,2)+'\n',{flag:'wx'});
await writeFile(join(dest,changed),current);await writeFile(join(dest,added),await readFile(join(S,added)),{flag:'wx'});
for(const row of rows)assert.equal(sha(await readFile(join(dest,row.path))),row.sha256);
await writeFile(join(out,'SOURCE-INPUTS-r2.json'),JSON.stringify({schema:1,baseCommit:base.sourceCommit,sourceRoot:S,repositorySubdirectory:sub,files:rows},null,2)+'\n',{flag:'wx'});
assert.equal(git(R,'rev-parse','HEAD'),base.sourceCommit);git(R,'add','--',sub);
assert.deepEqual(git(R,'diff','--cached','--name-only').split(/\r?\n/).sort(),rows.map(r=>sub+'/'+r.path).sort());
git(R,'-c','core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol','diff','--cached','--check');
assert.equal(git(R,'rev-parse','HEAD'),base.sourceCommit);await guards();
const commitOutput=git(R,'commit','-m','build: finalize Windows Alpha.2 Full and Only installation packages'),commit=git(R,'rev-parse','HEAD');
assert.notEqual(commit,base.sourceCommit);assert.equal(git(R,'rev-parse','HEAD^'),base.sourceCommit);assert.deepEqual(git(R,'status','--porcelain').split(/\r?\n/),base.gitStatus);
assert.equal(sha(await readFile(userDoc)),base.userDocumentSha256);await guards();
const bundle=join(out,'windows-alpha2-packages.bundle');git(R,'bundle','create',bundle,'HEAD',base.sourceBranch);const bundleVerify=git(R,'bundle','verify',bundle);
const restore=join(out,'restore');execFileSync('git',['clone','--no-hardlinks',bundle,restore],{windowsHide:true,stdio:['ignore','pipe','pipe']});
assert.equal(git(restore,'rev-parse','HEAD'),commit);assert.equal(git(restore,'status','--porcelain'),'');
for(const row of rows){const bytes=await readFile(join(restore,sub,row.path));assert.equal(bytes.length,row.size);assert.equal(sha(bytes),row.sha256);}
const bytes=await readFile(bundle),receipt={schema:1,status:'pass',scope:'Local commit plus full Git bundle, actual clean restore clone and byte verification of the new source directory; not a rebuild of historical external program inputs.',baseCommit:base.sourceCommit,commit,branch:base.sourceBranch,repository:R,sourceDirectory:dest,files:rows.length,bundle:{path:bundle,size:bytes.length,sha256:sha(bytes)},restore,restoredCommit:commit,sourceBytesVerified:true,unrelatedWorkingChangesPreserved:true,dailyPublicEntriesUnchanged:true,pushed:false,sourceInput:'SOURCE-INPUTS-r2.json',retainedAttempt:'CHECKPOINT-ATTEMPT1.json',whitespaceCheck:'Per-command cr-at-eol; immutable CRLF origin preserved, other whitespace checks enabled'};
await writeFile(join(out,'CHECKPOINT.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});await writeFile(join(out,'git.log'),commitOutput+'\n'+bundleVerify+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
