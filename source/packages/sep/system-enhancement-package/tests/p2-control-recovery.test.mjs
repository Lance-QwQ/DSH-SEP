import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openControl,DATA_DOMAINS} from '../src/p2/control.js';

async function fixture(t){
 const parent=process.env.SEP_TEST_ROOT??tmpdir();await mkdir(parent,{recursive:true});
 const storageRoot=await mkdtemp(join(parent,'journal-recovery-'));
 let control=await openControl({storageRoot,mode:'maintenance',initialize:true});
 t.after(async()=>{await control?.close();});
 const headPath=control.headPath,journalPath=join(control.root,'journal.jsonl');
 const initialHead=await readFile(headPath);
 return {storageRoot,headPath,journalPath,initialHead,get control(){return control;},
  async reopen(mode='maintenance'){await control.close();control=undefined;control=await openControl({storageRoot,mode});return control;},
  async lag(bytes=initialHead){await control.close();await writeFile(headPath,bytes);}};
}
test('reopening reconciles a durable audit tail without appending or replaying it',async t=>{
 const f=await fixture(t);await f.control.event('audit',{synthetic:true});const expected=await f.control.checkpoint();const journal=await readFile(f.journalPath);
 await f.lag();const reopened=await f.reopen('writer');assert.deepEqual((await reopened.checkpoint()).head,expected.head);
 assert.deepEqual(await readFile(f.journalPath),journal);assert.equal((await reopened.checkpoint()).businessSeq,0);
 await reopened.event('audit',{second:true});assert.equal((await reopened.checkpoint()).head.seq,3);
});
test('reconciliation preserves a published business completion and its sequence',async t=>{
 const f=await fixture(t);let calls=0;
 await f.control.business({operation:'synthetic'},async()=>{calls++;await writeFile(join(f.storageRoot,DATA_DOMAINS[0]+'.json'),'synthetic-data');});
 const expected=await f.control.checkpoint(),journal=await readFile(f.journalPath);
 await f.lag();const reopened=await f.reopen('writer');const cp=await reopened.checkpoint();assert.equal(cp.businessSeq,1);assert.equal(cp.pending.length,0);assert.equal(calls,1);assert.deepEqual(cp.head,expected.head);assert.deepEqual(await readFile(f.journalPath),journal);
 await reopened.withAccess(async()=>assert.equal(await readFile(join(f.storageRoot,DATA_DOMAINS[0]+'.json'),'utf8'),'synthetic-data'));
});
test('a recovered business intent still refuses writer admission and is not completed automatically',async t=>{
 const f=await fixture(t);await assert.rejects(f.control.business({operation:'synthetic'},async()=>{throw Error('synthetic interrupted operation');}));
 await f.lag();await assert.rejects(f.reopen('writer'),{code:'P2_RECOVERY_REQUIRED'});
 const c=await openControl({storageRoot:f.storageRoot,mode:'maintenance'});try{const cp=await c.checkpoint();assert.equal(cp.pending.length,1);assert.equal(cp.businessSeq,1);assert.equal(cp.events.at(-1).type,'business_intent');}finally{await c.close();}
});
for(const kind of ['hash','identity','ahead','truncated'])test(`reopening refuses ${kind} corruption without modifying journal or head`,async t=>{
 const f=await fixture(t);await f.control.event('audit',{synthetic:true});await f.control.close();
 const head=JSON.parse(f.initialHead);if(kind==='hash')head.hash='a'.repeat(64);if(kind==='identity')head.identity='wrong';if(kind==='ahead')head.seq=99;
 if(kind==='truncated'){const data=await readFile(f.journalPath);await writeFile(f.journalPath,data.subarray(0,data.length-1));}else await writeFile(f.headPath,JSON.stringify(head));
 const beforeHead=await readFile(f.headPath),beforeJournal=await readFile(f.journalPath);
 await assert.rejects(f.reopen(),{code:'P2_JOURNAL_INVALID'});assert.deepEqual(await readFile(f.headPath),beforeHead);assert.deepEqual(await readFile(f.journalPath),beforeJournal);
});