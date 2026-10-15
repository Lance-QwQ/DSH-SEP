import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,realpath,readFile,writeFile,readdir,rename,appendFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const load=name=>import(pathToFileURL(require.resolve(name)));
const {Context}=await load('@deepseek-ai/cordis');
const {SessionStore,SessionId}=await load('@deepseek-ai/dsh-session');
const {foldTasks}=await import(pathToFileURL(join(root,'bundle/modules/task-checkpoint/lib/fold.js')));
async function provider(){
  try{return (await import(pathToFileURL(join(root,'bundle/lib/session-persistence.js')))).default;}
  catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('SEP_LIVE_PERSISTENCE_MISSING');throw error;}
}
async function openContext(dir,compression='none'){
  const ctx=new Context();
  try{await ctx.plugin(SessionStore);await ctx.plugin(await provider(),{root:dir,compression});return ctx;}
  catch(error){await ctx.fiber.dispose();throw error;}
}
const fixture=()=>mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'live-'));
const taskId='00000000-0000-4000-8000-000000000001';
function change(id){return {schema:1,taskId,revision:1,sessionId:id,agentId:id,project:'synthetic-project',action:'create',objective:'Retain task after restart',steps:[{id:'write',description:'Write synthetic file',acceptance:'Hash matches',artifacts:[{path:'out.txt',sha256:'a'.repeat(64)}]}]};}

// Removing the SEP catalogue binding must make a real native writer's
// task/checkpoint-change unreadable after the provider is unloaded.
test('native Session writer durably retains a required SEP task across provider restart',async()=>{
  const dir=await fixture();let ctx=await openContext(dir);
  try{
    const session=ctx.sessions.create(SessionId('live-task'),{meta:{cwd:dir,delegationDepth:0}});
    // The actual Agent factory explicitly acquires the writer; merely
    // publishing a Session does not create a persistence handle.
    const writer=await ctx.sessionPersistence.create(session.header);
    session.append('task/checkpoint-change',change('live-task'));
    assert.equal(await ctx.sessions.flush(session),true);
    await writer.close();
    await ctx.fiber.dispose();ctx=await openContext(dir);
    const handle=await ctx.sessionPersistence.open(SessionId('live-task'),'read');
    try{
      const result=await handle.read();assert.equal(result.events.length,1);
      assert.equal(result.events[0].type,'task/checkpoint-change');
      assert.equal(Object.hasOwn(result.events[0],'ignorable'),false);
      assert.equal(foldTasks(result.events).get(taskId).objective,'Retain task after restart');
    }finally{await handle.close();}
  }finally{await ctx.fiber.dispose();}
});

async function logs(dir){
  const result=[];
  for(const item of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,item.name);
    if(item.isDirectory())result.push(...await logs(path));
    else if(item.isFile()&&/session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/.test(item.name))result.push(path);
  }
  return result;
}
async function stored(ctx,dir,id='parent'){
  const session=ctx.sessions.create(SessionId(id),{meta:{cwd:dir,delegationDepth:0}});
  const writer=await ctx.sessionPersistence.create(session.header);
  session.append('task/checkpoint-change',change(id));
  await ctx.sessions.flush(session);await writer.close();return session;
}
function taskEvent(id,seq=0){return {type:'task/checkpoint-change',seq,time:1,data:change(id)};}

test('malformed task and revision-gap appends refuse before changing durable bytes',async()=>{
  const dir=await fixture(),ctx=await openContext(dir);
  try{
    await stored(ctx,dir,'validated');const file=(await logs(dir))[0],before=await readFile(file);
    const writer=await ctx.sessionPersistence.open(SessionId('validated'),'write');
    try{
      await assert.rejects(writer.append([{type:'task/checkpoint-change',seq:1,time:2,data:{schema:1,taskId,revision:3,sessionId:'validated',agentId:'validated',project:'synthetic-project',action:'cancel'}}]));
      assert.deepEqual(await readFile(file),before);
      await assert.rejects(writer.append([{...taskEvent('validated',1),data:{...change('validated'),revision:2,action:'cancel',privateExtra:'synthetic'}}]));
      assert.deepEqual(await readFile(file),before);
      const valid={type:'task/checkpoint-change',seq:1,time:2,data:{schema:1,taskId,revision:2,sessionId:'validated',agentId:'validated',project:'synthetic-project',action:'cancel'}};
      await writer.append([valid]);const result=await writer.read();assert.equal(foldTasks(result.events).get(taskId).cancelled,true);
    }finally{await writer.close();}
  }finally{await ctx.fiber.dispose();}
});

