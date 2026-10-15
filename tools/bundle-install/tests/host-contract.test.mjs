import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,realpath,lstat,link,readdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const hostRequire=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(hostRequire.resolve('dsh-sep-bundle/package.json')));
const bundleFile=path=>pathToFileURL(join(root,'bundle/modules',path));
const load=name=>import(pathToFileURL(hostRequire.resolve(name)));
const {Context}=await load('@deepseek-ai/cordis');
const {Session,SessionId}=await load('@deepseek-ai/dsh-session');
const {createUserMessage,ToolCallId}=await load('@deepseek-ai/dsh-llm');
const {LocalFileSystem}=await load('@deepseek-ai/dsh-fs-local');
const {Scope}=await import(bundleFile('system-enhancement-package/src/scope.js'));
const {sessionEvents,sessionEventAt,sessionReplacement}=await import(bundleFile('system-enhancement-package/src/session-events.js'));
const {foldTasks}=await import(bundleFile('task-checkpoint/lib/fold.js'));
const contexts=[];const controls=[];
after(async()=>{for(const ctx of contexts.reverse())await ctx.fiber.dispose();for(const c of controls.reverse())await c.close();});
const fixture=prefix=>mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),prefix));
function context(){const ctx=new Context();contexts.push(ctx);return ctx;}
function change(sessionId){return {schema:1,taskId:'00000000-0000-4000-8000-000000000001',revision:1,sessionId,agentId:sessionId,project:'synthetic-project',action:'create',objective:'Keep a durable task',steps:[{id:'write',description:'Write a synthetic output',acceptance:'Output hash matches',artifacts:[{path:'out.txt',sha256:'a'.repeat(64)}]}]};}

// A wrong replacement coordinate or a mutable snapshot would break SEP's
// memory retirement boundary. These use the actual published native Session.
test('SEP memory reads immutable native events and retires only the selected surface record',()=>{
  const session=Session.create(SessionId('memory-boundary'));
  const first=session.append('user/message',createUserMessage({content:[{type:'text',text:'old'}],source:{kind:'user'}}),{surfaceOp:'append'});
  const before=sessionEvents(session);
  const second=session.append('user/message',createUserMessage({content:[{type:'text',text:'replacement'}],source:{kind:'user'}}),{surfaceOp:sessionReplacement(session,first.seq),sourceEventSeqs:[first.seq]});
  assert.equal(before.length,1);assert.equal(sessionEvents(session).length,2);
  assert.equal(sessionEventAt(session,first.seq).data.content[0].text,'old');
  assert.ok(Object.isFrozen(before));assert.ok(Object.isFrozen(before[0]));
  assert.deepEqual([...session.surface.nodes],[second.seq]);
  assert.deepEqual(session.deriveMessages().map(x=>x.content[0].text),['replacement']);
});

test('required SEP task events append and fold live but official persistence restoration refuses them',async()=>{
  const session=Session.create(SessionId('task-boundary'));
  const data=change('task-boundary');
  const event=session.append('task/checkpoint-change',data);
  assert.equal(foldTasks([event]).get(data.taskId).objective,'Keep a durable task');
  const persistenceRequire=createRequire(hostRequire.resolve('@deepseek-ai/dsh-session-persistence-jsonl'));
  const {sessionFormatCatalog}=await import(pathToFileURL(persistenceRequire.resolve('@deepseek-ai/dsh-session-format-catalog')));
  const header=sessionFormatCatalog.encodeCurrentHeader({...session.header,delegationDepth:0},0);
  const restore=sessionFormatCatalog.createRestore(header,{recovery:'strict',validation:'current'});
  assert.throws(()=>{restore.decodeRow(event);restore.finish();},/unknown event type/);
  assert.equal(sessionEventAt(session,0).type,'task/checkpoint-change');
});

