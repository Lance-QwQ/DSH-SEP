import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access,copyFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),root=resolve(process.argv[2]??''),pnpm=resolve(process.argv[3]??''),mode=process.argv[4]??'prepare';
const run=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(join(repo,'package.json')));assert.equal(manifest.version,'0.2.1-beta.3-bundle.24','fixed CI snapshot must be explicitly refreshed for another candidate');
if(mode==='prepare'){
 await assert.rejects(access(root),{code:'ENOENT'});await mkdir(root,{recursive:true});await mkdir(join(root,'host'));await mkdir(join(root,'tests'));
 const packed=await run(process.execPath,[pnpm,'pack','--pack-destination',root],{cwd:repo,windowsHide:true,timeout:60000});await writeFile(join(root,'pack.log'),packed.stdout+packed.stderr);
 const artifact=join(root,'dsh-sep-bundle-'+manifest.version+'.tgz'),bytes=await readFile(artifact);await copyFile(artifact,join(root,'candidate.tgz'));
 await copyFile(join(repo,'tools/bundle-install/platform-ci/package.json'),join(root,'host/package.json'));
 let lock=await readFile(join(repo,'tools/bundle-install/platform-ci/pnpm-lock.yaml'),'utf8');let changed=0;lock=lock.replace(/resolution: \{integrity: [^,\n]+, tarball: file:\.\.\/candidate\.tgz\}/g,()=>{changed++;return 'resolution: {integrity: sha512-'+createHash('sha512').update(bytes).digest('base64')+', tarball: file:../candidate.tgz}';});assert.equal(changed,1);await writeFile(join(root,'host/pnpm-lock.yaml'),lock);
 await writeFile(join(root,'PREPARED.json'),JSON.stringify({schema:1,candidate:manifest.version,platform:process.platform,arch:process.arch,node:process.version,artifactSha256:hash(bytes),fixedDirectDependencies:Object.keys(JSON.parse(await readFile(join(root,'host/package.json'))).dependencies).length,lockSha256:hash(Buffer.from(lock)),scope:'portable pending admission/configuration and native-provider preservation; not full protected Profile or desktop certification'},null,2)+'\n');
}else if(mode==='verify'){
 const env={...process.env,SEP_SOURCE_REPO:repo,SEP_OFFICIAL_HARNESS:join(root,'host'),SEP_BUNDLE_REPO:join(root,'host/node_modules/dsh-sep-bundle'),SEP_BUNDLE_TEST_ROOT:join(root,'tests'),SEP_TEST_PNPM:pnpm};
 const names=['entry','configuration','native-compatibility','platform-admission'];let result;
 try{result=await run(process.execPath,['--test','--test-concurrency=1','--test-reporter=spec',...names.map(n=>join(repo,'tools/bundle-install/tests',n+'.test.mjs'))],{cwd:repo,env,windowsHide:true,timeout:90000,maxBuffer:1024*1024});}catch(error){await writeFile(join(root,'tests.log'),(error.stdout??'')+(error.stderr??''));throw error;}
 await writeFile(join(root,'tests.log'),result.stdout+result.stderr);assert.match(result.stdout,/ℹ fail 0/);assert.match(result.stdout,/ℹ skipped 0/);
 await writeFile(join(root,'RESULT.json'),JSON.stringify({schema:1,status:'pass',platform:process.platform,arch:process.arch,node:process.version,prepared:JSON.parse(await readFile(join(root,'PREPARED.json'))),logSha256:hash(Buffer.from(result.stdout+result.stderr)),scope:'portable admission, budget read-only configuration, fixed runtime gate and unmodified native fs writes; Windows protected Profile covered separately; POSIX protected activation refused'},null,2)+'\n');
}else throw Error('unknown mode');
