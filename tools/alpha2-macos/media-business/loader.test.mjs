import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setup,ok} from './fixture.mjs';
import {load} from '../business/host-modules.mjs';
const {createUserMessage}=await load('@deepseek-ai/dsh-llm');

// Catches dependency-order regressions that a direct Context plugin test
// misses: real Loader admission and Agent requests share one attachment store.
test('official Loader image admission shares the Agent budget and closes with the runtime',async()=>{
 const f=await setup({loader:true,agentMaxTokens:null});
 try{
  const before=await readFile(f.budgetPath),image={type:'image',mediaType:'image/png',name:'加载器图片.png',data:(await readFile(join(f.source,'图像.png'))).toString('base64')};
  const content=await f.ctx.attachments.admitPromptContent([{type:'text',text:'before'},image,{type:'text',text:'after'}]);
  assert.deepEqual(content.map(part=>part.type),['text','image','text']);assert.equal(content[1].attachment.name,'加载器图片.png');
  assert.equal((await readFile(f.budgetPath)).equals(before),true,'local admission cannot charge the ledger');
  assert.equal(ok(await f.call('suite_status')).consumers.capture,false,'capture stays disabled by default');
  assert.equal(f.providerCalls(),0);
  f.agent.followup(createUserMessage({content,source:{kind:'user'}}));await f.agent.whenIdle();
  assert.equal(f.providerCalls(),1,JSON.stringify(f.agentErrors));assert.equal(JSON.parse(await readFile(f.budgetPath)).entries.filter(entry=>entry.status==='settled').length,1);
  assert.equal(ok(await f.call('suite_status')).phase,'active');
  assert.equal((await f.api.close()).status,'pass');
  await assert.rejects(f.ctx.attachments.admitPromptContent([image]),{code:'SEP_MAC_CLOSED'});
 }finally{await f.close();}
});
