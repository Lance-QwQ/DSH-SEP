import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,realpath,rename} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setImmediate as yieldToLoop} from 'node:timers/promises';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const load=name=>import(pathToFileURL(require.resolve(name)));
const owned=name=>import(pathToFileURL(join(root,'bundle',name)));
const {boot}=await load('@deepseek-ai/dsh-app-boot');
const {SessionId}=await load('@deepseek-ai/dsh-session');
const {LlmAdapter,createUserMessage}=await load('@deepseek-ai/dsh-llm');
const native={auto:true,thresholdRatio:0.63,retainRatio:0.21,headroomTokens:128,maxTokens:64,compactionRetries:0,maxOverflowRetries:2,modelPolicies:[{provider:'synthetic',model:'small',thresholdRatio:0.7,retainTokens:100}]};
const nativeUrl=pathToFileURL(require.resolve('@deepseek-ai/dsh-compaction-basic')).href;
const deferred=()=>Promise.withResolvers();let sequence=0;
async function setup({row={},config={},controllerRow=false}={}){
 const base=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'native-'));
 const project=join(base,'project');await mkdir(project);
 const file=join(base,'cordis.yml'),fileBytes=Buffer.from('[]\n');await writeFile(file,fileBytes);
 const f={base,project,file,fileBytes,requests:[],behavior:undefined};
 const moduleUrl=pathToFileURL(join(root,'bundle/lib/native-compaction.js')).href;
 try{await import(moduleUrl);}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('SEP_NATIVE_CONTROL_MISSING');throw error;}
 const options={nativeEntryId:'native',projects:[{id:'synthetic-project',root:project}],maxInputBytes:65536,...config};
 try{
  f.ctx=await boot('dsh',file,[{insert:[{id:'native',name:nativeUrl,config:structuredClone(native),...row},...(controllerRow?[{id:'control',name:moduleUrl,config:options}]:[])]}],async ctx=>{
   for(const name of ['@deepseek-ai/dsh-llm','@deepseek-ai/dsh-session-projection','@deepseek-ai/dsh-session','@deepseek-ai/dsh-token-meter'])await ctx.plugin((await load(name)).default);
   class Adapter extends LlmAdapter{
    async resolveModel(provider,model){return {provider,id:model,name:model,context:{contextWindow:100000}};}
    async *stream(options){f.requests.push(options);await f.behavior?.(options);options.signal?.throwIfAborted();yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text:'checkpoint'}};yield {type:'finish',reason:{kind:'stop'}};}
   }
   ctx.llm.registerAdapter(['synthetic'],new Adapter());ctx.provide('syntheticUserPlugin',{value:17});
  });
  f.entry=[...f.ctx.loader.entries()].find(e=>e.options.id==='native');
  if(!controllerRow){f.fiber=f.ctx.plugin(await import(moduleUrl),{...options,nativeEntryId:f.entry.id});await f.fiber;}
  else f.fiber=[...f.ctx.loader.entries()].find(e=>e.options.id==='control').fiber;
  f.api=f.ctx.sepNativeCompaction;assert(f.api,'SEP_NATIVE_CONTROL_MISSING');
  f.raw=structuredClone(f.entry.options);f.uid=f.entry.fiber?.uid;f.resolved=structuredClone(f.ctx.get('compaction')?.config);
  return f;
 }catch(error){await f.ctx?.fiber.dispose();throw error;}
}
async function close(f){await f.ctx.fiber.dispose();}
async function activate(f){const plan=await f.api.review();await f.api.activate({planHash:plan.planHash});return plan;}
function agent(f){const session=f.ctx.sessions.create(SessionId('native-'+(++sequence)),{meta:{cwd:f.project,delegationDepth:0}});return {session,options:{provider:'synthetic',model:'large'}};}
const prefix=()=>({messages:[createUserMessage({content:[{type:'text',text:'history '.repeat(300)}],source:{kind:'user'}})]});
async function assertRestored(f){assert.deepEqual(f.entry.options,f.raw);assert.deepEqual(f.ctx.compaction.config,f.resolved);assert.notEqual(f.entry.fiber.uid,f.uid);assert.equal(f.ctx.get('sepCompactionGroup'),undefined);assert.equal(f.ctx.syntheticUserPlugin.value,17);assert.deepEqual(await readFile(f.file),f.fileBytes);}

