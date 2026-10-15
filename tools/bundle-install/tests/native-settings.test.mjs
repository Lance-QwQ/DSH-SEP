import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {request as httpRequest} from 'node:http';
import {setup,close,model,owned,root,deferred,code} from './native-settings-fixture.mjs';
const UI='@deepseek-ai/dsh-client-ui-settings-memory';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const limit=(work,ms=3000)=>{let timer;return Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('fixture deadline')),ms);})]).finally(()=>clearTimeout(timer));};
const envelope=(method,payload={})=>({type:'client-request',rpcId:'synthetic-settings',method,payload});
async function authenticate(f){const response=await fetch(f.connection.authenticatedUrl(f.origin+'/'),{redirect:'manual'});assert.equal(response.status,303);assert.equal(response.headers.get('location'),'./');assert.equal(response.headers.get('cache-control'),'no-store');const cookie=response.headers.get('set-cookie');assert(cookie?.includes('HttpOnly'));assert(cookie.includes('SameSite=Strict'));return cookie.split(';')[0];}
const rpc=(f,cookie,method,payload={},headers={})=>fetch(f.origin+'/api/'+method,{method:'POST',headers:{'content-type':'application/json',origin:f.origin,...cookie?{cookie}:{},...headers},body:JSON.stringify(envelope(method,payload))});
const hostileHost=(f,cookie)=>new Promise((resolve,reject)=>{const req=httpRequest(f.origin+'/api/sep-budget/list',{method:'POST',headers:{host:'untrusted.invalid',origin:f.origin,cookie,'content-type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.setTimeout(3000,()=>req.destroy(Error('HTTP fixture deadline')));req.on('error',reject);req.end(JSON.stringify(envelope('sep-budget/list')));});

test('official client registry discovers the owned settings child and serves its unchanged factory',async()=>{
 const f=await setup();try{
  const row=f.ctx.clientModules.graph().entries.find(row=>row.id===UI);assert(row,'native settings factory is absent from the official client graph');
  assert.equal(f.ctx.clientModules.clientPath(UI),join(root,'bundle/modules/ui-settings-memory/lib/client.js'));
  const response=await fetch(new URL(row.url,f.origin+'/'));assert.equal(response.status,200);
  const text=await response.text();assert(text.includes('id: "'+UI+'"'));assert(text.includes('sep-budget'));
  const child=[...f.ctx.loader.entries()].find(e=>e.options.id==='sep-native-settings');assert(child?.fiber);assert(child.options.name.startsWith('file:'));assert.equal(child.parent.tree.ctx.fiber.entry,f.rootEntry);
  assert.equal(f.requests.length,0);
 }finally{await close(f);}
});

test('native root rejects a manual mount before acquiring storage ownership',async()=>{
 const f=await setup({mountRoot:false});try{
  const native=await owned('lib/native-settings-installation.js');await assert.rejects(native.apply(f.ctx,f.input),code('SEP_NATIVE_UI_LOADER_ENTRY_REQUIRED'));
  await assert.rejects(access(join(f.dirs.memory,'.suite-memory/p2/owner.lock')),e=>e.code==='ENOENT');assert.equal(f.ctx.get('suiteEnhancements'),undefined);
 }finally{await f.ctx.fiber.dispose();}
});

test('native activation requires the outer native review plan and cannot substitute its runtime hash',async()=>{
 const f=await setup({activate:false});try{
  const p=await f.api.review();await assert.rejects(f.api.activate({planHash:p.runtimeHash}),code('SEP_INSTALLATION_PLAN_INVALID'));
  await f.api.activate({planHash:p.planHash});assert.equal(f.api.status().phase,'active');
 }finally{await close(f);}
});

test('normal close withdraws client discovery and settings routes while retaining unrelated native entries',async()=>{
 const f=await setup();try{
  const native=f.entry,options=structuredClone(f.raw),cookie=await authenticate(f);
  assert.equal((await rpc(f,cookie,'sep-budget/list')).status,200);
  assert.equal((await f.api.close()).status,'pass');await tick();
  assert(!f.ctx.clientModules.graph().entries.some(row=>row.id===UI));assert.equal(f.rootEntry.subtree,undefined);
  assert.equal((await rpc(f,cookie,'sep-budget/list')).status,404);assert.deepEqual(native.options,options);assert(native.fiber);
 }finally{await close(f);}
});

test('a blocked close keeps the client owner until the accepted model work really settles',async()=>{
 const f=await setup({shutdownMs:100});const entered=deferred(),release=deferred();let running;
 try{
  f.behavior=async()=>{entered.resolve();await release.promise;};running=model(f).catch(()=>{});await limit(entered.promise);
  const stopped=await limit(f.api.close());assert.equal(stopped.status,'blocked');assert(f.ctx.clientModules.graph().entries.some(row=>row.id===UI));
  release.resolve();await running;
  // Model settlement releases one pending token, not the physical cleanup.
  // A second 100ms receipt may still be blocked; whenClosed is authoritative.
  const retried=await limit(f.api.close());assert(['pass','blocked'].includes(retried.status));
  if(retried.status==='blocked')assert.equal(retried.resourcesRetained,true);
  await limit(f.api.whenClosed());assert.equal(f.api.status().status,'pass');
  await tick();assert(!f.ctx.clientModules.graph().entries.some(row=>row.id===UI));
 }finally{release.resolve();await running;await close(f);}
});

test('a replaced native subtree is preserved and makes close blocked until the original ownership is restored',async()=>{
 const f=await setup({shutdownMs:100});const original=f.rootEntry.subtree,foreign={entries:function*(){}};
 try{
  assert(original,'native root has no owned child tree');f.rootEntry.subtree=foreign;
  const stopped=await limit(f.api.close());assert.equal(stopped.status,'blocked');assert.equal(f.rootEntry.subtree,foreign);
  f.rootEntry.subtree=original;assert.equal((await limit(f.api.close())).status,'pass');assert.equal(f.rootEntry.subtree,undefined);
 }finally{if(f.rootEntry.subtree===foreign)f.rootEntry.subtree=original;await close(f);}
});

test('real BrowserAuth requires cookie exchange before any SEP settings data is returned',async()=>{
 const f=await setup();try{
  assert.equal((await fetch(f.origin+'/')).status,401);assert.equal((await rpc(f,undefined,'sep-budget/list')).status,401);
  const apiToken=await fetch(f.connection.authenticatedUrl(f.origin+'/api/sep-budget/list'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(envelope('sep-budget/list'))});assert.equal(apiToken.status,401);
  const cookie=await authenticate(f);assert.equal((await fetch(f.origin+'/',{headers:{cookie}})).status,200);
  const response=await rpc(f,cookie,'sep-budget/list');assert.equal(response.status,200);const data=await response.json();assert.equal(data.result.ok,true);assert.equal(data.result.value.defaults.limitCny,100);
  assert(!JSON.stringify(data).includes('synthetic-secret-body'));assert.equal(f.requests.length,0);
 }finally{await close(f);}
});

test('Host and Origin fences reject a hostile request even with a valid signed cookie',async()=>{
 const f=await setup();try{const cookie=await authenticate(f);
  assert.equal((await rpc(f,cookie,'sep-budget/list',{}, {origin:'https://untrusted.invalid'})).status,403);
  assert.equal(await hostileHost(f,cookie),403);
  assert.equal((await rpc(f,cookie+'.tampered','sep-budget/list')).status,401);
  assert.equal((await rpc(f,cookie,'sep-budget/list')).status,200);
 }finally{await close(f);}
});

test('authenticated setting edits preserve ledger spend and enforce the service revision',async()=>{
 const f=await setup();try{const cookie=await authenticate(f);
  const initial=(await (await rpc(f,cookie,'sep-budget/list')).json()).result.value;
  const changed=await (await rpc(f,cookie,'sep-budget/updateDefault',{limitCny:25,expectedRevision:initial.defaults.revision})).json();assert.equal(changed.result.ok,true);
  const stale=await (await rpc(f,cookie,'sep-budget/updateDefault',{limitCny:30,expectedRevision:initial.defaults.revision})).json();assert.equal(stale.result.ok,false);
  const state=(await (await rpc(f,cookie,'sep-budget/list')).json()).result.value;assert.equal(state.defaults.limitCny,25);
  const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.initialSpent,1);assert.deepEqual(ledger.entries,[]);assert.equal(f.requests.length,0);
 }finally{await close(f);}
});

test('authenticated malformed and oversized envelopes are bounded without changing saved settings',async()=>{
 const f=await setup();try{const cookie=await authenticate(f),url=f.origin+'/api/sep-budget/list',headers={cookie,origin:f.origin,'content-type':'application/json'};
  const bad=await fetch(url,{method:'POST',headers,body:JSON.stringify(envelope('wrong-endpoint'))});assert.equal(bad.status,400);
  const huge=await fetch(url,{method:'POST',headers,body:'x'.repeat(40000)});assert.equal(huge.status,413);
  const state=(await (await rpc(f,cookie,'sep-budget/list')).json()).result.value;assert.equal(state.defaults.limitCny,100);assert.equal(f.requests.length,0);
 }finally{await close(f);}
});

test('a fresh native mount does not revive old controls or duplicate the client factory',async()=>{
 const f=await setup();try{
  const old=f.api;await old.close();await f.fiber.dispose();await f.mount();
  assert.equal(f.ctx.clientModules.graph().entries.filter(row=>row.id===UI).length,1);
  assert.equal(f.api.status().phase,'active');assert.equal(old.status().phase,'closed');
  await assert.rejects(old.activate({planHash:'0'.repeat(64)}),code('SEP_INSTALLATION_STATE'));
  assert.throws(()=>old.stream({}),code('SEP_P1_CLOSED'));
 }finally{await close(f);}
});

test('a replaced subgroup also blocks detachment and preserves the replacement owner',async()=>{
 const f=await setup({shutdownMs:100}),tree=f.rootEntry.subtree,group=f.rootEntry.subgroup,foreign={};
 try{
  f.rootEntry.subgroup=foreign;assert.equal((await limit(f.api.close())).status,'blocked');
  assert.equal(f.rootEntry.subtree,tree);assert.equal(f.rootEntry.subgroup,foreign);
  f.rootEntry.subgroup=group;assert.equal((await limit(f.api.close())).status,'pass');
 }finally{if(f.rootEntry.subgroup===foreign)f.rootEntry.subgroup=group;await close(f);}
});

test('a native UI registration collision fails closed and preserves the foreign route',async()=>{
 const f=await setup({activate:false,shutdownMs:100});try{
  await f.api.close();await f.fiber.dispose();
  f.connection.fetch.register({path:'/api/sep-budget/list',methods:['POST'],async fetch(){return new Response('user-route-preserved');}});
  await assert.rejects(limit(f.mount()));
  assert.equal(f.ctx.get('suiteEnhancements'),undefined);assert.equal(f.rootEntry.subtree,undefined);
  const control=await f.openControl({storageRoot:f.dirs.memory});await control.close();
  assert.equal(await (await rpc(f,await authenticate(f),'sep-budget/list')).text(),'user-route-preserved');
 }finally{await close(f);}
});

test('native mount failure with blocked restoration returns bounded recovery controls',async()=>{
 const f=await setup({activate:false,shutdownMs:100});const register=f.connection.registerFetchRoute;let controller,restore;
 try{
  await f.api.close();await f.fiber.dispose();
  f.connection.fetch.register({path:'/api/sep-budget/list',methods:['POST'],async fetch(){return new Response('user-route-preserved');}});
  f.connection.registerFetchRoute=function(...args){if(!controller){controller=f.ctx.sepNativeCompaction;restore=controller.restore;controller.restore=async()=>{throw Object.assign(Error('synthetic restoration'),{code:'SYNTHETIC_RESTORE'});};}return register.apply(this,args);};
  await limit(f.mount());assert.equal(f.api.status().phase,'mount-failed-blocked');
  await assert.rejects(f.api.review(),code('SEP_INSTALLATION_STATE'));await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});
  controller.restore=restore;assert.equal((await limit(f.api.close())).status,'pass');await f.api.whenClosed();
 }finally{f.connection.registerFetchRoute=register;if(controller)controller.restore=restore;await close(f);}
});

test('owner preflight refuses an existing subgroup before creating a native child tree',async()=>{
 const {assertOwner}=await owned('lib/native-settings-ui.js'),foreign={},entry={subgroup:foreign};
 assert.throws(()=>assertOwner({fiber:{entry},get:()=>undefined,clientModules:{clientPath:()=>undefined}}),code('SEP_NATIVE_UI_OWNER_CONFLICT'));
 assert.equal(entry.subgroup,foreign);assert.equal(entry.subtree,undefined);
});