test('SEP RAG verifies native five-part file identity and reads Chinese paths',async()=>{
  const dir=await fixture('rag-');await mkdir(join(dir,'资料'));
  await writeFile(join(dir,'资料','说明.txt'),'合成资料');
  const ctx=context();await ctx.plugin(LocalFileSystem,{cwd:dir});
  const scope=new Scope(ctx.fs,[{root:dir,sources:['资料']}]);await scope.init();
  const target=await ctx.fs.resolve(join(dir,'资料','说明.txt'));
  const info=await ctx.fs.stat(target),identity=await lstat(join(dir,'资料','说明.txt'),{bigint:true});
  assert.equal(info.version,`${identity.dev}:${identity.ino}:${identity.size}:${identity.mtimeNs}:${identity.ctimeNs}`);
  assert.equal(Buffer.from(await scope.bytes(scope.projects[0],'资料/说明.txt')).toString(),'合成资料');
  await assert.rejects(scope.bytes(scope.projects[0],'../escape.txt'),{code:'UNAUTHORIZED'});
});

test('SEP RAG rejects a hard-linked source on the actual official filesystem',async()=>{
  const dir=await fixture('linked-');await writeFile(join(dir,'source.txt'),'synthetic');await link(join(dir,'source.txt'),join(dir,'alias.txt'));
  const ctx=context();await ctx.plugin(LocalFileSystem,{cwd:dir});
  const scope=new Scope(ctx.fs,[{root:dir,sources:['source.txt']}]);
  await assert.rejects(scope.init(),{code:'UNAUTHORIZED'});
});

async function storageFixture(dir){
  const ctx=context();const {default:Storage}=await load('@deepseek-ai/dsh-storage');
  const json=await load('@deepseek-ai/dsh-storage-json'),domain=await load('@deepseek-ai/dsh-storage-domain');
  await ctx.plugin(Storage);await ctx.plugin(json,{root:dir});await ctx.plugin(domain,{backend:'json'});return ctx;
}
test('SEP P2 binds real JSON units and preserves all three domains across close and reopen',async()=>{
  const dir=await fixture('storage-');
  const {openControl,DATA_DOMAINS}=await import(bundleFile('system-enhancement-package/src/p2/control.js'));
  const {bindStorage}=await import(bundleFile('system-enhancement-package/src/p2/storage.js'));
  const bundleRequire=createRequire(join(root,'package.json'));const {z}=await import(pathToFileURL(bundleRequire.resolve('zod')));
  let control=await openControl({storageRoot:dir,initialize:true});controls.push(control);
  let ctx=await storageFixture(dir),facility=await bindStorage({facility:ctx.storageDomain,storageRoot:dir,control});
  const rows=[];
  for(const name of DATA_DOMAINS){const domain=await facility.open({name,version:1,tables:{probe:{valueSchema:z.object({value:z.string()})}}});rows.push(domain);await domain.table('probe').put('synthetic',{value:name});}
  let cp=await control.checkpoint();assert.equal(cp.businessSeq,3);assert.deepEqual(cp.pending,[]);
  for(const row of rows)await row.close();await ctx.fiber.dispose();await control.close();
  control=await openControl({storageRoot:dir});controls.push(control);ctx=await storageFixture(dir);facility=await bindStorage({facility:ctx.storageDomain,storageRoot:dir,control});
  for(const name of DATA_DOMAINS){const domain=await facility.open({name,version:1,tables:{probe:{valueSchema:z.object({value:z.string()})}}});assert.deepEqual(await control.withAccess(()=>domain.table('probe').get('synthetic')),{value:name});await domain.close();}
  cp=await control.checkpoint();assert.equal(cp.businessSeq,3);assert.equal(cp.barrier.closed,false);
});

test('SEP P2 refuses unknown existing data without replacing its bytes',async()=>{
  const dir=await fixture('unknown-'),file=join(dir,'dsh_four_layer_memory_v1.json');const bytes=Buffer.from('{"private":"synthetic-existing"}');await writeFile(file,bytes);
  const {openControl}=await import(bundleFile('system-enhancement-package/src/p2/control.js'));
  await assert.rejects(openControl({storageRoot:dir,initialize:true}),{code:'P2_COVERAGE_UNKNOWN'});
  assert.deepEqual(await readFile(file),bytes);
});

