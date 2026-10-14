import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readAssemblyReceipt,superviseNativeWorker} from './native-launch-runner.mjs';
const root=process.env.SEP_PRODUCT_TEST_ROOT;
if(!root)throw Error('SEP_PRODUCT_TEST_ROOT required');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function output(){return mkdtemp(join(root,'native-runner-'));}
async function child(t,mode,out){
 const p=spawn(process.execPath,[fileURLToPath(new URL('./native-runner-fixture.mjs',import.meta.url)),mode,out],{stdio:['ignore','ignore','ignore','ipc']});
 t.after(async()=>{p.ref();if(p.exitCode===null&&p.signalCode===null){const end=once(p,'exit');p.kill('SIGTERM');await end;}});
 return p;
}
test('assembly receipt requires supplied digest before using its program or app path',async()=>{
 const out=await output(),path=join(out,'assembly.json'),bytes=Buffer.from(JSON.stringify({status:'pass',restoredApplication:join(out,'DSH SEP.app'),programSha256:'a'.repeat(64)}));await writeFile(path,bytes);
 await assert.rejects(readAssemblyReceipt(path,'b'.repeat(64)),{code:'SEP_PRODUCT_ASSEMBLY_CHANGED'});
 const r=await readAssemblyReceipt(path,hash(bytes));assert.equal(r.programSha256,'a'.repeat(64));assert.equal(r.assemblyResultSha256,hash(bytes));
});
test('failed assembly receipt cannot become native launch input',async()=>{
 const out=await output(),path=join(out,'assembly.json'),bytes=Buffer.from(JSON.stringify({status:'fail',restoredApplication:join(out,'DSH SEP.app'),programSha256:'a'.repeat(64)}));await writeFile(path,bytes);
 await assert.rejects(readAssemblyReceipt(path,hash(bytes)),{code:'SEP_PRODUCT_ASSEMBLY_RESULT'});
});
test('two passed cases require actual worker exit zero',async t=>{
 const out=await output(),p=await child(t,'pass',out),r=await superviseNativeWorker({child:p,outputRoot:out,deadlineMs:3000,cleanupMs:1000});
 assert.equal(r.status,'pass');assert.deepEqual(r.workerExit,{code:0,signal:null});assert.equal(r.counts.pass,2);assert.equal(r.cleanup.resourcesConfirmedReleased,true);
});
test('passing case receipts with actual nonzero worker exit remain failed',async t=>{
 const out=await output(),p=await child(t,'bad-exit',out),r=await superviseNativeWorker({child:p,outputRoot:out,deadlineMs:3000,cleanupMs:1000});
 assert.equal(r.status,'fail');assert.equal(r.workerExit.code,1);assert.equal(r.cleanup.resourcesConfirmedReleased,true);
});
test('unknown cleanup retains exact child and cannot be reported as pass',async t=>{
 const out=await output(),p=await child(t,'blocked',out),r=await superviseNativeWorker({child:p,outputRoot:out,deadlineMs:3000,cleanupMs:1000});
 assert.equal(r.status,'blocked');assert.equal(r.workerPid,p.pid);assert.equal(r.workerExit,null);assert.equal(p.exitCode,null);assert.equal(r.cleanup.resourcesConfirmedReleased,false);assert.equal(r.cases[0].cleanup.generation,'c'.repeat(32));
});
test('deadline requests normal cleanup and records unknown response without killing the worker',async t=>{
 const out=await output(),p=await child(t,'wait-cleanup',out),r=await superviseNativeWorker({child:p,outputRoot:out,deadlineMs:400,cleanupMs:1000});
 assert.equal(r.status,'blocked');assert.equal(r.normalCleanupRequested,true);assert.equal(r.workerExit,null);assert.equal(p.exitCode,null);assert.equal(JSON.parse(await readFile(join(out,'cleanup-request.json'),'utf8')).kind,'requestCleanup');
});
