import assert from 'node:assert/strict';
import {test} from 'node:test';
import {writeFile,readFile,access,chmod,mkdir,unlink,link} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setup,close,agent,call,say,owned,load,require,code,deferred} from './native-settings-fixture.mjs';
const vision={enabled:true,allowUpload:true};
const {createCanvas}=createRequire(require.resolve('dsh-sep-bundle/package.json'))('@napi-rs/canvas');
async function prepare(f){const c=createCanvas(8,8);const x=c.getContext('2d');x.fillStyle='#00ff00';x.fillRect(0,0,8,8);await writeFile(join(f.dirs.project,'资料/image.png'),c.toBuffer('image/png'));f.imageCapable=true;const {deepSeekImageRequestPricing}=await load('@deepseek-ai/dsh-llm-deepseek');f.imagePricing=(_provider,model)=>deepSeekImageRequestPricing({models:[{id:model,inputModalities:['image']}]},model);const a=await agent(f);say(a,'请理解资料/image.png中的图片');return a;}
const invoke=(f,a)=>call(f,a,'vision',{path:'资料/image.png',question:'What colour is shown?'});
const limit=(p,ms=5000)=>{let timer;return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('fixture deadline')),ms);})]).finally(()=>clearTimeout(timer));};
test('vision uses native durable attachments, native route projection and the existing Profile ledger',async()=>{
 const f=await setup({business:{vision}});try{const a=await prepare(f);let ref,projected;
  f.behavior=async options=>{ref=options.messages.flatMap(m=>m.content).find(b=>b.type==='image')?.attachment;assert(ref);projected=await f.ctx.attachments.readImageRequest(ref,{width:8,height:8,maxBytes:65536},options.signal);};
  const output=await invoke(f,a);assert.equal(output.status,'understood');assert.equal(output.text,'checkpoint');assert(projected.data.byteLength>0);assert.equal(f.requests.length,1);assert(!JSON.stringify(output).includes('base64'));assert.equal(output.retention,'until-explicit-purge');
  const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].status,'settled');assert.equal(ledger.initialSpent,1);assert.equal(ledger.limit,100);assert.equal(output.trust,'untrusted_model_interpretation');
  const path=f.ctx.attachments.imageHostPath(ref);assert(path.startsWith(join(f.dirs.memory,'.suite-attachments')));await access(path);
 }finally{await close(f);}
});
test('vision requires explicit upload opt-in and refuses a model without verified image capability',async()=>{
 const {businessConfig}=await owned('lib/settings-consumers.js');assert.throws(()=>businessConfig.parse({sources:['资料'],vision:{enabled:true,allowUpload:false}}));
 const f=await setup({business:{vision}});try{const a=await prepare(f);f.imageCapable=false;await assert.rejects(invoke(f,a),code('P1_IMAGE_NOT_ALLOWED'));assert.equal(f.requests.length,0);assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await close(f);}
});
test('vision honours the existing Profile output limit without a paid dispatch',async()=>{
 const f=await setup({business:{vision},p1:{profileLimits:{maxOutputTokens:64,maxInputBytes:250000}}});try{const a=await prepare(f);await assert.rejects(invoke(f,a),code('P1_OUTPUT_LIMIT'));assert.equal(f.requests.length,0);assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await close(f);}
});
test('uncooperative vision retains root ownership and a conservative unknown reservation until actual settlement',async()=>{
 const f=await setup({business:{vision},shutdownMs:100}),entered=deferred(),release=deferred();let work;
 try{const a=await prepare(f);f.behavior=async()=>{entered.resolve();await release.promise;};work=invoke(f,a).then(()=>({ok:true}),e=>({ok:false,code:e.code}));await limit(entered.promise);assert.equal((await f.api.close()).status,'blocked');await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});release.resolve();assert.equal((await limit(work)).ok,false);await limit(f.api.whenClosed());const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].phase,'unknown');
 }finally{release.resolve();await work;await close(f);}
});
test('attachment purge requires the stopped owner and a fresh complete body-free file plan',async()=>{
 const f=await setup({business:{vision}});let attachmentPath;
 try{const a=await prepare(f);f.behavior=async options=>{const ref=options.messages[0].content.find(b=>b.type==='image').attachment;attachmentPath=f.ctx.attachments.imageHostPath(ref);const projected=await f.ctx.attachments.readImageRequest(ref,{width:4,height:4,maxBytes:65536},options.signal);assert.equal(projected.width,4);};await invoke(f,a);
  const maintenance=await owned('lib/attachment-maintenance.js');const selected={storageRoot:f.dirs.memory,projectId:f.input.runtime.profile.selection.projectId};
  await assert.rejects(maintenance.prepareAttachmentPurge(selected),{code:'P2_LOCKED'});await f.api.close();await limit(f.api.whenClosed());
  await assert.rejects(maintenance.prepareAttachmentPurge(selected),code('SEP_ATTACHMENT_IN_USE'));await f.attachmentFiber.dispose();
  const plan=await maintenance.prepareAttachmentPurge(selected);assert(plan.files.length>=2);assert(plan.files.some(row=>row.path.startsWith('cache')));assert(plan.files.some(row=>row.path.startsWith('attachments')));assert(!JSON.stringify(plan).includes('base64'));assert.equal(plan.effects.sessions,'existing references may become unreadable');
  const original=await readFile(attachmentPath);await chmod(attachmentPath,0o600);await writeFile(attachmentPath,Buffer.concat([original,Buffer.from('changed')]));await assert.rejects(maintenance.applyAttachmentPurge({...selected,plan,confirm:plan.planHash}),code('SEP_ATTACHMENT_PLAN_STALE'));await access(attachmentPath);
  await writeFile(attachmentPath,original);await chmod(attachmentPath,0o400);const next=await maintenance.prepareAttachmentPurge(selected);const receipt=await maintenance.applyAttachmentPurge({...selected,plan:next,confirm:next.planHash});assert.equal(receipt.status,'pass');await assert.rejects(access(attachmentPath),{code:'ENOENT'});assert.equal(receipt.deletedFiles,next.files.length);
 }finally{await close(f);}
});
test('an interrupted attachment purge remains fenced, rejects an invalid completion and resumes only through a new plan',async()=>{
 const f=await setup({business:{vision}});try{const a=await prepare(f);await invoke(f,a);await f.api.close();await limit(f.api.whenClosed());await f.attachmentFiber.dispose();
  const maintenance=await owned('lib/attachment-maintenance.js'),selected={storageRoot:f.dirs.memory,projectId:f.input.runtime.profile.selection.projectId},plan=await maintenance.prepareAttachmentPurge(selected),audit=join(plan.home,'purges');await mkdir(audit);
  await writeFile(join(audit,plan.planHash+'.intent.json'),JSON.stringify(plan));const complete=join(audit,plan.planHash+'.complete.json');await writeFile(complete,JSON.stringify({status:'pass',planHash:plan.planHash,supersededIntent:plan.planHash,remainingFiles:1,deletedFiles:0}));
  await assert.rejects(maintenance.initializeAttachmentHome(selected),code('SEP_ATTACHMENT_METADATA_INVALID'));
  await unlink(complete);await unlink(join(plan.home,plan.files[0].path));await assert.rejects(maintenance.initializeAttachmentHome(selected),code('SEP_ATTACHMENT_PURGE_PENDING'));
  const resumed=await maintenance.prepareAttachmentPurge(selected);assert(resumed.pendingPurges.includes(plan.planHash));await assert.rejects(maintenance.applyAttachmentPurge({...selected,plan,confirm:plan.planHash}),code('SEP_ATTACHMENT_PLAN_STALE'));
  assert.equal((await maintenance.applyAttachmentPurge({...selected,plan:resumed,confirm:resumed.planHash})).status,'pass');assert.equal(await maintenance.initializeAttachmentHome(selected),plan.home);
 }finally{await close(f);}
});
test('attachment inventory refuses a multiply linked object without deleting either link',async()=>{
 const f=await setup({business:{vision}});let object;try{const a=await prepare(f);f.behavior=async options=>{object=f.ctx.attachments.imageHostPath(options.messages[0].content.find(b=>b.type==='image').attachment);};await invoke(f,a);await f.api.close();await limit(f.api.whenClosed());await f.attachmentFiber.dispose();
  const other=join(f.base,'second-owned-link');await link(object,other);const maintenance=await owned('lib/attachment-maintenance.js');await assert.rejects(maintenance.prepareAttachmentPurge({storageRoot:f.dirs.memory,projectId:f.input.runtime.profile.selection.projectId}),code('SEP_ATTACHMENT_FILE_INVALID'));await access(object);await access(other);
 }finally{await close(f);}
});

