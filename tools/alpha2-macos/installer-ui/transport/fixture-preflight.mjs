// Test-fixture validation only. This does not exercise NSTask or the transport.
import { copyFile, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=resolve(process.argv[2]);await mkdir(root,{recursive:false});
const source=fileURLToPath(new URL('./controller-fixture.mjs',import.meta.url));
const nonce='f'.repeat(64),manifest='a'.repeat(64),results=[];
for(const mode of ['normal','split','slow','stderr','race','exit-eof','wrong-nonce','wrong-sequence','extra-field','duplicate','oversize','invalid-utf8','truncated','blocked']){
 const fixture=join(root,`${mode}.mjs`);await copyFile(source,fixture);
 const child=spawn(process.execPath,[fixture,nonce,manifest],{env:{PATH:process.env.PATH,LANG:'en_US.UTF-8'},stdio:['pipe','pipe','pipe']});
 const chunks=[];let stderr=0,output=0,closedSent=false,started=Date.now(),exitAt=null;
 const onData=chunk=>{chunks.push(chunk);output+=chunk.length;assert.ok(output<131072);if(['normal','split','slow','stderr'].includes(mode)&&Buffer.concat(chunks).includes(10)&&!closedSent){closedSent=true;child.stdin.write(JSON.stringify({protocol:1,nonce,sequence:2,operation:'close',input:{}})+'\n');}};
 child.stdout.on('data',onData);child.stderr.on('data',chunk=>{stderr+=chunk.length;});child.stdin.on('error',()=>{});child.on('exit',()=>{exitAt=Date.now();});
 child.stdin.write(JSON.stringify({protocol:1,nonce,sequence:1,operation:['race','exit-eof','blocked'].includes(mode)?'close':'preview',input:{}})+'\n');
 const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 assert.equal(result.signal,null);assert.equal(result.code,mode==='blocked'?9:0);const bytes=Buffer.concat(chunks);
 if(['normal','split','slow','stderr'].includes(mode)){const values=bytes.toString('utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(values.length,2);assert.equal(values[0].preview.target,'/Users/synthetic/Applications/安装 SEP.app');assert.equal(values[1].phase,'closed');}
 if(mode==='stderr')assert.ok(stderr>1000000);
 if(mode==='exit-eof'&&process.platform!=='win32')assert.ok(Date.now()-exitAt>=150);
 results.push({mode,status:'pass',exit:result.code,stdoutBytes:bytes.length,stderrBytes:stderr,elapsedMs:Date.now()-started,...(mode==='exit-eof'?{exitToEofMs:Date.now()-exitAt,inheritedFdOrderVerified:process.platform!=='win32'}:{})});
}
const bytes=await readFile(source);const receipt={status:'pass',platform:process.platform,scope:'synthetic fixture preflight; not the native transport',notVerified:process.platform==='win32'?['POSIX inherited stdout ordering; actual Mac preflight still requires it']:[],fixtureSha256:createHash('sha256').update(bytes).digest('hex'),results};await writeFile(join(root,'RESULT.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
