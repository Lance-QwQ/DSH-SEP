import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setup,ok} from './sep-fixture.mjs';
import {fixture} from './transaction-fixtures.mjs';
import {spawn} from 'node:child_process';
import {owned} from './bundle-modules.mjs';
async function interrupt(phase){
 const base=await fixture(),child=spawn(process.execPath,[new URL('./linux-document-worker.mjs',import.meta.url).pathname,JSON.stringify({base,phase})],{env:{...process.env},stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',x=>stderr+=x);
 const result=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});assert.equal(result.signal,'SIGKILL',stderr);return base;
}
test('real SEP document tool binds controlled-copy review and deletes RAG plus historical managed generations after exact user confirmation',async()=>{
 const f=await setup();try{
  ok(await f.call('suite_index'));ok(await f.call('bash',{command:'printf changed > data.txt'}));await f.ctx.sepLinuxProfile.commit(await f.ctx.sepLinuxProfile.review());ok(await f.call('suite_index'));
  const p=ok(await f.call('suite_document_delete',{action:'preview',path:'data.txt'}));assert.equal(p.source.managedCopies.generationCopies,2);assert(p.inventory.archives>=1,'historical RAG version exists before deletion');assert(p.excludedFromDeletion.includes('imported_original_source'));assert(!JSON.stringify(p).includes('changed'));
  f.say('可以删除');assert.equal((await f.call('suite_document_delete',{action:'confirm',planId:p.planId,planHash:p.planHash})).error.message.split(':')[0],'DOCUMENT_CONFIRMATION_REQUIRED');
  f.say(p.confirmation);const result=ok(await f.call('suite_document_delete',{action:'confirm',planId:p.planId,planHash:p.planHash}));assert.equal(result.status,'deleted');assert.equal(result.source.status,'retained');
  assert.equal(ok(await f.call('suite_document_delete',{action:'status',planId:p.planId})).status,'deleted');
  for(const name of ['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1'])assert(!(await readFile(join(f.memory,name+'.json'),'utf8')).includes('changed'),'no current/active/archive body remains');
  assert.equal(ok(await f.call('suite_search',{query:'changed'})).status,'not_found');ok(await f.call('suite_index'));assert.equal(ok(await f.call('suite_search',{query:'original'})).status,'not_found');
  const restore=await f.ctx.sepLinuxProfile.restore(1);await f.ctx.sepLinuxProfile.commit(restore);await assert.rejects(access(join((await f.ctx.sepLinuxProfile.current()).path,'data.txt')),{code:'ENOENT'});
  assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');assert.equal(f.providerCalls(),0);
 }finally{await f.close();}
 const g=await setup({base:f});try{ok(await g.call('suite_index'));assert.equal(ok(await g.call('suite_search',{query:'original'})).status,'not_found');}finally{await g.close();}
});
for(const phase of ['document-authority-accepted','document-intent-durable','document-copy-unlinked'])test(`actual SEP/P2 process death at ${phase} completes governed cleanup on restart`,{timeout:15000},async()=>{
 const base=await interrupt(phase),f=await setup({base});try{
  const plan=JSON.parse(await readFile(join(f.base,'document-test-plan.json')));f.say('确认永久删除计划 '+plan.planHash);
  assert.equal(ok(await f.call('suite_document_delete',{action:'resume',...plan})).status,'deleted');
  ok(await f.call('suite_index'));assert.equal(ok(await f.call('suite_search',{query:'original'})).status,'not_found');
  await assert.rejects(access(join((await f.ctx.sepLinuxProfile.current()).path,'data.txt')),{code:'ENOENT'});assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
 }finally{await f.close();}
});
test('lost body-free review stops interrupted deletion recovery instead of inventing new permission',async()=>{
 const base=await interrupt('document-authority-accepted'),plan=JSON.parse(await readFile(join(base.base,'document-test-plan.json')));
 await writeFile(join(base.base,'memory/.suite-memory/p2/document-plans',plan.planHash+'.json'),'{}');
 await assert.rejects(setup({base}),{code:'SEP_LINUX_DOCUMENT_PLAN_UNVERIFIED'});
 assert.equal(await readFile(join(base.root,'generations/1/data/data.txt'),'utf8'),'original');
});
test('Linux tool refuses imported-source destruction and changed managed versions without persisting a deletion',async()=>{
 const f=await setup();try{
  assert.equal((await f.call('suite_document_delete',{action:'preview',path:'data.txt',deleteSource:true})).error.message.split(':')[0],'SEP_LINUX_ORIGINAL_SOURCE_RETAINED');
  const p=ok(await f.call('suite_document_delete',{action:'preview',path:'data.txt'}));ok(await f.call('bash',{command:'printf newer > data.txt'}));f.say(p.confirmation);
  assert.equal((await f.call('suite_document_delete',{action:'confirm',planId:p.planId,planHash:p.planHash})).error.message.split(':')[0],'DOCUMENT_PLAN_CHANGED');
  assert.equal(ok(await f.call('read',{file_path:'data.txt'})).text,'newer');assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
 }finally{await f.close();}
});
test('a different project deletion in the same P2 authority never authorizes deleting this managed workspace',async()=>{
 const f=await setup();await f.close();const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js'),c=await openControl({storageRoot:f.memory});
 try{const marker={id:'document:foreign',owner:'project:another-project',status:'purged',documentPath:'data.txt',planHash:'f'.repeat(64)};await c.documentDeletion(marker,()=>c.completeDeletion({id:marker.id}));}finally{await c.close();}
 const g=await setup({base:f});try{assert.equal(ok(await g.call('read',{file_path:'data.txt'})).text,'original');ok(await g.call('suite_index'));assert.equal(ok(await g.call('suite_search',{query:'original'})).status,'found');}finally{await g.close();}
});
