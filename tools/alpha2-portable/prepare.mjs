import assert from 'node:assert/strict';
import {cp,mkdir,readFile,writeFile,lstat,readdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {portableLock} from './inputs.mjs';
const run=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const [repository,currentRuntime,officialHost,output,pnpm]=process.argv.slice(2).map(x=>resolve(x));
assert(output.startsWith('D:\\AIData\\ProjectWork\\DSH\\'));assert.equal(await realpath(dirname(output)),dirname(output));
await mkdir(output);const payload=join(output,'payload');await mkdir(payload);
const commit=(await run('git',['rev-parse','HEAD'],{cwd:repository})).stdout.trim();
assert.equal(commit,'94d15f6d6ffa6f92d458da68f39d1a00e643ba1c');
await run('git',['bundle','create',join(output,'source-checkpoint.bundle'),'HEAD'],{cwd:repository});
const source=join(currentRuntime,'node_modules/dsh-sep-bundle'),target=join(payload,'candidate-source');
await mkdir(target);const rows=[];
async function copyTree(from,to,path=''){
 const s=await lstat(from);assert(!s.isSymbolicLink(),'SOURCE_ALIAS:'+path);
 if(s.isDirectory()){await mkdir(to,{recursive:true});for(const name of (await readdir(from)).sort())await copyTree(join(from,name),join(to,name),path?path+'/'+name:name);}
 else{assert(s.isFile()&&s.nlink===1,'SOURCE_IDENTITY:'+path);const bytes=await readFile(from);await writeFile(to,bytes,{flag:'wx'});rows.push({path,sha256:sha(bytes),bytes:bytes.length});}
}
for(const name of ['bundle','package.json','ALPHA2-ADAPTATION.json','LICENSE','README.md'])await copyTree(join(source,name),join(target,name),name);
assert.equal(JSON.parse(await readFile(join(target,'package.json'))).version,'0.2.1-beta.3-alpha2-adapter.1');
assert.equal(sha(await readFile(join(target,'bundle/lib/native-compaction.js'))),sha(await readFile(join(repository,'bundle/lib/native-compaction.js'))));
await mkdir(join(payload,'artifacts'));
const packed=await run(process.execPath,[pnpm,'pack','--pack-destination',join(payload,'artifacts')],{cwd:target,windowsHide:true,timeout:60000,maxBuffer:1048576});
await writeFile(join(output,'pack.log'),packed.stdout+packed.stderr);
const artifact=await readFile(join(payload,'artifacts/dsh-sep-bundle-0.2.1-beta.3-alpha2-adapter.1.tgz'));
await writeFile(join(payload,'candidate.tgz'),artifact,{flag:'wx'});
await mkdir(join(payload,'host'));
const host=JSON.parse(await readFile(join(officialHost,'package.json')));
host.dependencies['dsh-sep-bundle']='file:../candidate.tgz';
await writeFile(join(payload,'host/package.json'),JSON.stringify(host,null,2)+'\n');
const lock=portableLock(await readFile(join(officialHost,'pnpm-lock.yaml'),'utf8'),artifact);
await writeFile(join(payload,'host/pnpm-lock.yaml'),lock);
await writeFile(join(payload,'host/pnpm-workspace.yaml'),`packages:\n  - .\nautoInstallPeers: false\nnodeLinker: hoisted\nminimumReleaseAge: 1440\nallowBuilds:\n  '@deepseek-ai/dsh-subprocess-local': true\n  esbuild: true\n  koffi: true\n  node-pty: true\n  '@google/genai': false\n  protobufjs: false\n`);
await cp(join(repository,'tools/bundle-install/tests'),join(payload,'tests'),{recursive:true});
await cp(dirname(fileURLToPath(import.meta.url)),join(payload,'operator'),{recursive:true});
const record={schema:1,sourceCommit:commit,officialCommit:'d743267388641bc76f17c45ce8b4c231aed1d32c',host:'0.2.1-alpha.2',candidate:'0.2.1-beta.3-alpha2-adapter.1',candidateSource:'program-only copy of current r6, including native-compaction fix; no daily data or credentials',artifactSha256:sha(artifact),lockSha256:sha(Buffer.from(lock)),directDependencies:Object.keys(host.dependencies).length,files:rows,scope:'Linux isolated installation and primitive probes; not full protected Profile or desktop certification',dailyChanged:false,published:false};
await writeFile(join(payload,'PREPARED.json'),JSON.stringify(record,null,2)+'\n');
await run('C:/Windows/System32/tar.exe',['-cf',join(output,'inputs.tar'),'-C',payload,'.'],{windowsHide:true,timeout:60000});
console.log(JSON.stringify({output,artifactSha256:record.artifactSha256,sourceFiles:rows.length,dependencies:record.directDependencies}));
