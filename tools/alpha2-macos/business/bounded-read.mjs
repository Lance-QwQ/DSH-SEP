import {constants} from 'node:fs';
import {lstat,realpath,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
const identity=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode,s.nlink].join(':');
export const hash=value=>createHash('sha256').update(value).digest('hex');
export async function boundedRead(path,{maxBytes,sha256,signal}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>16*1024*1024)fail('TOO_LARGE');signal?.throwIfAborted();
 const before=await lstat(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>BigInt(maxBytes)||await realpath(path)!==path)fail('SOURCE_CHANGED');
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const held=await file.stat({bigint:true});if(identity(held)!==identity(before))fail('SOURCE_CHANGED');const buffer=Buffer.alloc(Number(held.size)+1);let count=0;
  while(count<buffer.length){const row=await file.read(buffer,count,buffer.length-count,count);if(!row.bytesRead)break;count+=row.bytesRead;signal?.throwIfAborted();}
  if(count!==Number(held.size)||identity(held)!==identity(await file.stat({bigint:true}))||identity(held)!==identity(await lstat(path,{bigint:true})))fail('SOURCE_CHANGED');
  const bytes=buffer.subarray(0,count);if(sha256!==undefined&&hash(bytes)!==sha256)fail('SOURCE_CHANGED');signal?.throwIfAborted();return bytes;
 }finally{await file.close();}
}
