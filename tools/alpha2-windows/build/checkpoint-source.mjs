// Local source-only checkpoint after accepted archives; never pushes or changes daily entries.
import {readFile,writeFile,readdir,lstat,realpath,mkdir} from 'node:fs/promises';
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
const base=await json(join(P,'BASELINE.json')),delivery=await json(join(P,'DELIVERY-RESULT.json'));
assert.equal(delivery.status,'pass');assert.equal(delivery.revision,'windows-package.2');
assert.equal((await realpath(R)).toLowerCase(),R.toLowerCase());assert.equal((await realpath(P)).toLowerCase(),P.toLowerCase());
assert.equal((await realpath(dirname(dest))).toLowerCase(),dirname(dest).toLowerCase());
assert.equal(git(R,'rev-parse','HEAD'),base.sourceCommit);assert.equal(git(R,'branch','--show-current'),base.sourceBranch);
assert.deepEqual(git(R,'status','--porcelain').split(/\r?\n/),base.gitStatus);
const userDoc=join(R,'docs/BUNDLE15-REVIEW-RESPONSE.md');assert.equal(sha(await readFile(userDoc)),base.userDocumentSha256);
const daily='C:\\Users\\PUBLIC_USER\\Documents\\ChatGPT\\DSH SYSTEM ENHANCEMENT PACKAGE\\dsh-daily';
async function dailyUnchanged(){assert.equal(sha(await readFile(join(daily,'launch.mjs'))),base.dailyEntryHashes.launch);assert.equal(sha(await readFile(join(daily,'deployment-rc2.json'))),base.dailyEntryHashes.deployment);}
await dailyUnchanged();await assert.rejects(lstat(dest),{code:'ENOENT'});await assert.rejects(lstat(out),{code:'ENOENT'});
const rows=[];
async function collect(rel=''){
  for(const name of (await readdir(join(S,rel))).sort()){
    assert(name!=='__pycache__'&&!name.startsWith('.'),'unexpected generated or hidden source input');
    const path=rel?rel+'/'+name:name,full=join(S,path),s=await lstat(full);assert(!s.isSymbolicLink());
    if(s.isDirectory())await collect(path);
    else{assert(s.isFile()&&s.nlink===1&&/\.(?:mjs|js|py|md|json)$/.test(name)&&s.size<16777216);const bytes=await readFile(full);rows.push({path,size:bytes.length,sha256:sha(bytes)});}
  }
}
await collect();assert(rows.some(r=>r.path==='CLOSEOUT.json'));assert(rows.length>40);
assert.equal((await json(join(S,'CLOSEOUT.json'))).revision,delivery.revision);
assert.deepEqual(await readFile(join(S,'CLOSEOUT.json')),await readFile(join(P,'DELIVERY-RESULT.json')));
await mkdir(dest);await mkdir(out);
for(const row of rows){const bytes=await readFile(join(S,row.path));assert.equal(sha(bytes),row.sha256);await mkdir(dirname(join(dest,row.path)),{recursive:true});await writeFile(join(dest,row.path),bytes,{flag:'wx'});assert.equal(sha(await readFile(join(dest,row.path))),row.sha256);}
await writeFile(join(out,'SOURCE-INPUTS.json'),JSON.stringify({schema:1,baseCommit:base.sourceCommit,sourceRoot:S,repositorySubdirectory:sub,files:rows},null,2)+'\n',{flag:'wx'});
assert.equal(git(R,'rev-parse','HEAD'),base.sourceCommit);
git(R,'add','--',sub);
assert.deepEqual(git(R,'diff','--cached','--name-only').split(/\r?\n/).sort(),rows.map(r=>sub+'/'+r.path).sort());
// Preserve the hash-bound CRLF origin record; recognize CRLF only for this check.
git(R,'-c','core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol','diff','--cached','--check');
assert.equal(git(R,'rev-parse','HEAD'),base.sourceCommit);
const commitOutput=git(R,'commit','-m','build: finalize Windows Alpha.2 Full and Only installation packages');
const commit=git(R,'rev-parse','HEAD');assert.notEqual(commit,base.sourceCommit);
assert.equal(git(R,'rev-parse','HEAD^'),base.sourceCommit);
assert.deepEqual(git(R,'status','--porcelain').split(/\r?\n/),base.gitStatus);assert.equal(sha(await readFile(userDoc)),base.userDocumentSha256);await dailyUnchanged();
const bundle=join(out,'windows-alpha2-packages.bundle');git(R,'bundle','create',bundle,'HEAD',base.sourceBranch);
const bundleVerify=git(R,'bundle','verify',bundle);
const restore=join(out,'restore');execFileSync('git',['clone','--no-hardlinks',bundle,restore],{windowsHide:true,stdio:['ignore','pipe','pipe']});
assert.equal(git(restore,'rev-parse','HEAD'),commit);assert.equal(git(restore,'status','--porcelain'),'');
for(const row of rows){const bytes=await readFile(join(restore,sub,row.path));assert.equal(bytes.length,row.size);assert.equal(sha(bytes),row.sha256);}
const bytes=await readFile(bundle),receipt={schema:1,status:'pass',scope:'Local commit plus full Git bundle, actual clean restore clone and byte verification of this new source directory; not a rebuild of historical external program inputs.',baseCommit:base.sourceCommit,commit,branch:base.sourceBranch,repository:R,sourceDirectory:dest,files:rows.length,bundle:{path:bundle,size:bytes.length,sha256:sha(bytes)},restore,restoredCommit:commit,sourceBytesVerified:true,unrelatedWorkingChangesPreserved:true,dailyPublicEntriesUnchanged:true,pushed:false};
await writeFile(join(out,'CHECKPOINT.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
await writeFile(join(out,'git.log'),commitOutput+'\n'+bundleVerify+'\n',{flag:'wx'});
console.log(JSON.stringify(receipt));
