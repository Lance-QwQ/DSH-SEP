import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile,cp,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const repo=process.env.SEP_SOURCE_REPO;
const {setup,close,agent,save,call,root,load}=await import(pathToFileURL(join(repo,'tools/bundle-install/tests/native-settings-fixture.mjs')));
let module;
try{module=await import('../lib/daily-startup.mjs');}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('SEP_DAILY_STARTUP_MISSING');throw error;}
const {readDailySelection,startDailyInstallation}=module;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function selection(f){
 // A release contains materialized regular files; pnpm's cache may hard-link
 // package files, so it is not a valid final deployment binding.
 const program=join(f.base,'materialized-bundle');
 await cp(root,program,{recursive:true,filter:file=>!file.includes('node_modules',root.length)});
 await symlink(dirname(root),join(program,'node_modules'),'junction');
 const manifestFile=join(program,'package.json');
 const configuration=structuredClone(f.input);delete configuration.runtime.compaction.nativeEntryId;
 const value={schema:1,dsh:'0.2.1-alpha.2',sep:'0.2.1-beta.3-alpha2-adapter.1',bundleRoot:program,nativeCompactionEntryKey:'native',configuration,bindings:[{path:manifestFile,sha256:sha(await readFile(manifestFile))}]};
 const file=join(f.base,'daily-selection.json');const bytes=JSON.stringify(value)+'\n';await writeFile(file,bytes);
 return {file,hash:sha(bytes),value};
}
const code=want=>error=>error.code===want;

