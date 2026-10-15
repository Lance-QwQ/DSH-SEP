// Trusted build-time assembly only. It never starts the payload or installer.
import {mkdir,lstat,realpath,open,readlink,symlink,chmod,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname,basename,resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {captureInstallerRuntime} from '../runtime-closure.mjs';
import {INSTALLER_PATHS as paths} from '../manifest.mjs';
import {buildInstallerManifest,loadInstallerConfiguration} from '../bundle-config.mjs';
import {verifyCandidate,platform,fileHash,env} from '../../installer-entry/candidate.mjs';
import {loadProgram} from '../../desktop/managed-broker/program-manifest.mjs';

const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
const fail=suffix=>{throw Object.assign(Error('SEP_INSTALLER_RESOURCES_'+suffix),{code:'SEP_INSTALLER_RESOURCES_'+suffix});};
const identity=s=>[s.dev,s.ino,s.mode,s.uid,s.gid,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');
const sameDirectory=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode&&a.uid===b.uid;
const within=(root,path)=>path===root||path.startsWith(root+'/');
const records=items=>items.map(({path,sha256})=>({path,sha256}));
const nativeRoles=[['installation/install-native.c','coreHelper'],['installer-entry/account-native.c','entryHelper']];
async function directory(path){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||path==='/'||/[\\\x00-\x1f\x7f]/.test(path)||await realpath(path)!==path)throw Error('path');
 const stat=await lstat(path,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.uid!==BigInt(process.getuid())&&stat.uid!==0n)||(stat.mode&0o022n))throw Error('directory');return stat;
}
async function absent(path){try{await lstat(path);}catch(e){if(e.code==='ENOENT')return;throw e;}throw Error('exists');}
async function capture(path,max){
 const before=await lstat(path,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size<0n||before.size>BigInt(max)||await realpath(path)!==path)throw Error('source');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW),chunks=[];let total=0;
 try{if(identity(before)!==identity(await handle.stat({bigint:true})))throw Error('changed');for await(const b of handle.createReadStream({autoClose:false})){total+=b.length;if(total>Number(before.size))throw Error('changed');chunks.push(b);}if(total!==Number(before.size)||identity(before)!==identity(await handle.stat({bigint:true}))||identity(before)!==identity(await lstat(path,{bigint:true}))||await realpath(path)!==path)throw Error('changed');}finally{await handle.close();}
 const bytes=Buffer.concat(chunks,total);return{bytes,sha256:hash(bytes),identity:identity(before)};
}
async function publish(path,bytes,mode){await mkdir(dirname(path),{recursive:true,mode:0o755});await writeFile(path,bytes,{flag:'wx',mode:0o600});await chmod(path,mode);}
async function copyRegular(source,target,expected,mode){
 const before=await lstat(source,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||await realpath(source)!==source||before.size!==BigInt(expected.size))throw Error('source');
 const input=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW);let output;const digest=createHash('sha256');let size=0;
 try{
  if(identity(before)!==identity(await input.stat({bigint:true})))throw Error('changed');
  output=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  for await(const chunk of input.createReadStream({autoClose:false})){size+=chunk.length;if(size>expected.size)throw Error('changed');digest.update(chunk);let offset=0;while(offset<chunk.length){const r=await output.write(chunk,offset,chunk.length-offset);if(!r.bytesWritten)throw Error('write');offset+=r.bytesWritten;}}
  if(size!==expected.size||digest.digest('hex')!==expected.sha256||identity(before)!==identity(await input.stat({bigint:true}))||identity(before)!==identity(await lstat(source,{bigint:true}))||await realpath(source)!==source)throw Error('changed');
  await output.chmod(mode);
 }finally{await input.close();if(output)await output.close();}
}
async function copyPayload(source,target,receipt){
 const root=await directory(source);await mkdir(dirname(target),{recursive:true,mode:0o755});await mkdir(target,{mode:0o700});
 const directories=[];
 for(const row of receipt.entries){
  const from=join(source,row.path),to=join(target,row.path);
  if(row.kind==='directory'){await mkdir(to,{mode:0o700});directories.push(row);}
  else if(row.kind==='file')await copyRegular(from,to,row,row.mode);
  else if(row.kind==='link'){const before=await lstat(from,{bigint:true});if(!before.isSymbolicLink()||await readlink(from)!==row.target)throw Error('changed');await symlink(row.target,to);if(identity(before)!==identity(await lstat(from,{bigint:true})))throw Error('changed');}
  else throw Error('entry');
 }
 for(const row of directories.reverse())await chmod(join(target,row.path),row.mode);await chmod(target,Number(root.mode&0o7777n));
 if(!sameDirectory(root,await directory(source)))throw Error('changed');
}
async function compile(source,target,evidence,role){
 let run;try{run=await exec('/usr/bin/clang',['-std=c11','-Wall','-Wextra','-Werror',source,'-o',target],{cwd:evidence,env:env(),timeout:30000,killSignal:'SIGKILL',maxBuffer:1048576});}catch(e){run=e;}
 const stdout=String(run.stdout??''),stderr=String(run.stderr??''),log=Buffer.from(stdout+'\n'+stderr);await publish(join(evidence,role+'.log'),log.subarray(0,1048576),0o600);
 const receipt={role,exitCode:typeof run.code==='number'?run.code:run.code?null:0,signal:run.signal??null,timedOut:!!run.killed,logTruncated:log.length>1048576,logSha256:await fileHash(join(evidence,role+'.log')),...run instanceof Error?{processFamilyCleanup:'not_verified'}:{}};
 if(run instanceof Error||receipt.exitCode!==0){const e=Object.assign(Error('SEP_INSTALLER_RESOURCES_COMPILE'),{code:'SEP_INSTALLER_RESOURCES_COMPILE',compiler:receipt});throw e;}
 await chmod(target,0o555);receipt.sha256=await fileHash(target);return receipt;
}
export async function assembleInstallerResources(input){
 await platform();if(!input||Object.keys(input).sort().join(',')!=='contents,receipt,sourceApp,sourceRoot'||typeof input.sourceApp!=='string'||typeof input.sourceRoot!=='string')fail('SOURCE');
 if(typeof input.contents!=='string')fail('TARGET');
 const {sourceApp,sourceRoot,contents}=input,parent=dirname(contents),evidenceRoot=parent+'.resources-build';let receipt;try{receipt=structuredClone(input.receipt);}catch{fail('SOURCE');}
 let parentIdentity,rootIdentity,sourceIdentity;
 try{if(typeof contents!=='string'||!isAbsolute(contents)||resolve(contents)!==contents||basename(contents)!=='Contents')throw Error('target');parentIdentity=await directory(parent);await absent(contents);await absent(evidenceRoot);for(const path of [contents,evidenceRoot])if(within(sourceApp,path)||within(sourceRoot,path))throw Error('overlap');}catch{fail('TARGET');}
 let runtime,natives,program;
 try{
  rootIdentity=await directory(sourceRoot);sourceIdentity=await verifyCandidate(sourceApp,receipt);
  runtime=[];for(const row of await captureInstallerRuntime(sourceRoot)){const captured=await capture(join(sourceRoot,row.path),4194304);if(captured.sha256!==row.sha256)throw Error('runtime changed');runtime.push({path:row.path,...captured});}
  natives=[];for(const [path,role]of nativeRoles)natives.push({path,role,...await capture(join(sourceRoot,path),4194304)});
  program=await loadProgram(join(sourceApp,'Contents/Resources/PROGRAM.json'),receipt.programSha256);
  const nodeStat=await lstat(program.entries.node.path);if(nodeStat.size>268435456||!(nodeStat.mode&0o111)||await fileHash(program.entries.node.path)!==program.entries.node.sha256)throw Error('node');
 }catch{fail('SOURCE');}
 const source={runtime:records(runtime),native:records(natives)},compilers=[];let started=false;
 try{
  if(!sameDirectory(parentIdentity,await directory(parent)))fail('TARGET');await absent(contents);await absent(evidenceRoot);
  await mkdir(contents,{mode:0o755});started=true;await mkdir(evidenceRoot,{mode:0o700});
  for(const row of [...runtime,...natives])await publish(join(evidenceRoot,'source',row.path),row.bytes,0o444);
  await publish(join(evidenceRoot,'INPUTS.json'),Buffer.from(JSON.stringify({schema:1,source,payload:receipt},null,2)+'\n'),0o444);
  const payload=join(contents,paths.payload);await copyPayload(sourceApp,payload,receipt.inventory);await verifyCandidate(payload,receipt);
  const nodePath=join(contents,paths.node);await mkdir(dirname(nodePath),{recursive:true,mode:0o755});const nodeStat=await lstat(program.entries.node.path);await copyRegular(program.entries.node.path,nodePath,{size:nodeStat.size,sha256:program.entries.node.sha256},0o555);
  for(const row of runtime)await publish(join(contents,'Resources/runtime',row.path),row.bytes,0o444);
  await mkdir(join(contents,'Resources/native'),{mode:0o755});
  for(const row of natives)compilers.push(await compile(join(evidenceRoot,'source',row.path),join(contents,paths[row.role]),evidenceRoot,row.role));
  await publish(join(contents,paths.receipt),Buffer.from(JSON.stringify(receipt)+'\n'),0o444);
  const manifest=await buildInstallerManifest(contents),manifestPath=join(contents,'Resources/INSTALLER.json'),bytes=Buffer.from(JSON.stringify(manifest)+'\n');
  // Verify original bytes again before publishing the final manifest. Building
  // uses only captured JS/C bytes; a concurrent source edit cannot be hidden.
  if(!sameDirectory(rootIdentity,await directory(sourceRoot))||await verifyCandidate(sourceApp,receipt)!==sourceIdentity||JSON.stringify(records(await captureInstallerRuntime(sourceRoot)))!==JSON.stringify(source.runtime))fail('SOURCE');
  for(const row of [...runtime,...natives]){const now=await capture(join(sourceRoot,row.path),4194304);if(now.sha256!==row.sha256||now.identity!==row.identity)fail('SOURCE');}
  if(!sameDirectory(parentIdentity,await directory(parent)))fail('TARGET');
  await publish(manifestPath,bytes,0o444);const manifestSha256=hash(bytes);await loadInstallerConfiguration(contents,manifestSha256);
  const result={status:'pass',contents,manifestPath,manifestSha256,applicationStarted:false,outerSignatureCreated:false,payload:{entries:receipt.inventory.entries.length,totalBytes:receipt.inventory.totalBytes},source,evidenceRoot,compilers};
  await publish(join(contents,'RESOURCES-BUILD.json'),Buffer.from(JSON.stringify(result,null,2)+'\n'),0o444);return result;
 }catch(error){
  const code=/^SEP_INSTALLER_RESOURCES_[A-Z_]+$/.test(error.code??'')?error.code:'SEP_INSTALLER_RESOURCES_BUILD';
  if(started){try{await publish(join(contents,'RESOURCES-BUILD.json'),Buffer.from(JSON.stringify({schema:1,status:'fail',code,applicationStarted:false,outerSignatureCreated:false,source,compilers,...error.compiler?{failedCompiler:error.compiler}:{},failureArtifactsPreserved:true},null,2)+'\n'),0o600);}catch{/* Preserve the original error and existing artifacts even if diagnostics fail. */}}
  throw Object.assign(Error(code),{code});
 }
}
