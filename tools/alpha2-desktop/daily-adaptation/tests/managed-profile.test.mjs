import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {buildDailyComposition} from '../build/daily-composition.mjs';
import {adaptDailyPresets} from '../lib/daily-presets.mjs';
const repo=process.env.SEP_SOURCE_REPO,H=process.env.SEP_DAILY_MANAGED_HOST;
const {setup,close,load}=await import(pathToFileURL(join(repo,'tools/bundle-install/tests/native-settings-fixture.mjs')));
const sha=value=>createHash('sha256').update(value).digest('hex');
test('managed alpha.2 host completes actual recovery handshake, protects writes across RPC, and closes normally',async()=>{
 const f=await setup({mountRoot:false});let disposed=false,service,stdout='',stderr='',childHandle;
 try{
  const profile=join(f.base,'profile');await mkdir(profile);await mkdir(join(f.base,'dsh-home'));
  const core=join(H,'node_modules/dsh-sep-bundle'),recovery=join(H,'node_modules/@deepseek-ai/dsh-recovery');
  const adapter=join(f.base,'daily-adapter');await buildDailyComposition({coreRoot:core,out:adapter});
  // Generated adapter normally lives below the installed root. This fixture
  // supplies only a resolver junction; final graph must materialize all files.
  const {symlink}=await import('node:fs/promises');await symlink(join(H,'node_modules'),join(adapter,'node_modules'),'junction');
  const configuration=structuredClone(f.input);delete configuration.runtime.compaction.nativeEntryId;
  const bindings=[];for(const path of [join(core,'package.json'),...(await readdir(adapter)).filter(name=>name!=='node_modules').map(name=>join(adapter,name))])bindings.push({path,sha256:sha(await readFile(path))});
  const selection={schema:2,dsh:'0.2.1-alpha.2',sep:'0.2.1-beta.3-alpha2-adapter.1',bundleRoot:core,dailyAdapterRoot:adapter,nativeCompactionEntryKey:'native',configuration,bindings};
  const selectionPath=join(f.base,'daily-selection.json'),bytes=JSON.stringify(selection)+'\n';await writeFile(selectionPath,bytes);
  const {PROFILE_TEMPLATES,loadOverlayPatches}=await load('@deepseek-ai/dsh-app-boot');
  const presets=['standard','cordis','minimal','ptc'].map(name=>loadOverlayPatches('dsh',join(H,'node_modules/@deepseek-ai/dsh-web-app/presets',name+'.patch.yml'))[0].insert[0]);
  await writeFile(join(profile,'package.json'),JSON.stringify({name:'sep-managed-synthetic',private:true,type:'module',dsh:{profile:{bundles:PROFILE_TEMPLATES.web.bundles}}})+'\n');
  const patch=[...adaptDailyPresets(presets),...['fs-sandbox','session-persistence-jsonl','desktop-product-telemetry','product-analytics','session-telemetry-otel','otel'].map(id=>({id,disabled:true})),{id:'storage-json',config:{root:f.dirs.memory}},{id:'sandbox-policy',config:{mode:'workspace-write',workspaceRoot:f.dirs.project}},{insert:[{id:'native',name:'@deepseek-ai/dsh-compaction-basic',config:{auto:true,thresholdRatio:.63,retainRatio:.21,maxTokens:64,compactionRetries:0,maxOverflowRetries:2}},{id:'sep-recovery',name:pathToFileURL(join(recovery,'src/host-plugin.mjs')).href,config:{registerSelectedWorkspaces:true}},{id:'sep-continuation',name:pathToFileURL(join(recovery,'src/desktop-continuation.mjs')).href,config:{}}]}];
  const probe=join(f.base,'protected-write-probe.mjs'),target=join(f.dirs.project,'managed-protected.txt');await writeFile(target,'before');
  await writeFile(probe,`export const name='synthetic-owned-file-probe';export const inject=['fs','suiteEnhancements'];export function apply(ctx){const onMessage=async input=>{if(input?.type!=='synthetic-protected-write')return;try{const target=await ctx.fs.resolve(${JSON.stringify(target)});await ctx.fs.readText(target);const info=await ctx.fs.stat(target);await ctx.fs.writeText(target,'after',{kind:'replaceIfVersion',version:info.version},undefined,{mode:'workspace-write',workspaceRoot:${JSON.stringify(f.dirs.project)}});process.send?.({type:'synthetic-protected-write-result',status:'pass'});}catch(error){process.send?.({type:'synthetic-protected-write-result',status:'fail',code:error.code??error.name});}};process.on('message',onMessage);ctx.effect(()=>()=>process.off('message',onMessage));}`);
  patch.push({insert:[{id:'synthetic-protected-write-probe',name:pathToFileURL(probe).href,config:{}}]});
  await writeFile(join(profile,'cordis.patch.yml'),JSON.stringify(patch)+'\n');
  await close(f);disposed=true;
  const {openManagedService}=await import(pathToFileURL(join(recovery,'src/managed.mjs')));
  service=await openManagedService({controlRoot:join(f.base,'authority'),host:{transport:'desktop-http',desktop:{projectDir:profile,dshVersion:'0.2.1-alpha.2'},command:{file:process.execPath,args:[join(H,'node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'),H,profile,process.env.SEP_DAILY_PRIMARY_RUNTIME],cwd:f.dirs.project,env:{...process.env,DSH_HOME:join(f.base,'dsh-home'),DSH_TELEMETRY_DISABLED:'1',DSH_CLIENT_VERSION:'0.2.1-alpha.2',SEP_DAILY_SELECTION_PATH:selectionPath,SEP_DAILY_SELECTION_SHA256:sha(bytes)}},onSpawn:({child})=>{childHandle=child;child.stdout.on('data',v=>stdout=(stdout+v).slice(-16384));child.stderr.on('data',v=>stderr=(stderr+v).slice(-16384));},suiteRoot:join(core,'bundle/modules/system-enhancement-package'),suiteLockDirectory:f.dirs.locks,storageRoot:f.dirs.memory,projectIds:[selection.configuration.runtime.profile.selection.projectId],restartLimit:0,readinessTimeoutMs:30000,shutdownTimeoutMs:45000}});
  const state=await service.guardian.start({manual:true});assert.equal(state.phase,'running',JSON.stringify(state));
  const {recoveryClient}=await import(pathToFileURL(join(recovery,'src/client.mjs')));
  const hostClient=recoveryClient(service.hostConnection),admin=recoveryClient(service.connection);
  const held=await hostClient.call('acquireProjectWrite',{projectId:selection.configuration.runtime.profile.selection.projectId});
  await assert.rejects(admin.call('planRebind',{projectId:held.project.id,newRoot:f.dirs.project}),{code:'RECOVERY_PROJECT_BUSY'});
  assert.equal((await hostClient.call('releaseProjectWrite',{leaseId:held.leaseId,outcome:'succeeded'})).accepted,true);
  const writeResult=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('SYNTHETIC_WRITE_DEADLINE')),10000);childHandle.on('message',function listener(value){if(value?.type!=='synthetic-protected-write-result')return;clearTimeout(timer);childHandle.off('message',listener);resolve(value);});});childHandle.send({type:'synthetic-protected-write'});
  assert.deepEqual(await writeResult,{type:'synthetic-protected-write-result',status:'pass'});assert.equal(await readFile(target,'utf8'),'after');
  const stopped=await service.guardian.stop();assert.equal(stopped.phase,'stopped',JSON.stringify(stopped));assert.equal(stopped.lastExit.code,0);assert.equal(stopped.lastExit.forced,false);
  assert.equal(service.projectWriteLeases.status().active,0);await service.close();service=undefined;
 }finally{await service?.close();await writeFile(join(f.base,'managed-host.stdout.log'),stdout);await writeFile(join(f.base,'managed-host.stderr.log'),stderr);console.log('MANAGED_FIXTURE '+f.base);if(!disposed)await close(f);}
});