test('task owned by another session refuses before first materialization',async()=>{
  const dir=await fixture(),ctx=await openContext(dir);
  try{
    const session=ctx.sessions.create(SessionId('local-owner'),{meta:{cwd:dir,delegationDepth:0}});
    const writer=await ctx.sessionPersistence.create(session.header);
    try{await assert.rejects(writer.append([taskEvent('foreign-owner')]));assert.deepEqual(await logs(dir),[]);}
    finally{await writer.close();}
  }finally{await ctx.fiber.dispose();}
});

test('a native fork preserves parent tasks and owns only its new task after cold read',async()=>{
  const dir=await fixture();let ctx=await openContext(dir);
  try{
    const parent=await stored(ctx,dir);
    const child=ctx.sessions.fork(parent,undefined,SessionId('child'));
    const childTask='00000000-0000-4000-8000-000000000002';
    child.append('task/checkpoint-change',{...change('child'),taskId:childTask});
    const writer=await ctx.sessionPersistence.create(child.header,{inheritedEventCount:child.inheritedEventCount});
    await writer.append(child.snapshotEvents());await writer.close();
    await ctx.fiber.dispose();ctx=await openContext(dir);
    const reader=await ctx.sessionPersistence.open(SessionId('child'),'read');
    try{
      const result=await reader.read(),tasks=foldTasks(result.events);
      assert.equal(reader.header.parentSession,'parent');assert.equal(reader.inheritedEventCount,1);
      assert.equal(tasks.get(taskId).sessionId,'parent');assert.equal(tasks.get(childTask).sessionId,'child');
      assert.equal(result.events[0].data.sessionId,'parent');assert.equal(result.events.at(-1).data.sessionId,'child');
    }finally{await reader.close();}
  }finally{await ctx.fiber.dispose();}
});

test('a forged parent task prefix refuses before publishing the child file',async()=>{
  const dir=await fixture(),ctx=await openContext(dir);
  try{
    const parent=await stored(ctx,dir),parentFile=(await logs(dir))[0],before=await readFile(parentFile);
    const child=ctx.sessions.fork(parent,undefined,SessionId('forged-child'));
    const rows=structuredClone(child.snapshotEvents());rows[0].data.objective='forged prefix';
    const writer=await ctx.sessionPersistence.create(child.header,{inheritedEventCount:child.inheritedEventCount});
    try{await assert.rejects(writer.append(rows));assert.deepEqual(await logs(dir),[parentFile]);assert.deepEqual(await readFile(parentFile),before);}
    finally{await writer.close();}
  }finally{await ctx.fiber.dispose();}
});

test('a separate Node process cold-reads the task and releases its handle',async()=>{
  const dir=await fixture(),ctx=await openContext(dir);
  try{await stored(ctx,dir,'process-restart');}finally{await ctx.fiber.dispose();}
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./fixtures/session-live-child.mjs',import.meta.url)),dir,'process-restart'],{env:process.env,encoding:'utf8',timeout:15000,windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{eventCount:1,taskOwner:'process-restart',required:true,nativeVocabularyChanged:false});
});

test('nested native forks retain each original task owner without rebinding ancestors',async()=>{
  const dir=await fixture();let ctx=await openContext(dir);
  try{
    const parent=await stored(ctx,dir);let source=parent;
    for(const [id,newTask] of [['child','00000000-0000-4000-8000-000000000002'],['grandchild','00000000-0000-4000-8000-000000000003']]){
      const child=ctx.sessions.fork(source,undefined,SessionId(id));
      child.append('task/checkpoint-change',{...change(id),taskId:newTask});
      const writer=await ctx.sessionPersistence.create(child.header,{inheritedEventCount:child.inheritedEventCount});
      await writer.append(child.snapshotEvents());await writer.close();source=child;
    }
    await ctx.fiber.dispose();ctx=await openContext(dir);
    const reader=await ctx.sessionPersistence.open(SessionId('grandchild'),'read');
    try{assert.deepEqual([...foldTasks((await reader.read()).events).values()].map(task=>task.sessionId),['parent','child','grandchild']);}
    finally{await reader.close();}
  }finally{await ctx.fiber.dispose();}
});

