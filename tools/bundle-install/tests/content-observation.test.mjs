import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,realpath,rename} from 'node:fs/promises';
import {dirname,join,resolve,toNamespacedPath} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setImmediate as yieldToLoop} from 'node:timers/promises';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
const koffi=(await import(pathToFileURL(require.resolve('koffi')))).default;
const kernel=koffi.load('kernel32.dll');
const create=kernel.func('void * __stdcall CreateFileW(const char16_t *, uint32_t, uint32_t, void *, uint32_t, uint32_t, void *)');
const get=kernel.func('int __stdcall GetFileInformationByHandleEx(void *, int, void *, uint32_t)');
const set=kernel.func('int __stdcall SetFileInformationByHandle(void *, int, void *, uint32_t)');
const close=kernel.func('int __stdcall CloseHandle(void *)');
// Test-only external writer: restore the real file's BASIC_INFO timestamps,
// including ChangeTime. No mock FsVersion, private production hook, or fake stat.
function basicInfo(path,restore){
 const handle=create(toNamespacedPath(path),0x100,7,null,3,0x02000000,null);
 assert(handle&&handle!==-1n&&handle!==18446744073709551615n);
 try{const data=restore??Buffer.alloc(40);assert.equal(restore?set(handle,0,data,40):get(handle,0,data,40),1);return data;}finally{assert.equal(close(handle),1);}
}
async function sameMetadataChange(f,target,path,content){
 const observed=await f.ctx.fs.stat(target);const times=basicInfo(path);
 await writeFile(path,content);basicInfo(path,times);
 const changed=await f.ctx.fs.stat(target);
 assert.equal(changed.version,observed.version,'fixture must establish equality of all native metadata fields');
 assert.equal(String(changed.version).split(':').length,5);
 return observed.version;
}
async function setup(options={}){
 const base=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'content-'));
 const cwd=join(base,'工作区'),backup=join(base,'backups');await mkdir(cwd);await mkdir(backup);
 const ctx=new Context();
 try{
  await ctx.plugin(await import(pathToFileURL(join(root,'bundle/lib/recovery-authority.js'))),{controlRoot:join(base,'control')});
  const project=await ctx.recoveryHost.registerProject({id:'synthetic',root:cwd});
  const provider=(await import(pathToFileURL(join(root,'bundle/lib/file-protection.js')))).default;
  const config={cwd,projectId:project.id,observationMaxEntries:options.observationMaxEntries??16,recovery:{root:backup,maxFileBytes:options.maxFileBytes??65536,maxTotalBytes:16*1024*1024,maxEntries:128,retentionMs:86400000}};
  const fiber=ctx.plugin(provider,config);await fiber;
  const path=join(cwd,'内容.txt');await writeFile(path,options.content??'original');const target=await ctx.fs.resolve('内容.txt');
  return {ctx,base,cwd,backup,project,config,fiber,path,target};
 }catch(error){await ctx.fiber.dispose();throw error;}
}

