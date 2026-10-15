// Test observer: real Loader, tool registry, attachment codecs and budget.
// Only the remote model response is synthetic; no paid request leaves WSL.
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {load} from './host-modules.mjs';
export async function registerSyntheticAdapter(ctx){
 const {LlmAdapter,ToolCallId}=await load('@deepseek-ai/dsh-llm'),{SessionId}=await load('@deepseek-ai/dsh-session'),{deepSeekImageRequestPricing}=await load('@deepseek-ai/dsh-llm-deepseek');let requests=0,ref,projected;
 class Adapter extends LlmAdapter{
  async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:100000},inputModalities:['text','image']};}
  async listModels(provider){return [await this.resolveModel(provider,'deepseek-v4-flash')];}
  imageRequestPricing(_provider,model){return deepSeekImageRequestPricing({models:[{id:model,inputModalities:['image']}]},model);}
  async *stream(options){requests++;const blocks=options.messages.flatMap(m=>m.content),image=blocks.find(b=>b.type==='image');let text='synthetic desktop visual interpretation';if(image){ref=image.attachment;projected=await ctx.attachments.readImageRequest(ref,{width:4,height:4,maxBytes:65536},options.signal);}else{assert.equal(process.env.SEP_LINUX_FILE_UI,'1');const serial=JSON.stringify(options.messages),path=serial.match(/sep-attachment:\/\/[a-f0-9]{64}\/[^"\\\s]+/)?.[0];assert(path,'native file-to-text projection must expose virtual path');const result=options.messages.find(m=>m.role==='tool');if(!result){assert(!serial.includes('synthetic uploaded secret'),'body cannot enter initial request implicitly');const id=ToolCallId('desktop-file-read'),args=JSON.stringify({path,maxBytes:1024});yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name:'suite_attachment_read',argumentsDelta:args};yield {type:'block-end',index:0,block:{type:'tool-call',id,name:'suite_attachment_read',arguments:args}};yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:'tool-calls'}};return;}assert(JSON.stringify(result).includes('synthetic uploaded secret'),'actual tool result must contain uploaded bytes');text='synthetic attachment read verified';}yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text};yield {type:'block-end',index:0,block:{type:'text',text}};yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:'stop'}};}
 }
 ctx.llm.registerAdapter(['deepseek-official'],new Adapter());return {SessionId,ToolCallId,requests:()=>requests,ref:()=>ref,projected:()=>projected};
}
export async function verify(ctx,source){
 const adapter=await registerSyntheticAdapter(ctx),{SessionId,ToolCallId}=adapter;const a=(await ctx.agents.create({sessionId:SessionId('desktop-vision'),meta:{cwd:source,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64}})).agent;
 if(process.env.SEP_LINUX_ATTACHMENT_UI==='1')await ctx.agents.create({sessionId:SessionId('desktop-unreferenced'),meta:{cwd:source,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64}});
 const r=await ctx.tools.execute({name:'suite_vision',arguments:{path:'视觉.png',question:'Describe the image.'},agent:a,signal:new AbortController().signal,callId:ToolCallId('desktop-vision-one')});assert.equal(r.isError,false,JSON.stringify(r.error));assert.equal(r.value.status,'understood');assert.equal(adapter.requests(),1);assert.equal(adapter.projected().width,4);await access(ctx.attachments.imageHostPath(adapter.ref()));
 let fileReceipt;if(process.env.SEP_LINUX_FILE_UI==='1'){const uploads=ctx.get('fileUploads'),receipt=await uploads.uploadStream({sessionId:a.id,name:'中文说明.txt',data:(async function*(){yield Buffer.from('synthetic uploaded secret');})()});assert.deepEqual(uploads.resolve(a,receipt.receiptId),receipt.file);assert.equal(uploads.resolve(ctx.agents.get('desktop-unreferenced'),receipt.receiptId),undefined);assert.deepEqual(uploads.resolve(a,receipt.receiptId),receipt.file);fileReceipt={status:'pass',activeReceiptForeignSession:'refused',originalSessionReceiptStillLive:true};}
 const selected=ctx.sepLinuxAttachmentBinding;const ledger=JSON.parse(await readFile(join(selected.storageRoot,'../sep-budget/ledger.json')));assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].status,'settled');assert.equal(ledger.limit,100);
 return {status:'pass',syntheticModel:true,requests:adapter.requests(),nativeRequestWidth:4,settledEntries:1,retention:r.value.retention,...fileReceipt?{fileReceipt}:{}};
}
