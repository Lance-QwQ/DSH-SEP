import assert from 'node:assert/strict';
import {test} from 'node:test';
import {access,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setup,close,code,deferred} from './native-settings-fixture.mjs';
const limit=(work,ms=2500)=>{let timer;return Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('INITIALIZATION_DEADLINE')),ms);})]).finally(()=>clearTimeout(timer));};
// A failed assertion must not hang the runner inside the historical rollback
// cycle. This only terminates this isolated test worker, never the daily host.
const watchdog=setTimeout(()=>{console.error('TEST_CLEANUP_DEADLINE: isolated test worker only');process.exit(2);},18000);watchdog.unref();

test('initialization failure before ownership returns an error and leaves no lease',async()=>{
 const f=await setup({mountRoot:false,activate:false,shutdownMs:100,budget:'missing'});
 try{await assert.rejects(limit(f.mount()));assert.equal(f.ctx.get('suiteEnhancements'),undefined);await assert.rejects(access(join(f.dirs.memory,'.suite-memory/p2/owner.lock')),e=>e.code==='ENOENT');}
 finally{await limit(f.ctx.fiber.dispose());}
});

test('a source guard failure after Profile ownership rolls back the physical lease without changing the ledger',async()=>{
 const f=await setup({mountRoot:false,activate:false,shutdownMs:100,business:{sources:['../outside']}});
 try{
  await assert.rejects(limit(f.mount()));
  await assert.rejects(access(join(f.dirs.memory,'.suite-memory/p2/owner.lock')),e=>e.code==='ENOENT');
  assert.equal(f.ctx.get('suiteEnhancements'),undefined);assert.deepEqual(await readFile(f.budgetPath),f.bytes);
  const c=await f.openControl({storageRoot:f.dirs.memory});await c.close();
 }finally{await limit(f.ctx.fiber.dispose());}
});

test('an uncooperative initialization rollback retains ownership until the delayed restoration actually settles',async()=>{
 const f=await setup({mountRoot:false,activate:false,shutdownMs:100}),release=deferred();
 const facility=f.ctx.storageDomain,originalOpen=facility.open;let controller,originalRestore;
 try{
  facility.open=async function(spec,...args){
   if(spec.name==='dsh_four_layer_memory_v1'){
    controller=f.ctx.sepNativeCompaction;originalRestore=controller.restore;
    controller.restore=async()=>{await release.promise;return originalRestore();};
    throw Object.assign(Error('synthetic initialization'),{code:'SYNTHETIC_INITIALIZATION'});
   }
   return originalOpen.call(this,spec,...args);
  };
  await limit(f.mount());assert.equal(f.api.status().phase,'mount-failed-blocked');
  assert.equal((await limit(f.api.close())).status,'blocked');
  await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});
  let physicallyClosed=false;f.api.whenClosed().then(()=>{physicallyClosed=true;});await new Promise(r=>setTimeout(r,20));assert.equal(physicallyClosed,false);
  release.resolve();facility.open=originalOpen;await limit(f.api.whenClosed());assert.equal(f.api.status().phase,'closed');
  const c=await f.openControl({storageRoot:f.dirs.memory});await c.close();assert.equal(f.requests.length,0);
 }finally{release.resolve();facility.open=originalOpen;if(controller)controller.restore=originalRestore;await limit(close(f));}
});

