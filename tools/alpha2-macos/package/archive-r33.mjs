// Read-only archive transport for an already verified fixed CI artifact.
// This does not rebuild, re-sign, install or publish a release.
import assert from 'node:assert/strict';
import {mkdir,realpath,open,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
const artifact=11891016729,expectedBytes=653163007;
const expectedSha256='e7aab0bf4890a3a86c51e8532b3faf8c6a5adb5f16225944110e2c642883fd5c';
const out=resolve(process.argv[2]),temp=await realpath(process.env.RUNNER_TEMP);
assert(out.startsWith(temp+'/'));await mkdir(out,{mode:0o700});assert.equal(await realpath(out),out);
const token=process.env.SEP_ARTIFACT_TOKEN;assert(token);
const reply=await fetch('https://api.github.com/repos/Lance-QwQ/DSH-SEP/actions/artifacts/'+artifact+'/zip',{redirect:'manual',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(60000)});
assert([301,302,303,307,308].includes(reply.status));
const url=new URL(reply.headers.get('location'));assert.equal(url.protocol,'https:');assert(url.hostname.endsWith('.blob.core.windows.net')||url.hostname.endsWith('.actions.githubusercontent.com'));
const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(600000)});assert(response.ok);
const digest=createHash('sha256');let bytes=0;
const source=join(out,'original-artifact.zip');
await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,encoding,done){bytes+=chunk.length;if(bytes>expectedBytes)return done(Error('ARCHIVE_SIZE'));digest.update(chunk);done(null,chunk);}}),createWriteStream(source,{flags:'wx',mode:0o600}));
assert.equal(bytes,expectedBytes);assert.equal(digest.digest('hex'),expectedSha256);
const input=await open(source,'r'),parts=[];let offset=0;
try{
 for(let index=1;offset<bytes;index++){
  const folder=join(out,'part-'+index);await mkdir(folder,{mode:0o700});
  const name='artifact.part-'+index,part=await open(join(folder,name),'wx',0o600),hash=createHash('sha256');let partBytes=0;
  try{const buffer=Buffer.alloc(8*1024*1024);while(partBytes<240*1024*1024&&offset<bytes){const size=Math.min(buffer.length,240*1024*1024-partBytes,bytes-offset);const {bytesRead}=await input.read(buffer,0,size,offset);assert.equal(bytesRead,size);const chunk=buffer.subarray(0,bytesRead);hash.update(chunk);let written=0;while(written<bytesRead){const r=await part.write(chunk,written,bytesRead-written);assert(r.bytesWritten>0);written+=r.bytesWritten;}partBytes+=bytesRead;offset+=bytesRead;}await part.sync();}finally{await part.close();}
  parts.push({name,bytes:partBytes,sha256:hash.digest('hex')});
 }
}finally{await input.close();}
assert.equal(parts.length,3);
await writeFile(join(out,'PARTS.json'),JSON.stringify({schema:1,status:'pass',scope:'byte-preserving transport only',sourceRun:38557966121,sourceCommit:'7aa4b2113d1b858d4f7358a9cfbd93e780a2de5b',artifactId:artifact,bytes,sha256:expectedSha256,parts},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'pass',bytes,parts:parts.length}));
