import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {setupVision,setup,invoke,code,ok,limit,vision,imageFixture} from './vision-fixture.mjs';
import {load} from './host-modules.mjs';
import {owned} from './bundle-modules.mjs';
import {writeFile,chmod} from 'node:fs/promises';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('Linux vision reads the governed candidate, produces native durable request bytes and settles the existing ledger',async()=>{
 const f=await setupVision();try{let ref,request;const original=await readFile(join(f.source,'图像.png'));f.setBehavior(async options=>{ref=options.messages.flatMap(m=>m.content).find(b=>b.type==='image')?.attachment;assert(ref);request=await f.ctx.attachments.readImageRequest(ref,{width:4,height:4,maxBytes:65536},options.signal);return 'synthetic colour result';});
  const output=ok(await invoke(f));assert.equal(output.status,'understood');assert.equal(output.text,'synthetic colour result');assert.equal(output.retention,'until-explicit-purge');assert.equal(output.trust,'untrusted_model_interpretation');assert.equal(request.width,4);assert(request.data.length>0);assert.equal(output.sourceSha256,sha(original));
  const path=f.ctx.attachments.imageHostPath(ref);assert(path.startsWith(join(f.memory,'.suite-attachments/')));await access(path);assert(!JSON.stringify(output).includes('base64'));
  ok(await f.call('bash',{command:'cp second.png 图像.png'}));assert.equal(ok(await invoke(f)).sourceSha256,sha(await readFile(join(f.source,'second.png'))));assert.equal(sha(await readFile(join(f.source,'图像.png'))),sha(original));
  const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.entries.length,2);assert(ledger.entries.every(e=>e.status==='settled'));assert.equal(ledger.limit,100);assert.equal(ledger.initialSpent,0);assert.equal(f.providerCalls(),2);
 }finally{await f.close();}
});
test('Linux vision requires both capability and native pricing and never dispatches rejected requests',async()=>{
 const f=await setupVision();try{const before=await readFile(f.budgetPath);f.setImageCapability(false);assert.equal(code(await invoke(f)),'P1_IMAGE_NOT_ALLOWED');f.setImageCapability(true);f.setImagePricing(undefined);assert.equal(code(await invoke(f)),'BUDGET_ESTIMATE');assert.equal(f.providerCalls(),0);assert.deepEqual(await readFile(f.budgetPath),before);}finally{await f.close();}
});
test('Linux default composition exposes no vision tool or native attachment domain',async()=>{
 const f=await setup();try{assert.equal(f.ctx.tools.get('suite_vision'),undefined);assert.equal(f.ctx.get('sepAttachmentDomain'),undefined);assert.equal(f.providerCalls(),0);}finally{await f.close();}
});
test('Linux vision refuses disabled upload, preactivation, child execution and paths outside the governed workspace',async()=>{
 const {businessConfig}=await import('./linux-consumers.mjs');assert.throws(()=>businessConfig.parse({sources:['.'],vision:{enabled:true,allowUpload:false}}));
 const f=await setupVision({activate:false});try{assert.equal(code(await invoke(f)),'SEP_LINUX_NOT_ACTIVE');const p=await f.api.review();await f.api.activate({planHash:p.planHash});
  const {SessionId}=await load('@deepseek-ai/dsh-session'),child=(await f.ctx.agents.create({sessionId:SessionId('vision-child'),meta:{cwd:f.source,delegationDepth:1},agentOptions:{}})).agent;
  assert.equal(code(await f.call('suite_vision',{path:'图像.png',question:'colour?'},child)),'SEP_LINUX_CHILD_READONLY');assert.equal(code(await invoke(f,'../outside.png')),'UNAUTHORIZED');assert.equal(f.providerCalls(),0);assert.equal(JSON.parse(await readFile(f.budgetPath)).entries.length,0);
 }finally{await f.close();}
});
test('Linux vision output and session budget guards refuse dispatch without clearing the ledger or source',async()=>{
 const f=await setupVision({p1:{profileLimits:{maxOutputTokens:64,maxInputBytes:250000}}});try{const before=await readFile(f.budgetPath);assert.equal(code(await invoke(f)),'P1_OUTPUT_LIMIT');assert.deepEqual(await readFile(f.budgetPath),before);assert.equal(f.providerCalls(),0);}finally{await f.close();}
 const g=await setupVision({p1:{limitCny:0.000001}});try{assert.equal(code(await invoke(g)),'BUDGET_EXCEEDED');assert.equal(g.providerCalls(),0);assert.equal(JSON.parse(await readFile(g.budgetPath)).entries.length,0);await access(join(g.source,'图像.png'));}finally{await g.close();}
});
test('Linux vision malformed image and content-type mismatch never reach a model',async()=>{
 const base=await imageFixture();await writeFile(join(base.source,'bad.png'),'not an image');await writeFile(join(base.source,'mismatch.jpg'),await readFile(join(base.source,'图像.png')));
 const f=await setupVision({base});try{const malformed=await invoke(f,'bad.png'),mismatch=await invoke(f,'mismatch.jpg');assert.equal(malformed.isError,true);assert.equal(malformed.error.message,'Unsupported or malformed image data.');assert.equal(mismatch.isError,true);assert.equal(mismatch.error.message,'Declared image type does not match its bytes.');assert.equal(f.providerCalls(),0);assert.equal(JSON.parse(await readFile(f.budgetPath)).entries.length,0);}finally{await f.close();}
});
test('Linux uncooperative vision keeps ownership and unknown budget until its actual return after close',async()=>{
 const f=await setupVision({shutdownMs:100});let release,entered;const blocked=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});let work;
 try{f.setBehavior(async()=>{entered();await blocked;});work=invoke(f);await limit(started);assert.equal((await f.api.close()).status,'blocked');const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');await assert.rejects(openControl({storageRoot:f.memory}),{code:'P2_LOCKED'});release();assert.equal((await limit(work)).isError,true);await limit((async()=>{while(f.api.status().phase!=='closed')await new Promise(r=>setTimeout(r,10));})());
  const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].phase,'unknown');assert.equal(f.providerCalls(),1);
 }finally{release();await work;await f.close();}
});
test('Linux live attachment permission change blocks model dispatch and keeps the retained image',async()=>{
 const f=await setupVision();try{const home=join(f.memory,'.suite-attachments');await chmod(home,0o755);assert.equal(code(await invoke(f)),'SEP_PROJECT_PATH');assert.equal(f.providerCalls(),0);assert.equal(JSON.parse(await readFile(f.budgetPath)).entries.length,0);await chmod(home,0o700);assert.equal(ok(await invoke(f)).status,'understood');}finally{await chmod(join(f.memory,'.suite-attachments'),0o700);await f.close();}
});
