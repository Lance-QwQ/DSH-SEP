import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const fail=code=>{throw Object.assign(Error(code),{code});};
const demand=(value,code)=>{if(!value)fail(code);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateMetadata(meta,pkg){
 let url;try{url=new URL(meta?.dist?.tarball);}catch{fail('OFFICIAL_METADATA_BINDING');}
 demand(meta.name===pkg.name&&meta.version===pkg.version&&url.protocol==='https:'&&url.hostname==='registry.npmjs.org'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash,'OFFICIAL_METADATA_BINDING');
 demand(/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(meta.dist.integrity??''),'OFFICIAL_METADATA_INTEGRITY');return {tarball:url.href,integrity:meta.dist.integrity};
}
export function verifyArchive(bytes,integrity){demand(/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)&&'sha512-'+createHash('sha512').update(bytes).digest('base64')===integrity,'OFFICIAL_TARBALL_INTEGRITY');return{size:bytes.length,sha256:sha(bytes),integrity};}
export function archiveLimit(pkg){return pkg.name==='@deepseek-ai/libreoffice-kit-win32-x64'&&pkg.version==='0.1.5'?128*1024*1024:64*1024*1024;}
export function verifyCachedArchive(metadata,archive,pkg,prior){
 demand(prior?.name===pkg.name&&prior?.version===pkg.version&&sha(metadata)===prior.metadataSha256&&archive.length===prior.size&&sha(archive)===prior.sha256,'OFFICIAL_CACHE_BINDING');
 const selected=validateMetadata(JSON.parse(metadata),pkg),verified=verifyArchive(archive,selected.integrity);demand(verified.integrity===prior.integrity,'OFFICIAL_CACHE_BINDING');return{selected,verified};
}
async function boundedFile(path,max){const before=await lstat(path);demand(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size<=max&&(await realpath(path)).toLowerCase()===resolve(path).toLowerCase(),'OFFICIAL_CACHE_IDENTITY');const bytes=await readFile(path),after=await lstat(path);demand(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&bytes.length===before.size,'OFFICIAL_CACHE_IDENTITY');return bytes;}
async function download(url,maxBytes){
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(120000),headers:{accept:'application/json, application/octet-stream', 'user-agent':'DSH-SEP-official-source-verifier/1'}});
 if(!response.ok){await response.body?.cancel();fail('OFFICIAL_HTTP_'+response.status);}
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes){fail('OFFICIAL_DOWNLOAD_LIMIT');}chunks.push(chunk);}return Buffer.concat(chunks);
}
async function pythonAudit(python,archive,spec,out,cwd){
 const child=spawn(python,['-B',join(import.meta.dirname,'audit-official-tar.py'),archive,spec,out],{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:cwd,TMP:cwd,PYTHONDONTWRITEBYTECODE:'1'}});let count=0,overflow=false,timedOut=false;
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{count+=b.length;if(count>1048576){overflow=true;child.kill();}});
 const timer=setTimeout(()=>{timedOut=true;child.kill();},120000);
 try{const r=await new Promise((ok,no)=>{child.once('error',no);child.once('close',(code,signal)=>ok({code,signal}));});demand(!timedOut&&!overflow&&!r.signal&&[0,3].includes(r.code),'OFFICIAL_TAR_AUDIT');return JSON.parse(await readFile(out));}finally{clearTimeout(timer);}
}
export async function verifyOfficialDonor({inputPath,output,python,cacheRoot}){
 demand([inputPath,output,python].every(isAbsolute),'OFFICIAL_ABSOLUTE_PATH');demand(/^D:[\\/]/i.test(output),'OFFICIAL_D_OUTPUT');await mkdir(output);demand((await realpath(output)).toLowerCase()===resolve(output).toLowerCase(),'OFFICIAL_OUTPUT_ALIAS');
 const raw=await readFile(inputPath),spec=JSON.parse(raw);demand(raw.length<=32*1024*1024&&Array.isArray(spec.packages)&&Array.isArray(spec.required),'OFFICIAL_SPEC');
 let prior;let cachedResultSha256;let archiveBytes=0;
 if(cacheRoot){demand(isAbsolute(cacheRoot)&&/^D:[\\/]/i.test(cacheRoot),'OFFICIAL_CACHE_ROOT');const previous=await boundedFile(join(cacheRoot,'RESULT.json'),32*1024*1024);prior=JSON.parse(previous);demand(prior.inputSha256===sha(raw)&&['blocked','mismatch','pass'].includes(prior.status)&&Array.isArray(prior.packages),'OFFICIAL_CACHE_BINDING');cachedResultSha256=sha(previous);}
 const result={schema:1,status:'running',scope:'Registry exact-version HTTPS metadata, SHA-512 SRI and required member bytes; no npm scripts or extracted executable code.',inputSha256:sha(raw),limits:{defaultTarBytes:64*1024*1024,libreOffice015TarBytes:128*1024*1024,allArchivesBytes:2*1024*1024*1024,uncompressedPackageBytes:256*1024*1024},...(cacheRoot?{cache:{source:cacheRoot,resultSha256:cachedResultSha256,revalidated:true}}:{}),packages:[],mismatches:[],notVerified:[]};
 try{
  async function prove(pkg){
   demand(/^@deepseek-ai\/[a-z0-9][a-z0-9._-]*$/.test(pkg.name)&&/^[a-zA-Z0-9][a-zA-Z0-9.+-]*$/.test(pkg.version)&&/^[a-f0-9]{64}$/.test(pkg.manifestHash),'OFFICIAL_PACKAGE_SPEC');
   const prefix='node_modules/'+pkg.name+'/',required=spec.required.filter(f=>(f.packageName??(f.sourcePath.startsWith(prefix)?pkg.name:null))===pkg.name&&(!f.version||f.version===pkg.version));
   demand(required.length>0,'OFFICIAL_REQUIRED_COVERAGE');
   const normalized=required.map(f=>{demand(f.sourcePath.startsWith(prefix),'OFFICIAL_SOURCE_PATH');const path=f.packageRelativePath??f.sourcePath.slice(prefix.length);demand(path===f.sourcePath.slice(prefix.length),'OFFICIAL_SOURCE_PATH');return{path,size:f.size,sha256:f.sha256};});
   const id=sha(Buffer.from(pkg.name+'@'+pkg.version)),dir=join(output,id);await mkdir(dir);
   const metadataUrl='https://registry.npmjs.org/'+encodeURIComponent(pkg.name)+'/'+encodeURIComponent(pkg.version);
   const cached=prior?.packages.find(row=>row.name===pkg.name&&row.version===pkg.version);let metadata,selected,archive,verified;
   if(cached){metadata=await boundedFile(join(cacheRoot,id,'metadata.json'),4*1024*1024);archive=await boundedFile(join(cacheRoot,id,'official.tgz'),archiveLimit(pkg));({selected,verified}=verifyCachedArchive(metadata,archive,pkg,cached));}
   else{metadata=await download(metadataUrl,4*1024*1024);selected=validateMetadata(JSON.parse(metadata),pkg);archive=await download(selected.tarball,archiveLimit(pkg));verified=verifyArchive(archive,selected.integrity);}
   archiveBytes+=archive.length;demand(archiveBytes<=result.limits.allArchivesBytes,'OFFICIAL_DIRECTORY_BUDGET');await writeFile(join(dir,'metadata.json'),metadata,{flag:'wx'});
   const archivePath=join(dir,'official.tgz');await writeFile(archivePath,archive,{flag:'wx'});
   const auditSpec=join(dir,'expected.json');await writeFile(auditSpec,JSON.stringify({name:pkg.name,version:pkg.version,manifestHash:pkg.manifestHash,required:normalized},null,2)+'\n',{flag:'wx'});
   const audit=await pythonAudit(python,archivePath,auditSpec,join(dir,'AUDIT.json'),dir);
   const row={name:pkg.name,version:pkg.version,metadataUrl,metadataSha256:sha(metadata),tarballUrl:selected.tarball,...verified,source:cached?'revalidated-cache':'registry-download',status:audit.status,requiredFiles:normalized.length,matchedFiles:audit.files.length,manifestSha256:audit.manifestSha256,auditPath:join(id,'AUDIT.json'),files:audit.files};
   return{row,mismatches:audit.mismatches.map(mismatch=>({packageName:pkg.name,version:pkg.version,...mismatch}))};
  }
  // Four independent network/archive readers. Evidence writes are serialized
  // after the batch settles, including failure; no unobserved promises remain.
  for(let offset=0;offset<spec.packages.length;offset+=4){
   const batch=spec.packages.slice(offset,offset+4),settled=await Promise.allSettled(batch.map(prove));let failure;
   for(let i=0;i<settled.length;i++){
    const outcome=settled[i],pkg=batch[i];
    if(outcome.status==='rejected'){const error=outcome.reason;result.notVerified.push({name:pkg.name,version:pkg.version,metadataUrl:'https://registry.npmjs.org/'+encodeURIComponent(pkg.name)+'/'+encodeURIComponent(pkg.version),code:error.code??'OFFICIAL_SOURCE_UNAVAILABLE'});failure??=error;continue;}
    const {row,mismatches}=outcome.value;result.packages.push(row);result.mismatches.push(...mismatches);console.log(JSON.stringify({name:pkg.name,version:pkg.version,status:row.status,required:row.requiredFiles,matched:row.matchedFiles}));
   }
   await writeFile(join(output,'PROGRESS.json'),JSON.stringify(result,null,2)+'\n');if(failure)throw failure;
  }
  demand(result.packages.length>0,'OFFICIAL_EMPTY');result.status=result.mismatches.length?'mismatch':'pass';result.matchedFiles=result.packages.reduce((n,p)=>n+p.matchedFiles,0);result.requiredFiles=result.packages.reduce((n,p)=>n+p.requiredFiles,0);demand(result.requiredFiles===spec.required.length,'OFFICIAL_REQUIRED_COVERAGE');
 }catch(error){result.status='blocked';result.code=/^OFFICIAL_[A-Z0-9_]+$/.test(error.code??'')?error.code:'OFFICIAL_SOURCE_UNAVAILABLE';result.notVerified.push('Unprocessed packages/files remain unverified.');}
 result.completedAt=new Date().toISOString();await writeFile(join(output,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const[inputPath,output,python,cacheRoot]=process.argv.slice(2);const r=await verifyOfficialDonor({inputPath,output,python,cacheRoot});console.log(JSON.stringify({status:r.status,packages:r.packages.length,matchedFiles:r.matchedFiles,requiredFiles:r.requiredFiles,code:r.code}));if(r.status!=='pass')process.exitCode=1;}