test('review binds actual native row and resolved configuration without writes or model calls',async()=>{
 const f=await setup();try{const plan=await f.api.review();assert.match(plan.planHash,/^[a-f0-9]{64}$/);assert.equal(plan.nativeEntryId,f.entry.id);assert.deepEqual(plan.nativeConfig,f.resolved);plan.nativeConfig.thresholdRatio=0.9;assert.equal(f.ctx.compaction.config.thresholdRatio,0.63);assert.equal(f.entry.fiber.uid,f.uid);assert.deepEqual(f.entry.options,f.raw);assert.deepEqual(await readFile(f.file),f.fileBytes);assert.equal(f.requests.length,0);}finally{await close(f);}
});
test('confirmed cold switch preserves all native options and restores the original row after real summary',async()=>{
 const f=await setup();try{await activate(f);const engine=f.ctx.compaction;assert.deepEqual(engine.config,f.resolved);assert.equal(f.entry.options.disabled,true);await engine.summarize(prefix(),agent(f));assert.equal(f.ctx.sepCompactionGroup.status().verified,1);assert.equal(f.requests.length,1);await f.api.restore();await assertRestored(f);await assert.rejects(engine.summarize(prefix(),agent(f)),{code:'SEP_COMPACTION_CLOSED'});assert.equal(f.api.status().phase,'restored');}finally{await close(f);}
});
test('controller unload restores omitted disabled field and native owner without extra model requests',async()=>{
 const f=await setup();try{await activate(f);await f.fiber.dispose();await assertRestored(f);assert.equal(f.requests.length,0);assert.equal(f.api.status().closed,true);}finally{await close(f);}
});
test('explicit original disabled false survives switch and restore exactly',async()=>{
 const f=await setup({row:{disabled:false}});try{await activate(f);await f.api.restore();await assertRestored(f);assert.equal(f.entry.options.disabled,false);}finally{await close(f);}
});
test('unconfirmed or stale hash refuses before pausing native',async()=>{
 const f=await setup();try{await assert.rejects(f.api.activate({planHash:'0'.repeat(64)}),{code:'SEP_NATIVE_PLAN_INVALID'});await assert.rejects(f.api.activate({planHash:undefined}),{code:'SEP_NATIVE_PLAN_INVALID'});assert.equal(f.entry.fiber.uid,f.uid);const plan=await f.api.review();f.entry.options.config.thresholdRatio=0.67;await assert.rejects(f.api.activate({planHash:plan.planHash}),{code:'SEP_NATIVE_PLAN_STALE'});assert.equal(f.entry.fiber.uid,f.uid);assert.equal(f.entry.options.config.thresholdRatio,0.67);assert.equal(f.ctx.get('sepCompactionGroup'),undefined);}finally{await close(f);}
});
test('replaced project directory invalidates reviewed identity without stopping native',async()=>{
 const f=await setup();try{const plan=await f.api.review();await rename(f.project,f.project+'-old');await mkdir(f.project);await assert.rejects(f.api.activate({planHash:plan.planHash}),{code:'SEP_NATIVE_PLAN_STALE'});assert.equal(f.entry.fiber.uid,f.uid);assert.equal(f.entry.options.disabled,undefined);}finally{await close(f);}
});
test('invalid preparation root fails before any native row mutation',async()=>{
 const f=await setup({config:{projects:[{id:'synthetic',root:'relative-root'}]}});try{await assert.rejects(f.api.review(),{code:'SEP_NATIVE_PROJECT_INVALID'});assert.equal(f.entry.fiber.uid,f.uid);assert.deepEqual(f.entry.options,f.raw);}finally{await close(f);}
});
test('live Session prevents cold transition while preserving native service and Session',async()=>{
 const f=await setup();try{const plan=await f.api.review(),a=agent(f);await assert.rejects(f.api.activate({planHash:plan.planHash}),{code:'SEP_NATIVE_NOT_IDLE'});assert.equal(f.entry.fiber.uid,f.uid);assert.equal(f.ctx.sessions.get(a.session.id).id,a.session.id);}finally{await close(f);}
});
test('concurrent activation admits one owner and rejects the competing transition',async()=>{
 const f=await setup();try{const plan=await f.api.review();const first=f.api.activate({planHash:plan.planHash}),second=assert.rejects(f.api.activate({planHash:plan.planHash}),{code:'SEP_NATIVE_BUSY'});await Promise.all([first,second]);assert.equal(f.api.status().phase,'active');assert.equal(f.ctx.compaction.losslessStatus().verified,0);await f.api.restore();await assertRestored(f);}finally{await close(f);}
});
test('preparation changes during native disposal roll back the exact original row',async()=>{
 const f=await setup();try{f.entry.fiber.ctx.effect(()=>async()=>{await rename(f.project,f.project+'-moved');});const plan=await f.api.review();await assert.rejects(f.api.activate({planHash:plan.planHash}),{code:'SEP_NATIVE_ACTIVATION_FAILED'});await assertRestored(f);assert.equal(f.api.status().phase,'restored');}finally{await close(f);}
});
test('unload drains noncooperative accepted operation before restoring native and rejects late commit',async()=>{
 const f=await setup(),entered=deferred(),release=deferred();try{await activate(f);const engine=f.ctx.compaction;f.behavior=async()=>{entered.resolve();await release.promise;};const work=engine.summarize(prefix(),agent(f)),rejected=assert.rejects(work,error=>error.name==='LlmError'&&error.message==='SEP_COMPACTION_CLOSED');await entered.promise;let done=false;const unloading=Promise.resolve(f.fiber.dispose()).then(()=>{done=true;});await yieldToLoop();assert.equal(done,false);assert.equal(f.entry.options.disabled,true);assert.equal(f.entry.fiber.uid,null);release.resolve();await unloading;await rejected;await assertRestored(f);assert.equal(engine.losslessStatus().verified,0);}finally{release.resolve();await close(f);}
});
test('user changed native row is preserved and restore explicitly blocks until controlled repair',async()=>{
 const f=await setup();try{await activate(f);f.entry.options.config.thresholdRatio=0.68;await assert.rejects(f.api.restore(),{code:'SEP_NATIVE_RESTORE_BLOCKED'});assert.equal(f.api.status().phase,'restore-blocked');assert.equal(f.entry.options.config.thresholdRatio,0.68);assert.equal(f.ctx.get('compaction'),undefined);f.entry.options.config=structuredClone(f.raw.config);await f.api.restore();await assertRestored(f);}finally{await close(f);}
});
test('restore import failure is detected despite Loader swallowing it and can be retried after repair',async()=>{
 const f=await setup();let original;try{await activate(f);original=f.entry.parent.tree.import;f.entry.parent.tree.import=async()=>{throw Error('synthetic unavailable module');};await assert.rejects(f.api.restore(),{code:'SEP_NATIVE_RESTORE_BLOCKED'});assert.equal(f.api.status().phase,'restore-blocked');assert.equal(f.entry.options.disabled,true);assert.equal(f.ctx.get('compaction'),undefined);f.entry.parent.tree.import=original;await f.api.restore();await assertRestored(f);}finally{if(original)f.entry.parent.tree.import=original;await close(f);}
});
test('disabled or advanced isolated native row is refused rather than overwritten',async()=>{
 for(const row of [{disabled:true},{isolate:{compaction:true}}]){const f=await setup({row});try{await assert.rejects(f.api.review(),{code:'SEP_NATIVE_ROW_UNSUPPORTED'});assert.deepEqual(f.entry.options,f.raw);}finally{await close(f);}}
});
test('unused controller unload does not restart the native owner',async()=>{
 const f=await setup();try{await f.fiber.dispose();assert.equal(f.entry.fiber.uid,f.uid);assert.deepEqual(f.entry.options,f.raw);assert.deepEqual(f.ctx.compaction.config,f.resolved);}finally{await close(f);}
});
test('Session arriving during paused native disposal causes rollback without deleting it',async()=>{
 const f=await setup();let created;try{f.entry.fiber.ctx.effect(()=>()=>{created=agent(f);});const plan=await f.api.review();await assert.rejects(f.api.activate({planHash:plan.planHash}),{code:'SEP_NATIVE_ACTIVATION_FAILED'});await assertRestored(f);assert.equal(f.ctx.sessions.get(created.session.id).id,created.session.id);}finally{await close(f);}
});
test('actual controller Loader row uses full native id and restores through its controlled unload',async()=>{
 const f=await setup({controllerRow:true,config:{nativeEntryId:'include:native'}});try{await activate(f);const control=[...f.ctx.loader.entries()].find(e=>e.options.id==='control');await control.update({disabled:true});await f.fiber.await();await assertRestored(f);assert.equal(f.api.status().closed,true);}finally{await close(f);}
});
test('removed native id blocks restore without recreating or deleting the user row',async()=>{
 const f=await setup();try{await activate(f);f.entry.options.id='user-renamed';await assert.rejects(f.api.restore(),{code:'SEP_NATIVE_RESTORE_BLOCKED'});assert.equal(f.api.status().phase,'restore-blocked');assert.equal(f.entry.options.id,'user-renamed');assert.equal(f.ctx.get('compaction'),undefined);f.entry.options.id=f.raw.id;await f.api.restore();await assertRestored(f);}finally{await close(f);}
});
test('foreign native owner is never overwritten during blocked restoration retry',async()=>{
 const f=await setup();let foreign;try{await activate(f);f.entry.options.config.thresholdRatio=0.68;await assert.rejects(f.api.restore(),{code:'SEP_NATIVE_RESTORE_BLOCKED'});f.entry.options.config=structuredClone(f.raw.config);foreign=f.ctx.plugin((await load('@deepseek-ai/dsh-compaction-basic')).default,{...native,thresholdRatio:0.69});await foreign;const foreignConfig=f.ctx.compaction.config;await assert.rejects(f.api.restore(),{code:'SEP_NATIVE_RESTORE_BLOCKED'});assert.equal(f.ctx.compaction.config,foreignConfig);assert.equal(f.ctx.compaction.config.thresholdRatio,0.69);await foreign.dispose();await f.api.restore();await assertRestored(f);}finally{await foreign?.dispose();await close(f);}
});
test('unload during paused transition waits for accepted activation then restores native',async()=>{
 const f=await setup(),entered=deferred(),release=deferred();try{f.entry.fiber.ctx.effect(()=>async()=>{entered.resolve();await release.promise;});const plan=await f.api.review();const work=f.api.activate({planHash:plan.planHash}),rejected=assert.rejects(work,{code:'SEP_NATIVE_ACTIVATION_FAILED'});await entered.promise;let done=false;const unloading=Promise.resolve(f.fiber.dispose()).then(()=>{done=true;});await yieldToLoop();assert.equal(done,false);release.resolve();await unloading;await rejected;await assertRestored(f);assert.equal(f.api.status().closed,true);}finally{release.resolve();await close(f);}
});
test('native binding coexists with actual protected Profile and preserves durable Session, lease and ledger',async()=>{
 const f=await setup();let profile;try{
  const dirs=Object.fromEntries(['sessions','memory','locks','backups','budget'].map(name=>[name,join(f.base,name)]));for(const dir of Object.values(dirs))await mkdir(dir);
  const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');const initial=await openControl({storageRoot:dirs.memory,initialize:true});await initial.close();
  const budgetPath=join(dirs.budget,'ledger.json'),bytes=Buffer.from(JSON.stringify({version:3,currency:'CNY',limit:100,initialSpent:1,entries:[],taskLimits:{},childBindings:{},reconciliations:[],legacyInitialSpent:false,sessionDefault:{limitCny:100,revision:1},sessionLimits:{}})+'\n');await writeFile(budgetPath,bytes);
  for(const name of ['@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-agent'])await f.ctx.plugin((await load(name)).default);
  await f.ctx.plugin((await load('@deepseek-ai/dsh-agent-loop')).default,{agents:[]});await f.ctx.plugin((await load('@deepseek-ai/dsh-sandbox-policy')).default,{mode:'workspace-write',workspaceRoot:f.project});
  await f.ctx.plugin(await owned('lib/recovery-authority.js'),{controlRoot:join(f.base,'authority')});const id='00000000-0000-4000-8000-000000000002';await f.ctx.recoveryHost.registerProject({id,root:f.project});
  await f.ctx.plugin((await load('@deepseek-ai/dsh-storage')).default);await f.ctx.plugin(await load('@deepseek-ai/dsh-storage-json'),{root:dirs.memory});await f.ctx.plugin(await load('@deepseek-ai/dsh-storage-domain'),{backend:'json'});
  profile=f.ctx.plugin(await owned('lib/protected-profile.js'),{selection:{projectId:id,roots:{sessions:dirs.sessions,memory:dirs.memory,locks:dirs.locks,backups:dirs.backups},budgetPath,credentialRef:'DEEPSEEK_API_KEY'},recovery:{maxFileBytes:65536,maxTotalBytes:1048576,maxEntries:64,retentionMs:86400000}});await profile;
  const review=await f.ctx.sepProtectedProfile.review();await f.ctx.sepProtectedProfile.confirm({planHash:review.planHash});await activate(f);
  const handle=await f.ctx.agents.create({sessionId:SessionId('protected-native-'+(++sequence)),meta:{cwd:f.project,delegationDepth:0},agentOptions:{provider:'synthetic',model:'large'}});const a=handle.agent;
  a.session.append('turn/start',{turn:1});await f.ctx.compaction.summarize(prefix(),a);await f.ctx.sessions.flush(a.session);await f.api.restore();await assertRestored(f);
  const reader=await f.ctx.sessionPersistence.open(a.session.id,'read');try{const data=await reader.read();assert.equal(data.events.some(e=>e.type==='turn/start'),true);}finally{await reader.close();}
  await assert.rejects(openControl({storageRoot:dirs.memory}),{code:'P2_LOCKED'});assert.deepEqual(await readFile(budgetPath),bytes);await profile.dispose();const control=await openControl({storageRoot:dirs.memory});await control.close();assert.deepEqual(await readFile(budgetPath),bytes);
 }finally{await f.fiber.dispose();await profile?.dispose();await close(f);}
});