test('offline attachment CLI previews without bodies and refuses an unconfirmed purge before accepting the exact plan',async()=>{
 const f=await setup({business:{vision}});try{const a=await prepare(f);await invoke(f,a);await f.api.close();await limit(f.api.whenClosed());await f.attachmentFiber.dispose();
  const cli=join(require.resolve('dsh-sep-bundle/package.json'),'../bundle/lib/attachment-maintenance-cli.js'),selected=[f.dirs.memory,f.input.runtime.profile.selection.projectId],run=promisify(execFile);
  const preview=await run(process.execPath,[cli,'plan',...selected]);const plan=JSON.parse(preview.stdout);assert(plan.files.length>0);assert(!preview.stdout.includes('base64'));const file=join(f.base,'attachment-plan.json');await writeFile(file,preview.stdout);
  await assert.rejects(run(process.execPath,[cli,'apply',...selected,file,'0'.repeat(64)]),e=>e.code===2&&JSON.parse(e.stderr).code==='SEP_ATTACHMENT_CONFIRMATION_REQUIRED');await access(join(plan.home,plan.files[0].path));
  const applied=JSON.parse((await run(process.execPath,[cli,'apply',...selected,file,plan.planHash])).stdout);assert.equal(applied.status,'pass');assert.equal(applied.deletedFiles,plan.files.length);await assert.rejects(access(join(plan.home,plan.files[0].path)),{code:'ENOENT'});
 }finally{await close(f);}
});
