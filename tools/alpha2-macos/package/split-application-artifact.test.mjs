import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {MAX_PART_BYTES,splitApplicationArtifact} from './split-application-artifact.mjs';
const root=process.env.SEP_ARTIFACT_SPLIT_TEST_ROOT;
if(!root)throw Error('SEP_ARTIFACT_SPLIT_TEST_ROOT required');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(bytes=Buffer.from('small signed archive fixture')){
 const runnerTemp=await mkdtemp(join(root,'split-')),assemblyRoot=join(runnerTemp,'assembly');await mkdir(assemblyRoot);
 const receipt={schema:1,status:'pass',artifact:'DSH-SEP-preview.zip',artifactSha256:hash(bytes),artifactBytes:bytes.length};
 await writeFile(join(assemblyRoot,receipt.artifact),bytes);const resultBytes=JSON.stringify(receipt)+'\n';await writeFile(join(assemblyRoot,'RESULT.json'),resultBytes);
 return {runnerTemp,assemblyRoot,outputRoot:join(runnerTemp,'parts'),partBytes:7,bytes,receipt,resultBytes};
}
test('streamed parts reconstruct exact archive and bind every digest without modifying assembly',async()=>{
 const f=await fixture(),r=await splitApplicationArtifact(f);assert.equal(r.status,'pass');assert.equal(MAX_PART_BYTES,384*1024*1024);
 const manifest=JSON.parse(await readFile(join(f.outputRoot,'transport-manifest.json'),'utf8'));assert.deepEqual(manifest,r);assert.equal(r.assemblyResultSha256,hash(f.resultBytes));assert.equal(r.artifact.sha256,f.receipt.artifactSha256);assert.equal(r.artifact.bytes,f.bytes.length);
 const parts=[];for(const[index,p]of r.parts.entries()){assert.equal(p.index,index+1);assert.match(p.name,/\.part$/);assert.ok(p.bytes>0&&p.bytes<=7);const bytes=await readFile(join(f.outputRoot,p.name));assert.equal(bytes.length,p.bytes);assert.equal(hash(bytes),p.sha256);parts.push(bytes);}
 assert.deepEqual(Buffer.concat(parts),f.bytes);assert.equal(r.totalBytes,f.bytes.length);assert.deepEqual(await readFile(join(f.assemblyRoot,f.receipt.artifact)),f.bytes);assert.equal(await readFile(join(f.assemblyRoot,'RESULT.json'),'utf8'),f.resultBytes);
});
test('exact part boundary does not emit an empty trailing part',async()=>{
 const f=await fixture(Buffer.alloc(14,0x5a)),r=await splitApplicationArtifact(f);assert.equal(r.parts.length,2);assert.deepEqual(r.parts.map(p=>p.bytes),[7,7]);assert.equal((await readdir(f.outputRoot)).filter(n=>n.endsWith('.part')).length,2);
});
test('wrong whole-archive SHA refuses a successful transport manifest and preserves original',async()=>{
 const f=await fixture();f.receipt.artifactSha256='0'.repeat(64);await writeFile(join(f.assemblyRoot,'RESULT.json'),JSON.stringify(f.receipt));await assert.rejects(splitApplicationArtifact(f),{code:'SEP_ARTIFACT_BINDING'});
 await assert.rejects(stat(join(f.outputRoot,'transport-manifest.json')),{code:'ENOENT'});assert.deepEqual(await readFile(join(f.assemblyRoot,f.receipt.artifact)),f.bytes);
});
test('failed assembly and wrong advertised byte count are refused before splitting',async()=>{
 for(const change of [{status:'fail'},{artifactBytes:9999}]){const f=await fixture();await writeFile(join(f.assemblyRoot,'RESULT.json'),JSON.stringify({...f.receipt,...change}));await assert.rejects(splitApplicationArtifact(f),{code:change.status?'SEP_ARTIFACT_RESULT':'SEP_ARTIFACT_BINDING'});await assert.rejects(stat(f.outputRoot),{code:'ENOENT'});}
});
test('artifact escape, existing output, outside output, and oversized parts are refused',async()=>{
 const f=await fixture();await writeFile(join(f.assemblyRoot,'RESULT.json'),JSON.stringify({...f.receipt,artifact:'../other.zip'}));await assert.rejects(splitApplicationArtifact(f),{code:'SEP_ARTIFACT_RESULT'});
 await writeFile(join(f.assemblyRoot,'RESULT.json'),f.resultBytes);await mkdir(f.outputRoot);await assert.rejects(splitApplicationArtifact(f),{code:'SEP_ARTIFACT_OUTPUT'});
 await assert.rejects(splitApplicationArtifact({...f,outputRoot:join(root,'outside')}),{code:'SEP_ARTIFACT_OUTPUT'});await assert.rejects(splitApplicationArtifact({...f,outputRoot:join(f.runnerTemp,'other'),partBytes:MAX_PART_BYTES+1}),{code:'SEP_ARTIFACT_PART_SIZE'});
});