test('closing during initialization cannot later publish ready settings or admit a model stream',async()=>{
 const f=await setup({mountRoot:false,activate:false,shutdownMs:100}),entered=deferred(),release=deferred();
 const facility=f.ctx.storageDomain,originalOpen=facility.open;let mounting;const epochs=[];
 f.ctx.on('internal/status',fiber=>{if(fiber.name?.includes('sep-'))epochs.push({name:fiber.name,uid:fiber.uid,parentUid:fiber.parent?.fiber?.uid,entryId:fiber.entry?.id,state:fiber.state});});
 try{
  facility.open=async function(spec,...args){if(spec.name==='dsh_four_layer_memory_v1'){entered.resolve();await release.promise;}return originalOpen.call(this,spec,...args);};
  mounting=f.mount().then(()=>({ok:true}),error=>({error}));await limit(entered.promise);
  const inner=f.ctx.sepSettingsRuntime;assert(inner);assert.equal((await limit(inner.close())).status,'blocked');
  release.resolve();const mounted=await limit(mounting);await limit(inner.whenClosed());
  console.log('INITIALIZATION-CLOSE-TRACE',JSON.stringify({mounted:mounted.ok??mounted.error?.message,innerPhase:inner.status().phase,currentPhase:f.ctx.get('sepSettingsRuntime')?.status().phase,rootAttempts:epochs.filter(e=>e.name==='dsh-sep-native-settings-installation'&&e.state===1).map(e=>e.uid)}));
  assert.equal(f.ctx.get('suiteEnhancements'),undefined);assert.throws(()=>inner.stream({}),code('SEP_P1_CLOSED'));
  await assert.rejects(access(join(f.dirs.memory,'.suite-memory/p2/owner.lock')),e=>e.code==='ENOENT');
 }finally{release.resolve();facility.open=originalOpen;await mounting;await limit(close(f));}
});

test('inner initialization plus restore failure returns bounded non-admitting recovery controls and permits a fresh mount',async()=>{
 const f=await setup({mountRoot:false,activate:false,shutdownMs:100});
 const facility=f.ctx.storageDomain,originalOpen=facility.open;let controller,originalRestore;
 try{
  facility.open=async function(spec,...args){
   if(spec.name==='dsh_four_layer_memory_v1'){
    controller=f.ctx.sepNativeCompaction;assert(controller);originalRestore=controller.restore;
    controller.restore=async()=>{throw Object.assign(Error('synthetic restore unavailable'),{code:'SYNTHETIC_RESTORE'});};
    throw Object.assign(Error('synthetic layered initialization failure'),{code:'SYNTHETIC_INITIALIZATION'});
   }
   return originalOpen.call(this,spec,...args);
  };
  await limit(f.mount());
  assert.equal(f.api.status().phase,'mount-failed-blocked');
  assert.equal(f.api.status().runtime.phase,'initialization-failed-blocked');
  await assert.rejects(f.api.review(),code('SEP_INSTALLATION_STATE'));
  assert.throws(()=>f.api.stream({}),code('SEP_P1_CLOSED'));
  assert.equal(f.ctx.get('suiteEnhancements'),undefined);
  await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});
  assert.equal(f.requests.length,0);
  assert.deepEqual(await readFile(f.budgetPath),f.bytes);
  facility.open=originalOpen;controller.restore=originalRestore;
  assert.equal((await limit(f.api.close())).status,'pass');await limit(f.api.whenClosed());await limit(f.fiber.dispose());
  await f.mount();const plan=await f.api.review();await f.api.activate({planHash:plan.planHash});assert.equal(f.api.status().phase,'active');
 }finally{
  facility.open=originalOpen;if(controller)controller.restore=originalRestore;
  await limit(close(f));
 }
});

test('the root exposes bounded close before inner initialization settles and a fresh explicit root may be activated afterwards',async()=>{
 const f=await setup({mountRoot:false,activate:false,shutdownMs:100}),entered=deferred(),release=deferred();
 const facility=f.ctx.storageDomain,originalOpen=facility.open;let mounting,control;
 try{
  facility.open=async function(spec,...args){if(spec.name==='dsh_four_layer_memory_v1'){entered.resolve();await release.promise;}return originalOpen.call(this,spec,...args);};
  mounting=f.mount().then(()=>({ok:true}),error=>({error}));await limit(entered.promise);
  // Strict service discovery excludes every LOADING Cordis provider. The
  // trusted startup supervisor uses the documented non-strict get; business
  // consumers retain normal strict discovery and cannot use this as admission.
  control=f.ctx.get('sepControlledInstallation',false);assert(control,'root recovery control must exist during inner initialization');
  assert.equal(control.status().phase,'preparing');await assert.rejects(control.review(),code('SEP_INSTALLATION_STATE'));
  assert.equal((await limit(control.close())).status,'blocked');
  assert.throws(()=>control.stream({}),code('SEP_P1_CLOSED'));
  release.resolve();await limit(mounting);await limit(control.whenClosed());
  assert.equal(control.status().phase,'closed');assert.equal(f.ctx.get('suiteEnhancements'),undefined);
  facility.open=originalOpen;const oldRoot=f.ctx.loader.resolve('sep-native-root').fiber;await oldRoot.dispose();
  await f.mount();assert.notEqual(f.fiber,oldRoot);const plan=await f.api.review();await f.api.activate({planHash:plan.planHash});assert.equal(f.api.status().phase,'active');
 }finally{release.resolve();facility.open=originalOpen;await mounting;await limit(close(f));}
});

