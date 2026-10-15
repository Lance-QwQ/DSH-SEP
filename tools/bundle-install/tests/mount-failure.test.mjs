import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setup,close,code,deferred} from './controlled-fixture.mjs';
// The 700ms failure observation starts at injected UI failure, after startup.
async function observe(work,ms=700){let timer;try{return await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>resolve({state:'pending'}),ms);})]);}finally{clearTimeout(timer);}}
const collision=f=>f.connection.fetch.register({path:'/api/sep-budget/list',methods:['POST'],async fetch(){return new Response('user-route-preserved');}});
async function preserved(f){const r=await f.connection.createSharedFetchHandler('/api').fetch(new Request('http://127.0.0.1/api/sep-budget/list',{method:'POST'}));assert.equal(await r.text(),'user-route-preserved');}

test('UI mount failure with blocked native restore returns a bounded quarantined root, retaining lease until explicit repair',async()=>{
 const f=await setup({activate:false,shutdownMs:100});
 let controller,originalRestore,mounting,observed;const failurePoint=deferred();
 const register=f.connection.registerFetchRoute;
 try{
  await f.api.close();await f.fiber.dispose();
  collision(f);
  f.connection.registerFetchRoute=function(...args){
   if(!controller){controller=f.ctx.sepNativeCompaction;originalRestore=controller.restore;controller.restore=async()=>{throw Object.assign(new Error('synthetic-restore-failure'),{code:'SYNTHETIC_RESTORE'});};failurePoint.resolve();}
   return register.apply(this,args);
  };
  mounting=f.mount().then(()=>({state:'settled',api:f.ctx.sepControlledInstallation}),error=>({state:'rejected',error}));
  assert.equal((await observe(failurePoint.promise.then(()=>({state:'reached'})),5000)).state,'reached');observed=await observe(mounting);
  console.log(JSON.stringify({observation:observed.state,error:observed.error?.message,injected:!!controller,inner:f.ctx.get('sepSettingsRuntime')?.status()}));
  // Preserve observations before repairing the synthetic cause. Cleanup is
  // unconditional even on the old package, whose mount never returns here.
  if(observed.state==='settled'){
   const api=observed.api;assert.equal(api.status().phase,'mount-failed-blocked');assert.equal(api.status().status,'blocked');assert.equal(api.status().resourcesRetained,true);
   assert.equal(api.status().code,'SEP_INSTALLATION_MOUNT_FAILED');
   await assert.rejects(api.review(),code('SEP_INSTALLATION_STATE'));
   await assert.rejects(api.activate({planHash:'0'.repeat(64)}),code('SEP_INSTALLATION_STATE'));
   assert.throws(()=>api.stream({}),code('SEP_P1_CLOSED'));
   await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});
   const route=f.connection.createSharedFetchHandler('/api');assert.equal(await (await route.fetch(new Request('http://127.0.0.1/api/sep-budget/list',{method:'POST'}))).text(),'user-route-preserved');
   assert(!JSON.stringify(api.status()).includes('synthetic-restore-failure'));assert.equal(f.requests.length,0);
  }
 }finally{
  f.connection.registerFetchRoute=register;
  if(controller)controller.restore=originalRestore;
  if(observed?.state==='settled'){assert.equal((await observed.api.close()).status,'pass');await observed.api.whenClosed();}
  else await f.ctx.get('sepSettingsRuntime')?.close();
  if(mounting)await mounting;
  await close(f);
 }
 assert.equal(observed.state,'settled','mount must return blocked recovery controls within the observation deadline');
});

test('ordinary UI collision still rejects after complete rollback and preserves unrelated routes and ledger',async()=>{
 const f=await setup({activate:false,shutdownMs:100});
 try{await f.api.close();await f.fiber.dispose();collision(f);
  await assert.rejects(f.mount(),/already registered/);await preserved(f);
  assert.equal(f.ctx.get('suiteEnhancements'),undefined);assert.equal(f.ctx.get('sepSettingsRuntime'),undefined);
  const control=await f.openControl({storageRoot:f.dirs.memory});await control.close();assert.equal(f.requests.length,0);
 }finally{await close(f);}
});

