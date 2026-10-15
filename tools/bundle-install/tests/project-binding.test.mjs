import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,realpath,readdir,rename,symlink,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const bundleRequire=createRequire(join(root,'package.json'));
const {z}=await import(pathToFileURL(bundleRequire.resolve('zod')));
const load=name=>import(pathToFileURL(require.resolve(name)));
const owned=name=>import(pathToFileURL(join(root,'bundle',name)));
const {Context}=await load('@deepseek-ai/cordis');
const {SessionId}=await load('@deepseek-ai/dsh-session');
const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');
const {Budget}=await owned('modules/system-enhancement-package/src/budget-ledger.js');
let counter=0;
function ledger(){return {version:3,currency:'CNY',limit:80,initialSpent:1.25,entries:[{id:'paid',status:'settled',reservedCny:3,chargeCeilingCny:2.5,createdAt:'2026-10-01T00:00:00Z',finishedAt:'2026-10-01T00:01:00Z'},{id:'unknown',status:'reserved',reservedCny:3,createdAt:'2026-10-01T01:00:00Z',phase:'unknown'}],taskLimits:{},childBindings:{},reconciliations:[{id:'corrected',entryId:'paid',chargeCny:1.5,evidence:{kind:'provider-receipt',reference:'synthetic-only'},createdAt:'2026-10-02T00:00:00Z'}],legacyInitialSpent:false,sessionDefault:{limitCny:42,revision:7},sessionLimits:{'session-a':{limitCny:12,revision:3}}};}
async function setup(options={}){
 const base=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'bindings-'));
 const dirs=Object.fromEntries(['project','sessions','memory','locks','backups','budget'].map(name=>[name,join(base,name)]));for(const path of Object.values(dirs))await mkdir(path);
 const ctx=new Context();let control,controlFiber;
 try{
  await ctx.plugin((await load('@deepseek-ai/dsh-session')).SessionStore);
  await ctx.plugin((await owned('lib/session-persistence.js')).default,{root:dirs.sessions,compression:'none'});
  await ctx.plugin(await owned('lib/recovery-authority.js'),{controlRoot:join(base,'authority')});
  const project=await ctx.recoveryHost.registerProject({id:'00000000-0000-4000-8000-000000000001',root:dirs.project});
  await ctx.plugin((await owned('lib/file-protection.js')).default,{cwd:dirs.project,projectId:project.id,recovery:{root:dirs.backups,maxFileBytes:65536,maxTotalBytes:1048576,maxEntries:64,retentionMs:86400000}});
  await ctx.plugin((await load('@deepseek-ai/dsh-storage')).default);await ctx.plugin(await load('@deepseek-ai/dsh-storage-json'),{root:dirs.memory});await ctx.plugin(await load('@deepseek-ai/dsh-storage-domain'),{backend:'json'});
  control=await openControl({storageRoot:dirs.memory,initialize:true});
  const provideControl=async()=>{controlFiber=ctx.plugin({name:'synthetic-storage-control',apply(inner){inner.provide('sepStorageControl',control);}});await controlFiber;};
  if(!options.omitControl)await provideControl();
  const budgetPath=join(dirs.budget,'ledger.json'),bytes=Buffer.from(JSON.stringify(ledger(),null,2)+'\n');await writeFile(budgetPath,bytes);
  await writeFile(join(dirs.project,'资料.txt'),'合成资料');
  let plugin;try{plugin=await owned('lib/project-binding.js');}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('SEP_HOST_BINDING_MISSING');throw error;}
  const fiber=ctx.plugin(plugin);await fiber;
  const selection={projectId:project.id,roots:{sessions:dirs.sessions,memory:dirs.memory,locks:dirs.locks,backups:dirs.backups},budgetPath,credentialRef:'DEEPSEEK_API_KEY',configuration:{budget:{sharedLimitCny:100,roundLimitCny:5,sessionDefaultLimitCny:100}}};
  return {ctx,get control(){return control;},base,dirs,project,budgetPath,bytes,selection,fiber,switchControl:async(mode)=>{await controlFiber.dispose();await control.close();control=await openControl({storageRoot:dirs.memory,mode});await provideControl();},close:async()=>{await ctx.fiber.dispose();await control.close();}};
 }catch(error){await ctx.fiber.dispose();await control?.close();throw error;}
}
async function confirmed(f){const plan=await f.ctx.sepProjectBinding.review(f.selection);return f.ctx.sepProjectBinding.confirm({planHash:plan.planHash});}
const session=f=>f.ctx.sessions.create(SessionId('binding-'+(++counter)),{meta:{cwd:f.dirs.project,delegationDepth:0}});
test('review binds native providers and governed storage without changing ledger or lifecycle records',async()=>{
 const f=await setup();try{
  const marker=join(f.dirs.memory,'synthetic-metadata.json'),body=Buffer.from('{"createdAt":"2020-01-01","completedAt":"2020-01-02"}\n');await writeFile(marker,body);
  const before=await readdir(f.dirs.budget),plan=await f.ctx.sepProjectBinding.review(f.selection);
  assert.equal(plan.businessEnabled,false);assert.equal(plan.configurationApplied,false);assert.equal(plan.ledger.accounting.accountedCny,5.75);assert.equal(plan.ledger.persistedPolicy.sharedLimitCny,80);assert.equal(plan.ledger.persistedPolicy.sessionDefault.revision,7);
  assert.equal(plan.project.memoryKey,f.project.memoryKey);assert.equal(plan.project.generation,1);assert.deepEqual(await readFile(f.budgetPath),f.bytes);assert.deepEqual(await readFile(marker),body);assert.deepEqual(await readdir(f.dirs.budget),before);
  assert.equal(JSON.stringify(plan).includes('synthetic-only'),false);assert(Object.isFrozen(plan.roots));
 }finally{await f.close();}
});
test('confirmation is fingerprint-bound and retains persisted policies over requested defaults',async()=>{
 const f=await setup();try{const value=await confirmed(f);assert.equal(value.status,'confirmed');assert.equal(value.businessEnabled,false);assert.equal(value.ledger.persistedPolicy.sharedLimitCny,80);assert.equal(value.ledger.persistedPolicy.sessionDefault.limitCny,42);assert.equal(value.credential.resolved,false);assert.equal(value.credential.reference,'DEEPSEEK_API_KEY');assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await f.close();}
});
test('changed ledger after review invalidates confirmation without replacing it',async()=>{
 const f=await setup();try{const plan=await f.ctx.sepProjectBinding.review(f.selection),changed=Buffer.from(JSON.stringify({...ledger(),initialSpent:2}));await writeFile(f.budgetPath,changed);await assert.rejects(f.ctx.sepProjectBinding.confirm({planHash:plan.planHash}),{code:'SEP_BINDING_PLAN_CHANGED'});assert.deepEqual(await readFile(f.budgetPath),changed);}finally{await f.close();}
});
test('replaced storage directory after review invalidates its original identity',async()=>{
 const f=await setup();try{const plan=await f.ctx.sepProjectBinding.review(f.selection);await rename(f.dirs.locks,f.dirs.locks+'-retained');await mkdir(f.dirs.locks);await assert.rejects(f.ctx.sepProjectBinding.confirm({planHash:plan.planHash}),{code:'SEP_BINDING_PLAN_CHANGED'});}finally{await f.close();}
});
test('project rebind invalidates the reviewed authority generation',async()=>{
 const f=await setup();try{const plan=await f.ctx.sepProjectBinding.review(f.selection),newRoot=join(f.base,'new-project');await mkdir(newRoot);const move=await f.ctx.recoveryHost.planRebind({projectId:f.project.id,newRoot});await f.ctx.recoveryHost.commitRebind({planId:move.planId,confirmationHash:move.confirmationHash});await assert.rejects(f.ctx.sepProjectBinding.confirm({planHash:plan.planHash}),{code:'SEP_BINDING_PLAN_CHANGED'});}finally{await f.close();}
});
test('aliased selected directory is rejected rather than accepted under its displayed path',async()=>{
 const f=await setup();try{const alias=join(f.base,'alias');await symlink(f.dirs.locks,alias,'junction');await assert.rejects(f.ctx.sepProjectBinding.review({...f.selection,roots:{...f.selection.roots,locks:alias}}),{code:'SEP_BINDING_PATH_INVALID'});}finally{await f.close();}
});
test('internal data directories cannot be a source project or nested in it',async()=>{
 const f=await setup();try{const nested=join(f.dirs.project,'locks');await mkdir(nested);await assert.rejects(f.ctx.sepProjectBinding.review({...f.selection,roots:{...f.selection.roots,locks:nested}}),{code:'SEP_BINDING_SCOPE_CONFLICT'});}finally{await f.close();}
});
test('overlapping private storage and lock roots are rejected',async()=>{
 const f=await setup();try{await assert.rejects(f.ctx.sepProjectBinding.review({...f.selection,roots:{...f.selection.roots,locks:f.dirs.memory}}),{code:'SEP_BINDING_SCOPE_CONFLICT'});}finally{await f.close();}
});
test('credential literals and unknown reset fields are rejected without echoing their contents',async()=>{
 const f=await setup();try{for(const input of [{...f.selection,apiKey:'synthetic-secret-body'},{...f.selection,reset:true},{...f.selection,credentialRef:'synthetic-secret-body'}])await assert.rejects(f.ctx.sepProjectBinding.review(input),error=>error.code==='SEP_BINDING_INPUT_INVALID'&&!error.message.includes('synthetic-secret-body'));}finally{await f.close();}
});
test('missing ledger never creates a fresh balance',async()=>{
 const f=await setup();try{await unlink(f.budgetPath);await assert.rejects(f.ctx.sepProjectBinding.review(f.selection),{code:'SEP_BINDING_LEDGER_REQUIRED'});assert.deepEqual(await readdir(f.dirs.budget),[]);}finally{await f.close();}
});
test('corrupt ledger bytes are preserved and block binding',async()=>{
 const f=await setup();try{const bytes=Buffer.from('corrupt-synthetic');await writeFile(f.budgetPath,bytes);await assert.rejects(f.ctx.sepProjectBinding.review(f.selection),{code:'SEP_BINDING_LEDGER_INVALID'});assert.deepEqual(await readFile(f.budgetPath),bytes);}finally{await f.close();}
});
test('legacy ledger is refused without implicit migration or policy rewrite',async()=>{
 const f=await setup();try{const bytes=Buffer.from(JSON.stringify({version:1,currency:'CNY',limit:50,initialSpent:3,entries:[]}));await writeFile(f.budgetPath,bytes);await assert.rejects(f.ctx.sepProjectBinding.review(f.selection),{code:'SEP_BINDING_LEDGER_MIGRATION_REQUIRED'});assert.deepEqual(await readFile(f.budgetPath),bytes);}finally{await f.close();}
});
test('current budget operations at the confirmed canonical path remain visible without resetting consumption',async()=>{
 const f=await setup();try{await confirmed(f);const budget=new Budget(f.budgetPath,{limit:80});await budget.reserve('new-reservation',1);const view=await f.ctx.sepProjectBinding.reviewSession(session(f));assert.equal(view.ledger.accounting.accountedCny,6.75);assert.equal(view.ledger.accounting.reservedCny,4);assert.equal(view.ledger.persistedPolicy.sessionDefault.revision,7);assert.equal(JSON.parse(await readFile(f.budgetPath)).reconciliations.length,1);}finally{await f.close();}
});
test('real Session handoff keeps project scope and writes through the selected SEP persistence and governed store',async()=>{
 const f=await setup();try{
  await confirmed(f);const s=session(f),view=await f.ctx.sepProjectBinding.reviewSession(s);assert.equal(view.project.memoryKey,f.project.memoryKey);assert.equal(view.paths.sessionRoot,f.dirs.sessions);
  const {Scope}=await owned('modules/system-enhancement-package/src/scope.js'),scope=new Scope(f.ctx.fs,[view.sourceProject],{enabled:true,recoveryHost:f.ctx.recoveryHost});await scope.init();assert.equal(scope.projects[0].key,f.project.memoryKey);assert.equal(Buffer.from(await scope.bytes(scope.projects[0],'资料.txt')).toString(),'合成资料');
  const writer=await f.ctx.sessionPersistence.create(s.header);
  s.append('user/message',{id:'00000000-0000-4000-8000-000000000002',role:'user',source:{kind:'user'},content:[{type:'text',text:'synthetic binding session'}]},{surfaceOp:'append'});
  assert.equal(await f.ctx.sessions.flush(s),true);await writer.close();
  const reader=await f.ctx.sessionPersistence.open(s.id,'read');try{assert.equal((await reader.read()).events[0].type,'user/message');}finally{await reader.close();}
  const {bindStorage}=await owned('modules/system-enhancement-package/src/p2/storage.js'),facility=await bindStorage({facility:f.ctx.storageDomain,storageRoot:f.dirs.memory,control:f.control});
  const domain=await facility.open({name:'dsh_enhancement_suite_v1',version:1,tables:{projects:{valueSchema:z.json()}}});
  await domain.table('projects').put(f.project.memoryKey,{synthetic:true});assert.deepEqual(await f.control.withAccess(()=>domain.table('projects').get(f.project.memoryKey)),{synthetic:true});await domain.close();assert.deepEqual(await readFile(f.budgetPath),f.bytes);
 }finally{await f.close();}
});
test('different workspace Session and forged header do not receive the selected project context',async()=>{
 const f=await setup();try{await confirmed(f);const other=f.ctx.sessions.create(SessionId('other'),{meta:{cwd:f.dirs.memory,delegationDepth:0}});await assert.rejects(f.ctx.sepProjectBinding.reviewSession(other),{code:'SEP_BINDING_SESSION_SCOPE'});await assert.rejects(f.ctx.sepProjectBinding.reviewSession({header:{cwd:f.dirs.project,id:'fake'}}),{code:'SEP_BINDING_SESSION_INVALID'});}finally{await f.close();}
});
test('changed live Session provider cannot inherit a confirmation for an earlier provider',async()=>{
 const f=await setup();try{await confirmed(f);const plugin=(await owned('lib/session-persistence.js')).default,runtime=f.ctx.registry.get(plugin);await Promise.all([...runtime.fibers].map(fiber=>fiber.dispose()));const other=join(f.base,'other-sessions');await mkdir(other);await f.ctx.plugin(plugin,{root:other,compression:'none'});await assert.rejects(f.ctx.sepProjectBinding.reviewSession(session(f)),{code:'SEP_BINDING_CONTEXT_CHANGED'});}finally{await f.close();}
});
test('unknown memory governance cannot be inferred from a valid-looking native backend',async()=>{
 const f=await setup({omitControl:true});try{await assert.rejects(f.ctx.sepProjectBinding.review(f.selection),{code:'SEP_BINDING_GOVERNANCE_REQUIRED'});assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await f.close();}
});
test('storage maintenance barrier prevents confirming or using a prepared binding',async()=>{
 const f=await setup();try{const plan=await f.ctx.sepProjectBinding.review(f.selection);await f.switchControl('maintenance');await f.control.setBarrier({closed:true,transactionId:'synthetic-maintenance',planHash:'a'.repeat(64)});await assert.rejects(f.ctx.sepProjectBinding.confirm({planHash:plan.planHash}),{code:'SEP_BINDING_PLAN_CHANGED'});await assert.rejects(f.ctx.sepProjectBinding.review(f.selection),{code:'P2_RECOVERY_REQUIRED'});}finally{await f.close();}
});
test('caller mutations to a reviewed selection cannot alter the prepared plan',async()=>{
 const f=await setup();try{const plan=await f.ctx.sepProjectBinding.review(f.selection);f.selection.roots.locks=f.dirs.project;f.selection.configuration.budget.sharedLimitCny=1;const value=await f.ctx.sepProjectBinding.confirm({planHash:plan.planHash});assert.equal(value.roots.locks,f.dirs.locks);assert.equal(value.ledger.persistedPolicy.sharedLimitCny,80);}finally{await f.close();}
});
test('binding unload closes previously held service references',async()=>{
 const f=await setup();try{await confirmed(f);const service=f.ctx.sepProjectBinding;await f.fiber.dispose();await assert.rejects(service.reviewSession(session(f)),{code:'SEP_BINDING_CLOSED'});assert.equal(f.ctx.get('sepProjectBinding'),undefined);}finally{await f.close();}
});
test('unconfirmed and mismatched plans cannot hand off a real Session',async()=>{
 const f=await setup();try{await assert.rejects(f.ctx.sepProjectBinding.reviewSession(session(f)),{code:'SEP_BINDING_CONFIRMATION_REQUIRED'});const plan=await f.ctx.sepProjectBinding.review(f.selection);await assert.rejects(f.ctx.sepProjectBinding.confirm({planHash:'0'.repeat(64)}),{code:'SEP_BINDING_CONFIRMATION_MISMATCH'});assert.equal((await f.ctx.sepProjectBinding.confirm({planHash:plan.planHash})).status,'confirmed');}finally{await f.close();}
});
