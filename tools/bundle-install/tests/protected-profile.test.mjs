import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,realpath,readdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setImmediate as yieldToLoop} from 'node:timers/promises';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const load=name=>import(pathToFileURL(require.resolve(name)));
const owned=name=>import(pathToFileURL(join(root,'bundle',name)));
const {Context}=await load('@deepseek-ai/cordis');
const {SessionId}=await load('@deepseek-ai/dsh-session');
const {ToolCallId}=await load('@deepseek-ai/dsh-llm');
const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');
const {z}=await import(pathToFileURL(createRequire(join(root,'package.json')).resolve('zod')));
let sequence=0;
const projectId='00000000-0000-4000-8000-000000000001';
async function input(){
 const base=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'profile-core-'));
 const dirs=Object.fromEntries(['project','sessions','memory','locks','backups','budget'].map(name=>[name,join(base,name)]));for(const path of Object.values(dirs))await mkdir(path);
 const control=await openControl({storageRoot:dirs.memory,initialize:true});await control.close();
 const budgetPath=join(dirs.budget,'ledger.json'),bytes=Buffer.from(JSON.stringify({version:3,currency:'CNY',limit:80,initialSpent:1.25,entries:[{id:'unknown',status:'reserved',reservedCny:3,createdAt:'2026-10-01T00:00:00Z',phase:'unknown'}],taskLimits:{},childBindings:{},reconciliations:[],legacyInitialSpent:false,sessionDefault:{limitCny:42,revision:7},sessionLimits:{}})+'\n');await writeFile(budgetPath,bytes);await writeFile(join(dirs.project,'内容.txt'),'original');
 return {base,dirs,budgetPath,bytes,config:{selection:{projectId,roots:{sessions:dirs.sessions,memory:dirs.memory,locks:dirs.locks,backups:dirs.backups},budgetPath,credentialRef:'DEEPSEEK_API_KEY'},recovery:{maxFileBytes:65536,maxTotalBytes:1048576,maxEntries:64,retentionMs:86400000},session:{compression:'none'}}};
}
async function prerequisites(ctx,f){
 for(const name of ['@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-session-projection','@deepseek-ai/dsh-session','@deepseek-ai/dsh-llm','@deepseek-ai/dsh-agent'])await ctx.plugin((await load(name)).default);
 await ctx.plugin((await load('@deepseek-ai/dsh-agent-loop')).default,{agents:[]});
 await ctx.plugin((await load('@deepseek-ai/dsh-sandbox-policy')).default,{mode:'workspace-write',workspaceRoot:f.dirs.project});
 await ctx.plugin(await owned('lib/recovery-authority.js'),{controlRoot:join(f.base,'authority')});await ctx.recoveryHost.registerProject({id:projectId,root:f.dirs.project});
 await ctx.plugin((await load('@deepseek-ai/dsh-storage')).default);await ctx.plugin(await load('@deepseek-ai/dsh-storage-json'),{root:f.dirs.memory});await ctx.plugin(await load('@deepseek-ai/dsh-storage-domain'),{backend:'json'});
}
async function setup(options={}){
 const f=await input(),ctx=new Context();f.ctx=ctx;
 try{await prerequisites(ctx,f);await options.before?.(f);let plugin;try{plugin=await owned('lib/protected-profile.js');}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('SEP_PROFILE_CORE_MISSING');throw error;}
  f.plugin=plugin;f.fiber=ctx.plugin(plugin,options.config?.(f)??f.config);await f.fiber;
  f.agent=(await ctx.agents.create({sessionId:SessionId('profile-'+(++sequence)),meta:{cwd:f.dirs.project,delegationDepth:0},agentOptions:{}})).agent;
  f.call=(name,args)=>ctx.tools.execute({name,arguments:args,agent:f.agent,signal:new AbortController().signal,callId:ToolCallId('profile-call-'+(++sequence))});
  f.close=()=>ctx.fiber.dispose();return f;
 }catch(error){await options.failed?.(f,error);await ctx.fiber.dispose();throw error;}
}
async function confirm(f){const plan=await f.ctx.sepProtectedProfile.review();return f.ctx.sepProtectedProfile.confirm({planHash:plan.planHash});}
test('single profile module mounts real protected providers without overwriting native prerequisites or ledger',async()=>{
 const f=await setup();try{const view=await f.ctx.sepProtectedProfile.review();assert.equal(view.businessEnabled,false);assert.equal(view.configurationApplied,false);assert.equal(view.ledger.accounting.accountedCny,4.25);assert.equal(view.ledger.persistedPolicy.sharedLimitCny,80);assert.equal(view.ledger.persistedPolicy.sessionDefault.limitCny,42);assert(f.ctx.fs);assert(f.ctx.sessionPersistence);assert(f.ctx.sepGovernedStorage);assert(f.ctx.sandboxPolicy);assert.deepEqual(await readFile(f.budgetPath),f.bytes);assert.equal(JSON.stringify(view).includes('original'),false);}finally{await f.close();}
});
test('real native Agent text tools use complete observations and durable recovery in the combined profile',async()=>{
 const f=await setup();try{await confirm(f);assert.equal((await f.call('write',{file_path:'内容.txt',content:'bad'})).error.info.code,'FS_NOT_OBSERVED');assert.equal((await f.call('read',{file_path:'内容.txt'})).isError,false);assert.equal((await f.call('edit',{file_path:'内容.txt',old_string:'original',new_string:'new'})).isError,false);assert.equal(await readFile(join(f.dirs.project,'内容.txt'),'utf8'),'new');assert.equal((await f.ctx.fs.listMutations()).length,1);assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await f.close();}
});
test('combined profile persists required SEP tasks and restores their ownership after provider remount',async()=>{
 const f=await setup();try{await confirm(f);const session=f.agent.session;await f.ctx.sepProtectedProfile.reviewSession(session);session.append('task/checkpoint-change',{schema:1,taskId:'00000000-0000-4000-8000-000000000002',revision:1,sessionId:session.id,agentId:session.id,project:'synthetic',action:'create',objective:'persist profile task',steps:[{id:'one',description:'synthetic',acceptance:'kept',artifacts:[{path:'out.txt',sha256:'a'.repeat(64)}]}]});assert.equal(await f.ctx.sessions.flush(session),true);await f.fiber.dispose();f.fiber=f.ctx.plugin(f.plugin,f.config);await f.fiber;const reader=await f.ctx.sessionPersistence.open(session.id,'read');try{const records=await reader.read();assert.equal(records.events[0].type,'task/checkpoint-change');assert.equal(records.events[0].data.sessionId,session.id);}finally{await reader.close();}}finally{await f.close();}
});
test('combined governed storage saves all three domains and preserves business sequence across remount',async()=>{
 const f=await setup();try{
  await confirm(f);const names=['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1'];
  for(const name of names){const domain=await f.ctx.sepGovernedStorage.open({name,version:1,tables:{probe:{valueSchema:z.json()}}});await domain.table('probe').put('synthetic',{domain:name});await domain.close();}
  const first=await f.ctx.sepStorageControl.checkpoint();assert.equal(first.businessSeq,3);assert.deepEqual(first.pending,[]);
  await f.fiber.dispose();f.fiber=f.ctx.plugin(f.plugin,f.config);await f.fiber;await confirm(f);
  for(const name of names){const domain=await f.ctx.sepGovernedStorage.open({name,version:1,tables:{probe:{valueSchema:z.json()}}});assert.deepEqual(await f.ctx.sepGovernedStorage.withAccess(()=>domain.table('probe').get('synthetic')),{domain:name});await domain.close();}
  assert.equal((await f.ctx.sepStorageControl.checkpoint()).businessSeq,3);assert.deepEqual(await readFile(f.budgetPath),f.bytes);
 }finally{await f.close();}
});
test('a live native filesystem is refused instead of being disposed or silently replaced',async()=>{
 let native;await assert.rejects(setup({before:async f=>{await f.ctx.plugin((await load('@deepseek-ai/dsh-fs-local')).default,{cwd:f.dirs.project});native=f.ctx.fs.internals;},failed:async f=>{assert.equal(f.ctx.fs.internals,native);assert.equal(f.ctx.get('sessionPersistence'),undefined);assert.equal(f.ctx.get('sepStorageControl'),undefined);assert.equal(f.ctx.tools.get('write'),undefined);}}),{code:'SEP_PROFILE_PROVIDER_CONFLICT'});
});
test('a live native Session persistence is refused and its root is preserved',async()=>{
 await assert.rejects(setup({before:async f=>{await f.ctx.plugin((await load('@deepseek-ai/dsh-session-persistence-jsonl')).default,{root:f.dirs.sessions,compression:'none'});},failed:async f=>{assert.equal(f.ctx.sessionPersistence.root,f.dirs.sessions);assert.equal(f.ctx.get('fs'),undefined);assert.equal(f.ctx.get('sepStorageControl'),undefined);}}),{code:'SEP_PROFILE_PROVIDER_CONFLICT'});
});
test('invalid ledger rolls back every owned child and releases the P2 lease',async()=>{
 await assert.rejects(setup({before:async f=>{await writeFile(f.budgetPath,'corrupt-synthetic');},failed:async f=>{for(const name of ['fs','sessionPersistence','sepProjectBinding','sepStorageControl','sepGovernedStorage','sepProtectedProfile'])assert.equal(f.ctx.get(name),undefined,name);assert.equal(f.ctx.tools.get('write'),undefined);assert(f.ctx.sandboxPolicy);const owner=await openControl({storageRoot:f.dirs.memory});await owner.close();assert.equal(await readFile(f.budgetPath,'utf8'),'corrupt-synthetic');}}),{code:'SEP_BINDING_LEDGER_INVALID'});
});
test('unknown storage governance cannot be bootstrapped by the Profile module',async()=>{
 await assert.rejects(setup({config:f=>({...f.config,selection:{...f.config.selection,roots:{...f.config.selection.roots,memory:f.dirs.locks}}}),failed:async f=>{assert.deepEqual(await readdir(f.dirs.locks),[]);assert.equal(f.ctx.get('fs'),undefined);assert.equal(f.ctx.get('sessionPersistence'),undefined);assert.deepEqual(await readFile(f.budgetPath),f.bytes);}}),{code:'P2_UNINITIALIZED'});
});
test('opened preexisting memory domains block composition without closing the user domain',async()=>{
 let domain;await assert.rejects(setup({before:async f=>{domain=await f.ctx.storageDomain.open({name:'dsh_enhancement_suite_v1',version:1,tables:{probe:{valueSchema:z.json()}}});await domain.table('probe').put('retained',{private:'synthetic'});},failed:async f=>{assert.deepEqual(domain.table('probe').get('retained'),{private:'synthetic'});assert.equal(f.ctx.get('fs'),undefined);assert.equal(f.ctx.get('sessionPersistence'),undefined);assert.equal(f.ctx.get('sepStorageControl'),undefined);const control=await openControl({storageRoot:f.dirs.memory});await control.close();await domain.close();}}),{code:'P2_STORAGE_ALREADY_OPEN'});
});
test('duplicate composition cannot inherit confirmation or replace its first provider group',async()=>{
 const f=await setup();try{await confirm(f);const identity=f.ctx.fs.internals;let duplicate;try{duplicate=f.ctx.plugin({...f.plugin,name:'synthetic-duplicate-profile'},f.config);await assert.rejects(Promise.resolve(duplicate),{code:'SEP_PROFILE_PROVIDER_CONFLICT'});}finally{await duplicate?.dispose();}assert.equal(f.ctx.fs.internals,identity);assert.equal((await f.ctx.sepProtectedProfile.reviewSession(f.agent.session)).status,'reviewed-session');}finally{await f.close();}
});
test('unload removes only owned contributions and releases storage while keeping native engine and plugins',async()=>{
 const f=await setup({before:f=>{f.ctx.provide('compaction',Object.freeze({config:{auto:false,thresholdRatio:0.63,retainRatio:0.21}}));f.ctx.provide('syntheticUserPlugin',Object.freeze({value:7}));}});try{
  await confirm(f);const native=f.ctx.compaction,service=f.ctx.sepProtectedProfile,store=f.ctx.sepGovernedStorage;
  await f.fiber.dispose();for(const name of ['fs','sessionPersistence','sepProjectBinding','sepStorageControl','sepGovernedStorage','sepProtectedProfile'])assert.equal(f.ctx.get(name),undefined,name);
  assert.equal(f.ctx.tools.get('write'),undefined);assert.equal(f.ctx.compaction,native);assert.equal(f.ctx.syntheticUserPlugin.value,7);assert(f.ctx.sandboxPolicy);assert(f.ctx.sessions);
  await assert.rejects(service.review(),{code:'SEP_PROFILE_CLOSED'});await assert.rejects(store.open({name:'dsh_enhancement_suite_v1'}),{code:'SEP_PROFILE_CLOSED'});
  const control=await openControl({storageRoot:f.dirs.memory});await control.close();assert.deepEqual(await readFile(f.budgetPath),f.bytes);
 }finally{await f.close();}
});
test('retained domain and table references refuse new mutations after profile unload',async()=>{
 const f=await setup();try{await confirm(f);const domain=await f.ctx.sepGovernedStorage.open({name:'dsh_enhancement_suite_v1',version:1,tables:{probe:{valueSchema:z.json()}}}),table=domain.table('probe');await table.put('synthetic',{value:1});await f.fiber.dispose();await assert.rejects(table.put('synthetic',{value:2}),{code:'SEP_PROFILE_CLOSED'});assert.throws(()=>table.get('synthetic'),{code:'SEP_PROFILE_CLOSED'});assert.equal(JSON.parse(await readFile(join(f.dirs.memory,'dsh_enhancement_suite_v1.json'))).tables.probe.synthetic.value,1);}finally{await f.close();}
});
test('invalid configuration and reset flags are rejected before a provider is mounted',async()=>{
 await assert.rejects(setup({config:f=>({...f.config,initialize:true}),failed:async f=>{assert.equal(f.ctx.get('fs'),undefined);assert.equal(f.ctx.get('sessionPersistence'),undefined);assert.deepEqual(await readFile(f.budgetPath),f.bytes);}}),{code:'SEP_PROFILE_INPUT_INVALID'});
});
test('official Loader cold-composes explicit provider replacement and preserves native settings on unload',async()=>{
 const f=await input();let ctx;
 try{
  const {boot}=await load('@deepseek-ai/dsh-app-boot'),path=join(f.base,'cordis.yml');await writeFile(path,'[]\n');
  const rows=[{id:'native-files',name:pathToFileURL(require.resolve('@deepseek-ai/dsh-fs-local')).href,config:{cwd:f.dirs.project},disabled:true},{id:'native-sessions',name:pathToFileURL(require.resolve('@deepseek-ai/dsh-session-persistence-jsonl')).href,config:{root:f.dirs.sessions,compression:'none'},disabled:true},{id:'sep-core',name:pathToFileURL(join(root,'bundle/lib/protected-profile.js')).href,config:f.config}];
  const native=Object.freeze({config:{auto:true,thresholdRatio:0.63,retainRatio:0.21}}),user=Object.freeze({value:9});
  ctx=await boot('dsh',path,[{insert:rows}],async inner=>{await prerequisites(inner,f);inner.provide('compaction',native);inner.provide('syntheticUserPlugin',user);});
  assert(ctx.get('sepProtectedProfile'),'SEP_PROFILE_CORE_MISSING');const plan=await ctx.sepProtectedProfile.review();await ctx.sepProtectedProfile.confirm({planHash:plan.planHash});assert.equal(ctx.compaction,native);assert.equal(ctx.syntheticUserPlugin,user);
  const entries=[...ctx.loader.entries()],entry=entries.find(row=>row.options.id==='sep-core');assert(entry.fiber);assert.equal(entries.find(row=>row.options.id==='native-files').fiber,undefined);
  await entry.fiber.dispose();assert.equal(ctx.get('fs'),undefined);assert.equal(ctx.get('sessionPersistence'),undefined);assert.equal(ctx.compaction,native);assert.deepEqual(await readFile(f.budgetPath),f.bytes);
 }finally{await ctx?.fiber.dispose();}
});
test('profile unload closes new admissions and retains P2 ownership until an accepted access callback settles',async()=>{
 const f=await setup();let resume;try{
  let started;const reached=new Promise(resolve=>{started=resolve;}),release=new Promise(resolve=>{resume=resolve;});
  const accepted=f.ctx.sepGovernedStorage.withAccess(async()=>{started();await release;return 7;});await reached;
  const service=f.ctx.sepGovernedStorage;let ended=false;const closing=Promise.resolve(f.fiber.dispose()).then(()=>{ended=true;});await yieldToLoop();
  assert.equal(ended,false);await assert.rejects(service.withAccess(()=>9),{code:'SEP_PROFILE_CLOSED'});resume();assert.equal(await accepted,7);await closing;
  const control=await openControl({storageRoot:f.dirs.memory});assert.deepEqual((await control.checkpoint()).pending,[]);await control.close();
 }finally{resume?.();await f.close();}
});
test('late tool collision rolls back its Session child without removing a user-defined tool',async()=>{
 let tool;await assert.rejects(setup({before:async f=>{const {defineTool}=await load('@deepseek-ai/dsh-tools');f.ctx.tools.register(defineTool({name:'write',description:'synthetic user tool',parameters:{},output:{schema:{type:'string'},render:(_a,value)=>[{type:'text',text:value}]},execute:async()=> 'retained'}));tool=f.ctx.tools.get('write');},failed:async f=>{assert.equal(f.ctx.tools.get('write'),tool);assert.equal(f.ctx.get('sessionPersistence'),undefined);assert.equal(f.ctx.get('fs'),undefined);assert.equal(f.ctx.get('sepStorageControl'),undefined);assert.deepEqual(await readFile(f.budgetPath),f.bytes);}}),{code:'SEP_FS_TOOL_CONFLICT'});
});
test('repeated domain close waits for the caller-initiated native close rather than reporting completion early',async()=>{
 const f=await setup();let resume,closing,original,native;try{
  await confirm(f);const domain=await f.ctx.sepGovernedStorage.open({name:'dsh_enhancement_suite_v1',version:1,tables:{probe:{valueSchema:z.json()}}});await domain.table('probe').put('synthetic',{value:1});
  native=f.ctx.storageDomain.get('dsh_enhancement_suite_v1');original=native.close;
  let started;const entered=new Promise(resolve=>{started=resolve;}),release=new Promise(resolve=>{resume=resolve;});
  native.close=async()=>{started();await release;return original.call(native);};
  const closingDomain=domain.close();await entered;let repeatedEnded=false;const again=domain.close().then(()=>{repeatedEnded=true;});await yieldToLoop();assert.equal(repeatedEnded,false,'Repeated close reported completion while native close was pending');
  let ended=false;closing=Promise.resolve(f.fiber.dispose()).then(()=>{ended=true;});await yieldToLoop();await yieldToLoop();
  assert.equal(ended,false,'Profile released its ownership before the caller-owned native domain close settled');resume();await closingDomain;await again;await closing;
  const control=await openControl({storageRoot:f.dirs.memory});assert.deepEqual((await control.checkpoint()).pending,[]);await control.close();
 }finally{resume?.();if(native&&original)native.close=original;await closing?.catch(()=>{});await f.close();}
});