test('native tool execution retains opaque parent identity through SEP-style wrappers',async()=>{
  const ctx=context();const {default:SystemPrompt}=await load('@deepseek-ai/dsh-system-prompt');const {default:Tools,defineTool}=await load('@deepseek-ai/dsh-tools');
  await ctx.plugin(SystemPrompt);await ctx.plugin(Tools);
  let outerToken,innerParent;
  ctx.on('tools/execute',async(exec,next)=>{if(exec.name==='outer')outerToken=exec.token;if(exec.name==='inner')innerParent=exec.parent;return next();});
  ctx.tools.register(defineTool({name:'inner',description:'synthetic',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(){return 'ok';}}));
  ctx.tools.register(defineTool({name:'outer',description:'synthetic',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(_a,exec){const r=await ctx.tools.execute({callId:ToolCallId('inner'),name:'inner',arguments:{},parent:exec.token,signal:exec.signal});assert.equal(r.isError,false);return 'ok';}}));
  const result=await ctx.tools.execute({callId:ToolCallId('outer'),name:'outer',arguments:{},signal:new AbortController().signal});
  assert.equal(result.isError,false);assert.ok(outerToken);assert.notEqual(typeof outerToken,'string');assert.equal(innerParent,outerToken);
});

test('native dispatcher fuses SEP recovery cancellation and prevents dispatch after wrapper abort',async()=>{
  const ctx=context();const {default:SystemPrompt}=await load('@deepseek-ai/dsh-system-prompt');const {default:Tools,defineTool}=await load('@deepseek-ai/dsh-tools');
  await ctx.plugin(SystemPrompt);await ctx.plugin(Tools);let calls=0;
  ctx.tools.register(defineTool({name:'blocked',description:'synthetic',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(){calls++;return 'unexpected';}}));
  const replacement=new AbortController();
  ctx.on('tools/execute',async(exec,next)=>{const original=exec.signal;exec.signal=AbortSignal.any([original,replacement.signal]);replacement.abort();try{return await next();}finally{exec.signal=original;}});
  const result=await ctx.tools.execute({callId:ToolCallId('cancel'),name:'blocked',arguments:{},signal:new AbortController().signal});
  assert.equal(calls,0);assert.equal(result.isError,true);assert.equal(result.error.info.code,'ABORTED_BEFORE_DISPATCH');
});

test('lossless adapter inherits the official engine without changing configured native pressure thresholds',async()=>{
  const {BasicCompactionEngine}=await load('@deepseek-ai/dsh-compaction-basic');
  const {createLosslessCompaction}=await import(bundleFile('plugin-group/source/lossless-compaction.mjs'));
  const dir=await fixture('compaction-');const Enhanced=await createLosslessCompaction(BasicCompactionEngine,{projects:[{id:'synthetic',root:dir}]});
  assert.ok(Enhanced.prototype instanceof BasicCompactionEngine);
  const ctx=context();const {default:Llm}=await load('@deepseek-ai/dsh-llm');const {default:Sessions}=await load('@deepseek-ai/dsh-session');const {default:Meter}=await load('@deepseek-ai/dsh-token-meter');
  const {default:Projections}=await load('@deepseek-ai/dsh-session-projection');
  await ctx.plugin(Llm);await ctx.plugin(Projections);await ctx.plugin(Sessions);await ctx.plugin(Meter);await ctx.plugin(Enhanced,{auto:false,thresholdRatio:0.63,retainRatio:0.21});
  assert.equal(ctx.compaction.config.thresholdRatio,0.63);assert.equal(ctx.compaction.config.retainRatio,0.21);assert.equal(ctx.compaction.losslessStatus().activeWorkers,0);
  await ctx.fiber.dispose();assert.equal(ctx.get('compaction'),undefined);
});

