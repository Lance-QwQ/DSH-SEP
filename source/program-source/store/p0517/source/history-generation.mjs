import {readdir,realpath,lstat} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {SESSION_FORMAT_VERSION} from '@deepseek-ai/dsh-session';
import {sessionFormatLogFilename} from '@deepseek-ai/dsh-session-format';

// The native read API can translate historical formats. The audit CLI must
// establish that the physical current-format generation exists before using it.
export async function currentGenerationIdentity(root,id,compression){
 if(!isAbsolute(root??'')||!/^[A-Za-z0-9_-]{1,128}$/.test(id??'')||!['none','zstd'].includes(compression))throw Error('REVIEW_ARGUMENTS');
 const canonical=await realpath(root);if(canonical.toLowerCase()!==resolve(root).toLowerCase())throw Error('REVIEW_ROOT_IDENTITY');
 const rootInfo=await lstat(root,{bigint:true});if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())throw Error('REVIEW_ROOT_IDENTITY');
 const projects=await readdir(root,{withFileTypes:true});if(projects.length>10000)throw Error('REVIEW_LOG_LIMIT');
 const found=[];
 for(const project of projects){
   if(project.isSymbolicLink())throw Error('REVIEW_ROOT_IDENTITY');if(!project.isDirectory())continue;
   const directory=join(root,project.name,id);let info;
   try{info=await lstat(directory);}catch(e){if(e.code==='ENOENT')continue;throw e;}
   if(!info.isDirectory()||info.isSymbolicLink())throw Error('REVIEW_ROOT_IDENTITY');
   const filename=sessionFormatLogFilename(SESSION_FORMAT_VERSION)+(compression==='zstd'?'.zstd':'');
   const path=join(directory,filename);let file;
   try{file=await lstat(path,{bigint:true});}catch(e){if(e.code==='ENOENT')throw Error('REVIEW_CURRENT_GENERATION_REQUIRED');throw e;}
   if(!file.isFile()||file.isSymbolicLink()||file.nlink!==1n||file.ino===0n||file.dev===0n)throw Error('REVIEW_ROOT_IDENTITY');
   if(file.size>64n*1024n*1024n)throw Error('REVIEW_LOG_LIMIT');
   found.push({path,dev:String(file.dev),ino:String(file.ino),birth:String(file.birthtimeNs),size:String(file.size),modified:String(file.mtimeNs)});
 }
 if(found.length!==1)throw Error('REVIEW_CURRENT_GENERATION_REQUIRED');
 return JSON.stringify({root:canonical,dev:String(rootInfo.dev),ino:String(rootInfo.ino),birth:String(rootInfo.birthtimeNs),file:found[0]});
}
