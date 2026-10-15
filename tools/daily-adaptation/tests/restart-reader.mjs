import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readDailySelection,startDailyInstallation} from '../lib/daily-startup.mjs';
const input=JSON.parse(process.env.SEP_DAILY_RESTART_CASE);
const require=createRequire(join(process.env.SEP_OFFICIAL_HARNESS,'package.json'));
const load=name=>import(pathToFileURL(require.resolve(name)));
const {boot}=await load('@deepseek-ai/dsh-app-boot');
const {SessionId}=await load('@deepseek-ai/dsh-session');
const selection=await readDailySelection({path:input.selectionFile,sha256:input.sha256});
const selected=selection.configuration.runtime.profile.selection;
const owned=name=>import(pathToFileURL(join(input.bundleRoot,'bundle',name)));
const native=selection.nativeCompactionEntryKey;
let ctx,opened;
try{
 ctx=await boot('dsh',join(input.base,'cordis.yml'),[{insert:[{id:native,name:pathToFileURL(require.resolve('@deepseek-ai/dsh-compaction-basic')).href,config:{auto:true,thresholdRatio:.63,retainRatio:.21,maxTokens:64,compactionRetries:0,maxOverflowRetries:2}}]}],async host=>{
  for(const name of ['llm','session-projection','session','token-meter','system-prompt','tools','agent'])await host.plugin((await load('@deepseek-ai/dsh-'+name)).default);
  await host.plugin((await load('@deepseek-ai/dsh-agent-loop')).default,{agents:[]});
  for(const name of ['subagent','subagent-spawn-in-process','user-approval']){const module=await load('@deepseek-ai/dsh-'+name);await host.plugin(module.default??module);}
  await host.plugin((await load('@deepseek-ai/dsh-sandbox-policy')).default,{mode:'workspace-write',workspaceRoot:input.project});
  await host.plugin(await owned('lib/recovery-authority.js'),{controlRoot:join(input.base,'authority')});
  await host.recoveryHost.projectById({id:selected.projectId});
  await host.plugin((await load('@deepseek-ai/dsh-storage')).default);await host.plugin(await load('@deepseek-ai/dsh-storage-json'),{root:selected.roots.memory});await host.plugin(await load('@deepseek-ai/dsh-storage-domain'),{backend:'json'});
  const {createLaunchEnvironmentSnapshot}=await load('@deepseek-ai/dsh-launch-environment');host.provide('launchEnvironment',createLaunchEnvironmentSnapshot([]));
  await host.plugin((await load('@deepseek-ai/dsh-credentials-local')).default,{path:join(input.base,'credentials.yaml'),dshHome:input.base,watch:false});
  await host.plugin((await load('@deepseek-ai/dsh-host-webserver')).default,{host:'127.0.0.1',port:0});
  await host.plugin(await load('@deepseek-ai/dsh-client-connection'),{maxRequestBodyBytes:32768});
  await host.loader.create({id:'client-modules',name:pathToFileURL(require.resolve('@deepseek-ai/dsh-client-modules')).href});await host.loader.await();
 });
 opened=await startDailyInstallation(ctx,selection);if(opened.status!=='pass')throw Object.assign(Error(JSON.stringify({code:opened.code,initialization:opened.initialization,entry:{state:opened.entry?.fiber?.state,exports:Object.keys(opened.entry?.moduleNamespace??{})},missing:['loader','tools','systemPrompt','sessions','storageDomain','recoveryHost','llm','tokenMeter','agents','subagents','approval','connection','clientModules'].filter(name=>!ctx.get(name))})),{code:opened.code});
 const handle=await ctx.sessionPersistence.open(SessionId(input.sessionId),'read');let sessionEvents;
 try{sessionEvents=(await handle.read()).events.length;}finally{await handle.close();}
 let reader;
 const owner=ctx.plugin({name:'synthetic-restart-reader',inject:['agents'],async apply(child){reader=(await child.agents.resume({resumeSessionId:SessionId(input.sessionId),agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64}})).agent;}});await owner;
 if(reader.id!==input.sessionId||reader.session.header.cwd!==input.project)throw Error('RESUME_IDENTITY_CHANGED');
 await ctx.get('sepProtectedProfile').reviewSession(reader.session);
 const found=await ctx.tools.get('suite_memory_recall',reader).execute({query:'synthetic restart requirement'},{agent:reader,signal:new AbortController().signal,callId:'restart-recall'});
 const memories=found.records.length;
 const stopped=await opened.close();if(stopped.status!=='pass')throw Error('CLEANUP_BLOCKED');await ctx.fiber.dispose();ctx=undefined;
 console.log(JSON.stringify({status:'pass',resumed:true,sessionEvents,memories,ledgerSha256:createHash('sha256').update(await readFile(selected.budgetPath)).digest('hex'),resourcesRetained:false}));
}finally{if(ctx){await opened?.close();await ctx.fiber.dispose();}}
