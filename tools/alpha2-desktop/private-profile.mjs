// Local private fixture. All output inherits the operator-protected parent.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,cp,symlink,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {prepareVerificationCopy} from './verification-copy.mjs';
const phase=process.env.SEP_BUNDLE_TEST_ROOT,host=process.env.SEP_OFFICIAL_HARNESS;
const capture=join(phase,'private-capture-r4'),manifest=JSON.parse(await readFile(join(capture,'CAPTURE.json')));
const sha=b=>createHash('sha256').update(b).digest('hex');
const working=await mkdtemp(join(phase,'private-working-root/profile-'));
const report={schema:1,status:'running',scope:'controlled PRIVATE COPY only; full official Alpha.2 Profile launcher, no real model, no original writes, no daily selection',working,checks:[]};
try{
 for(const row of manifest.rows)assert.equal(sha(await readFile(row.path)),row.sha256,'ORIGINAL_SOURCE_CHANGED');
 const fork=await prepareVerificationCopy({sourceRoot:manifest.sources.memory,capturedRoot:join(capture,'memory'),targetParent:working,host});
 for(const name of ['sessions','ledger'])await cp(join(capture,name),join(working,name),{recursive:true,errorOnExist:true,force:false});
 for(const name of ['locks','backups'])await mkdir(join(working,name));
 const active=JSON.parse(await readFile(join(capture,'memory/dsh_four_layer_memory_v1.json'))),owners=active.tables.active.catalog.owners;
 const owner=Object.entries(owners).find(([k,v])=>k.startsWith('project:')&&v.records?.some(r=>r.status==='confirmed'));
 assert(owner,'PRIVATE_PROJECT_RECORD_REQUIRED');const memoryKey=owner[0].slice(8),record=owner[1].records.find(r=>r.status==='confirmed');
 const core=join(host,'node_modules/dsh-sep-bundle'),copy=join(working,'verified-bundle');await cp(core,copy,{recursive:true,filter:p=>!p.includes('node_modules',core.length)});await symlink(join(host,'node_modules'),join(copy,'node_modules'),'junction');
 const binding=join(working,'verification-binding.mjs');await writeFile(binding,`import {openVerificationControl} from ${JSON.stringify(new URL('./verification-copy.mjs',import.meta.url).href)};export const openControl=input=>openVerificationControl({...input,planPath:${JSON.stringify(fork.planPath)},expectedPlanHash:${JSON.stringify(fork.planHash)}});\n`);
 const p=join(copy,'bundle/lib/protected-profile.js'),body=await readFile(p,'utf8'),from="import {openControl} from '../modules/system-enhancement-package/src/p2/control.js';",to=`import {openControl} from '${pathToFileURL(binding).href}';`;
 assert.equal(body.split(from).length,2);await writeFile(p,body.replace(from,to));
 const origins=[{file:p,source:join(core,'bundle/lib/protected-profile.js'),sourceSha256:sha(body),transforms:[{from,to}],resultSha256:sha(body.replace(from,to))}];
 let fixture=await readFile(join(phase,'fixture-repo/tools/bundle-install/tests/native-settings-fixture.mjs'),'utf8');const transforms=[];
 const replace=(from,to)=>{assert.equal(fixture.split(from).length,2,'FIXTURE_ORIGIN_ANCHOR');fixture=fixture.replace(from,to);transforms.push({from,to});};
 replace("const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));",`const root=${JSON.stringify(copy)};`);
 replace("const base=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'controlled-'));",`const base=await mkdtemp(join(${JSON.stringify(working)},'controlled-'));`);
 replace("const budgetPath=join(dirs.budget,'ledger.json');",`dirs.memory=${JSON.stringify(fork.storageRoot)};dirs.sessions=${JSON.stringify(join(working,'sessions'))};dirs.locks=${JSON.stringify(join(working,'locks'))};dirs.backups=${JSON.stringify(join(working,'backups'))};\n const budgetPath=${JSON.stringify(join(working,'ledger/budget.json'))};`);
 replace("if(budget!=='missing')await writeFile(budgetPath,budget==='invalid'?'{}':bytes);","await readFile(budgetPath); // Existing copied ledger only: never seed or reset it.");
 replace("const seed=await openControl({storageRoot:dirs.memory,initialize:true});await seed.close();","// The copied authority is opened only by the explicitly bound Profile adapter.");
 replace("await ctx.recoveryHost.registerProject({id,root:dirs.project});",`await ctx.recoveryHost.registerProject({id,root:dirs.project,memoryKey:${JSON.stringify(memoryKey)}});`);
 const fixturePath=join(working,'private-fixture.mjs');await writeFile(fixturePath,fixture);await writeFile(join(working,'ORIGIN.json'),JSON.stringify({origins,fixture:{transforms,resultSha256:sha(fixture)}},null,2)+'\n');
 const {setup,close,load}=await import(pathToFileURL(fixturePath));const f=await setup({mountRoot:false,business:{capture:false,recall:false}});let disposed=false;
 try{
  const {buildDailyComposition}=await import(pathToFileURL(join(phase,'tools/daily-adaptation/build/daily-composition.mjs')));
  const {adaptDailyPresets}=await import(pathToFileURL(join(phase,'tools/daily-adaptation/lib/daily-presets.mjs')));
  const adapter=join(working,'daily-adapter');await buildDailyComposition({coreRoot:copy,out:adapter});await symlink(join(host,'node_modules'),join(adapter,'node_modules'),'junction');
  const configuration=structuredClone(f.input);delete configuration.runtime.compaction.nativeEntryId;
  configuration.runtime.p1.limitCny=JSON.parse(await readFile(join(working,'ledger/budget.json'))).limit;
  const user=Object.keys(owners).find(k=>k.startsWith('user:'));if(user)configuration.runtime.business.userProfile=user.slice(5);
  const bindings=[];for(const path of [join(copy,'package.json'),binding,...(await readdir(adapter)).filter(n=>n!=='node_modules').map(n=>join(adapter,n))])bindings.push({path,sha256:sha(await readFile(path))});
  const selection={schema:2,dsh:'0.2.1-alpha.2',sep:'0.2.1-beta.3-alpha2-adapter.1',bundleRoot:copy,dailyAdapterRoot:adapter,nativeCompactionEntryKey:'native',configuration,bindings};
  const selectionFile=join(working,'selection.json'),selectionBytes=JSON.stringify(selection)+'\n';await writeFile(selectionFile,selectionBytes);
  const profile=join(working,'profile');await mkdir(profile);await mkdir(join(working,'dsh-home'));
  const {PROFILE_TEMPLATES,loadOverlayPatches}=await load('@deepseek-ai/dsh-app-boot');
  const presets=['standard','cordis','minimal','ptc'].map(n=>loadOverlayPatches('dsh',join(host,'node_modules/@deepseek-ai/dsh-web-app/presets',n+'.patch.yml'))[0].insert[0]);
  await writeFile(join(profile,'package.json'),JSON.stringify({name:'sep-private-copy-verification',private:true,type:'module',dsh:{profile:{bundles:PROFILE_TEMPLATES.web.bundles}}})+'\n');
  await writeFile(join(profile,'cordis.patch.yml'),JSON.stringify([...adaptDailyPresets(presets),...['fs-sandbox','session-persistence-jsonl','desktop-product-telemetry','product-analytics','session-telemetry-otel','otel'].map(id=>({id,disabled:true})),{id:'storage-json',config:{root:fork.storageRoot}},{id:'sandbox-policy',config:{mode:'workspace-write',workspaceRoot:f.dirs.project}},{insert:[{id:'native',name:'@deepseek-ai/dsh-compaction-basic',config:{auto:true,thresholdRatio:.63,retainRatio:.21,maxTokens:64,compactionRetries:0,maxOverflowRetries:2}},{id:'sep-recovery',name:pathToFileURL(join(copy,'bundle/lib/recovery-authority.js')).href,config:{controlRoot:join(f.base,'authority')}}]}])+'\n');
  await close(f);disposed=true;
  const sessionRows=manifest.rows.filter(r=>r.domain==='sessions').map(({relative,sha256})=>({relative,sha256}));
  const input={host,profile,selectionFile,sha256:sha(selectionBytes),project:f.dirs.project,checkPresets:true,privateCheck:{memoryKey,recordId:record.id,textHash:sha(record.text),recordFields:Object.fromEntries(['revision','createdAt','updatedAt','lastUsedAt','status','layer','scope','owner'].map(k=>[k,record[k]])),sessionRoot:join(working,'sessions'),originalSessionRows:sessionRows,originalSessionCount:new Set(sessionRows.map(r=>dirname(r.relative))).size,ledgerPath:join(working,'ledger/budget.json')}};
  const worker=join(working,'private-worker.mjs');let source=await readFile(join(phase,'tools/daily-adaptation/tests/profile-worker.mjs'),'utf8');
  source=source.replace("from '../lib/daily-startup.mjs'",`from '${pathToFileURL(join(phase,'tools/daily-adaptation/lib/daily-startup.mjs')).href}'`);
  source=source.replace(" const status={status:'pass'",` const privateChecks=await (await import(${JSON.stringify(new URL('./private-profile-checks.mjs',import.meta.url).href)})).check(running.ctx,input.privateCheck);\n const status={privateChecks,status:'pass'`);
  source=source.replace("SessionId('profile-'+preset)","SessionId('profile-'+preset+'-'+input.round)");
  source=source.replace('let running,opened;',"let running,opened;const originalFetch=globalThis.fetch;globalThis.fetch=(url,options)=>{const parsed=new URL(typeof url==='string'||url instanceof URL?url:url.url);if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))throw Object.assign(Error('PRIVATE_EGRESS_DENIED'),{code:'PRIVATE_EGRESS_DENIED'});return originalFetch(url,options);};");
  await writeFile(worker,source);
  for(let round=1;round<=2;round++){
   const child=spawn(process.execPath,[worker],{cwd:f.dirs.project,env:{...process.env,DSH_HOME:join(working,'dsh-home'),DSH_TELEMETRY_DISABLED:'1',SEP_DAILY_PROFILE_CASE:JSON.stringify({...input,round}),DEEPSEEK_API_KEY:'synthetic-not-a-real-key'},stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const timer=setTimeout(()=>child.kill(),90000);
   const exit=await new Promise((res,rej)=>{child.on('error',rej);child.on('exit',(code,signal)=>res({code,signal}));}).finally(()=>clearTimeout(timer));
   await writeFile(join(working,`round-${round}.stdout.log`),stdout);await writeFile(join(working,`round-${round}.stderr.log`),stderr);
   assert.equal(exit.code,0,'PRIVATE_FULL_PROFILE_FAILED');const line=stdout.split(/\r?\n/).find(s=>s.startsWith('SEP_PROFILE_RESULT '));assert(line,'PRIVATE_FULL_PROFILE_RECEIPT_MISSING');const result=JSON.parse(line.slice(19));assert.equal(result.status,'pass');for(const row of sessionRows)assert.equal(sha(await readFile(join(working,'sessions',row.relative))),row.sha256,'PRIVATE_SESSION_BYTES_CHANGED_AFTER_SHUTDOWN');report.checks.push({kind:'official-full-profile-private-copy',round,...result});
  }
 }finally{if(!disposed)await close(f);}
 for(const row of manifest.rows)assert.equal(sha(await readFile(row.path)),row.sha256,'ORIGINAL_SOURCE_CHANGED');
 report.status='pass';report.sourceUnchanged=true;report.planHash=fork.planHash;report.notVerified=['real model/API','original workspace files or their restoration','historical backup rollback/purge','migration/adoption to a different production directory','Linux/macOS'];
 await writeFile(join(working,'PRIVATE-PROFILE-RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'pass',report:join(working,'PRIVATE-PROFILE-RESULT.json'),rounds:report.checks.length}));
}catch(error){report.status='fail';report.code=/^[A-Z][A-Z0-9_]+$/.test(error.code??'')?error.code:/^[A-Z][A-Z0-9_]+$/.test(error.message??'')?error.message:'PRIVATE_PROFILE_FAILED';report.errorType=error.name;await writeFile(join(working,'private-error.log'),error.stack??error.name);await writeFile(join(working,'PRIVATE-PROFILE-FAILURE.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'fail',code:report.code,report:join(working,'PRIVATE-PROFILE-FAILURE.json')}));process.exitCode=1;}
