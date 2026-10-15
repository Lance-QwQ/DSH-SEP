import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,access} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {openFixture,isolation,edit} from './transaction-fixtures.mjs';
const marker={id:'document:synthetic',owner:'project:synthetic',status:'purged',documentPath:'data.txt',planHash:'a'.repeat(64)};
const authority=markers=>({identity:'synthetic-independent-authority',read:async()=>structuredClone(markers)});
const absent=path=>assert.rejects(access(path),{code:'ENOENT'});
test('permanent document deletion purges every managed generation and invalidates retained candidates without touching imported source',async()=>{
 const f=await openFixture(),markers=[];try{
  assert.equal(typeof f.project.bindDocumentAuthority,'function','Linux deletion authority is implemented');await f.project.bindDocumentAuthority(authority(markers));
  await f.project.commit(await f.project.run({command:edit('second-version')}));const pending=await f.project.run({command:edit('pending-version')});
  const review=await f.project.reviewDocument('data.txt');assert.equal(review.generationCopies,2);assert.equal(review.invalidatedPlans,1);assert(!JSON.stringify(review).includes('second-version'));
  markers.push(marker);assert.equal((await f.project.deleteDocument({marker})).status,'deleted');
  await absent(join((await f.project.current()).path,'data.txt'));
  for(const gen of ['1','2'])await absent(join(f.root,'generations',gen,'data/data.txt'));
  await assert.rejects(f.project.commit(pending),{code:'SEP_PROJECT_PLAN_INVALID'});
  for(const id of await readdir(join(f.root,'transactions')))assert.deepEqual(await readdir(join(f.root,'transactions',id)),[]);
  await f.project.commit(await f.project.planRestore(1));await absent(join((await f.project.current()).path,'data.txt'));
  assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');assert.equal(await readFile(join((await f.project.current()).path,'中文目录/note.txt'),'utf8'),'保留');
 }finally{await f.project.close();}
});
test('missing independent deletion authority blocks a restarted controller and known deleted bytes cannot be introduced under another path',async()=>{
 const f=await openFixture(),markers=[];await f.project.bindDocumentAuthority(authority(markers));markers.push(marker);await f.project.deleteDocument({marker});await f.project.close();
 const p=await f.openManagedProject({root:f.root,isolation});try{
  await assert.rejects(p.current(),{code:'SEP_PROJECT_DOCUMENT_AUTHORITY_REQUIRED'});
  await assert.rejects(p.bindDocumentAuthority(authority([])),{code:'SEP_PROJECT_DOCUMENT_AUTHORITY_INVALID'});
  await p.bindDocumentAuthority(authority(markers));
  await assert.rejects(p.run({command:edit('regenerated')}),{code:'SEP_PROJECT_DOCUMENT_REMOVED'});
  await assert.rejects(p.run({command:['/usr/bin/sh','-c','printf original > copied.txt']}),{code:'SEP_PROJECT_DOCUMENT_COPY_REMOVED'});
  await absent(join((await p.current()).path,'data.txt'));
 }finally{await p.close();}
});
test('untracked equal-content aliases and changed deletion plans refuse before destructive cleanup',async()=>{
 const f=await openFixture(),markers=[];try{
  await f.project.bindDocumentAuthority(authority(markers));const review=await f.project.reviewDocument('data.txt');
  await f.project.commit(await f.project.run({command:edit('changed')}));markers.push(marker);
  await assert.rejects(f.project.deleteDocument({marker,expectedPlanHash:review.planHash}),{code:'SEP_PROJECT_DOCUMENT_PLAN_CHANGED'});
  assert.equal(await readFile(join(f.root,'generations/1/data/data.txt'),'utf8'),'original');
 }finally{await f.project.close();}
 const g=await openFixture();try{await g.project.bindDocumentAuthority(authority([]));await g.project.commit(await g.project.run({command:['/usr/bin/sh','-c','cp data.txt alias.txt']}));await assert.rejects(g.project.reviewDocument('data.txt'),{code:'SEP_PROJECT_DOCUMENT_HISTORY_UNKNOWN'});}finally{await g.project.close();}
});
for(const phase of ['document-intent-durable','document-copy-unlinked','document-candidate-cleaned','document-complete-durable'])test(`real SIGKILL at ${phase} resumes deletion without restoring removed bytes`,{timeout:10000},async()=>{
 const f=await openFixture();if(phase==='document-candidate-cleaned')await f.project.run({command:edit('uncommitted')});await f.project.close();
 const child=spawn(process.execPath,[new URL('./document-worker.mjs',import.meta.url).pathname,JSON.stringify({root:f.root,isolation,phase,marker})],{env:{PATH:'/usr/bin:/bin'},stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',x=>err+=x);const ended=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});assert.equal(ended.signal,'SIGKILL',err);
 const p=await f.openManagedProject({root:f.root,isolation});try{
  await assert.rejects(p.current(),{code:'SEP_PROJECT_DOCUMENT_AUTHORITY_REQUIRED'});await p.bindDocumentAuthority(authority([marker]));
  await absent(join((await p.current()).path,'data.txt'));await p.commit(await p.planRestore(1));await absent(join((await p.current()).path,'data.txt'));
  assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
 }finally{await p.close();}
});
test('deletion recovery refuses changed surviving bytes instead of treating every partial tree as an approved deletion prefix',async()=>{
 const f=await openFixture();await f.project.close();const child=spawn(process.execPath,[new URL('./document-worker.mjs',import.meta.url).pathname,JSON.stringify({root:f.root,isolation,phase:'document-copy-unlinked',marker})],{env:{PATH:'/usr/bin:/bin'},stdio:'ignore'});const ended=await new Promise(r=>child.on('close',(code,signal)=>r({code,signal})));assert.equal(ended.signal,'SIGKILL');
 await writeFile(join(f.root,'generations/1/data/中文目录/note.txt'),'unexpected-modification');
 const p=await f.openManagedProject({root:f.root,isolation});try{await assert.rejects(p.bindDocumentAuthority(authority([marker])),{code:'SEP_PROJECT_DOCUMENT_RECOVERY_INVALID'});await assert.rejects(p.current(),{code:'SEP_PROJECT_DOCUMENT_RECOVERY_REQUIRED'});assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');}finally{await p.close();}
});
