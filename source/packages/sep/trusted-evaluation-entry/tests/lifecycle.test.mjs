import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Entry} from '../entry.mjs';

function fixture(t,shutdownMs=100){
 const config={enabled:true,shutdownMs,backend:{configSha256:'a'.repeat(64),stateIdentity:'b'.repeat(64)},project:{projectId:'synthetic',catalogSha256:'c'.repeat(64)}};
 let connection,spawns=0,disposed=0,eof=0;
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify(connection));t.after(()=>{globalThis.fetch=previous;});
 const entry=new Entry({plugin:async()=>({dispose:async()=>{disposed++;}})},config,{spawnBackend:challenge=>{
  spawns++;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
  connection={endpoint:'http://127.0.0.1:12345',protocol:'sep-eval-lifecycle-v1',projectId:config.project.projectId,catalogSha256:config.project.catalogSha256,stateIdentity:config.backend.stateIdentity,generationId:'d'.repeat(32),token:'e'.repeat(64),challenge};
  child.stdin.on('finish',()=>{eof++;child.stdout.write(JSON.stringify({closed:{status:'pass',quiescent:true,generationId:connection.generationId}})+'\n');child.emit('close',0);});
  setImmediate(()=>child.stdout.write(JSON.stringify({ready:connection})+'\n'));return child;
 }});
 t.after(async()=>{config.shutdownMs=100;if(entry.runtime)await entry.stop();});
 return {entry,config,counts:()=>({spawns,disposed,eof})};
}
for(const invalid of [0,99,30001,NaN,Infinity,'100'])test(`invalid shutdown budget ${String(invalid)} refuses activation before spawning`,async t=>{
 const f=fixture(t,invalid);await assert.rejects(f.entry.start(),/SHUTDOWN_LIMIT/);assert.deepEqual(f.counts(),{spawns:0,disposed:0,eof:0});assert.equal(f.entry.state,'idle');
});
test('a running entry uses its validated shutdown budget even if the caller mutates configuration',async t=>{
 const f=fixture(t);assert.equal((await f.entry.start()).status,'pass');f.config.shutdownMs=0;
 assert.equal((await f.entry.stop()).status,'pass');assert.deepEqual(f.counts(),{spawns:1,disposed:1,eof:1});assert.equal((await f.entry.stop()).status,'pass');
});
test('the lifecycle integrity manifest covers every shipped Python module with exact bytes',async()=>{
 const root=new URL('../evaluation/',import.meta.url),manifest=JSON.parse(await readFile(new URL('lifecycle-manifest.json',root),'utf8'));
 const files=['admission.py','compile_patch.py','deadline.py','evaluation.py','grade_worker.py','lifecycle.py','lifecycle_worker.py','official.py','supervisor.py'];
 assert.deepEqual(Object.keys(manifest).sort(),files);
 for(const file of files){const bytes=await readFile(new URL(file,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest[file],file);}
});