test('cold read refuses a changed inherited prefix and keeps the altered bytes for review',async()=>{
  const dir=await fixture();let ctx=await openContext(dir);let file;
  try{
    const parent=await stored(ctx,dir),child=ctx.sessions.fork(parent,undefined,SessionId('tampered-child'));
    const writer=await ctx.sessionPersistence.create(child.header,{inheritedEventCount:child.inheritedEventCount});
    await writer.append(child.snapshotEvents());await writer.close();await ctx.fiber.dispose();
    for(const path of await logs(dir))if(JSON.parse((await readFile(path,'utf8')).split('\n')[0]).id==='tampered-child')file=path;
    const lines=(await readFile(file,'utf8')).trimEnd().split('\n').map(line=>JSON.parse(line));lines[1].data.objective='synthetic altered prefix';
    await writeFile(file,lines.map(line=>JSON.stringify(line)).join('\n')+'\n');const altered=await readFile(file);
    ctx=await openContext(dir);await assert.rejects(ctx.sessionPersistence.open(SessionId('tampered-child'),'read'),/SEP_SESSION_PARENT_PREFIX_MISMATCH/);
    assert.deepEqual(await readFile(file),altered);
  }finally{await ctx.fiber.dispose();}
});

test('missing durable parent blocks SEP fork restoration without fabricating a new parent',async()=>{
  const dir=await fixture();let ctx=await openContext(dir);let parentFile;
  try{
    const parent=await stored(ctx,dir);parentFile=(await logs(dir))[0];
    const child=ctx.sessions.fork(parent,undefined,SessionId('orphaned-child'));
    const writer=await ctx.sessionPersistence.create(child.header,{inheritedEventCount:child.inheritedEventCount});
    await writer.append(child.snapshotEvents());await writer.close();await ctx.fiber.dispose();
    const before=await readFile(parentFile);await rename(parentFile,parentFile+'.offline');
    ctx=await openContext(dir);await assert.rejects(ctx.sessionPersistence.open(SessionId('orphaned-child'),'read'),/SEP_SESSION_PARENT_UNAVAILABLE/);
    assert.deepEqual(await readFile(parentFile+'.offline'),before);assert.equal((await logs(dir)).length,1);
  }finally{await ctx.fiber.dispose();}
});

test('a cyclic durable parent graph refuses instead of repeatedly reopening ancestors',async()=>{
  const dir=await fixture();let ctx=await openContext(dir);
  try{
    const parent=await stored(ctx,dir);
    for(const id of ['cycle-a','cycle-b']){
      const child=ctx.sessions.fork(parent,undefined,SessionId(id));
      const writer=await ctx.sessionPersistence.create(child.header,{inheritedEventCount:child.inheritedEventCount});
      await writer.append(child.snapshotEvents());await writer.close();
    }
    await ctx.fiber.dispose();
    for(const file of await logs(dir)){
      const lines=(await readFile(file,'utf8')).trimEnd().split('\n').map(line=>JSON.parse(line));
      if(!lines[0].id.startsWith('cycle-'))continue;
      lines[0].parentSession=lines[0].id==='cycle-a'?'cycle-b':'cycle-a';
      await writeFile(file,lines.map(line=>JSON.stringify(line)).join('\n')+'\n');
    }
    ctx=await openContext(dir);await assert.rejects(ctx.sessionPersistence.open(SessionId('cycle-a'),'read'),/SEP_SESSION_PARENT_CHAIN_INVALID/);
  }finally{await ctx.fiber.dispose();}
});

test('an aborted parent proof returns the original cancellation instead of a missing-parent diagnosis',async()=>{
  const dir=await fixture(),ctx=await openContext(dir);
  try{
    const parent=await stored(ctx,dir),child=ctx.sessions.fork(parent,undefined,SessionId('cancelled-proof'));
    const {assertSepParent}=await import(pathToFileURL(join(root,'bundle/lib/session-parent-proof.js')));
    const controller=new AbortController(),reason=new Error('synthetic user cancellation');
    const pending=assertSepParent(ctx.sessionPersistence,child.header,child.snapshotEvents(),child.inheritedEventCount,{signal:controller.signal});
    controller.abort(reason);await assert.rejects(pending,error=>error===reason);
  }finally{await ctx.fiber.dispose();}
});

test('Zstandard task storage cold-reads with the official physical decoder',async()=>{
  const dir=await fixture();let ctx=await openContext(dir,'zstd');
  try{
    await stored(ctx,dir,'compressed');assert.ok((await logs(dir))[0].endsWith('.zstd'));
    await ctx.fiber.dispose();ctx=await openContext(dir,'zstd');
    const reader=await ctx.sessionPersistence.open(SessionId('compressed'),'read');
    try{assert.equal(foldTasks((await reader.read()).events).get(taskId).sessionId,'compressed');}
    finally{await reader.close();}
  }finally{await ctx.fiber.dispose();}
});

test('two provider instances refuse concurrent writers and admit after owner close',async()=>{
  const dir=await fixture(),first=await openContext(dir),second=await openContext(dir);
  try{
    await stored(first,dir,'leased');const writer=await first.sessionPersistence.open(SessionId('leased'),'write');
    try{await assert.rejects(second.sessionPersistence.open(SessionId('leased'),'write'));}
    finally{await writer.close();}
    const next=await second.sessionPersistence.open(SessionId('leased'),'write');await next.close();
  }finally{await second.fiber.dispose();await first.fiber.dispose();}
});