test('a foreign root provider still initializing is rejected before registering cleanup or acquiring the memory lease',async()=>{
 const f=await setup({mountRoot:false,activate:false,shutdownMs:100}),entered=deferred(),release=deferred();let foreign,mounting;
 try{
  foreign=f.ctx.plugin({name:'synthetic-preparing-root-owner',async apply(child){child.provide('sepControlledInstallation',{foreign:true});entered.resolve();await release.promise;}});
  await limit(entered.promise);assert.equal(f.ctx.get('sepControlledInstallation'),undefined);
  // f.mount's service lookup could see the unrelated foreign owner. Check the
  // actual attempted Loader fiber's startup outcome as well.
  mounting=f.mount().then(()=>f.ctx.loader.resolve('sep-native-root').fiber.await());
  await assert.rejects(limit(mounting),code('SEP_INSTALLATION_PROVIDER_CONFLICT'));
  assert.equal(f.ctx.get('sepControlledInstallation',false).foreign,true);
  await assert.rejects(access(join(f.dirs.memory,'.suite-memory/p2/owner.lock')),e=>e.code==='ENOENT');
 }finally{release.resolve();await foreign;await foreign?.dispose();await mounting?.catch(()=>{});await limit(f.ctx.fiber.dispose());}
});

test('blocked initialization retains a bounded redacted primary cause separately from cleanup failure',async()=>{
 const f=await setup({mountRoot:false,activate:false,shutdownMs:100}),facility=f.ctx.storageDomain,originalOpen=facility.open;let controller,restore;
 try{facility.open=async function(spec,...args){if(spec.name==='dsh_four_layer_memory_v1'){
  controller=f.ctx.sepNativeCompaction;restore=controller.restore;controller.restore=async()=>{throw Object.assign(Error('private restore body'),{code:'SYNTHETIC_RESTORE'});};
  throw Object.assign(Error('private-primary-secret-body'),{code:'SYNTHETIC_INITIALIZATION'});
 }return originalOpen.call(this,spec,...args);};
 await limit(f.mount());const status=f.api.status();assert.equal(status.runtime.initializationCause.code,'SYNTHETIC_INITIALIZATION');
 assert.equal(status.runtime.code,'SEP_NATIVE_RESTORE_BLOCKED');assert(!JSON.stringify(status).includes('private-primary-secret-body'));
 facility.open=originalOpen;controller.restore=restore;assert.equal((await limit(f.api.close())).status,'pass');
 }finally{facility.open=originalOpen;if(controller)controller.restore=restore;await limit(close(f));}
});

test('consumer layer cleanup can fail once and be retried without releasing the Profile lease early',async()=>{
 const f=await setup({mountRoot:false,shutdownMs:100}),facility=f.ctx.storageDomain,originalOpen=facility.open;let repair=false,attempts=0;
 try{facility.open=async function(spec,...args){const domain=await originalOpen.call(this,spec,...args);if(spec.name==='dsh_four_layer_memory_v1'){
  const originalClose=domain.close.bind(domain);domain.close=async()=>{attempts++;if(!repair)throw Object.assign(Error('synthetic layer close'),{code:'SYNTHETIC_LAYER_CLOSE'});return originalClose();};
 }return domain;};await limit(f.mount());assert.equal((await limit(f.api.close())).status,'blocked');
 await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});repair=true;
 assert.equal((await limit(f.api.close())).status,'pass');await limit(f.api.whenClosed());assert(attempts>=2);assert.deepEqual(await readFile(f.budgetPath),f.bytes);
 }finally{repair=true;facility.open=originalOpen;await limit(close(f));}
});
