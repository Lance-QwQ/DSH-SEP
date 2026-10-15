import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {readFile,writeFile,cp,symlink,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {adaptDailyPresets} from '../lib/daily-presets.mjs';
const repo=process.env.SEP_SOURCE_REPO;
const {setup,close,root,load}=await import(pathToFileURL(join(repo,'tools/bundle-install/tests/native-settings-fixture.mjs')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('the full official alpha.1 desktop profile accepts the confirmed cold root and exits',async()=>{
 const f=await setup({mountRoot:false});let disposed=false,child;
 try{
  const bundleRoot=join(f.base,'materialized-bundle');await cp(root,bundleRoot,{recursive:true,filter:file=>!file.includes('node_modules',root.length)});await symlink(dirname(root),join(bundleRoot,'node_modules'),'junction');
  const configuration=structuredClone(f.input);delete configuration.runtime.compaction.nativeEntryId;
  const manifestFile=join(bundleRoot,'package.json');
  const value={schema:1,dsh:'0.2.1-alpha.2',sep:'0.2.1-beta.3-alpha2-adapter.1',bundleRoot,nativeCompactionEntryKey:'native',configuration,bindings:[{path:manifestFile,sha256:sha(await readFile(manifestFile))}]};
  const selectionFile=join(f.base,'profile-selection.json'),selectionBytes=JSON.stringify(value)+'\n';await writeFile(selectionFile,selectionBytes);
  const profile=join(f.base,'profile');await mkdir(profile);await mkdir(join(f.base,'dsh-home'));
  const {PROFILE_TEMPLATES,loadOverlayPatches}=await load('@deepseek-ai/dsh-app-boot');
  const presetRows=['standard','cordis','minimal','ptc'].map(name=>loadOverlayPatches('dsh',join(process.env.SEP_DAILY_FULL_HOST,'node_modules/@deepseek-ai/dsh-web-app/presets',name+'.patch.yml'))[0].insert[0]);
  await writeFile(join(profile,'package.json'),JSON.stringify({name:'sep-synthetic-daily-profile',private:true,type:'module',dsh:{profile:{bundles:PROFILE_TEMPLATES.web.bundles}}})+'\n');
  const patch=[...adaptDailyPresets(presetRows),...['fs-sandbox','session-persistence-jsonl','desktop-product-telemetry','product-analytics','session-telemetry-otel','otel'].map(id=>({id,disabled:true})),
   {id:'storage-json',config:{root:f.dirs.memory}},
   {id:'sandbox-policy',config:{mode:'workspace-write',workspaceRoot:f.dirs.project}},
   {insert:[{id:'native',name:'@deepseek-ai/dsh-compaction-basic',config:{auto:true,thresholdRatio:.63,retainRatio:.21,maxTokens:64,compactionRetries:0,maxOverflowRetries:2}},{id:'sep-recovery',name:pathToFileURL(join(bundleRoot,'bundle/lib/recovery-authority.js')).href,config:{controlRoot:join(f.base,'authority')}}]}];
  await writeFile(join(profile,'cordis.patch.yml'),JSON.stringify(patch)+'\n');
  await close(f);disposed=true;
  const input={host:process.env.SEP_DAILY_FULL_HOST,profile,selectionFile,sha256:sha(selectionBytes),project:f.dirs.project,checkPresets:true};
  child=spawn(process.execPath,[fileURLToPath(new URL('./profile-worker.mjs',import.meta.url))],{cwd:f.dirs.project,env:{...process.env,DSH_HOME:join(f.base,'dsh-home'),DSH_TELEMETRY_DISABLED:'1',SEP_DAILY_PROFILE_CASE:JSON.stringify(input)},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stdout='',stderr='';child.stdout.on('data',bytes=>{stdout+=bytes;});child.stderr.on('data',bytes=>{stderr+=bytes;});
  const timer=setTimeout(()=>child.kill(),45000);
  let exit;try{exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});}finally{clearTimeout(timer);}
  await writeFile(join(f.base,'full-profile.stdout.log'),stdout);await writeFile(join(f.base,'full-profile.stderr.log'),stderr);
  assert.equal(exit.code,0,JSON.stringify({exit,stderr,stdout}));
  const line=stdout.split(/\r?\n/).find(line=>line.startsWith('SEP_PROFILE_RESULT '));assert.ok(line,JSON.stringify({stdout,stderr}));
  const result=JSON.parse(line.slice('SEP_PROFILE_RESULT '.length));assert.equal(result.status,'pass');assert.equal(result.phase,'active');assert.equal(result.resourcesRetained,false);assert.ok(result.webPort>0);assert.equal(result.presetRows.length,4);
 }finally{if(!disposed)await close(f);}
});
