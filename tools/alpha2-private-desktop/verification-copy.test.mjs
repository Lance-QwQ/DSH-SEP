import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,link,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const host=process.env.SEP_OFFICIAL_HARNESS,base=process.env.SEP_BUNDLE_TEST_ROOT;
const core=join(host,'node_modules/dsh-sep-bundle/bundle/modules/system-enhancement-package/src');
const {openControl}=await import(pathToFileURL(join(core,'p2/control.js')));
let api;try{api=await import('./verification-copy.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
async function fixture(){
 assert(api?.prepareVerificationCopy,'VERIFICATION_COPY_NOT_IMPLEMENTED');
 const root=await mkdtemp(join(base,'verification-copy-')),source=join(root,'source'),capture=join(root,'capture'),parent=join(root,'target');
 await mkdir(source);await mkdir(parent);const c=await openControl({storageRoot:source,initialize:true});
 // A withdrawn record is authority outside rollback-able data. Preserve it even
 // though the synthetic source has no physical document or restoration work.
 await c.business({operation:'synthetic'},()=>c.deletion({id:'withdrawn-before-copy',owner:'project:synthetic',status:'withdrawn'}));await c.close();
 await cp(source,capture,{recursive:true});
 const result=await api.prepareVerificationCopy({sourceRoot:source,capturedRoot:capture,targetParent:parent,host});return {root,source,capture,parent,...result};
}
test('explicit plan opens the physical copy, preserves complete journal/deletion authority, and reopens after a COPY write',async()=>{
 const f=await fixture();await assert.rejects(openControl({storageRoot:f.storageRoot}),e=>['P2_JOURNAL_INVALID','P2_STORAGE_RELOCATION_INVALID'].includes(e.code));
 const body=await readFile(join(f.capture,'.suite-memory/p2/journal.jsonl'));
 let c=await api.openVerificationControl({planPath:f.planPath,expectedPlanHash:f.planHash,storageRoot:f.storageRoot});
 try{const before=await c.checkpoint();assert.equal(before.deletionSeq,1);assert.equal(before.deletions[0].id,'withdrawn-before-copy');await c.business({domain:'dsh_enhancement_suite_v1',operation:'put',table:'projects',key:'synthetic'},()=>writeFile(join(f.storageRoot,'dsh_enhancement_suite_v1.json'),'{}'));assert((await readFile(join(f.storageRoot,'.suite-memory/p2/journal.jsonl'))).subarray(0,body.length).equals(body));}finally{await c.close();}
 c=await api.openVerificationControl({planPath:f.planPath,expectedPlanHash:f.planHash,storageRoot:f.storageRoot});try{assert.equal((await c.checkpoint()).deletionSeq,1);}finally{await c.close();}
 assert((await readFile(join(f.source,'.suite-memory/p2/journal.jsonl'))).equals(body));
});
test('mismatched confirmation, another target, and forged plan fail before acquiring a target owner',async()=>{
 const f=await fixture();await assert.rejects(api.openVerificationControl({planPath:f.planPath,expectedPlanHash:'0'.repeat(64),storageRoot:f.storageRoot}),{code:'VERIFICATION_PLAN_MISMATCH'});
 await assert.rejects(api.openVerificationControl({planPath:f.planPath,expectedPlanHash:f.planHash,storageRoot:f.source}),{code:'VERIFICATION_TARGET_MISMATCH'});
 const p=JSON.parse(await readFile(f.planPath));p.target.fileId='0:0';await writeFile(f.planPath,JSON.stringify(p));await assert.rejects(api.openVerificationControl({planPath:f.planPath,expectedPlanHash:f.planHash,storageRoot:f.storageRoot}),{code:'VERIFICATION_PLAN_MISMATCH'});
 await assert.rejects(readFile(join(f.storageRoot,'.suite-memory/p2/owner.lock')),{code:'ENOENT'});
});
test('changed source/capture and hardlinked target content refuse admission',async()=>{
 const f=await fixture();await writeFile(join(f.capture,'.suite-memory/p2/journal.jsonl'),'changed');await assert.rejects(api.openVerificationControl({planPath:f.planPath,expectedPlanHash:f.planHash,storageRoot:f.storageRoot}),{code:'VERIFICATION_SOURCE_CHANGED'});
 const g=await fixture();await writeFile(join(g.source,'dsh_enhancement_suite_v1.json'),'changed');await assert.rejects(api.openVerificationControl({planPath:g.planPath,expectedPlanHash:g.planHash,storageRoot:g.storageRoot}),{code:'VERIFICATION_SOURCE_CHANGED'});
 const h=await fixture();await link(join(h.storageRoot,'.suite-memory/p2/journal.jsonl'),join(h.root,'extra-link'));await assert.rejects(api.openVerificationControl({planPath:h.planPath,expectedPlanHash:h.planHash,storageRoot:h.storageRoot}),{code:'VERIFICATION_ALIAS'});
});
test('verification copy refuses maintenance, rollback, deletion and external-path business callbacks',async()=>{
 const f=await fixture(),c=await api.openVerificationControl({planPath:f.planPath,expectedPlanHash:f.planHash,storageRoot:f.storageRoot});let called=false;
 try{for(const work of [()=>c.maintenance({},()=>{called=true;}),()=>c.completeDeletion({id:'withdrawn-before-copy'}),()=>c.documentDeletion({},()=>{called=true;}),()=>c.business({operation:'purge_owned_backups'},()=>{called=true;}),()=>c.business({domain:'dsh_enhancement_suite_v1',operation:'put',file:f.source},()=>{called=true;})])await assert.rejects(work,{code:'VERIFICATION_SCOPE_DENIED'});assert.equal(called,false);}finally{await c.close();}
});
test('closed barrier and unresolved business intent remain blocked, not reset by copy preparation',async()=>{
 assert(api?.prepareVerificationCopy,'VERIFICATION_COPY_NOT_IMPLEMENTED');
 for(const kind of ['barrier','pending']){
  const root=await mkdtemp(join(base,'verification-closed-')),source=join(root,'source'),capture=join(root,'capture'),parent=join(root,'target');await mkdir(parent);const c=await openControl({storageRoot:source,initialize:true,mode:'maintenance'});
  if(kind==='barrier')await c.setBarrier({closed:true});else await assert.rejects(c.business({operation:'synthetic'},()=>{throw Error('EXPECTED');}));await c.close();await cp(source,capture,{recursive:true});
  await assert.rejects(api.prepareVerificationCopy({sourceRoot:source,capturedRoot:capture,targetParent:parent,host}),{code:'VERIFICATION_SOURCE_NOT_QUIESCENT'});
 }
});
test('missing deletion basis, altered journal prefix and modified seed domain cannot become an authorized copy',async()=>{
 const f=await fixture();const path=join(f.storageRoot,'.suite-memory/p2/journal.jsonl');const body=(await readFile(path,'utf8')).split('\n');body[1]=body[1].replace('business_intent','business_intent_changed');await writeFile(path,body.join('\n'));await assert.rejects(api.openVerificationControl({planPath:f.planPath,expectedPlanHash:f.planHash,storageRoot:f.storageRoot}),{code:'VERIFICATION_CHAIN_INVALID'});
 const g=await fixture();await writeFile(join(g.storageRoot,'dsh_enhancement_suite_v1.json'),'tampered');await assert.rejects(api.openVerificationControl({planPath:g.planPath,expectedPlanHash:g.planHash,storageRoot:g.storageRoot}),{code:'P2_DATA_DRIFT'});
 const h=await fixture();await writeFile(join(h.source,'.suite-memory/p2/journal.jsonl'),'');await assert.rejects(api.openVerificationControl({planPath:h.planPath,expectedPlanHash:h.planHash,storageRoot:h.storageRoot}),{code:'VERIFICATION_SOURCE_CHANGED'});
});
