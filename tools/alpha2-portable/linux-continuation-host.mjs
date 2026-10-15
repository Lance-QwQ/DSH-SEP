// Test observer: native persistent sessions, exact body identity and authorisation.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {owned} from './bundle-modules.mjs';
import {fileToken} from './linux-file-access.mjs';
import {registerSyntheticAdapter} from './verify-linux-vision-desktop.mjs';
const {sessionEvents}=await owned('modules/system-enhancement-package/src/session-events.js');
export async function install(ctx,source){
 const root=process.env.SEP_BUNDLE_TEST_ROOT,phase=process.env.SEP_DESKTOP_CONTINUATION,adapter=await registerSyntheticAdapter(ctx),stateFile=join(root,'PERSISTED-PROBE.json');
 const options={meta:{cwd:source,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64}};
 let orphan,state;if(phase==='1'){
  const other=(await ctx.agents.create({sessionId:adapter.SessionId('desktop-unreferenced'),...options})).agent;
  orphan=await ctx.fileUploads.uploadStream({sessionId:other.id,name:'unbound.txt',data:(async function*(){yield Buffer.from('synthetic unbound receipt');})()});
 }else{
  state=JSON.parse(await readFile(stateFile));
  for(const sessionId of [state.sessionId,'desktop-unreferenced'])await ctx.agents.resume({resumeSessionId:adapter.SessionId(sessionId),agentOptions:options.agentOptions});
  const a=ctx.agents.get(state.sessionId),other=ctx.agents.get('desktop-unreferenced');
  assert.equal(ctx.fileUploads.resolve(other,state.orphan.receiptId),undefined,'unbound receipt cannot survive a host process');
  const refs=sessionEvents(a.session).filter(e=>e.type==='user/message').flatMap(e=>(e.data?.message??e.data).content??[]).filter(x=>x.type==='file').map(x=>x.attachment);assert.deepEqual(refs,state.refs);
  for(const ref of refs){const result=await ctx.tools.execute({name:'suite_attachment_read',arguments:{path:fileToken(ref)},agent:a,signal:new AbortController().signal,callId:adapter.ToolCallId('restart-positive')});assert.equal(result.isError,false);assert.equal(result.value.text,'synthetic uploaded secret');const denied=await ctx.tools.execute({name:'suite_attachment_read',arguments:{path:fileToken(ref)},agent:other,signal:new AbortController().signal,callId:adapter.ToolCallId('restart-negative')});assert.equal(denied.isError,true);assert.equal(denied.error?.info?.code??denied.error?.message?.split(':')[0],'SEP_FILE_NOT_REFERENCED');}
  assert.deepEqual(JSON.parse(await readFile(state.budgetPath)),state.ledger,'restart and direct read must not duplicate model charges');
  process.send({type:'continuation-recovered',status:'pass',refs,orphanReceipt:'refused',sameSessionRead:'pass',foreignSessionRead:'refused',adapterRequests:adapter.requests(),ledgerUnchanged:true});
 }
 process.on('message',async m=>{if(m?.type!=='continuation-snapshot')return;try{
  const a=ctx.agents.list().find(a=>JSON.stringify(sessionEvents(a.session)).includes('synthetic attachment read verified'));assert(a);const events=sessionEvents(a.session),refs=events.filter(e=>e.type==='user/message').flatMap(e=>(e.data?.message??e.data).content??[]).filter(x=>x.type==='file').map(x=>x.attachment);assert.equal(refs.length,1);assert(JSON.stringify(events).includes('synthetic attachment read verified'));
  const budgetPath=join(ctx.sepLinuxAttachmentBinding.storageRoot,'../sep-budget/ledger.json'),ledger=JSON.parse(await readFile(budgetPath));assert.equal(ledger.entries.length,3);assert(ledger.entries.every(x=>x.status==='settled'));
  const result={sessionId:a.id,refs,orphan,budgetPath,ledger,route:m.route};await writeFile(stateFile,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});process.send({type:'continuation-snapshot',id:m.id,status:'pass',sessionId:a.id,refs,ledgerEntries:ledger.entries.length});
 }catch(e){process.send({type:'continuation-snapshot',id:m.id,status:'fail',code:e.code??e.message});}});
}
