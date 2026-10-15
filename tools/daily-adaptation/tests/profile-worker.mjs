// Isolated acceptance worker: use the official profile launcher, never an SDK
// boot in the production path. Every path is a synthetic fixture supplied by
// the parent; no real key or model request is used.
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readDailySelection,startDailyInstallation} from '../lib/daily-startup.mjs';
const input=JSON.parse(process.env.SEP_DAILY_PROFILE_CASE);
const require=createRequire(join(input.host,'package.json'));
const load=name=>import(pathToFileURL(require.resolve(name)));
const {symbols}=await load('@deepseek-ai/cordis');
const {loadLayeredEnv,loadProfileDirectory}=await load('@deepseek-ai/dsh-app-boot');
const {runProfile}=await load('@deepseek-ai/dsh/profile-boot');
let running,opened;
try{
 const installAnchor=join(input.host,'node_modules/@deepseek-ai/dsh/package.json');
 const profile=loadProfileDirectory('dsh',input.profile,installAnchor);
 running=await runProfile({environment:loadLayeredEnv('dsh'),profile:'desktop',resolvedProfile:{profile,installAnchor},patchFiles:[],args:['--no-open','--port','0']});
 opened=await startDailyInstallation(running.ctx,await readDailySelection({path:input.selectionFile,sha256:input.sha256}));
 if(opened.status!=='pass')throw Object.assign(Error('DAILY_PROFILE_BLOCKED'),{code:opened.code,details:opened.initialization});
 await running.ctx.loader.await();
 const broken=[...running.ctx.loader.entries()].filter(row=>!row.disabled&&row.fiber?.state!==2).map(row=>({id:row.options.id,state:row.fiber?.state}));
 if(broken.length)throw Object.assign(Error('DAILY_PROFILE_INCOMPLETE'),{code:'SEP_DAILY_PROFILE_INCOMPLETE',details:broken});
 const presets=[];
 if(input.checkPresets){
  const {SessionId}=await load('@deepseek-ai/dsh-session');
  for(const preset of ['standard','minimal','cordis','ptc']){
   const handle=await running.ctx.agents.create({sessionId:SessionId('profile-'+preset),meta:{cwd:input.project,agentPreset:preset,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-flash',maxTokens:64},setup:async child=>{await running.ctx.agentPresets.mount(child,preset);}});
   const scoped=running.ctx.agentPresets.serviceFor(handle.agent,'compaction'),engine=scoped??handle.agent.ctx.get('compaction');
   const original=engine?.[symbols.original]??engine;
   if(typeof original?.losslessStatus!=='function')throw Object.assign(Error('Preset shadows SEP compaction'),{code:'SEP_DAILY_PRESET_COMPACTION_SHADOWED',details:{preset}});
   const tool=running.ctx.tools.get('suite_status',handle.agent);if(!tool)throw Error('SEP_DAILY_PRESET_TOOL_MISSING');
   presets.push(preset);
  }
 }
 const status={status:'pass',phase:opened.installation.status().phase,webPort:running.ctx.webServer.port,services:['fs','sessionPersistence','suiteEnhancements','connection','agents','agentPresets'].filter(name=>running.ctx.get(name)),presetRows:[...running.ctx.loader.entries()].filter(row=>row.options.id?.startsWith('preset-')).map(row=>({id:row.options.id,state:row.fiber?.state}))};
 const receipt=await opened.close();if(receipt.status!=='pass')throw Error('DAILY_PROFILE_CLEANUP_BLOCKED');
 await running.shutdown.shutdown(0);running=undefined;
 console.log('SEP_PROFILE_RESULT '+JSON.stringify({...status,presets,resourcesRetained:false}));
}catch(error){console.error('SEP_PROFILE_ERROR',error.code??error.name,error.message,error.details??'');process.exitCode=1;}
finally{if(running){await opened?.close();await running.shutdown.shutdown(process.exitCode??1);}}