async function legacy(dir,ctx,id,rows=[]){
  const header={version:4,id,createdAt:1,isSeeded:false,delegationDepth:0,cwd:dir};
  const writer=await ctx.sessionPersistence.create(header);await writer.flush();await writer.close();
  const current=(await logs(dir))[0];const old=current.replace(/session\.v4\.jsonl$/,'session.v3.jsonl');
  await rename(current,old);await writeFile(old,[{type:'session',...header,version:3},...rows].map(x=>JSON.stringify(x)).join('\n')+'\n');return old;
}
test('native-only V3 read is non-writing and write-open publishes V4 beside unchanged V3',async()=>{
  const dir=await fixture();let ctx=await openContext(dir);
  try{
    const old=await legacy(dir,ctx,'old-native'),before=await readFile(old);await ctx.fiber.dispose();ctx=await openContext(dir);
    const reader=await ctx.sessionPersistence.open(SessionId('old-native'),'read');await reader.close();
    assert.equal((await logs(dir)).length,1);assert.deepEqual(await readFile(old),before);
    const writer=await ctx.sessionPersistence.open(SessionId('old-native'),'write');await writer.close();
    assert.equal((await logs(dir)).length,2);assert.deepEqual(await readFile(old),before);
    assert.ok((await logs(dir)).some(path=>path.endsWith('session.v4.jsonl')));
  }finally{await ctx.fiber.dispose();}
});

test('historical required tasks and ignorable recovery linkage refuse without publishing a successor',async()=>{
  for(const event of [taskEvent('old-sep'),{type:'recovery/continuation',seq:0,time:1,ignorable:true,data:{recoveryFromTaskId:taskId,recoveryPlanHash:'a'.repeat(64),recoveryRequestId:'synthetic-request',recoveryProjectId:'00000000-0000-4000-8000-000000000004',recoveryProjectGeneration:1}}]){
    const dir=await fixture();let ctx=await openContext(dir);
    try{
      const old=await legacy(dir,ctx,'old-sep',[event]),before=await readFile(old);await ctx.fiber.dispose();ctx=await openContext(dir);
      await assert.rejects(ctx.sessionPersistence.open(SessionId('old-sep'),'read'));
      await assert.rejects(ctx.sessionPersistence.open(SessionId('old-sep'),'write'));
      assert.deepEqual(await readFile(old),before);assert.equal((await logs(dir)).length,1);
    }finally{await ctx.fiber.dispose();}
  }
});

test('unknown required events and invalid SEP recovery markers refuse before write',async()=>{
  const dir=await fixture(),ctx=await openContext(dir);
  try{
    const writer=await ctx.sessionPersistence.create({version:4,id:'unknown',createdAt:1,isSeeded:false,delegationDepth:0,cwd:dir});
    try{
      await assert.rejects(writer.append([{type:'unknown/required',seq:0,time:1,data:{message:'synthetic-private'}}]));
      await assert.rejects(writer.append([{type:'recovery/continuation',seq:0,time:1,data:{}}]));
      assert.deepEqual(await logs(dir),[]);
    }finally{await writer.close();}
  }finally{await ctx.fiber.dispose();}
});

test('an interrupted JSON tail remains unchanged on read and repairs before a valid append',async()=>{
  const dir=await fixture();let ctx=await openContext(dir);
  try{
    await stored(ctx,dir,'interrupted');const file=(await logs(dir))[0],before=await readFile(file);await ctx.fiber.dispose();
    await appendFile(file,'{"type":"task/checkpoint-change","seq":1');const interrupted=await readFile(file);
    ctx=await openContext(dir);const reader=await ctx.sessionPersistence.open(SessionId('interrupted'),'read');
    try{assert.equal((await reader.read()).events.length,1);assert.deepEqual(await readFile(file),interrupted);}
    finally{await reader.close();}
    const writer=await ctx.sessionPersistence.open(SessionId('interrupted'),'write');
    try{
      await writer.append([{type:'task/checkpoint-change',seq:1,time:2,data:{schema:1,taskId,revision:2,sessionId:'interrupted',agentId:'interrupted',project:'synthetic-project',action:'cancel'}}]);
      assert.equal(foldTasks((await writer.read()).events).get(taskId).cancelled,true);
      assert.deepEqual((await readFile(file)).subarray(0,before.length),before);
    }finally{await writer.close();}
  }finally{await ctx.fiber.dispose();}
});