test('lossless composition refuses to replace a live native engine without a controlled swap',async()=>{
  const {apply}=await import(bundleFile('plugin-group/source/lossless-plugin.mjs'));
  const ctx=context();ctx.provide('compaction',Object.freeze({identity:'native'}));
  await assert.rejects(apply(ctx,{projects:[]}),/LOSSLESS_ENGINE_ALREADY_PRESENT/);
  assert.equal(ctx.compaction.identity,'native');
});

test('SEP recovery refuses missing project authority instead of creating an unprotected project',async()=>{
  const {recoveryBinding}=await import(bundleFile('system-enhancement-package/src/recovery-binding.js'));
  assert.throws(()=>recoveryBinding(undefined),{code:'RECOVERY_UNAVAILABLE'});
  const dir=await fixture('authority-'),before=await readdir(dir);
  const ctx=context();await ctx.plugin(LocalFileSystem,{cwd:dir});const scope=new Scope(ctx.fs,[{root:dir,sources:['.']}],{enabled:true});
  await assert.rejects(scope.init(),{code:'RECOVERY_UNAVAILABLE'});assert.deepEqual(await readdir(dir),before);
});

test('official native write succeeds without claiming SEP durable recovery protection',async()=>{
  const dir=await fixture('native-write-'),ctx=context();await ctx.plugin(LocalFileSystem,{cwd:dir});
  const target=await ctx.fs.resolve(join(dir,'native.txt'));
  await ctx.fs.writeText(target,'synthetic',{kind:'createIfAbsent'});
  assert.equal(await readFile(join(dir,'native.txt'),'utf8'),'synthetic');
  assert.notEqual(ctx.fs.recoveryStatus,'ready');
  assert.equal(typeof ctx.fs.recoveryInspect,'undefined');
  assert.deepEqual(await readdir(dir),['native.txt']);
});

test('SEP P1 intercepts the real native LLM stream, settles usage and retains unknown reservations',async()=>{
  const dir=await fixture('p1-'),ctx=await storageFixture(join(dir,'data'));
  const {default:Llm,LlmAdapter}=await load('@deepseek-ai/dsh-llm');
  const {default:Sessions}=await load('@deepseek-ai/dsh-session');
  const {default:Agents}=await load('@deepseek-ai/dsh-agent');
  const {default:SystemPrompt}=await load('@deepseek-ai/dsh-system-prompt');
  const {default:Tools}=await load('@deepseek-ai/dsh-tools');
  const {default:Subagents}=await load('@deepseek-ai/dsh-subagent');
  const spawn=await load('@deepseek-ai/dsh-subagent-spawn-in-process');
  const {default:Approval}=await load('@deepseek-ai/dsh-user-approval');
  await ctx.plugin(Llm);await ctx.plugin(Sessions);await ctx.plugin(Agents);await ctx.plugin(SystemPrompt);await ctx.plugin(Tools);await ctx.plugin(Subagents);await ctx.plugin(spawn);await ctx.plugin(Approval,{policy:'never'});await ctx.plugin(LocalFileSystem,{cwd:dir});
  let dispatched=0,withUsage=true;
  class SyntheticAdapter extends LlmAdapter{async *stream(){dispatched++;if(withUsage)yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:'stop'}};}}
  ctx.llm.registerAdapter(['deepseek-official'],new SyntheticAdapter());
  const {installP1,p1Config}=await import(bundleFile('system-enhancement-package/src/p1.js'));
  const {openStore}=await import(bundleFile('system-enhancement-package/src/store.js'));
  const scope=new Scope(ctx.fs,[{root:dir,sources:['.']}]);await scope.init();
  const store=await openStore(ctx.storageDomain,join(dir,'locks'));ctx.effect(()=>()=>store.close());
  const path=join(dir,'budget.json'),config=p1Config.parse({enabled:true,budgetPath:path});
  const p1=await installP1(ctx,{config,scope,store,signal:new AbortController().signal,track:work=>work});
  assert.equal(p1.status().state,'ready');
  const options={provider:'deepseek-official',model:'deepseek-v4-flash',messages:[],maxTokens:64,signal:new AbortController().signal};
  const collect=async extra=>{const chunks=[];for await(const chunk of ctx.llm.stream({...options,...extra}))chunks.push(chunk);return chunks;};
  await collect({});let ledger=JSON.parse(await readFile(path,'utf8'));assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].status,'settled');assert.ok(ledger.entries[0].chargeCeilingCny>0);
  withUsage=false;await collect({});ledger=JSON.parse(await readFile(path,'utf8'));assert.equal(ledger.entries.length,2);assert.equal(ledger.entries[1].status,'reserved');assert.equal(ledger.entries[1].phase,'unknown');assert.ok(ledger.entries[1].reservedCny>0);
  const bytes=await readFile(path);
  await assert.rejects(collect({maxTokens:2049}),{code:'P1_OUTPUT_LIMIT'});await assert.rejects(collect({provider:'another-provider'}),{code:'P1_MODEL_NOT_ALLOWED'});
  assert.equal(dispatched,2);assert.deepEqual(await readFile(path),bytes);
});

