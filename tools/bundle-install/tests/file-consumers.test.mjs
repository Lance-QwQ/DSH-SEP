import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {dirname,join,resolve,toNamespacedPath} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const load=name=>import(pathToFileURL(require.resolve(name)));
const {Context}=await load('@deepseek-ai/cordis');
const {SessionId}=await load('@deepseek-ai/dsh-session');
const {ToolCallId}=await load('@deepseek-ai/dsh-llm');
const {setSandboxMode}=await load('@deepseek-ai/dsh-sandbox-policy');
let sequence=0;
async function setup(options={}){
 const base=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'consumers-'));
 const cwd=join(base,'项目'),backup=join(base,'backups');await mkdir(cwd);await mkdir(backup);
 const ctx=new Context();
 try{
  for(const name of ['@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-session-projection','@deepseek-ai/dsh-session','@deepseek-ai/dsh-llm','@deepseek-ai/dsh-agent'])await ctx.plugin((await load(name)).default);
  await ctx.plugin((await load('@deepseek-ai/dsh-agent-loop')).default,{agents:[]});
  if(!options.omitSandbox)await ctx.plugin((await load('@deepseek-ai/dsh-sandbox-policy')).default,{mode:options.mode??'workspace-write',workspaceRoot:cwd});
  await ctx.plugin(await import(pathToFileURL(join(root,'bundle/lib/recovery-authority.js'))),{controlRoot:join(base,'control')});
  const project=await ctx.recoveryHost.registerProject({id:'synthetic',root:cwd});
  const files={cwd,projectId:project.id,observationMaxEntries:options.capacity??1024,recovery:{root:backup,maxFileBytes:65536,maxTotalBytes:16*1024*1024,maxEntries:128,retentionMs:86400000}};
  await options.beforeCandidate?.({ctx,files});
  let group,provider,policy;
  if(process.env.SEP_CONSUMER_BASELINE==='1'){
   provider=ctx.plugin((await import(pathToFileURL(join(root,'bundle/lib/file-protection.js')))).default,files);await provider;
   policy=ctx.plugin(await load('@deepseek-ai/dsh-fs-observation-policy'));await policy;
   group=ctx.plugin(await load('@deepseek-ai/dsh-tool-fs'),{readStreamMinSize:options.stream?1:10485760});await group;
  }else{
   const entry=await import(pathToFileURL(join(root,'bundle/lib/protected-file-tools.js')));
   group=ctx.plugin(entry,{files,tools:{readStreamMinSize:options.stream?1:10485760,...options.tools}});await group;
  }
  const a=await ctx.agents.create({sessionId:SessionId('consumer-a-'+(++sequence)),meta:{cwd},agentOptions:{}});
  const b=await ctx.agents.create({sessionId:SessionId('consumer-b-'+sequence),meta:{cwd},agentOptions:{}});
  const path=join(cwd,'内容.txt');await writeFile(path,'original');
  const f={ctx,base,cwd,backup,project,files,group,provider,policy,a,b,path};
  f.call=(name,args,agent=a.agent,signal=new AbortController().signal)=>ctx.tools.execute({name,arguments:args,agent,signal,callId:ToolCallId('consumer-call-'+(++sequence))});
  return f;
 }catch(error){try{await options.onFailure?.(ctx,error);}finally{await ctx.fiber.dispose();}throw error;}
}
const code=result=>result.error?.info?.code;
const text=result=>result.content.map(item=>item.text??'').join('\n');
async function disposePlugin(ctx,name){const plugin=await load(name),runtime=ctx.registry.get(plugin)??ctx.registry.get(plugin.default);assert(runtime);await Promise.all([...runtime.fibers].map(fiber=>fiber.dispose()));}
test('native read-only policy denies a model-facing write under the owned provider',async()=>{
 const f=await setup({mode:'read-only'});try{
  assert.equal((await f.call('read',{file_path:'内容.txt'})).isError,false);
  const result=await f.call('write',{file_path:'内容.txt',content:'bad'});
  assert.equal(result.isError,true);assert.equal(code(result),'FS_SANDBOX_DENIED');assert.match(result.content[0].text,/\[sandbox:/);
  assert.equal(await readFile(f.path,'utf8'),'original');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('native unread overwrite and edit fail before creating recovery copies',async()=>{
 const f=await setup();try{
  for(const [name,args] of [['write',{file_path:'内容.txt',content:'bad'}],['edit',{file_path:'内容.txt',old_string:'original',new_string:'bad'}]]){
   const result=await f.call(name,args);assert.equal(result.isError,true);assert.equal(code(result),'FS_NOT_OBSERVED');
  }
  assert.equal(await readFile(f.path,'utf8'),'original');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('real Session A observations cannot authorize Session B',async()=>{
 const f=await setup();try{
  await f.call('read',{file_path:'内容.txt'});
  const denied=await f.call('write',{file_path:'内容.txt',content:'bad'},f.b.agent);assert.equal(code(denied),'FS_NOT_OBSERVED');
  assert.deepEqual(await f.ctx.fs.listMutations(),[]);
  assert.equal((await f.call('read',{file_path:'内容.txt'},f.b.agent)).isError,false);
  assert.equal((await f.call('write',{file_path:'内容.txt',content:'allowed'},f.b.agent)).isError,false);
 }finally{await f.ctx.fiber.dispose();}
});
test('changed native version is rejected with the native reread guidance',async()=>{
 const f=await setup();try{
  await f.call('read',{file_path:'内容.txt'});await writeFile(f.path,'external-longer');
  const result=await f.call('write',{file_path:'内容.txt',content:'bad'});assert.equal(code(result),'FS_STALE_VERSION');assert.match(text(result),/read/i);
  assert.deepEqual(await f.ctx.fs.listMutations(),[]);assert.equal(await readFile(f.path,'utf8'),'external-longer');
 }finally{await f.ctx.fiber.dispose();}
});
test('native stream routing mints a receipt only after the complete tool read',async()=>{
 const f=await setup({stream:true});try{
  const result=await f.call('read',{file_path:'内容.txt'});assert.equal(result.isError,false);assert.match(text(result),/original/);
  assert.equal((await f.call('edit',{file_path:'内容.txt',old_string:'original',new_string:'new'})).isError,false);
 }finally{await f.ctx.fiber.dispose();}
});
test('committed write observation remains subject to the native per-session policy',async()=>{
 const f=await setup();try{
  assert.equal((await f.call('write',{file_path:'new.txt',content:'one'})).isError,false);
  const denied=await f.call('edit',{file_path:'new.txt',old_string:'one',new_string:'two'},f.b.agent);assert.equal(code(denied),'FS_NOT_OBSERVED');
  assert.equal((await f.call('edit',{file_path:'new.txt',old_string:'one',new_string:'two'})).isError,false);
  assert.equal((await f.ctx.fs.listMutations()).length,2);
 }finally{await f.ctx.fiber.dispose();}
});
test('native session sandbox override does not affect another session',async()=>{
 const f=await setup();try{
  await setSandboxMode(f.a.agent.session,'read-only');await f.call('read',{file_path:'内容.txt'});
  assert.equal(code(await f.call('write',{file_path:'内容.txt',content:'bad'})),'FS_SANDBOX_DENIED');
  assert.equal((await f.call('write',{file_path:'b.txt',content:'allowed'},f.b.agent)).isError,false);
 }finally{await f.ctx.fiber.dispose();}
});
test('an Agent with another cwd cannot mutate the selected registered project',async()=>{
 const f=await setup();try{
  const other=join(f.base,'other');await mkdir(other);const c=await f.ctx.agents.create({sessionId:SessionId('other-'+(++sequence)),meta:{cwd:other},agentOptions:{}});
  const result=await f.call('write',{file_path:join(f.cwd,'new.txt'),content:'bad'},c.agent);assert.equal(code(result),'RECOVERY_STALE_CONTEXT');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('danger-full-access still cannot escape the selected protected project',async()=>{
 const f=await setup({mode:'danger-full-access'});try{
  const result=await f.call('write',{file_path:join(f.base,'escape.txt'),content:'bad'});assert.equal(result.isError,true);assert.equal(code(result),'FS_SANDBOX_DENIED');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('requested escalation without an approval service never writes',async()=>{
 const f=await setup({mode:'read-only'});try{
  const result=await f.call('write',{file_path:'new.txt',content:'bad',sandbox_permissions:'workspace-write',justification:'synthetic scope check'});assert.equal(result.isError,true);assert.match(text(result),/requires approval/i);assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('pre-aborted native dispatch produces no recovery entry',async()=>{
 const f=await setup();try{
  const signal=AbortSignal.abort();const result=await f.call('write',{file_path:'new.txt',content:'bad'},f.a.agent,signal);assert.equal(result.isError,true);assert.equal(code(result),'ABORTED_BEFORE_DISPATCH');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('unloaded native observation policy cannot leave an unconditional write fallback',async()=>{
 const f=await setup();try{
  await disposePlugin(f.ctx,'@deepseek-ai/dsh-fs-observation-policy');
  const result=await f.call('write',{file_path:'new.txt',content:'bad'});assert.equal(code(result),'FS_NOT_OBSERVED');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('unloaded sandbox policy closes the composite provider mutation path',async()=>{
 const f=await setup();try{
  const target=await f.ctx.fs.resolve('new.txt');
  await disposePlugin(f.ctx,'@deepseek-ai/dsh-sandbox-policy');
  await assert.rejects(f.ctx.fs.writeText(target,'bad',{kind:'createIfAbsent'}),error=>error.code==='SEP_FS_SANDBOX_REQUIRED');
  const result=await f.call('write',{file_path:'new.txt',content:'bad'});assert.equal(result.isError,true);assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('receipt capacity cannot turn a durable successful write into a false failure',async()=>{
 const f=await setup({capacity:1});try{
  await f.call('read',{file_path:'内容.txt'});
  const first=await f.call('write',{file_path:'内容.txt',content:'new'});assert.equal(first.isError,false,JSON.stringify(first.error));
  assert.equal(await readFile(f.path,'utf8'),'new');assert.equal((await f.ctx.fs.listMutations()).length,1);
  assert.equal(code(await f.call('write',{file_path:'内容.txt',content:'bad'})),'FS_NOT_OBSERVED');
  assert.equal(code(await f.call('read',{file_path:'内容.txt'})),'FS_OBSERVATION_LIMIT');assert.equal((await f.ctx.fs.listMutations()).length,1);
 }finally{await f.ctx.fiber.dispose();}
});
test('component requires a composed native sandbox policy and fails without hanging',async()=>{
 await assert.rejects(setup({omitSandbox:true}),error=>error.code==='SEP_FS_SANDBOX_REQUIRED');
});
test('component unload removes its native tools and owned provider, retaining native sandbox',async()=>{
 const f=await setup();try{
  const old=f.ctx.fs;await f.group.dispose();assert.equal(f.ctx.get('fs'),undefined);assert(f.ctx.get('sandboxPolicy'));
  const target=await old.resolve('new.txt');await assert.rejects(old.writeText(target,'bad',{kind:'createIfAbsent'}),error=>error.code==='RECOVERY_UNAVAILABLE');
  const result=await f.call('write',{file_path:'new.txt',content:'bad'});assert.equal(result.isError,true);assert.equal(code(result),'UNKNOWN_TOOL');
 }finally{await f.ctx.fiber.dispose();}
});
test('existing native file provider is rejected and left intact',async()=>{
 let original,checked=false;
 await assert.rejects(setup({beforeCandidate:async({ctx,files})=>{await ctx.plugin((await load('@deepseek-ai/dsh-fs-local')).default,{cwd:files.cwd});original=ctx.fs.internals;},onFailure:async(ctx)=>{assert.equal(ctx.fs.internals,original);assert.equal(ctx.fs.sandboxMode,undefined);assert.equal(ctx.tools.get('write'),undefined);checked=true;}}),error=>error.code==='SEP_FS_PROVIDER_CONFLICT');assert.equal(checked,true);
});
test('user-owned colliding tool is rejected and its registration retained',async()=>{
 const {defineTool}=await load('@deepseek-ai/dsh-tools');let checked=false;
 await assert.rejects(setup({beforeCandidate:async({ctx})=>{ctx.tools.register(defineTool({name:'write',description:'synthetic retained user tool',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(){return 'retained';}}));},onFailure:async(ctx)=>{assert.equal(ctx.get('fs'),undefined);const result=await ctx.tools.execute({name:'write',arguments:{},signal:new AbortController().signal,callId:ToolCallId('retained')});assert.equal(text(result),'retained');checked=true;}}),error=>error.code==='SEP_FS_TOOL_CONFLICT');assert.equal(checked,true);
});
test('invalid native read caps roll back provider, tools and observation policy',async()=>{
 let checked=false;
 await assert.rejects(setup({tools:{readLimit:0},onFailure:async(ctx)=>{
  assert.equal(ctx.get('fs'),undefined);for(const name of ['read','write','edit'])assert.equal(ctx.tools.get(name),undefined);
  const {FsTargetKey}=await load('@deepseek-ai/dsh-fs');
  assert.equal(await ctx.waterfall('fs/write-intent',{targetKey:FsTargetKey('synthetic'),displayPath:'synthetic'},{},()=>undefined),undefined);assert(ctx.get('sandboxPolicy'));checked=true;
 }}),/positive integer/);assert.equal(checked,true);
});
test('equal five-field native metadata still cannot hide changed content from native tools',async()=>{
 const f=await setup();try{
  const koffi=(await load('koffi')).default,kernel=koffi.load('kernel32.dll');
  const create=kernel.func('void * __stdcall CreateFileW(const char16_t *, uint32_t, uint32_t, void *, uint32_t, uint32_t, void *)');
  const get=kernel.func('int __stdcall GetFileInformationByHandleEx(void *, int, void *, uint32_t)');
  const set=kernel.func('int __stdcall SetFileInformationByHandle(void *, int, void *, uint32_t)');
  const close=kernel.func('int __stdcall CloseHandle(void *)');
  const basic=restore=>{const handle=create(toNamespacedPath(f.path),0x100,7,null,3,0x02000000,null);assert(handle&&handle!==-1n&&handle!==18446744073709551615n);try{const data=restore??Buffer.alloc(40);assert.equal(restore?set(handle,0,data,40):get(handle,0,data,40),1);return data;}finally{assert.equal(close(handle),1);}};
  await f.call('read',{file_path:'内容.txt'});const target=await f.ctx.fs.resolve('内容.txt'),before=await f.ctx.fs.stat(target),times=basic();
  await writeFile(f.path,'external');basic(times);assert.equal((await f.ctx.fs.stat(target)).version,before.version);assert.equal(String(before.version).split(':').length,5);
  assert.equal(code(await f.call('write',{file_path:'内容.txt',content:'bad'})),'FS_STALE_CONTENT');assert.equal(await readFile(f.path,'utf8'),'external');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('official boot Loader mounts and unloads one explicit file-tools Profile entry',async()=>{
 const {boot}=await load('@deepseek-ai/dsh-app-boot');
 const base=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'profile-')),cwd=join(base,'项目'),backup=join(base,'backups');await mkdir(cwd);await mkdir(backup);
 const ledgerPath=join(base,'synthetic-budget.json'),ledger=Buffer.from('{"spent":2,"reservation":"unknown"}\n');await writeFile(ledgerPath,ledger);
 const files={cwd,projectId:'synthetic',recovery:{root:backup,maxFileBytes:65536,maxTotalBytes:16*1024*1024,maxEntries:128,retentionMs:86400000}};
 const configPath=join(base,'cordis.yml');await writeFile(configPath,JSON.stringify([{id:'sep-files',name:pathToFileURL(join(root,'bundle/lib/protected-file-tools.js')).href,config:{files}}])+'\n');
 const ctx=await boot('sep-file-profile-test',configPath,undefined,async ctx=>{
  for(const name of ['@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-session-projection','@deepseek-ai/dsh-session','@deepseek-ai/dsh-llm','@deepseek-ai/dsh-agent'])await ctx.plugin((await load(name)).default);
  await ctx.plugin((await load('@deepseek-ai/dsh-agent-loop')).default,{agents:[]});
  await ctx.plugin((await load('@deepseek-ai/dsh-token-meter')).default);
  await ctx.plugin((await load('@deepseek-ai/dsh-compaction-basic')).default,{auto:false,thresholdRatio:0.63,retainRatio:0.21});
  await ctx.plugin((await load('@deepseek-ai/dsh-sandbox-policy')).default,{mode:'workspace-write',workspaceRoot:cwd});
  await ctx.plugin(await import(pathToFileURL(join(root,'bundle/lib/recovery-authority.js'))),{controlRoot:join(base,'control')});await ctx.recoveryHost.registerProject({id:'synthetic',root:cwd});
  ctx.provide('syntheticUserMarker',{value:'preserved'});
 });
 try{
  const handle=await ctx.agents.create({sessionId:SessionId('profile-'+(++sequence)),meta:{cwd},agentOptions:{}});
  const result=await ctx.tools.execute({name:'write',arguments:{file_path:'new.txt',content:'first'},agent:handle.agent,signal:new AbortController().signal,callId:ToolCallId('profile-write')});assert.equal(result.isError,false,JSON.stringify(result.error));
  assert.equal(await readFile(join(cwd,'new.txt'),'utf8'),'first');assert.deepEqual(await readFile(ledgerPath),ledger);
  assert.equal(ctx.compaction.config.thresholdRatio,0.63);assert.equal(ctx.compaction.config.retainRatio,0.21);
  const entry=[...ctx.loader.entries()].find(entry=>entry.options.id==='sep-files');assert(entry);await entry.fiber.dispose();
  assert.equal(ctx.get('fs'),undefined);assert.equal(ctx.tools.get('write'),undefined);assert.equal(ctx.get('syntheticUserMarker').value,'preserved');assert(ctx.get('sandboxPolicy'));assert.deepEqual(await readFile(ledgerPath),ledger);
  assert.equal(ctx.compaction.config.thresholdRatio,0.63);assert.equal(ctx.compaction.config.retainRatio,0.21);
 }finally{await ctx.fiber.dispose();}
});
test('native post-write observation supports create then edit then overwrite without an unnecessary reread',async()=>{
 const f=await setup();try{
  assert.equal((await f.call('write',{file_path:'new.txt',content:'one'})).isError,false);
  const edit=await f.call('edit',{file_path:'new.txt',old_string:'one',new_string:'two'});assert.equal(edit.isError,false,JSON.stringify(edit.error));
  const write=await f.call('write',{file_path:'new.txt',content:'three'});assert.equal(write.isError,false,JSON.stringify(write.error));
  assert.equal(await readFile(join(f.cwd,'new.txt'),'utf8'),'three');assert.equal((await f.ctx.fs.listMutations()).length,3);
 }finally{await f.ctx.fiber.dispose();}
});

test('strict file provider rejects malformed overwrite receipts before backups and keeps createIfAbsent safe',async()=>{
 const f=await setup();try{const target=await f.ctx.fs.resolve('内容.txt');
  for(const expected of [null,{}, {kind:'replaceIfVersion'}, {kind:'replaceIfVersion',version:null}, {kind:'invented'}]){
   await assert.rejects(f.ctx.fs.writeText(target,'bad',expected),{code:'FS_NOT_OBSERVED'});
   assert.equal(await readFile(f.path,'utf8'),'original');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
  }
  await assert.rejects(f.ctx.fs.writeText(target,'bad',{kind:'createIfAbsent'}));assert.equal(await readFile(f.path,'utf8'),'original');
  const fresh=await f.ctx.fs.resolve('new-safe.txt');await f.ctx.fs.writeText(fresh,'new',{kind:'createIfAbsent'});assert.equal(await readFile(join(f.cwd,'new-safe.txt'),'utf8'),'new');
 }finally{await f.ctx.fiber.dispose();}
});
