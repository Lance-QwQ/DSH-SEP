import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,realpath,readdir,rename,link} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {setImmediate as yieldToLoop} from 'node:timers/promises';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
async function setup(overrides={}){
 const base=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'protected-'));
 const cwd=join(base,'工作区'),backup=join(base,'private-backups');await mkdir(cwd);await mkdir(backup);
 const ctx=new Context();
 try{
  let authority,provider;
  try{authority=await import(pathToFileURL(join(root,'bundle/lib/recovery-authority.js')));provider=(await import(pathToFileURL(join(root,'bundle/lib/file-protection.js')))).default;}
  catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('SEP_PROTECTED_FILESYSTEM_MISSING');throw error;}
  await ctx.plugin(authority,{controlRoot:join(base,'control')});
  const project=await ctx.recoveryHost.registerProject({id:'synthetic',root:cwd});
  const config={cwd,projectId:project.id,recovery:{root:backup,maxFileBytes:65536,maxTotalBytes:16*1024*1024,maxEntries:128,retentionMs:86400000,...overrides}};
  const fsFiber=ctx.plugin(provider,config);await fsFiber;
  return {ctx,base,cwd,backup,config,project,fsFiber};
 }catch(error){await ctx.fiber.dispose();throw error;}
}
// Removing durable preparation or bypassing the owned file provider loses the
// actual preimage or lets restoration overwrite an unrelated mutation.
test('owned provider durably protects a real write and restores its exact preimage',async()=>{
 const f=await setup();
 try{
  const path=join(f.cwd,'中文.txt');await writeFile(path,'before\r\n');
  const target=await f.ctx.fs.resolve('中文.txt');const observed=await f.ctx.fs.stat(target);await f.ctx.fs.readText(target);
  const result=await f.ctx.fs.writeText(target,'after\r\n',{kind:'replaceIfVersion',version:observed.version});
  assert.equal(await readFile(path,'utf8'),'after\r\n');assert.equal(typeof result.mutationId,'string');
  assert.equal(await readFile(join(f.backup,result.mutationId,'before.bin'),'utf8'),'before\r\n');
  const operations=await f.ctx.fs.listMutations();assert.equal(operations.length,1);assert.equal(operations[0].state,'committed');
  await f.ctx.fs.restoreMutation(result.mutationId);
  assert.equal(await readFile(path,'utf8'),'before\r\n');assert.equal((await f.ctx.fs.listMutations()).find(row=>row.mutationId===result.mutationId).state,'restored');
 }finally{await f.ctx.fiber.dispose();}
});