test('uncooperative restoration retains ownership through bounded mount failure and Fiber disposal until the gate is released',async()=>{
 const f=await setup({activate:false,shutdownMs:100}),gate=deferred();
 const register=f.connection.registerFetchRoute;let controller,restore,mounting,unloading;const failurePoint=deferred();
 try{await f.api.close();await f.fiber.dispose();collision(f);
  f.connection.registerFetchRoute=function(...args){if(!controller){controller=f.ctx.sepNativeCompaction;restore=controller.restore;controller.restore=async()=>{await gate.promise;return restore();};failurePoint.resolve();}return register.apply(this,args);};
  mounting=f.mount().then(()=>({state:'settled',api:f.ctx.sepControlledInstallation}),error=>({state:'rejected',error}));
  assert.equal((await observe(failurePoint.promise.then(()=>({state:'reached'})),5000)).state,'reached');const result=await observe(mounting);assert.equal(result.state,'settled');assert.equal(result.api.status().phase,'mount-failed-blocked');
  assert.equal((await result.api.close()).status,'blocked');await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});
  unloading=f.fiber.dispose().then(()=>({state:'disposed'}));assert.equal((await observe(unloading,180)).state,'pending');
  gate.resolve();await result.api.whenClosed();await unloading;assert.equal(result.api.status().phase,'closed');await preserved(f);
 }finally{gate.resolve();f.connection.registerFetchRoute=register;if(controller)controller.restore=restore;await f.ctx.get('sepSettingsRuntime')?.close();if(mounting)await mounting;if(unloading)await unloading;await close(f);}
});

test('close requested during UI registration joins startup before disposing newly created routes and never reopens admission',async()=>{
 const f=await setup({activate:false,shutdownMs:100});const register=f.connection.registerFetchRoute;let api,stopping;
 try{await f.api.close();await f.fiber.dispose();
  f.connection.registerFetchRoute=function(...args){if(!api){api=f.ctx.sepControlledInstallation;assert(api,'recovery control must exist before UI assembly');stopping=api.close();}return register.apply(this,args);};
  await assert.rejects(f.mount(),code('SEP_INSTALLATION_STATE'));await stopping;await api.whenClosed();assert.equal(api.status().phase,'closed');
  await assert.rejects(api.review(),code('SEP_INSTALLATION_STATE'));assert.throws(()=>api.stream({}),code('SEP_P1_CLOSED'));
  const response=await f.connection.createSharedFetchHandler('/api').fetch(new Request('http://127.0.0.1/api/sep-budget/list',{method:'POST'}));assert.equal(response.status,404);
  const control=await f.openControl({storageRoot:f.dirs.memory});await control.close();assert.equal(f.requests.length,0);
 }finally{f.connection.registerFetchRoute=register;await close(f);}
});

test('UI mount plus physical lease cleanup failure returns blocked and needs explicit synthetic owner recovery before close can pass',async()=>{
 const f=await setup({activate:false,shutdownMs:100});const register=f.connection.registerFetchRoute;let control,release,mounting;const failurePoint=deferred();
 try{await f.api.close();await f.fiber.dispose();collision(f);
  f.connection.registerFetchRoute=function(...args){if(!control){control=f.ctx.sepStorageControl;release=control.close;control.close=async()=>{throw Object.assign(new Error('synthetic-lease-close'),{code:'SYNTHETIC_LEASE_CLOSE'});};failurePoint.resolve();}return register.apply(this,args);};
  mounting=f.mount().then(()=>({state:'settled',api:f.ctx.sepControlledInstallation}),error=>({state:'rejected',error}));
  assert.equal((await observe(failurePoint.promise.then(()=>({state:'reached'})),5000)).state,'reached');const result=await observe(mounting);assert.equal(result.state,'settled');assert.equal(result.api.status().phase,'mount-failed-blocked');
  console.log('cleanup-observation',JSON.stringify(result.api.status()));
  assert.equal(result.api.status().runtime.phase,'cleanup-blocked');await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});await preserved(f);
  // No stale lock deletion: after cleanup failure is observed, the test's
  // original, still-owned coordinator explicitly closes its own lease.
  control.close=release;await release();console.log('synthetic-owned-lease-released');assert.equal((await result.api.close()).status,'pass');await result.api.whenClosed();
  const next=await f.openControl({storageRoot:f.dirs.memory});await next.close();assert.equal(f.requests.length,0);
 }finally{f.connection.registerFetchRoute=register;if(control){control.close=release;await release();}console.log('cleanup-finally-lease-released');await f.ctx.get('sepSettingsRuntime')?.close();console.log('cleanup-finally-runtime-closed');if(mounting)await mounting;console.log('cleanup-finally-mount-settled');await close(f);console.log('cleanup-finally-root-disposed');}
});
