import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,chmod,access,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {load} from './host-modules.mjs';
import {fixture} from './transaction-fixtures.mjs';
import {coldAttachments,maintenance} from './attachment-fixture.mjs';
import {setupVision,invoke,ok} from './vision-fixture.mjs';
const {Context}=await load('@deepseek-ai/cordis');
test('Linux cold attachment bootstrap refuses a group-readable storage root before creating a governed domain',async()=>{
 const f=await fixture(),ctx=new Context(),storageRoot=join(f.base,'memory');await mkdir(storageRoot,{mode:0o700});await chmod(storageRoot,0o755);
 try{await assert.rejects(coldAttachments(ctx,{source:f.source,storageRoot}),{code:'SEP_PROJECT_PATH'});await assert.rejects(access(join(storageRoot,'.suite-attachments')),{code:'ENOENT'});}finally{await ctx.fiber.dispose();}
});
test('Linux offline attachment maintenance refuses loosened domain permissions instead of accepting exposed image copies',async()=>{
 const f=await setupVision();try{ok(await invoke(f));const selected=f.ctx.sepLinuxAttachmentBinding;await f.close();await chmod(join(f.memory,'.suite-attachments'),0o755);await assert.rejects(maintenance.prepareAttachmentPurge(selected),{code:'SEP_PROJECT_PATH'});}finally{await chmod(join(f.memory,'.suite-attachments'),0o700);await f.close();}
});
test('Linux attachment purge fences both independent owners and preserves source and RAG until fresh explicit confirmation',async()=>{
 const f=await setupVision();try{let ref;f.setBehavior(async o=>{ref=o.messages[0].content.find(b=>b.type==='image').attachment;await f.ctx.attachments.readImageRequest(ref,{width:4,height:4,maxBytes:65536},o.signal);});ok(await invoke(f));ok(await f.call('suite_index'));
  const selected=f.ctx.sepLinuxAttachmentBinding,path=f.ctx.attachments.imageHostPath(ref);await assert.rejects(maintenance.prepareAttachmentPurge(selected),{code:'P2_LOCKED'});await f.api.close();await assert.rejects(maintenance.prepareAttachmentPurge(selected),{code:'SEP_ATTACHMENT_IN_USE'});await f.attachmentFiber.dispose();
  const plan=await maintenance.prepareAttachmentPurge(selected);assert(plan.files.some(x=>x.path.startsWith('attachments/')));assert(plan.files.some(x=>x.path.startsWith('cache/')));assert.equal(plan.effects.rag,'not deleted');assert(!JSON.stringify(plan).includes('base64'));await assert.rejects(maintenance.applyAttachmentPurge({...selected,plan,confirm:'0'.repeat(64)}),{code:'SEP_ATTACHMENT_CONFIRMATION_REQUIRED'});await access(path);
  const receipt=await maintenance.applyAttachmentPurge({...selected,plan,confirm:plan.planHash});assert.equal(receipt.status,'pass');assert.equal(receipt.deletedFiles,plan.files.length);assert.equal(receipt.remainingFiles,0);await assert.rejects(access(path),{code:'ENOENT'});await access(join(f.source,'图像.png'));await access(join(f.memory,'dsh_enhancement_suite_v1.json'));
 }finally{await f.close();}
});
test('Linux native attachment references cannot bypass activation or continue writing after runtime close',async()=>{
 const f=await setupVision({activate:false});try{const input={data:await readFile(join(f.source,'图像.png')),mediaType:'image/png'},native=f.ctx.attachments;await assert.rejects(native.saveImage(input),{code:'SEP_LINUX_NOT_ACTIVE'});const plan=await f.api.review();await f.api.activate({planHash:plan.planHash});await native.saveImage(input);await f.api.close();await assert.rejects(native.saveImage(input),{code:'SEP_LINUX_CLOSED'});}finally{await f.close();}
});
test('Linux image attachment domain rejects unsupported native file aliases before producing ungovernable hard links',async()=>{
 const f=await setupVision();try{const selected=f.ctx.sepLinuxAttachmentBinding;await assert.rejects(f.ctx.attachments.saveFile({data:Buffer.from('synthetic private file'),name:'example.txt'}),{code:'SEP_LINUX_FILE_ATTACHMENT_UNSUPPORTED'});await f.close();assert.equal((await maintenance.prepareAttachmentPurge(selected)).files.length,0);}finally{await f.close();}
});
test('Linux attachment service rejects late mounting and cannot reuse another project domain',async()=>{
 const f=await fixture(),ctx=new Context(),storageRoot=join(f.base,'memory');await mkdir(storageRoot,{mode:0o700});try{await ctx.plugin((await load('@deepseek-ai/dsh-llm')).default);await assert.rejects(coldAttachments(ctx,{source:f.source,storageRoot}),{code:'SEP_LINUX_ATTACHMENT_COLD_REQUIRED'});}finally{await ctx.fiber.dispose();}
 const g=await setupVision(),memory=g.memory;await g.close();const other=join(g.base,'different-source');await mkdir(other,{mode:0o700});const second=new Context();try{await assert.rejects(coldAttachments(second,{source:other,storageRoot:memory}),{code:'SEP_ATTACHMENT_OWNER_MISMATCH'});}finally{await second.fiber.dispose();}
});
test('Linux attachment storage cannot hide inside the source under a dot-prefixed child directory',async()=>{
 const f=await fixture(),ctx=new Context(),storageRoot=join(f.source,'..private');await mkdir(storageRoot,{mode:0o700});try{await assert.rejects(coldAttachments(ctx,{source:f.source,storageRoot}),{code:'SEP_LINUX_STORAGE_SCOPE'});await assert.rejects(access(join(storageRoot,'.suite-attachments')),{code:'ENOENT'});}finally{await ctx.fiber.dispose();}
});