// Without a successful full-body read, a metadata stat must not authorize a
// guarded overwrite. Otherwise the blind spot remains exploitable.
test('metadata-only observation cannot authorize a guarded overwrite',async()=>{
 const f=await setup();try{
  const info=await f.ctx.fs.stat(f.target);
  await assert.rejects(f.ctx.fs.writeText(f.target,'changed',{kind:'replaceIfVersion',version:info.version}),{code:'FS_NOT_OBSERVED'});
  assert.equal(await readFile(f.path,'utf8'),'original');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('equal native metadata cannot hide a body change from guarded overwrite',async()=>{
 const f=await setup();try{
  const info=await f.ctx.fs.stat(f.target);assert.equal(await f.ctx.fs.readText(f.target),'original');
  await sameMetadataChange(f,f.target,f.path,'external');
  await assert.rejects(f.ctx.fs.writeText(f.target,'wrong',{kind:'replaceIfVersion',version:info.version}),{code:'FS_STALE_CONTENT'});
  assert.equal(await readFile(f.path,'utf8'),'external');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('equal native metadata cannot hide a body change from guarded edit',async()=>{
 const f=await setup();try{
  const info=await f.ctx.fs.stat(f.target);await f.ctx.fs.readText(f.target);
  await sameMetadataChange(f,f.target,f.path,'external');
  await assert.rejects(f.ctx.fs.editText(f.target,{oldString:'external',newString:'wrong',replaceAll:false},{version:info.version}),{code:'FS_STALE_CONTENT'});
  assert.equal(await readFile(f.path,'utf8'),'external');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});

test('successful full read enables guarded CRLF edit and exact restoration',async()=>{
 const f=await setup({content:'old\r\nnext\r\n'});try{
  const info=await f.ctx.fs.stat(f.target);assert.equal(await f.ctx.fs.readText(f.target),'old\r\nnext\r\n');
  const result=await f.ctx.fs.editText(f.target,{oldString:'old',newString:'new',replaceAll:false},{version:info.version});
  assert.equal(await readFile(f.path,'utf8'),'new\r\nnext\r\n');assert.equal(String(result.version).split(':').length,5);
  await f.ctx.fs.restoreMutation(result.mutationId);assert.equal(await readFile(f.path,'utf8'),'old\r\nnext\r\n');
 }finally{await f.ctx.fiber.dispose();}
});
test('successful bounded byte read authorizes guarded overwrite',async()=>{
 const f=await setup();try{
  const info=await f.ctx.fs.stat(f.target);assert.deepEqual(await f.ctx.fs.readBytes(f.target,undefined,8),Buffer.from('original'));
  await f.ctx.fs.writeText(f.target,'new',{kind:'replaceIfVersion',version:info.version});assert.equal(await readFile(f.path,'utf8'),'new');
 }finally{await f.ctx.fiber.dispose();}
});
test('complete stream consumption authorizes a guarded overwrite',async()=>{
 const f=await setup();try{
  const info=await f.ctx.fs.stat(f.target);let text='';for await(const chunk of await f.ctx.fs.streamText(f.target))text+=chunk;
  assert.equal(text,'original');await f.ctx.fs.writeText(f.target,'new',{kind:'replaceIfVersion',version:info.version});assert.equal(await readFile(f.path,'utf8'),'new');
 }finally{await f.ctx.fiber.dispose();}
});
test('early stream termination does not mint a full-body observation',async()=>{
 const f=await setup();try{
  const info=await f.ctx.fs.stat(f.target);for await(const chunk of await f.ctx.fs.streamText(f.target)){assert.equal(chunk,'original');break;}
  await assert.rejects(f.ctx.fs.writeText(f.target,'bad',{kind:'replaceIfVersion',version:info.version}),{code:'FS_NOT_OBSERVED'});assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('partial byte range and stat do not mint a full-body observation',async()=>{
 const f=await setup();try{
  const info=await f.ctx.fs.stat(f.target);await f.ctx.fs.readByteRange(f.target,{offset:0,length:2});
  await assert.rejects(f.ctx.fs.writeText(f.target,'bad',{kind:'replaceIfVersion',version:info.version}),{code:'FS_NOT_OBSERVED'});assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('same-version different-body reread remains ambiguous for old or new callers',async()=>{
 const f=await setup();try{
  const info=await f.ctx.fs.stat(f.target);await f.ctx.fs.readText(f.target);await sameMetadataChange(f,f.target,f.path,'external');assert.equal(await f.ctx.fs.readText(f.target),'external');
  await assert.rejects(f.ctx.fs.writeText(f.target,'bad',{kind:'replaceIfVersion',version:info.version}),{code:'FS_OBSERVATION_AMBIGUOUS'});
  await sameMetadataChange(f,f.target,f.path,'original');await f.ctx.fs.readText(f.target);
  await assert.rejects(f.ctx.fs.writeText(f.target,'bad',{kind:'replaceIfVersion',version:info.version}),{code:'FS_OBSERVATION_AMBIGUOUS'});assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
for(const method of ['moveFile','removeFile'])test(`same metadata content guard protects ${method}`,async()=>{
 const f=await setup();try{
  const info=await f.ctx.fs.stat(f.target);await f.ctx.fs.readText(f.target);await sameMetadataChange(f,f.target,f.path,'external');
  const destination=await f.ctx.fs.resolve('moved.txt');const args=method==='moveFile'?[f.target,destination,{version:info.version}]:[f.target,{version:info.version}];
  await assert.rejects(f.ctx.fs[method](...args),{code:'FS_STALE_CONTENT'});assert.equal(await readFile(f.path,'utf8'),'external');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('content is checked after admission waits, before any preimage record',async()=>{
 const f=await setup();let release,waiting,write;try{
  const info=await f.ctx.fs.stat(f.target);await f.ctx.fs.readText(f.target);let entered;const started=new Promise(resolve=>{entered=resolve;});
  waiting=f.ctx.recoveryHost.withProject(f.project.id,()=>{entered();return new Promise(resolve=>{release=resolve;});});await started;
  write=f.ctx.fs.writeText(f.target,'bad',{kind:'replaceIfVersion',version:info.version});const checked=assert.rejects(write,{code:'FS_STALE_CONTENT'});
  await sameMetadataChange(f,f.target,f.path,'external');release();await waiting;await checked;assert.equal(await readFile(f.path,'utf8'),'external');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{release?.();await waiting?.catch(()=>{});await write?.catch(()=>{});await f.ctx.fiber.dispose();}
});
test('content read and write preflight hold actual file and ancestor ownership',async()=>{
 const f=await setup();try{
  let attempts=0;f.ctx.fs.internals.inspectReadBytesAfterStat=async()=>{attempts++;await assert.rejects(writeFile(f.path,'external'));await assert.rejects(rename(f.cwd,join(f.base,'moved')));};
  const info=await f.ctx.fs.stat(f.target);assert.equal(await f.ctx.fs.readText(f.target),'original');
  await f.ctx.fs.writeText(f.target,'new',{kind:'replaceIfVersion',version:info.version});assert.equal(attempts,2);assert.equal(await readFile(f.path,'utf8'),'new');
 }finally{await f.ctx.fiber.dispose();}
});
test('invalid UTF-8 read cannot authorize guarded overwrite',async()=>{
 const f=await setup();try{
  await writeFile(f.path,Buffer.from([0xff,0xfe]));const info=await f.ctx.fs.stat(f.target);await assert.rejects(f.ctx.fs.readText(f.target),{code:'FS_NOT_TEXT'});
  await assert.rejects(f.ctx.fs.writeText(f.target,'bad',{kind:'replaceIfVersion',version:info.version}),{code:'FS_NOT_OBSERVED'});assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('failed capped or pre-aborted reads cannot authorize guarded overwrite',async()=>{
 const f=await setup();try{
  const info=await f.ctx.fs.stat(f.target);await assert.rejects(f.ctx.fs.readBytes(f.target,undefined,7),{code:'FS_TOO_LARGE'});
  const controller=new AbortController();controller.abort();await assert.rejects(f.ctx.fs.readText(f.target,controller.signal),{code:'FS_ABORTED'});
  await assert.rejects(f.ctx.fs.writeText(f.target,'bad',{kind:'replaceIfVersion',version:info.version}),{code:'FS_NOT_OBSERVED'});assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('bounded observation capacity refuses new observations without losing earlier protection',async()=>{
 const f=await setup({observationMaxEntries:1});try{
  const info=await f.ctx.fs.stat(f.target);await f.ctx.fs.readText(f.target);
  const next=await f.ctx.fs.resolve('next.txt');await writeFile(join(f.cwd,'next.txt'),'next');const nextInfo=await f.ctx.fs.stat(next);
  await assert.rejects(f.ctx.fs.readText(next),{code:'FS_OBSERVATION_LIMIT'});
  await assert.rejects(f.ctx.fs.writeText(next,'bad',{kind:'replaceIfVersion',version:nextInfo.version}),{code:'FS_NOT_OBSERVED'});
  await sameMetadataChange(f,f.target,f.path,'external');await assert.rejects(f.ctx.fs.writeText(f.target,'bad',{kind:'replaceIfVersion',version:info.version}),{code:'FS_STALE_CONTENT'});assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('provider reload requires a new observation and old read references are closed',async()=>{
 const f=await setup();try{
  const old=f.ctx.fs,info=await old.stat(f.target);await old.readText(f.target);await f.fiber.dispose();await assert.rejects(old.readText(f.target),{code:'RECOVERY_UNAVAILABLE'});
  const Provider=(await import(pathToFileURL(join(root,'bundle/lib/file-protection.js')))).default;await f.ctx.plugin(Provider,f.config);
  await assert.rejects(f.ctx.fs.writeText(f.target,'bad',{kind:'replaceIfVersion',version:info.version}),{code:'FS_NOT_OBSERVED'});
  await f.ctx.fs.readText(f.target);await f.ctx.fs.writeText(f.target,'new',{kind:'replaceIfVersion',version:info.version});assert.equal(await readFile(f.path,'utf8'),'new');
 }finally{await f.ctx.fiber.dispose();}
});
test('explicit unguarded mutation remains recoverable without inventing an observation',async()=>{
 const f=await setup();try{
  const result=await f.ctx.fs.writeText(f.target,'new');assert.equal(await readFile(f.path,'utf8'),'new');await f.ctx.fs.restoreMutation(result.mutationId);assert.equal(await readFile(f.path,'utf8'),'original');
 }finally{await f.ctx.fiber.dispose();}
});
test('protected full reads enforce the configured file-size bound',async()=>{
 const f=await setup({maxFileBytes:7});try{
  await assert.rejects(f.ctx.fs.readText(f.target),{code:'FS_TOO_LARGE'});
  await assert.rejects(f.ctx.fs.readBytes(f.target,undefined,8),{code:'FS_TOO_LARGE'});
  await assert.rejects((async()=>{for await(const _ of await f.ctx.fs.streamText(f.target)){} })(),{code:'FS_TOO_LARGE'});
  await writeFile(f.path,'short');assert.equal(await f.ctx.fs.readText(f.target),'short');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('binary byte observation preserves exact raw preimage in guarded text replacement',async()=>{
 const f=await setup();try{
  const bytes=Buffer.from([0,0xff,3]);await writeFile(f.path,bytes);const info=await f.ctx.fs.stat(f.target);assert.deepEqual(await f.ctx.fs.readBytes(f.target,undefined,3),bytes);
  const result=await f.ctx.fs.writeText(f.target,'new',{kind:'replaceIfVersion',version:info.version});assert.deepEqual(await readFile(join(f.backup,result.mutationId,'before.bin')),bytes);
 }finally{await f.ctx.fiber.dispose();}
});
test('provider disposal drains an admitted bounded read and releases native handles',async()=>{
 const f=await setup();let release,reading,disposing;try{
  const service=f.ctx.fs;let entered;const started=new Promise(resolve=>{entered=resolve;});service.internals.inspectReadBytesAfterStat=()=>{entered();return new Promise(resolve=>{release=resolve;});};
  reading=service.readText(f.target);await started;let done=false;disposing=f.fiber.dispose().then(()=>{done=true;});await yieldToLoop();assert.equal(done,false);
  await assert.rejects(service.readText(f.target),{code:'RECOVERY_UNAVAILABLE'});release();assert.equal(await reading,'original');await disposing;
  await writeFile(f.path,'external');assert.equal(await readFile(f.path,'utf8'),'external');
 }finally{release?.();await reading?.catch(()=>{});await disposing?.catch(()=>{});await f.ctx.fiber.dispose();}
});
test('failed owned read releases native handles and cannot leave a forged observation',async()=>{
 const f=await setup();try{
  const info=await f.ctx.fs.stat(f.target);f.ctx.fs.internals.inspectReadBytesAfterStat=()=>{throw new Error('synthetic-read-failure');};
  await assert.rejects(f.ctx.fs.readText(f.target),/synthetic-read-failure/);delete f.ctx.fs.internals.inspectReadBytesAfterStat;
  await writeFile(f.path,'original');await assert.rejects(f.ctx.fs.writeText(f.target,'bad',{kind:'replaceIfVersion',version:(await f.ctx.fs.stat(f.target)).version}),{code:'FS_NOT_OBSERVED'});assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