test('unchanged Loader tree reload keeps the owned native pause and permits exact restore',async()=>{
 const f=await setup();try{
  const {symbols}=await load('@deepseek-ai/cordis');await activate(f);const enhanced=f.ctx.compaction[symbols.original];
  await f.entry.parent.update([structuredClone(f.raw)]);
  assert.equal(f.entry.options.disabled,true,'loader reload must preserve the temporary native fence');
  assert.equal(f.ctx.compaction[symbols.original],enhanced);assert.equal(f.api.status().phase,'active');
  await f.api.restore();await assertRestored(f);
 }finally{await close(f);}
});
test('unchanged Loader reload preserves explicit false and releases its interceptor on restore',async()=>{
 const f=await setup({row:{disabled:false}});try{
  const update=f.entry.update;await activate(f);
  await f.entry.parent.update([structuredClone(f.raw)]);
  assert.equal(f.entry.options.disabled,true);
  await f.api.restore();await assertRestored(f);assert.equal(f.entry.update,update);
  await f.entry.update({config:{...f.raw.config,thresholdRatio:.72}});await f.entry.fiber.await();
  assert.equal(f.ctx.compaction.config.thresholdRatio,.72);
 }finally{await close(f);}
});
test('changed Loader reload remains visible and blocks restoration without overwriting user config',async()=>{
 const f=await setup();try{
  await activate(f);
  await f.entry.parent.update([{...structuredClone(f.raw),config:{...f.raw.config,thresholdRatio:.72},disabled:true}]);
  await assert.rejects(f.api.restore(),{code:'SEP_NATIVE_RESTORE_BLOCKED'});
  assert.equal(f.entry.options.config.thresholdRatio,.72);assert.equal(f.entry.options.disabled,true);
  f.entry.options.config=structuredClone(f.raw.config);await f.api.restore();await assertRestored(f);
 }finally{await close(f);}
});
