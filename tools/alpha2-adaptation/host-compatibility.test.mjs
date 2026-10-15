import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,close,agent,call,save,load,owned,exec,deferred} from './fixture.mjs';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
test('Alpha.2 mounts the real protected SEP composition and closes', {timeout:30000},async()=>{
 const f=await setup();try{
  assert.equal(f.api.status().phase,'active');
  const a=await agent(f);assert.equal(f.ctx.workingDirectory.get(a.session),f.dirs.project);
  const status=await call(f,a,'status',{});assert(status);
 }finally{await close(f);}
});
test('Alpha.2 suite delegates two children through managed activation, retains budget bindings', {timeout:30000},async()=>{
 const f=await setup();try{
  const a=await agent(f);let offered=false;
  f.customStream=options=>{if(options.sessionId!==a.id||offered)return false;offered=true;const args=JSON.stringify({tasks:[{label:'A',prompt:'Return A'},{label:'B',prompt:'Return B'}]});f.customChunks=[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id:'delegate-1',name:'suite_delegate',argumentsDelta:args},{type:'block-end',index:0,block:{type:'tool-call',id:'delegate-1',name:'suite_delegate',arguments:args}},{type:'usage',usage:{inputTokens:10,outputTokens:2}},{type:'finish',reason:{kind:'tool-calls'}}];return true;};
  const {createUserMessage}=await load('@deepseek-ai/dsh-llm');
  a.followup(createUserMessage({content:[{type:'text',text:'Run synthetic delegation'}],source:{kind:'user'}}));await a.whenIdle();
  const out=await call(f,a,'tasks',{});
  assert.equal(out.runs.length,2);assert(out.runs.every(r=>r.status==='completed'),JSON.stringify(out));
  assert(out.runs.every(r=>r.childSessionId));assert.equal(new Set(out.runs.map(r=>r.childSessionId)).size,2);
  const ledger=JSON.parse(await readFile(f.budgetPath));
  assert(out.runs.every(r=>ledger.childBindings[r.childSessionId]?.rootSessionId===a.id),JSON.stringify(ledger.childBindings));
  const bindings=Object.values(ledger.childBindings);assert(bindings.every(v=>v.rootTurn===1&&v.taskId===bindings[0].taskId));
  assert.equal(ledger.entries.length,4);assert(ledger.entries.every(e=>e.scope.taskId===bindings[0].taskId&&e.status==='settled'));
  assert(out.runs.every(r=>!f.ctx.agents.get(r.childSessionId)));
 }finally{await close(f);}
});
test('Alpha.2 suite child keeps read-only tool permissions',{timeout:30000},async()=>{
 const f=await setup();try{
  const a=await agent(f);let mutations=0;const denied=[];
  f.ctx.tools.register({name:'synthetic_mutate',description:'Synthetic mutation counter',parameters:{type:'object'},output:{schema:{type:'object'},render:()=>[]},async execute(){mutations++;return {done:true};}});
  f.behavior=async options=>{const child=f.ctx.agents.get(options.sessionId);if(child?.session.header.origin==='subagent')denied.push(await f.ctx.tools.execute({name:'synthetic_mutate',arguments:{},agent:child,signal:options.signal,callId:'managed-mutation'}));};
  const result=await call(f,a,'delegate',{tasks:[{label:'A',prompt:'Return A'}]});assert.equal(result.runs[0].status,'completed');assert.equal(denied.length,1);assert.equal(denied[0].isError,true);assert.equal(mutations,0);
 }finally{await close(f);}
});
test('Alpha.2 published child timeout disposes activation and retains unknown reservation',{timeout:30000},async()=>{
 const f=await setup({p1:{timeoutMs:3000}});try{
  const a=await agent(f);let dispatched=false;f.behavior=options=>new Promise(resolve=>{dispatched=true;if(options.signal.aborted)resolve();else options.signal.addEventListener('abort',resolve,{once:true});});
  const result=await call(f,a,'delegate',{tasks:[{label:'timeout',prompt:'Wait'}]});
  assert(dispatched,'timeout case must actually reach the synthetic adapter');assert.equal(result.runs[0].status,'timed_out',JSON.stringify(result));assert.equal(result.publicationPersisted,true);
  assert.equal(JSON.parse(await readFile(f.budgetPath)).entries[0].phase,'unknown');assert(!f.ctx.agents.get(result.runs[0].childSessionId));
 }finally{await close(f);}
});
test('Alpha.2 project group refuses memory hints when the effective cwd leaves its project',{timeout:30000},async()=>{
 const f=await setup({business:{pluginGroup:true}});try{
  const a=await agent(f),other=join(f.base,'other-group');await mkdir(other);
  assert.equal(await f.ctx.sepPluginGroup.supportsMemoryFactHints(exec(a)),true);
  await f.ctx.workingDirectory.set(a,other);
  assert.equal(await f.ctx.sepPluginGroup.supportsMemoryFactHints(exec(a)),false);
  await assert.rejects(f.ctx.sepPluginGroup.memoryPreview(exec(a)),/GROUP_PROJECT_SCOPE/);
  assert.equal(f.requests.length,0);
 }finally{await close(f);}
});
test('Alpha.2 ignorable plugin record survives owned JSONL reopen without becoming model text',{timeout:30000},async()=>{
 const f=await setup();try{
  const a=await agent(f),{appendPluginRecord,pluginRecordOf}=await load('@deepseek-ai/dsh-session');
  appendPluginRecord(a.session,'plugin:synthetic/probe',{marker:'private-synthetic-plugin-body'});const id=a.id;
  await f.agentOwners.get(a).dispose();
  const handle=await f.ctx.sessionPersistence.open(id,'read');
  try{const restored=await handle.read(0,Number.MAX_SAFE_INTEGER),row=restored.events.find(e=>e.type==='plugin:synthetic/probe');assert(row);assert.equal(row.ignorable,true);assert.deepEqual(pluginRecordOf(row).data,{marker:'private-synthetic-plugin-body'});assert(!JSON.stringify(restored.events.filter(e=>e.type==='user/message'||e.type==='assistant/message')).includes('private-synthetic-plugin-body'));}finally{await handle.close();}
 }finally{await close(f);}
});
test('Alpha.2 caller cancellation after publication disposes exact child',{timeout:30000},async()=>{
 const f=await setup(),entered=deferred();try{
  const a=await agent(f);f.behavior=options=>new Promise(resolve=>{entered.resolve();if(options.signal.aborted)resolve();else options.signal.addEventListener('abort',resolve,{once:true});});
  const abort=new AbortController(),work=f.ctx.tools.get('suite_delegate',a).execute({tasks:[{label:'cancel',prompt:'Wait'}]},{...exec(a),signal:abort.signal});await entered.promise;abort.abort();
  const result=await work;assert.equal(result.runs[0].status,'cancelled');assert.equal(result.publicationPersisted,true);assert(!f.ctx.agents.get(result.runs[0].childSessionId));
 }finally{await close(f);}
});
test('Alpha.2 cancellation before publication creates no child or reservation',{timeout:30000},async()=>{
 const f=await setup();try{
  const a=await agent(f),abort=new AbortController();abort.abort();
  await assert.rejects(f.ctx.tools.get('suite_delegate',a).execute({tasks:[{label:'cancel',prompt:'Wait'}]},{...exec(a),signal:abort.signal}));
  assert.equal(JSON.parse(await readFile(f.budgetPath)).entries.length,0);
  assert.equal(f.ctx.agents.list().filter(c=>c.session.header.origin==='subagent').length,0);
 }finally{await close(f);}
});
test('Alpha.2 native compaction uses the existing shared ledger',{timeout:30000},async()=>{
 const f=await setup();try{
  const a=await agent(f),{createUserMessage}=await load('@deepseek-ai/dsh-llm');
  await f.ctx.compaction.summarize({messages:[createUserMessage({content:[{type:'text',text:'history '.repeat(300)}],source:{kind:'user'}})]},a);
  const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.initialSpent,1);assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].status,'settled');assert.equal(ledger.entries[0].scope.category,'compaction');
 }finally{await close(f);}
});
test('Alpha.2 durable working-directory record survives owned JSONL save and reopen',{timeout:30000},async()=>{
 const f=await setup();try{
  const a=await agent(f),sub=join(f.dirs.project,'sub');await mkdir(sub);
  await f.ctx.workingDirectory.set(a,sub);const id=a.id;
  await f.agentOwners.get(a).dispose();
  const snapshot=await f.ctx.sessionPersistence.stat(id);assert.equal(snapshot.formatStatus,'current');
  const handle=await f.ctx.sessionPersistence.open(id,'read');
  try{const restored=await handle.read(0,Number.MAX_SAFE_INTEGER);assert(restored.events.some(e=>e.type==='working-directory/change'&&e.data.cwd===sub));assert.equal(handle.header.cwd,f.dirs.project);}finally{await handle.close();}
 }finally{await close(f);}
});
test('Alpha.2 model request remains limited without clearing prior ledger',{timeout:30000},async()=>{
 const f=await setup({p1:{profileLimits:{maxOutputTokens:64,maxInputBytes:1024}}});try{
  const {model}=await import('./fixture.mjs');const before=await readFile(f.budgetPath);
  await assert.rejects(model(f,{maxTokens:65}),e=>String(e.code??e.message).includes('P1_OUTPUT_LIMIT'));
  assert.deepEqual(await readFile(f.budgetPath),before);assert.equal(f.requests.length,0);
 }finally{await close(f);}
});
test('Alpha.2 effective cwd cannot retrieve original project memory after leaving it', {timeout:30000},async()=>{
 const f=await setup();try{
  const a=await agent(f);await save(f,a,'合成项目的约定为水星','project');
  const other=join(f.base,'outside');await mkdir(other);
  await f.ctx.workingDirectory.set(a,other);
  assert.equal(a.session.header.cwd,f.dirs.project);assert.equal(f.ctx.workingDirectory.get(a.session),other);
  await assert.rejects(call(f,a,'memory_recall',{query:'水星'}),e=>['UNAUTHORIZED','SEP_BINDING_SESSION_SCOPE','RECOVERY_UNAVAILABLE','RECOVERY_STALE_CONTEXT'].some(c=>String(e.code??e.message).includes(c)));
  await f.ctx.workingDirectory.set(a,f.dirs.project);assert(await call(f,a,'memory_recall',{query:'水星'}));
 }finally{await close(f);}
});
test('Alpha.2 protected write still rejects an unobserved existing file',{timeout:30000},async()=>{
 const f=await setup();try{
  const p=join(f.dirs.project,'guard.txt');await writeFile(p,'original');
  const target=await f.ctx.fs.resolve(p);
  await assert.rejects(f.ctx.fs.writeText(target,'changed',null),e=>e.code==='FS_NOT_OBSERVED');
  assert.equal(await readFile(p,'utf8'),'original');
 }finally{await close(f);}
});
test('Alpha.2 native relative read/write follows cwd and retains recovery backup',{timeout:30000},async()=>{
 const f=await setup();try{
  const a=await agent(f),sub=join(f.dirs.project,'中文子目录');await mkdir(sub);
  await writeFile(join(f.dirs.project,'same.txt'),'root');await writeFile(join(sub,'same.txt'),'sub-original');
  await f.ctx.workingDirectory.set(a,sub);
  const dispatch=(name,args)=>f.ctx.tools.execute({name,arguments:args,agent:a,signal:new AbortController().signal,callId:'cwd-'+name});
  const read=await dispatch('read',{file_path:'same.txt'});assert.equal(read.isError,false,JSON.stringify(read));
  assert(JSON.stringify(read.content).includes('sub-original'));
  const write=await dispatch('write',{file_path:'same.txt',content:'sub-updated'});assert.equal(write.isError,false,JSON.stringify(write));
  assert.equal(await readFile(join(sub,'same.txt'),'utf8'),'sub-updated');assert.equal(await readFile(join(f.dirs.project,'same.txt'),'utf8'),'root');
  const files=(await readdir(f.dirs.backups,{recursive:true,withFileTypes:true})).filter(r=>r.isFile());
  const bodies=await Promise.all(files.map(r=>readFile(join(r.parentPath,r.name))));assert(bodies.some(b=>b.equals(Buffer.from('sub-original'))),'owned recovery must retain exact pre-write bytes');
 }finally{await close(f);}
});
test('Alpha.2 child failure preserves first cause and releases child',{timeout:30000},async()=>{
 const f=await setup();try{
  const a=await agent(f);f.behavior=()=>{throw Object.assign(Error('synthetic provider failure'),{code:'RATE_LIMIT'});};
  const result=await call(f,a,'delegate',{tasks:[{label:'error',prompt:'Fail'}]});
  assert.equal(result.runs[0].status,'failed');assert.equal(result.publicationPersisted,true);assert(result.runs[0].failure);
  assert(!f.ctx.agents.get(result.runs[0].childSessionId));assert(!JSON.stringify(result).includes('synthetic provider failure'));
 }finally{await close(f);}
});
test('Alpha.2 native edit returns a valid success after the governed mutation',{timeout:30000},async()=>{
 const f=await setup();try{
  const a=await agent(f),p=join(f.dirs.project,'edit.txt');await writeFile(p,'alpha beta');
  const dispatch=(name,args)=>f.ctx.tools.execute({name,arguments:args,agent:a,signal:new AbortController().signal,callId:'native-'+name});
  assert.equal((await dispatch('read',{file_path:p})).isError,false);
  const result=await dispatch('edit',{file_path:p,old_string:'beta',new_string:'gamma'});
  assert.equal(result.isError,false,JSON.stringify(result));assert.equal(await readFile(p,'utf8'),'alpha gamma');
 }finally{await close(f);}
});
