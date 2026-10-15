import {createHash} from 'node:crypto';
// Test-only trusted caller; tools execute through the actual shipped Host.
import {readFile,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {load} from './host-modules.mjs';
export const name='sep-installed-core-fixture',inject=['agents','tools','sepLinuxRuntime','sepLinuxProfile'];
export function apply(ctx,{root,source,round}){
 const lifetime=new AbortController();ctx.effect(()=>()=>lifetime.abort());
 const run=async()=>{
  for(let n=0;n<900;n++){lifetime.signal.throwIfAborted();try{await readFile(join(root,'begin'));if(ctx.sepLinuxRuntime.status().phase==='active')break;}catch(e){if(e.code!=='ENOENT')throw e;}await delay(50);}
  const {ToolCallId}=await load('@deepseek-ai/dsh-llm'),{SessionId}=await load('@deepseek-ai/dsh-session'),{agent}=await ctx.agents.create({sessionId:SessionId('installed-core-'+createHash('sha256').update(root).digest('hex').slice(0,10)+'-'+round),meta:{cwd:source,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64}});let n=0;
  const call=async(name,args={})=>{const r=await ctx.tools.execute({name,arguments:args,agent,signal:lifetime.signal,callId:ToolCallId('core-'+round+'-'+ ++n)});assert.equal(r.isError,false,JSON.stringify(r.error));return r.value;},path='中文文档.txt';
  const original=(await ctx.sepLinuxProfile.current()).generation;
  assert.deepEqual(await call('read',{file_path:path}),{exists:false,version:'absent'});await call('write',{file_path:path,content:'SEP packaged first'});assert.equal((await call('read',{file_path:path})).text,'SEP packaged first');await call('edit',{file_path:path,old_string:'first',new_string:'verified'});assert.equal((await call('read',{file_path:path})).text,'SEP packaged verified');
  await assert.rejects(access(join(source,path)),{code:'ENOENT'});const plan=await ctx.sepLinuxProfile.review();const committed=await ctx.sepLinuxProfile.commit(plan);assert.equal(committed.status,'committed');await call('suite_index');assert.equal((await call('suite_search',{query:'packaged'})).status,'found');
  const restore=await ctx.sepLinuxProfile.restore(original),restored=await ctx.sepLinuxProfile.commit(restore);assert.equal(restored.status,'committed');await assert.rejects(access(join((await ctx.sepLinuxProfile.current()).path,path)),{code:'ENOENT'});await assert.rejects(access(join(source,path)),{code:'ENOENT'});
  await writeFile(join(root,'core.json'),JSON.stringify({status:'pass',calls:n,committed,restored,originalSourcePreserved:true,scope:'actual installed Host read/write/edit/COW commit/RAG/explicit restore; no model calls'}));
 };
 run().catch(async e=>{try{await writeFile(join(root,'core.json'),JSON.stringify({status:'fail',code:e.code??e.name,message:String(e.message).slice(0,1000)}));}catch{}});
}