test('stale writes and unmatched edits retain original bytes without accumulating backups',async()=>{
 const f=await setup();try{
  const path=join(f.cwd,'a.txt');await writeFile(path,'original');const target=await f.ctx.fs.resolve('a.txt');const old=await f.ctx.fs.stat(target);
  await writeFile(path,'external correction');
  assert.notEqual((await f.ctx.fs.stat(target)).version,old.version,'the stale-guard fixture must establish a changed version');
  await assert.rejects(f.ctx.fs.writeText(target,'bad',{kind:'replaceIfVersion',version:old.version}),{code:'FS_STALE_VERSION'});
  await assert.rejects(f.ctx.fs.editText(target,{oldString:'missing',newString:'bad',replaceAll:false}));
  assert.equal(await readFile(path,'utf8'),'external correction');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('create-if-absent refuses an existing file before creating a private preimage',async()=>{
 const f=await setup();try{
  const path=join(f.cwd,'exists.txt');await writeFile(path,'keep');const target=await f.ctx.fs.resolve('exists.txt');
  await assert.rejects(f.ctx.fs.writeText(target,'bad',{kind:'createIfAbsent'}),{code:'FS_NOT_OBSERVED'});
  assert.equal(await readFile(path,'utf8'),'keep');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('protected mutations refuse hard links and preserve both link names',async()=>{
 const f=await setup();try{
  const first=join(f.cwd,'one.txt'),second=join(f.cwd,'two.txt');await writeFile(first,'keep');await link(first,second);
  const target=await f.ctx.fs.resolve('one.txt');await assert.rejects(f.ctx.fs.writeText(target,'bad'),{code:'FS_UNSAFE_TARGET'});
  assert.equal(await readFile(first,'utf8'),'keep');assert.equal(await readFile(second,'utf8'),'keep');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('read-only policy refuses writes and broader native policy cannot escape the registered project',async()=>{
 const f=await setup();try{
  const target=await f.ctx.fs.resolve('new.txt');await assert.rejects(f.ctx.fs.writeText(target,'bad',undefined,undefined,{mode:'read-only',workspaceRoot:f.cwd}),{code:'FS_SANDBOX_DENIED'});
  const outside=join(f.base,'outside.txt');await writeFile(outside,'keep');const other=await f.ctx.fs.resolve(outside);
  await assert.rejects(f.ctx.fs.writeText(other,'bad',undefined,undefined,{mode:'danger-full-access',workspaceRoot:f.cwd}),{code:'FS_SANDBOX_DENIED'});
  assert.equal(await readFile(outside,'utf8'),'keep');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('per-call workspace substitution is refused without mutating registered files',async()=>{
 const f=await setup();try{
  const target=await f.ctx.fs.resolve('new.txt');await assert.rejects(f.ctx.fs.writeText(target,'bad',undefined,undefined,{mode:'workspace-write',workspaceRoot:f.base}),{code:'RECOVERY_STALE_CONTEXT'});
  assert.deepEqual(await readdir(f.cwd),[]);assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('maintenance closes after already admitted write and refuses the later queued write',async()=>{
 const f=await setup();try{
  const first=await f.ctx.fs.resolve('first.txt'),second=await f.ctx.fs.resolve('second.txt');
  const accepted=f.ctx.fs.writeText(first,'accepted');const maintenance=f.ctx.recoveryHost.beginMaintenance({id:'synthetic-maintenance'});const refused=f.ctx.fs.writeText(second,'bad');
  const results=await Promise.allSettled([accepted,maintenance,refused]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'fulfilled');assert.equal(results[2].status,'rejected');assert.equal(results[2].reason.code,'RECOVERY_MAINTENANCE_CLOSED');
  assert.equal(await readFile(join(f.cwd,'first.txt'),'utf8'),'accepted');assert.deepEqual(await readdir(f.cwd),['first.txt']);
 }finally{await f.ctx.fiber.dispose();}
});
test('a missing moved workspace is paused and is not silently registered under its new path',async()=>{
 const f=await setup();try{
  const target=await f.ctx.fs.resolve('new.txt');const moved=join(f.base,'moved-workspace');await rename(f.cwd,moved);
  await assert.rejects(f.ctx.fs.writeText(target,'bad'),{code:'RECOVERY_PROJECT_PAUSED'});
  await assert.rejects(f.ctx.recoveryHost.projectForPath({cwd:moved}),{code:'RECOVERY_PROJECT_UNKNOWN'});
  assert.deepEqual(await readdir(moved),[]);assert.equal((await f.ctx.recoveryHost.listProjects()).length,1);
 }finally{await f.ctx.fiber.dispose();}
});
test('explicit project rebind retains memory identity and rejects the old provider context',async()=>{
 const f=await setup();try{
  const target=await f.ctx.fs.resolve('new.txt'),next=join(f.base,'new-workspace');await mkdir(next);
  const plan=await f.ctx.recoveryHost.planRebind({projectId:f.project.id,newRoot:next});
  const rebound=await f.ctx.recoveryHost.commitRebind({planId:plan.planId,confirmationHash:plan.confirmationHash});
  assert.equal(rebound.memoryKey,f.project.memoryKey);assert.equal(rebound.generation,f.project.generation+1);
  await assert.rejects(f.ctx.fs.writeText(target,'bad'),{code:'RECOVERY_STALE_CONTEXT'});assert.deepEqual(await readdir(f.cwd),[]);assert.deepEqual(await readdir(next),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('backup entry quota blocks subsequent writes while preserving the retained preimage',async()=>{
 const f=await setup({maxEntries:1});try{
  const path=join(f.cwd,'a.txt');await writeFile(path,'original');const target=await f.ctx.fs.resolve('a.txt');const first=await f.ctx.fs.writeText(target,'first');
  await assert.rejects(f.ctx.fs.writeText(target,'second'),{code:'FS_BACKUP_LIMIT'});assert.equal(await readFile(path,'utf8'),'first');
  assert.equal(await readFile(join(f.backup,first.mutationId,'before.bin'),'utf8'),'original');assert.equal((await f.ctx.fs.listMutations()).length,1);
 }finally{await f.ctx.fiber.dispose();}
});
test('restoration refuses newer external changes without overwriting them or growing the journal',async()=>{
 const f=await setup();try{
  const path=join(f.cwd,'a.txt');await writeFile(path,'original');const target=await f.ctx.fs.resolve('a.txt');const first=await f.ctx.fs.writeText(target,'changed');await writeFile(path,'external correction');
  await assert.rejects(f.ctx.fs.restoreMutation(first.mutationId),{code:'FS_RECOVERY_CONFLICT'});assert.equal(await readFile(path,'utf8'),'external correction');assert.equal((await f.ctx.fs.listMutations()).length,1);
 }finally{await f.ctx.fiber.dispose();}
});
test('restoration refuses a corrupted private preimage and preserves current data',async()=>{
 const f=await setup();try{
  const path=join(f.cwd,'a.txt');await writeFile(path,'original');const target=await f.ctx.fs.resolve('a.txt');const first=await f.ctx.fs.writeText(target,'changed');await writeFile(join(f.backup,first.mutationId,'before.bin'),'tampered');
  await assert.rejects(f.ctx.fs.restoreMutation(first.mutationId),{code:'FS_RECOVERY_CONFLICT'});assert.equal(await readFile(path,'utf8'),'changed');assert.equal((await f.ctx.fs.listMutations()).length,1);
 }finally{await f.ctx.fiber.dispose();}
});
test('managed move and deletion are independently recoverable',async()=>{
 const f=await setup();try{
  const source=join(f.cwd,'中文.txt');await writeFile(source,'move me');const from=await f.ctx.fs.resolve('中文.txt'),to=await f.ctx.fs.resolve('new.txt');
  const moved=await f.ctx.fs.moveFile(from,to);assert.deepEqual(await readdir(f.cwd),['new.txt']);await f.ctx.fs.restoreMutation(moved.mutationId);assert.deepEqual(await readdir(f.cwd),['中文.txt']);
  const deleted=await f.ctx.fs.removeFile(from);assert.deepEqual(await readdir(f.cwd),[]);await f.ctx.fs.restoreMutation(deleted.mutationId);assert.equal(await readFile(source,'utf8'),'move me');
 }finally{await f.ctx.fiber.dispose();}
});
test('project authority and mutation records survive provider restart without resetting identity',async()=>{
 const f=await setup();let reopened;
 try{
  const path=join(f.cwd,'a.txt');await writeFile(path,'original');const target=await f.ctx.fs.resolve('a.txt');const first=await f.ctx.fs.writeText(target,'changed');await f.ctx.fiber.dispose();
  reopened=new Context();await reopened.plugin(await import(pathToFileURL(join(root,'bundle/lib/recovery-authority.js'))),{controlRoot:join(f.base,'control')});
  const project=await reopened.recoveryHost.projectById({id:f.project.id});assert.equal(project.memoryKey,f.project.memoryKey);assert.deepEqual(project.identity,f.project.identity);assert.equal(project.generation,1);
  await reopened.plugin((await import(pathToFileURL(join(root,'bundle/lib/file-protection.js')))).default,f.config);assert.equal((await reopened.fs.listMutations()).length,1);
  await reopened.fs.restoreMutation(first.mutationId);assert.equal(await readFile(path,'utf8'),'original');
 }finally{await f.ctx.fiber.dispose();await reopened?.fiber.dispose();}
});
test('unknown projects and disposed authorities refuse admission instead of fabricating a project',async()=>{
 const f=await setup();try{
  const service=f.ctx.recoveryHost;const outside=join(f.base,'unregistered');await mkdir(outside);
  await assert.rejects(service.projectForPath({cwd:outside}),{code:'RECOVERY_PROJECT_UNKNOWN'});assert.equal((await service.listProjects()).length,1);
  await f.ctx.fiber.dispose();await assert.rejects(service.projectById({id:f.project.id}),{code:'RECOVERY_UNAVAILABLE'});
 }finally{await f.ctx.fiber.dispose();}
});
test('aborted standard write retains existing bytes and produces no preimage',async()=>{
 const f=await setup();try{
  const path=join(f.cwd,'a.txt');await writeFile(path,'original');const target=await f.ctx.fs.resolve('a.txt');const abort=new AbortController();abort.abort(new Error('cancelled'));
  await assert.rejects(f.ctx.fs.writeText(target,'bad',undefined,abort.signal));assert.equal(await readFile(path,'utf8'),'original');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('every managed mutator respects maintenance including removeFile and restoreMutation',async()=>{
 const f=await setup();try{
  const path=join(f.cwd,'a.txt');await writeFile(path,'before');const target=await f.ctx.fs.resolve('a.txt'),other=await f.ctx.fs.resolve('moved.txt');const original=await f.ctx.fs.writeText(target,'current');
  await f.ctx.recoveryHost.beginMaintenance({id:'maintenance-all'});
  for(const work of [()=>f.ctx.fs.editText(target,{oldString:'current',newString:'bad',replaceAll:false}),()=>f.ctx.fs.moveFile(target,other),()=>f.ctx.fs.removeFile(target),()=>f.ctx.fs.restoreMutation(original.mutationId)])await assert.rejects(work(),{code:'RECOVERY_MAINTENANCE_CLOSED'});
  assert.equal(await readFile(path,'utf8'),'current');assert.equal((await f.ctx.fs.listMutations()).length,1);
 }finally{await f.ctx.fiber.dispose();}
});
test('actual Windows file and ancestor handles prevent relocation during publication',async()=>{
 const f=await setup();try{
  const path=join(f.cwd,'a.txt');await writeFile(path,'before');const target=await f.ctx.fs.resolve('a.txt');let inspected=false;
  f.ctx.fs.internals.inspectTemp=async()=>{
   inspected=true;await assert.rejects(rename(path,join(f.cwd,'stolen.txt')),error=>['EPERM','EBUSY','EACCES'].includes(error.code));
   await assert.rejects(rename(f.cwd,join(f.base,'moved')),error=>['EPERM','EBUSY','EACCES'].includes(error.code));
  };
  const result=await f.ctx.fs.writeText(target,'after');assert.equal(inspected,true);assert.equal(await readFile(path,'utf8'),'after');assert.equal(await readFile(join(f.backup,result.mutationId,'before.bin'),'utf8'),'before');
 }finally{await f.ctx.fiber.dispose();}
});
test('interrupted staging keeps original bytes and an inspectable durable prepared record',async()=>{
 const f=await setup();try{
  const path=join(f.cwd,'a.txt');await writeFile(path,'before');const target=await f.ctx.fs.resolve('a.txt');
  f.ctx.fs.internals.inspectTemp=()=>{throw new Error('synthetic-staging-interruption');};
  await assert.rejects(f.ctx.fs.writeText(target,'after'),/synthetic-staging-interruption/);
  assert.equal(await readFile(path,'utf8'),'before');const operations=await f.ctx.fs.listMutations();assert.equal(operations.length,1);assert.equal(operations[0].state,'prepared');
  assert.equal(await readFile(join(f.backup,operations[0].mutationId,'before.bin'),'utf8'),'before');
  await assert.rejects(f.ctx.fs.restoreMutation(operations[0].mutationId),{code:'FS_RECOVERY_CONFLICT'});
 }finally{await f.ctx.fiber.dispose();}
});
test('a second controller owner cannot take over a live authority and can acquire after close',async()=>{
 const f=await setup();let other=new Context();try{
  const module=await import(pathToFileURL(join(root,'bundle/lib/recovery-authority.js'))),journal=join(f.base,'control/journal.jsonl');const before=await readFile(journal);
  await assert.rejects(async()=>await other.plugin(module,{controlRoot:join(f.base,'control')}),error=>error.code==='OWNER_LOCKED'||error.message.includes('OWNER_LOCKED'));
  assert.deepEqual(await readFile(journal),before);await other.fiber.dispose();await f.ctx.fiber.dispose();other=new Context();
  await other.plugin(module,{controlRoot:join(f.base,'control')});assert.equal((await other.recoveryHost.projectById({id:f.project.id})).memoryKey,f.project.memoryKey);
 }finally{await f.ctx.fiber.dispose();await other.fiber.dispose();}
});
test('a new Node process reads retained authority and restores a durable mutation',async()=>{
 const f=await setup();try{
  const path=join(f.cwd,'a.txt');await writeFile(path,'before');const result=await f.ctx.fs.writeText(await f.ctx.fs.resolve('a.txt'),'after');await f.ctx.fiber.dispose();
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('./fixtures/file-protection-child.mjs',import.meta.url)),join(f.base,'control'),f.cwd,f.backup,f.project.id,result.mutationId],{env:process.env,encoding:'utf8',timeout:20000,windowsHide:true});
  assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);const receipt=JSON.parse(child.stdout.trim());assert.equal(receipt.operations,1);assert.equal(receipt.memoryKey,f.project.memoryKey);assert.equal(receipt.generation,1);assert.equal(receipt.restored,true);assert.equal(await readFile(path,'utf8'),'before');
 }finally{await f.ctx.fiber.dispose();}
});
test('the shipped SEP memory binding consumes the same real local project authority',async()=>{
 const f=await setup();try{
  const {recoveryBinding}=await import(pathToFileURL(join(root,'bundle/modules/system-enhancement-package/src/recovery-binding.js')));const binding=recoveryBinding(f.ctx.recoveryHost);
  const project={recoveryProjectId:f.project.id,key:f.project.memoryKey,recoveryGeneration:1,root:f.cwd};assert.equal((await binding.assert(project)).id,f.project.id);
  const next=join(f.base,'next');await mkdir(next);const plan=await f.ctx.recoveryHost.planRebind({projectId:f.project.id,newRoot:next});await f.ctx.recoveryHost.commitRebind({planId:plan.planId,confirmationHash:plan.confirmationHash});
  await assert.rejects(binding.assert(project),{code:'RECOVERY_STALE_CONTEXT'});
 }finally{await f.ctx.fiber.dispose();}
});
test('unloading only the protected provider closes borrowed mutation references',async()=>{
 const f=await setup();try{
  const service=f.ctx.fs,target=await service.resolve('late.txt');await f.fsFiber.dispose();
  await assert.rejects(service.writeText(target,'bad'),{code:'RECOVERY_UNAVAILABLE'});assert.deepEqual(await readdir(f.cwd),[]);
 }finally{await f.ctx.fiber.dispose();}
});
test('provider disposal awaits an admitted publication and refuses new calls during draining',async()=>{
 const f=await setup();let release,write,disposing;
 try{
  const service=f.ctx.fs,target=await service.resolve('accepted.txt');let entered;
  const started=new Promise(resolve=>{entered=resolve;});service.internals.inspectTemp=()=>{entered();return new Promise(resolve=>{release=resolve;});};
  write=service.writeText(target,'accepted');await started;let done=false;disposing=f.fsFiber.dispose().then(()=>{done=true;});await yieldToLoop();
  assert.equal(done,false,'provider returned disposal before the owned publication finished');
  await assert.rejects(service.writeText(target,'late'),{code:'RECOVERY_UNAVAILABLE'});release();await write;await disposing;assert.equal(await readFile(join(f.cwd,'accepted.txt'),'utf8'),'accepted');
 }finally{release?.();await write?.catch(()=>{});await disposing?.catch(()=>{});await f.ctx.fiber.dispose();}
});
test('both original and candidate size limits reject before persisting a preimage',async()=>{
 const f=await setup({maxFileBytes:8});try{
  const target=await f.ctx.fs.resolve('too-large.txt');await assert.rejects(f.ctx.fs.writeText(target,'123456789'),{code:'FS_BACKUP_LIMIT'});
  await writeFile(join(f.cwd,'too-large.txt'),'123456789');await assert.rejects(f.ctx.fs.writeText(target,'small'),{code:'FS_BACKUP_LIMIT'});
  assert.equal(await readFile(join(f.cwd,'too-large.txt'),'utf8'),'123456789');assert.deepEqual(await f.ctx.fs.listMutations(),[]);
 }finally{await f.ctx.fiber.dispose();}
});
