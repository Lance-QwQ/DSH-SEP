// Transport only: never modifies, extracts, signs, or installs the archive.
import {lstat,realpath,open,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

export const MAX_PART_BYTES=384*1024*1024;
const fail=code=>{throw Object.assign(Error(code),{code});};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
const code=e=>/^SEP_ARTIFACT_[A-Z0-9_]{1,60}$/.test(e?.code??'')?e.code:'SEP_ARTIFACT_IO';
async function regular(path){
 const st=await lstat(path,{bigint:true});
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1n||await realpath(path)!==path)fail('SEP_ARTIFACT_BINDING');
 return st;
}
async function writeAll(handle,bytes){
 let offset=0;
 while(offset<bytes.length){const r=await handle.write(bytes,offset,bytes.length-offset);if(r.bytesWritten<=0)fail('SEP_ARTIFACT_IO');offset+=r.bytesWritten;}
}

export async function splitApplicationArtifact({assemblyRoot,outputRoot,runnerTemp=process.env.RUNNER_TEMP,partBytes=MAX_PART_BYTES}){
 if(!Number.isSafeInteger(partBytes)||partBytes<1||partBytes>MAX_PART_BYTES)fail('SEP_ARTIFACT_PART_SIZE');
 if(typeof runnerTemp!=='string'||!isAbsolute(runnerTemp))fail('SEP_ARTIFACT_OUTPUT');
 const temp=await realpath(runnerTemp);
 if(typeof outputRoot!=='string'||!isAbsolute(outputRoot)||resolve(outputRoot)!==outputRoot||!outputRoot.startsWith(temp+sep)||await realpath(dirname(outputRoot))!==dirname(outputRoot))fail('SEP_ARTIFACT_OUTPUT');
 try{await lstat(outputRoot);fail('SEP_ARTIFACT_OUTPUT');}catch(e){if(e.code!=='ENOENT')throw e;}
 if(typeof assemblyRoot!=='string'||!isAbsolute(assemblyRoot)||resolve(assemblyRoot)!==assemblyRoot||!assemblyRoot.startsWith(temp+sep)||await realpath(assemblyRoot)!==assemblyRoot||!(await lstat(assemblyRoot)).isDirectory())fail('SEP_ARTIFACT_RESULT');
 const resultPath=join(assemblyRoot,'RESULT.json'),resultBefore=await regular(resultPath);
 if(resultBefore.size>1048576n)fail('SEP_ARTIFACT_RESULT');
 let resultBytes;const resultHandle=await open(resultPath,'r');
 try{
  if(!same(resultBefore,await resultHandle.stat({bigint:true})))fail('SEP_ARTIFACT_BINDING');
  const buffer=Buffer.alloc(1048577);let used=0;
  while(used<buffer.length){const {bytesRead}=await resultHandle.read(buffer,used,buffer.length-used);if(!bytesRead)break;used+=bytesRead;}
  if(used>1048576||BigInt(used)!==resultBefore.size||!same(resultBefore,await regular(resultPath)))fail('SEP_ARTIFACT_BINDING');
  resultBytes=buffer.subarray(0,used);
 }finally{await resultHandle.close();}
 let result;try{result=JSON.parse(resultBytes.toString('utf8'));}catch{fail('SEP_ARTIFACT_RESULT');}
 if(result.status!=='pass'||typeof result.artifact!=='string'||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.zip$/.test(result.artifact)||! /^[a-f0-9]{64}$/.test(result.artifactSha256??'')||!Number.isSafeInteger(result.artifactBytes)||result.artifactBytes<1)fail('SEP_ARTIFACT_RESULT');
 const archivePath=join(assemblyRoot,result.artifact),before=await regular(archivePath);
 if(before.size!==BigInt(result.artifactBytes))fail('SEP_ARTIFACT_BINDING');
 const archive=await open(archivePath,'r');let created=false,part,partHash,partSize=0,partName,totalBytes=0;
 const parts=[],whole=createHash('sha256');
 async function finishPart(){
  if(!part)return;
  await part.sync();await part.close();part=undefined;
  parts.push({index:parts.length+1,name:partName,bytes:partSize,sha256:partHash.digest('hex')});partSize=0;
 }
 try{
  if(!same(before,await archive.stat({bigint:true})))fail('SEP_ARTIFACT_BINDING');
  await mkdir(outputRoot,{mode:0o700});created=true;
  if(await realpath(outputRoot)!==outputRoot)fail('SEP_ARTIFACT_OUTPUT');
  // One reusable 1 MiB data buffer; the archive is never loaded in full.
  const buffer=Buffer.alloc(Math.min(1024*1024,partBytes));
  while(true){
   const {bytesRead}=await archive.read(buffer,0,Math.min(buffer.length,partBytes-partSize));
   if(!bytesRead)break;
   if(totalBytes+bytesRead>result.artifactBytes)fail('SEP_ARTIFACT_BINDING');
   if(!part){partName=result.artifact+'.'+String(parts.length+1).padStart(4,'0')+'.part';part=await open(join(outputRoot,partName),'wx',0o600);partHash=createHash('sha256');}
   const bytes=buffer.subarray(0,bytesRead);await writeAll(part,bytes);partHash.update(bytes);whole.update(bytes);partSize+=bytesRead;totalBytes+=bytesRead;
   if(partSize===partBytes)await finishPart();
  }
  await finishPart();
  if(totalBytes!==result.artifactBytes||whole.digest('hex')!==result.artifactSha256||!same(before,await archive.stat({bigint:true}))||!same(before,await regular(archivePath))||!same(resultBefore,await regular(resultPath)))fail('SEP_ARTIFACT_BINDING');
  if(parts.reduce((n,p)=>n+p.bytes,0)!==totalBytes||parts.length!==Math.ceil(totalBytes/partBytes))fail('SEP_ARTIFACT_BINDING');
  const manifest={schema:1,status:'pass',scope:'artifact transport only; no archive mutation or extraction',assemblyResultSha256:digest(resultBytes),artifact:{name:result.artifact,sha256:result.artifactSha256,bytes:result.artifactBytes},partBytes,totalBytes,parts};
  await writeFile(join(outputRoot,'transport-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return manifest;
 }catch(e){
  if(created)await writeFile(join(outputRoot,'SPLIT-FAILURE.json'),JSON.stringify({schema:1,status:'fail',code:code(e),totalBytes,completedParts:parts.length,sourceModified:false})+'\n',{flag:'wx',mode:0o600}).catch(()=>{});
  throw e;
 }finally{if(part)await part.close();await archive.close();}
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  if(process.argv.length!==4)fail('SEP_ARTIFACT_ARGUMENT');
  const manifest=await splitApplicationArtifact({assemblyRoot:process.argv[2],outputRoot:process.argv[3]});
  console.log(JSON.stringify({status:'pass',parts:manifest.parts.length,totalBytes:manifest.totalBytes,sha256:manifest.artifact.sha256}));
 }catch(e){console.error(JSON.stringify({status:'fail',code:code(e)}));process.exitCode=1;}
}
