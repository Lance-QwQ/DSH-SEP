import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const repo=process.argv[2],out=process.argv[3];
const original=await readFile(join(repo,'tools/bundle-install/tests/native-compaction.test.mjs'),'utf8');
const additions=`
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
`;
const filename=process.argv[4]??'native-reload.test.mjs';if(!/^native-reload(?:-r\d+)?\.test\.mjs$/.test(filename))throw Error('TEST_OUTPUT_NAME');
await writeFile(join(out,filename),original+additions,{flag:'wx'});
