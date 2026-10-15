import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {join} from 'node:path';
import {setupVision,imageFixture} from './vision-fixture.mjs';
import {load} from './host-modules.mjs';
const {AttachmentError}=await load('@deepseek-ai/dsh-attachment');
const wire=async f=>({type:'image',mediaType:'image/png',name:'中文 图片.png',data:(await readFile(join(f.source,'图像.png'))).toString('base64')});
test('native UI-like Agent without maxTokens receives the Profile bound before its request is logged and charged',async()=>{
 const f=await setupVision({agentMaxTokens:null,p1:{profileLimits:{maxOutputTokens:128,maxInputBytes:250000}}});let requested;
 try{f.setBehavior(o=>{requested=o.maxTokens;});const {createUserMessage}=await load('@deepseek-ai/dsh-llm'),content=await f.ctx.attachments.admitPromptContent([await wire(f)]);f.agent.followup(createUserMessage({content,source:{kind:'user'}}));await f.agent.whenIdle();assert.equal(requested,128,JSON.stringify(f.agentErrors));assert.equal(f.providerCalls(),1);const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].status,'settled');}
 finally{await f.close();}
});
test('native explicit oversized output remains rejected rather than silently clamped',async()=>{
 const f=await setupVision({agentMaxTokens:129,p1:{profileLimits:{maxOutputTokens:128,maxInputBytes:250000}}});try{const {createUserMessage}=await load('@deepseek-ai/dsh-llm');f.agent.followup(createUserMessage({content:[{type:'text',text:'synthetic'}],source:{kind:'user'}}));await f.agent.whenIdle();assert.equal(f.providerCalls(),0);assert(JSON.stringify(f.agentErrors).includes('P1_OUTPUT_LIMIT'));assert.equal(JSON.parse(await readFile(f.budgetPath)).entries.length,0);}finally{await f.close();}
});
test('native prompt admission refuses even text before activation and after close',async()=>{
 const f=await setupVision({activate:false}),store=f.ctx.attachments;
 try{await assert.rejects(store.admitPromptContent([{type:'text',text:'do not queue before activation'}]),{code:'SEP_LINUX_NOT_ACTIVE'});
  const p=await f.api.review();await f.api.activate({planHash:p.planHash});assert.deepEqual(await store.admitPromptContent([{type:'text',text:'active'}]),[{type:'text',text:'active'}]);
  assert.equal((await f.api.close()).status,'pass');await assert.rejects(store.admitPromptContent([{type:'text',text:'do not queue after close'}]),{code:'SEP_LINUX_CLOSED'});
 }finally{await f.close();}
});
test('native file uploads return a classified attachment error without consuming stream data',async()=>{
 const f=await setupVision();let consumed=false;const data=(async function*(){consumed=true;yield Buffer.from('private synthetic file');})();
 try{for(const work of [()=>f.ctx.attachments.saveFile({data:Buffer.from('text'),name:'私人.txt'}),()=>f.ctx.attachments.saveFileStream({data,name:'私人.txt'})])await assert.rejects(work(),error=>error instanceof AttachmentError&&error.code==='SEP_LINUX_FILE_ATTACHMENT_UNSUPPORTED'&&/image|图片/i.test(error.message)&&!error.message.includes('私人'));
  assert.equal(consumed,false);assert.equal(f.providerCalls(),0);
 }finally{await f.close();}
});
test('native encoded Chinese image admission preserves text order, durable ref and zero model charges',async()=>{
 const f=await setupVision();try{const before=await readFile(f.budgetPath),body=await f.ctx.attachments.admitPromptContent([{type:'text',text:'before'},await wire(f),{type:'text',text:'after'}]);
  assert.deepEqual(body.map(x=>x.type),['text','image','text']);assert.equal(body[0].text,'before');assert.equal(body[2].text,'after');assert.equal(body[1].attachment.name,'中文 图片.png');
  await access(f.ctx.attachments.imageHostPath(body[1].attachment));const stored=await f.ctx.attachments.readImage(body[1].attachment);assert.equal(stored.ref.width,8);assert.equal(stored.ref.height,8);assert(stored.data.length>0);
  assert.deepEqual(await readFile(f.budgetPath),before);assert.equal(f.providerCalls(),0);assert(!JSON.stringify(body).includes('base64'));
 }finally{await f.close();}
});
test('native wire admission rejects malformed, mismatched, excessive and oversized images before publication',async()=>{
 const f=await setupVision();try{const png=await wire(f),objects=join(f.memory,'.suite-attachments/attachments/v1/objects');
  const count=async()=>{try{return (await readdir(objects,{recursive:true})).length;}catch(e){if(e.code==='ENOENT')return 0;throw e;}};const before=await count();
  for(const input of [[{...png,data:'bad!'}],[{...png,data:Buffer.from('not an image').toString('base64')}],[{...png,mediaType:'image/jpeg'}],[png,png],[{...png,data:Buffer.alloc(4*1024*1024+1).toString('base64')}]])await assert.rejects(f.ctx.attachments.admitPromptContent(input),error=>error instanceof AttachmentError);
  assert.equal(await count(),before);assert.equal(f.providerCalls(),0);assert.equal(JSON.parse(await readFile(f.budgetPath)).entries.length,0);
 }finally{await f.close();}
});
test('native image references remain readable after composition restart and explicit purge makes them unavailable',async()=>{
 const base=await imageFixture(),f=await setupVision({base});let ref;try{ref=(await f.ctx.attachments.admitPromptContent([await wire(f)]))[0].attachment;}finally{await f.close();}
 const g=await setupVision({base});try{assert.equal((await g.ctx.attachments.readImage(ref)).ref.attachmentId,ref.attachmentId);}finally{await g.close();}
 const {prepareAttachmentPurge,applyAttachmentPurge}=await import('./linux-attachment-maintenance.mjs'),owner=JSON.parse(await readFile(join(g.memory,'.suite-attachments/owner.json'))),selected={storageRoot:g.memory,projectId:owner.projectId},p=await prepareAttachmentPurge(selected);await applyAttachmentPurge({...selected,plan:p,confirm:p.planHash});
 const h=await setupVision({base});try{await assert.rejects(h.ctx.attachments.readImage(ref),error=>error instanceof AttachmentError&&error.code==='ATTACHMENT_NOT_FOUND');assert.equal(h.providerCalls(),0);}finally{await h.close();}
});
