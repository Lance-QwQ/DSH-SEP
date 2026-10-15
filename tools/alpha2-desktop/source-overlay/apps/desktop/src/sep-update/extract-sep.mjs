/** Bounded SEP delta ZIP extraction. Parsing is yauzl 3.4; no candidate code is loaded. */
import yauzl from 'yauzl';
import {mkdir,lstat,realpath} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {crc32} from 'node:zlib';
const demand=(v,c)=>{if(!v)throw Error(c);};
const key=p=>process.platform==='win32'?resolve(p).toLowerCase():resolve(p);
const same=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs','nlink'].every(k=>a[k]===b[k]);
async function directory(path){const s=await lstat(path);demand(s.isDirectory()&&!s.isSymbolicLink()&&key(await realpath(path))===key(path),'SEP_ARCHIVE_REDIRECTED');return s;}
/** Failure retains an incomplete, unselected directory, never a ready receipt. */
export async function extractSepArchive({archive,destination,maxBytes=2147483648,maxEntries=20000,signal}){
 signal?.throwIfAborted();
 demand(isAbsolute(archive)&&isAbsolute(destination),'SEP_ARCHIVE_PATH');
 demand(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=2147483648&&Number.isSafeInteger(maxEntries)&&maxEntries>0&&maxEntries<=20000,'SEP_ARCHIVE_LIMIT');
 const before=await lstat(archive,{bigint:true});
 demand(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(maxBytes)+33554432n&&key(await realpath(archive))===key(archive),'SEP_ARCHIVE_IDENTITY');
 await directory(dirname(destination));
 try{await lstat(destination);throw Error('SEP_ARCHIVE_DESTINATION_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 let zip,zipError=null;
 const abort=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(120000)]);
 try{
  zip=await yauzl.openPromise(archive,{lazyEntries:true,autoClose:false,strictFileNames:true,validateEntrySizes:true});
  zip.on('error',e=>{zipError=e;});
  demand(Number.isSafeInteger(zip.entryCount)&&zip.entryCount>0&&zip.entryCount<=maxEntries,'SEP_ARCHIVE_COUNT');
  const entries=[],names=new Set();let total=0;
  for await(const e of zip.eachEntry()){
   abort.throwIfAborted();
   demand(/^(sep-package\.json|base-graph\.json|target-graph\.json|payload\/[a-f0-9]{64})$/.test(e.fileName),'SEP_ARCHIVE_PATH');
   demand(!names.has(e.fileName),'SEP_ARCHIVE_DUPLICATE');names.add(e.fileName);
   const mode=(e.externalFileAttributes>>>16)&0xf000;
   demand(mode===0||mode===0x8000,'SEP_ARCHIVE_LINK');
   demand((e.externalFileAttributes&0x410)===0,'SEP_ARCHIVE_ATTRIBUTES');
   demand(!e.isEncrypted()&&[0,8].includes(e.compressionMethod),'SEP_ARCHIVE_ENCODING');
   demand(Number.isSafeInteger(e.uncompressedSize)&&e.uncompressedSize>=0&&e.uncompressedSize<=maxBytes-total,'SEP_ARCHIVE_SIZE');total+=e.uncompressedSize;
   if(!e.fileName.startsWith('payload/'))demand(e.uncompressedSize<=16777216,'SEP_ARCHIVE_METADATA_SIZE');
   entries.push(e);demand(entries.length<=maxEntries,'SEP_ARCHIVE_COUNT');
  }
  for(const name of ['sep-package.json','base-graph.json','target-graph.json'])demand(names.has(name),'SEP_ARCHIVE_METADATA_MISSING');
  demand(same(before,await lstat(archive,{bigint:true})),'SEP_ARCHIVE_CHANGED');abort.throwIfAborted();
  await directory(dirname(destination));await mkdir(destination,{mode:0o700});await mkdir(join(destination,'payload'),{mode:0o700});
  let written=0;
  for(const e of entries){
   abort.throwIfAborted();if(zipError)throw zipError;
   await directory(destination);await directory(dirname(join(destination,e.fileName)));
   let count=0,checksum=0;
   const check=new Transform({transform(chunk,encoding,done){count+=chunk.length;written+=chunk.length;if(count>e.uncompressedSize||written>maxBytes)return done(Error('SEP_ARCHIVE_SIZE'));checksum=crc32(chunk,checksum);done(null,chunk);},flush(done){done(count!==e.uncompressedSize?Error('SEP_ARCHIVE_TRUNCATED'):checksum!==e.crc32?Error('SEP_ARCHIVE_CRC'):null);}});
   const input=await zip.openReadStreamPromise(e);
   await pipeline(input,check,createWriteStream(join(destination,e.fileName),{flags:'wx',mode:0o600,flush:true}),{signal:abort});
  }
  abort.throwIfAborted();demand(same(before,await lstat(archive,{bigint:true})),'SEP_ARCHIVE_CHANGED');
  if(zipError)throw zipError;return {status:'pass',files:entries.length,bytes:written};
 }catch(error){if(signal?.aborted)signal.throwIfAborted();if(abort.aborted)throw Error('SEP_ARCHIVE_TIMEOUT',{cause:error});if(error.message?.startsWith('SEP_ARCHIVE_'))throw error;throw Error('SEP_ARCHIVE_INVALID',{cause:error});}
 finally{if(zip?.isOpen)await new Promise((resolve,reject)=>{zip.once('close',resolve);zip.once('error',reject);zip.close();});}
}
