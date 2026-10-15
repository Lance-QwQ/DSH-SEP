import {constants} from 'node:fs';
import {open,realpath,statfs,readdir,mkdir,lstat} from 'node:fs/promises';
import {resolve,isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
export const fail=code=>{throw Object.assign(Error(code),{code});};
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const LIMITS=Object.freeze({entries:1024,bytes:33554432,file:4194304,depth:16});
const version=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode,s.nlink].map(String).join(':');
export async function directory(path,privateRoot=false){
 if(!isAbsolute(path)||resolve(path)!==path||await realpath(path)!==path)fail('SEP_PROJECT_PATH');
 const held=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{
  const s=await held.stat({bigint:true});
  if(!s.isDirectory()||!s.ino||s.uid!==BigInt(process.getuid())||privateRoot&&(s.mode&0o077n)!==0n||(await statfs('/proc/self/fd/'+held.fd,{bigint:true})).type!==0xef53n)fail('SEP_PROJECT_PATH');
  return held;
 }catch(e){await held.close();throw e;}
}
export async function syncDirectory(path){const h=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await h.sync();}finally{await h.close();}}
/** Bounded, no-follow, single-link capture. The destination must be a fresh
 * private directory in the trusted controller's permission domain. */
export async function tree(root,{copyTo}={}){
 const held=await directory(root),entries=[],versions=[];let bytes=0;
 try{
  if(copyTo){const dest=await directory(copyTo,true);try{if((await readdir('/proc/self/fd/'+dest.fd)).length)fail('SEP_PROJECT_UNSAFE_TREE');}finally{await dest.close();}}
  async function walk(dir,prefix,depth){
   if(depth>LIMITS.depth)fail('SEP_PROJECT_LIMIT');
   const before=await dir.stat({bigint:true});versions.push([prefix,version(before)]);
   const names=await readdir('/proc/self/fd/'+dir.fd);
   names.sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
   for(const name of names){
    if(!name||name.length>200||/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(name))fail('SEP_PROJECT_UNSAFE_TREE');
    if(entries.length>=LIMITS.entries)fail('SEP_PROJECT_LIMIT');
    const path='/proc/self/fd/'+dir.fd+'/'+name,rel=prefix?prefix+'/'+name:name;
    const s=await lstat(path,{bigint:true});
    if(s.uid!==BigInt(process.getuid())||s.isSymbolicLink()||!s.ino||!s.isFile()&&!s.isDirectory())fail('SEP_PROJECT_UNSAFE_TREE');
    if(s.isDirectory()){
     const child=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
     try{
      if(version(s)!==version(await child.stat({bigint:true})))fail('SEP_PROJECT_TREE_CHANGED');
      entries.push({path:rel,kind:'directory'});if(copyTo)await mkdir(join(copyTo,rel),{mode:0o700});
      await walk(child,rel,depth+1);
     }finally{await child.close();}
    }else{
     if(s.nlink!==1n)fail('SEP_PROJECT_UNSAFE_TREE');
     if(s.size>BigInt(LIMITS.file)||bytes+Number(s.size)>LIMITS.bytes)fail('SEP_PROJECT_LIMIT');
     const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
     try{
      if(version(s)!==version(await file.stat({bigint:true})))fail('SEP_PROJECT_TREE_CHANGED');
      const data=Buffer.alloc(Number(s.size)+1);let offset=0;
      while(offset<data.length){const r=await file.read(data,offset,data.length-offset,null);if(!r.bytesRead)break;offset+=r.bytesRead;}
      if(offset!==Number(s.size)||version(s)!==version(await file.stat({bigint:true}))||version(s)!==version(await lstat(path,{bigint:true})))fail('SEP_PROJECT_TREE_CHANGED');
      const body=data.subarray(0,offset),executable=Boolean(s.mode&0o100n);bytes+=offset;
      entries.push({path:rel,kind:'file',size:offset,sha256:hash(body),executable});versions.push([rel,version(s)]);
      if(copyTo){const out=await open(join(copyTo,rel),'wx',executable?0o700:0o600);try{await out.writeFile(body);await out.sync();}finally{await out.close();}}
     }finally{await file.close();}
    }
   }
   if(version(before)!==version(await dir.stat({bigint:true})))fail('SEP_PROJECT_TREE_CHANGED');
   if(copyTo)await syncDirectory(prefix?join(copyTo,prefix):copyTo);
  }
  await walk(held,'',0);entries.sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));versions.sort((a,b)=>Buffer.compare(Buffer.from(a[0]),Buffer.from(b[0])));
  return {sha256:hash(JSON.stringify(entries)),version:hash(JSON.stringify(versions)),entries,bytes};
 }finally{await held.close();}
}