test('SEP settings routes use native Connection and Session services while preserving the existing budget',async()=>{
  const dir=await fixture('settings-'),ctx=context();const {default:Sessions}=await load('@deepseek-ai/dsh-session');await ctx.plugin(Sessions);
  ctx.sessions.create(SessionId('settings-root'),{meta:{delegationDepth:0}});
  const {Budget}=await import(bundleFile('system-enhancement-package/src/budget-ledger.js'));
  const path=join(dir,'budget.json'),budget=new Budget(path,{limit:100});await budget.init();await budget.reserve('synthetic',2);await budget.settle('synthetic',1,{prompt_tokens:1,completion_tokens:1});
  const {createBudgetSettingsService}=await import(bundleFile('system-enhancement-package/src/budget-settings-service.js'));
  const settings=createBudgetSettingsService({ctx,budget,taskLimitCny:5});ctx.provide('suiteEnhancements',{budgetSettings:settings});
  const {HostConnectionService}=await load('@deepseek-ai/dsh-client-connection');
  // Direct Fetch-route characterization only. BrowserAuth is not exercised;
  // no HTTP server or authentication success is claimed by this fixture.
  const connection=new HostConnectionService(ctx,[],undefined);ctx.provide('webServer',{host:'127.0.0.1'});
  const ui=await import(bundleFile('ui-settings-memory/lib/index.js'));const fiber=await ctx.plugin(ui,{});
  const route=connection.createSharedFetchHandler('/api');
  const invoke=async(method,payload)=>{const r=await route.fetch(new Request('http://127.0.0.1/api/sep-budget/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'synthetic',method:'sep-budget/'+method,payload})}));assert.equal(r.status,200);return r.json();};
  const list=await invoke('list',{});assert.equal(list.result.ok,true);assert.equal(list.result.value.available,true);assert.equal(list.result.value.shared.accountedUpperBoundCny,1);assert.deepEqual(list.result.value.sessions,[{id:'settings-root',label:'settings-root'}]);
  const before=JSON.parse(await readFile(path,'utf8'));
  const result=await invoke('update',{sessionId:'settings-root',limitCny:25,expectedRevision:0});assert.equal(result.result.ok,true);assert.equal(result.result.value.limitCny,25);assert.deepEqual(JSON.parse(await readFile(path,'utf8')).entries,before.entries);
  const conflict=await invoke('update',{sessionId:'settings-root',limitCny:30,expectedRevision:0});assert.equal(conflict.result.ok,false);assert.equal(conflict.result.error.message,'BUDGET_SETTINGS_CONFLICT');
  const response=await route.fetch(new Request('ftp://synthetic.invalid/api/sep-budget/list',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));
  // Reject an unsupported carrier scheme; Host/Origin authentication remains
  // outside this direct registry test and is checked by Connection.
  assert.equal(response.status,403);
  await fiber.dispose();assert.equal((await route.fetch(new Request('http://127.0.0.1/api/sep-budget/list',{method:'POST'}))).status,404);
});
