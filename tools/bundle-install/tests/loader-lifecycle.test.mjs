import assert from 'node:assert/strict';
import {test} from 'node:test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setup} from './native-settings-fixture.mjs';

// One characterization of the upstream assumption that previously surprised
// this composition. No SEP runtime is mounted and no provider is substituted.
test('a dependency refresh retries the official Loader root on the same fiber but explicit dispose and create replace that fiber while reusing Entry',async()=>{
 const f=await setup({mountRoot:false,activate:false});
 try{
  const file=join(f.base,'loader-ownership-probe.mjs');
  await writeFile(file,`export const name='sep-loader-ownership-probe';\nexport const inject=['loader'];\nexport const attempts=[];\nexport async function apply(ctx){attempts.push({fiber:ctx.fiber,entry:ctx.fiber.entry,uid:ctx.fiber.uid});if(attempts.length===1)throw Error('synthetic first attempt');}\n`);
  const module=await import(pathToFileURL(file).href);
  await f.ctx.loader.create({id:'ownership-probe',name:pathToFileURL(file).href});await f.ctx.loader.await();
  assert.equal(module.attempts.length,1);
  // Use the real dependency refresh API that Loader and provider changes call;
  // do not assume its notification has run before loader.await() returns.
  await Promise.allSettled(f.ctx.reflect.notify(['loader']).map(fiber=>fiber.await()));
  assert.equal(module.attempts.length,2,'dependency refresh retries the failed attempt');
  assert.equal(module.attempts[0].fiber,module.attempts[1].fiber);
  const entry=f.ctx.loader.resolve('ownership-probe'),first=entry.fiber;assert.equal(first,module.attempts[0].fiber);
  await first.dispose();
  await f.ctx.loader.create({id:'ownership-probe',name:pathToFileURL(file).href});await f.ctx.loader.await();
  assert.equal(f.ctx.loader.resolve('ownership-probe'),entry,'Entry reuse is not fresh activation identity');
  assert.notEqual(entry.fiber,first,'explicit remount creates a new root ownership instance');
  assert.equal(module.attempts.length,3);assert.equal(module.attempts[2].fiber,entry.fiber);
  console.log('LOADER-OWNERSHIP',JSON.stringify({attemptUids:module.attempts.map(a=>a.uid),sameEntry:module.attempts.every(a=>a.entry===entry)}));
 }finally{await f.ctx.fiber.dispose();}
});