test('daily adapter entry is separately bound and cannot be supplied through the original schema',async()=>{
 const f=await setup({mountRoot:false});try{
  const s=await selection(f);const {buildDailyComposition}=await import('../build/daily-composition.mjs');
  const out=join(f.base,'daily-composition');await buildDailyComposition({coreRoot:s.value.bundleRoot,out});
  await symlink(dirname(root),join(out,'node_modules'),'junction');
  s.value.dailyAdapterRoot=out;
  let bytes=JSON.stringify(s.value)+'\n';await writeFile(s.file,bytes);
  await assert.rejects(readDailySelection({path:s.file,sha256:sha(bytes)}),code('SEP_DAILY_SELECTION_INVALID'));
  s.value.schema=2;
  const {readdir}=await import('node:fs/promises');for(const file of await readdir(out)){if(file==='node_modules')continue;const path=join(out,file);s.value.bindings.push({path,sha256:sha(await readFile(path))});}
  bytes=JSON.stringify(s.value)+'\n';await writeFile(s.file,bytes);
  const opened=await startDailyInstallation(f.ctx,await readDailySelection({path:s.file,sha256:sha(bytes)}));
  f.api=opened.installation;f.fiber=opened.entry?.fiber;
  assert.equal(opened.status,'pass',JSON.stringify({status:opened.status,code:opened.code,initialization:opened.initialization}));
  assert.equal((await opened.close()).status,'pass');
 }finally{await close(f);}
});
test('unconfirmed or replaced selection refuses before any owned root is created',async()=>{
 const f=await setup({mountRoot:false});try{
  const s=await selection(f);await assert.rejects(readDailySelection({path:s.file,sha256:'a'.repeat(64)}),code('SEP_DAILY_SELECTION_CHANGED'));
  assert.equal(f.ctx.get('sepControlledInstallation'),undefined);
  const reviewed=await readDailySelection({path:s.file,sha256:s.hash});
  await writeFile(s.file,JSON.stringify({...s.value,configuration:{}}));
  await assert.rejects(startDailyInstallation(f.ctx,reviewed),code('SEP_DAILY_SELECTION_CHANGED'));
  assert.equal(f.ctx.get('sepControlledInstallation'),undefined);
 }finally{await close(f);}
});
test('mismatching pinned program binding refuses before any owned root is created',async()=>{
 const f=await setup({mountRoot:false});try{
  const s=await selection(f);s.value.bindings[0].sha256='b'.repeat(64);const bytes=JSON.stringify(s.value)+'\n';await writeFile(s.file,bytes);
  await assert.rejects(readDailySelection({path:s.file,sha256:sha(bytes)}),code('SEP_DAILY_PROGRAM_CHANGED'));
  assert.equal(f.ctx.get('sepControlledInstallation'),undefined);
 }finally{await close(f);}
});
test('approved cold selection activates actual native root, preserves ledger, and releases owners',async()=>{
 const f=await setup({mountRoot:false});try{
  const s=await selection(f),before=await readFile(f.budgetPath);
  const opened=await startDailyInstallation(f.ctx,await readDailySelection({path:s.file,sha256:s.hash}));
  f.api=opened.installation;f.fiber=opened.entry.fiber;
  assert.equal(opened.status,'pass',JSON.stringify({code:opened.code,cleanup:opened.cleanup,root:f.api?.status(),entry:opened.entry?{disabled:opened.entry.disabled,state:opened.entry.fiber?.state,exports:Object.keys(opened.entry.moduleNamespace??{})}:null,missing:['loader','tools','systemPrompt','sessions','storageDomain','recoveryHost','llm','tokenMeter','agents','subagents','approval','connection','clientModules'].filter(name=>!f.ctx.get(name))}));assert.equal(f.api.status().phase,'active');
  assert.deepEqual(await readFile(f.budgetPath),before);
  const a=await agent(f);const receipt=await save(f,a,'Remember synthetic daily restart requirement','project');
  assert.ok(receipt);assert.equal(f.ctx.get('suiteEnhancements').memoryFactHintsProtocol,1);
  await assert.rejects(startDailyInstallation(f.ctx,await readDailySelection({path:s.file,sha256:s.hash})),code('SEP_DAILY_HOST_NOT_COLD'));
  const stopped=await opened.close();assert.equal(stopped.status,'pass');assert.equal(stopped.resourcesRetained,false);
 }finally{await close(f);}
});
test('missing governed root stays missing and no empty replacement is initialized',async()=>{
 const f=await setup({mountRoot:false});try{
  const s=await selection(f);s.value.configuration.runtime.profile.selection.roots.memory=join(f.base,'missing-memory');
  const bytes=JSON.stringify(s.value)+'\n';await writeFile(s.file,bytes);
  const result=await startDailyInstallation(f.ctx,await readDailySelection({path:s.file,sha256:sha(bytes)}));
  assert.equal(result.status,'blocked');assert.equal(result.businessAdmitted,false);
  const {lstat}=await import('node:fs/promises');await assert.rejects(lstat(join(f.base,'missing-memory')),error=>error.code==='ENOENT');
 }finally{await close(f);}
});
test('fresh Node host reuses governed memory, session and ledger without initialization',async()=>{
 const f=await setup({mountRoot:false});let disposed=false;
 try{
  const s=await selection(f),opened=await startDailyInstallation(f.ctx,await readDailySelection({path:s.file,sha256:s.hash}));
  assert.equal(opened.status,'pass');f.api=opened.installation;f.fiber=opened.entry.fiber;
  const a=await agent(f);const {createUserMessage}=await load('@deepseek-ai/dsh-llm');
  a.followup(createUserMessage({content:[{type:'text',text:'Remember synthetic restart requirement'}],source:{kind:'user'}}));await a.whenIdle();
  await call(f,a,'memory_save',{text:'Remember synthetic restart requirement',category:'project',status:'confirmed',eventId:'restart-memory',reason:'explicit direct evidence'});await f.ctx.sessions.flush(a.session);
  assert.equal((await opened.close()).status,'pass');await close(f);disposed=true;
  const before=await readFile(f.budgetPath);
  const input={selectionFile:s.file,sha256:s.hash,bundleRoot:s.value.bundleRoot,base:f.base,project:f.dirs.project,sessionId:a.id};
  const {fileURLToPath}=await import('node:url');
  const child=spawn(process.execPath,[fileURLToPath(new URL('./restart-reader.mjs',import.meta.url))],{env:{...process.env,SEP_DAILY_RESTART_CASE:JSON.stringify(input)},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);
  const timer=setTimeout(()=>child.kill(),30000);const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);
  assert.equal(exit.code,0,stderr);const result=JSON.parse(stdout.trim());assert.equal(result.status,'pass');assert.equal(result.resumed,true);assert.ok(result.sessionEvents>0);assert.ok(result.memories>0);assert.equal(result.resourcesRetained,false);
  assert.equal(result.ledgerSha256,sha(before));assert.deepEqual(await readFile(f.budgetPath),before);
 }finally{if(!disposed)await close(f);}
});
