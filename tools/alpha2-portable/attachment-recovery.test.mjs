import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile,access,mkdir,link,unlink,chmod,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {setupVision,invoke,ok,vision,imageFixture} from './vision-fixture.mjs';
import {setup} from './sep-fixture.mjs';
import * as maintenance from './linux-attachment-maintenance.mjs';
async function populated(){const f=await setupVision();let ref;f.setBehavior(async o=>{ref=o.messages[0].content.find(b=>b.type==='image').attachment;await f.ctx.attachments.readImageRequest(ref,{width:4,height:4,maxBytes:65536},o.signal);});ok(await invoke(f));const selected=f.ctx.sepLinuxAttachmentBinding,path=f.ctx.attachments.imageHostPath(ref);await f.close();return {...f,ref,selected,path};}
async function child(script,args){const p=spawn(process.execPath,[new URL(script,import.meta.url).pathname,...args],{env:{...process.env},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);return new Promise((resolve,reject)=>{p.once('error',reject);p.once('close',(code,signal)=>resolve({code,signal,stdout,stderr}));});}
for(const phase of ['attachment-intent-durable','attachment-copy-unlinked','attachment-complete-durable'])test(`Linux purge process death at ${phase} keeps the independent domain fenced and recovers through reviewed remaining copies`,async()=>{
 const f=await populated(),plan=await maintenance.prepareAttachmentPurge(f.selected),file=join(f.base,'purge-plan.json');await writeFile(file,JSON.stringify(plan),{mode:0o600});const result=await child('./attachment-worker.mjs',[file,phase]);assert.equal(result.signal,'SIGKILL',result.stderr);
 if(phase!=='attachment-complete-durable'){
  await assert.rejects(setup({base:f,business:{vision},imageCapable:true}),{code:'SEP_ATTACHMENT_PURGE_PENDING'});const resumed=await maintenance.prepareAttachmentPurge(f.selected);assert(resumed.pendingPurges.includes(plan.planHash));if(phase==='attachment-copy-unlinked')await assert.rejects(maintenance.applyAttachmentPurge({...f.selected,plan,confirm:plan.planHash}),{code:'SEP_ATTACHMENT_PLAN_STALE'});
  assert.equal((await maintenance.applyAttachmentPurge({...f.selected,plan:resumed,confirm:resumed.planHash})).status,'pass');
 }
 assert.equal((await maintenance.prepareAttachmentPurge(f.selected)).files.length,0);const g=await setup({base:f,business:{vision},imageCapable:true});try{await assert.rejects(g.ctx.attachments.readImage(f.ref));await access(join(f.source,'图像.png'));}finally{await g.close();}
});
test('Linux attachment restart preserves the original native reference, including after its document source is governed-deleted',async()=>{
 const f=await populated(),g=await setup({base:f,business:{vision},imageCapable:true});try{assert((await g.ctx.attachments.readImage(f.ref)).data.byteLength>0);const preview=ok(await g.call('suite_document_delete',{action:'preview',path:'图像.png'}));g.say(preview.confirmation);ok(await g.call('suite_document_delete',{action:'confirm',planId:preview.planId,planHash:preview.planHash}));assert((await g.ctx.attachments.readImage(f.ref)).data.byteLength>0);await access(join(g.source,'图像.png'));}finally{await g.close();}
 const plan=await maintenance.prepareAttachmentPurge(f.selected);assert(plan.files.length>=2);assert.equal((await maintenance.applyAttachmentPurge({...f.selected,plan,confirm:plan.planHash})).status,'pass');
});
test('Linux purge rejects stale bytes, aliases and a different project without deleting images',async()=>{
 const f=await populated(),plan=await maintenance.prepareAttachmentPurge(f.selected),bytes=await readFile(f.path);await chmod(f.path,0o600);await writeFile(f.path,Buffer.concat([bytes,Buffer.from('changed')]));await assert.rejects(maintenance.applyAttachmentPurge({...f.selected,plan,confirm:plan.planHash}),{code:'SEP_ATTACHMENT_PLAN_STALE'});await access(f.path);
 await writeFile(f.path,bytes);await chmod(f.path,0o400);await assert.rejects(maintenance.prepareAttachmentPurge({...f.selected,projectId:'00000000-0000-4000-8000-000000000099'}),{code:'SEP_ATTACHMENT_OWNER_MISMATCH'});
 const alias=join(f.base,'aliased-memory');await symlink(f.memory,alias);await assert.rejects(maintenance.prepareAttachmentPurge({...f.selected,storageRoot:alias}),{code:'SEP_PROJECT_PATH'});const hard=join(f.memory,'.suite-attachments/cache/hardlink');await link(f.path,hard);await assert.rejects(maintenance.prepareAttachmentPurge(f.selected),{code:'SEP_PROJECT_PATH'});await unlink(hard);await access(f.path);
});
test('Linux offline CLI uses exact confirmation, bounded JSON receipts and never exposes malformed arguments',async()=>{
 const f=await populated(),prefix=[f.memory,f.selected.projectId];const malformed=await child('./linux-attachment-cli.mjs',['apply',...prefix,'private-secret']);assert.equal(malformed.code,2);assert.deepEqual(JSON.parse(malformed.stderr),{status:'blocked',code:'SEP_ATTACHMENT_CLI_INPUT'});assert(!malformed.stderr.includes('private-secret'));
 const planned=await child('./linux-attachment-cli.mjs',['plan',...prefix]);assert.equal(planned.code,0,planned.stderr);const plan=JSON.parse(planned.stdout),file=join(f.base,'operator-plan.json');await writeFile(file,planned.stdout,{mode:0o600});const rejected=await child('./linux-attachment-cli.mjs',['apply',...prefix,file,'0'.repeat(64)]);assert.equal(rejected.code,2);await access(f.path);
 const applied=await child('./linux-attachment-cli.mjs',['apply',...prefix,file,plan.planHash]);assert.equal(applied.code,0,applied.stderr);assert.equal(JSON.parse(applied.stdout).remainingFiles,0);await assert.rejects(access(f.path),{code:'ENOENT'});
});
test('Linux cold vision startup preserves recovery of an interrupted governed document deletion',async()=>{
 const base=await imageFixture(),result=await child('./linux-document-worker.mjs',[JSON.stringify({base,phase:'document-authority-accepted'})]);assert.equal(result.signal,'SIGKILL',result.stderr);
 const f=await setupVision({base});try{const plan=JSON.parse(await readFile(join(base.base,'document-test-plan.json')));f.say('确认永久删除计划 '+plan.planHash);assert.equal(ok(await f.call('suite_document_delete',{action:'resume',...plan})).status,'deleted');ok(await f.call('suite_index'));assert.equal(ok(await f.call('suite_search',{query:'original'})).status,'not_found');assert.equal(ok(await invoke(f)).status,'understood');}finally{await f.close();}
});
