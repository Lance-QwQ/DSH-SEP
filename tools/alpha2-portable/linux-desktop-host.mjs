import {join} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const [runtime,profile,source]=process.argv.slice(2),req=createRequire(join(runtime,'package.json'));
const load=n=>import(pathToFileURL(req.resolve(n)));
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw Error('SEP_SYNTHETIC_NETWORK_DISABLED');return originalFetch(input,init);};
let running;
try{
 const {loadLayeredEnv,loadProfileDirectory}=await load('@deepseek-ai/dsh-app-boot'),{runProfile}=await load('@deepseek-ai/dsh/profile-boot');
 const anchor=join(runtime,'node_modules/@deepseek-ai/dsh/package.json');
 running=await runProfile({environment:loadLayeredEnv('dsh'),profile:'desktop',patchFiles:[],resolvedProfile:{profile:loadProfileDirectory('dsh',profile,anchor),installAnchor:anchor},args:['--no-open','--host','127.0.0.1','--port','0']});
 const ctx=running.ctx;if(!ctx.get('sepLinuxProfile'))throw Error('SEP_LINUX_PROFILE_NOT_MOUNTED');
 if(process.env.SEP_LINUX_BUSINESS==='1'){
  if(!ctx.get('sepLinuxRuntime')||!ctx.get('suiteEnhancements'))throw Error('SEP_LINUX_BUSINESS_NOT_MOUNTED');
  const plan=await ctx.sepLinuxRuntime.review();await ctx.sepLinuxRuntime.activate({planHash:plan.planHash});
  const state=ctx.sepLinuxRuntime.status();if(state.phase!=='active'||state.consumers?.memory!=='ready'||state.compaction?.phase!=='active')throw Error('SEP_LINUX_BUSINESS_NOT_ACTIVE');
  const memory=await ctx.suiteEnhancements.memorySettings.list({}),budget=await ctx.suiteEnhancements.budgetSettings.list({});
  const context=process.env.SEP_LINUX_CONTEXT==='1'?await (await import('./verify-linux-context-desktop.mjs')).verify(ctx,source):undefined;
  if(process.env.SEP_DESKTOP_CONTINUATION)await (await import('./linux-continuation-host.mjs')).install(ctx,source);
  const vision=!process.env.SEP_DESKTOP_CONTINUATION&&process.env.SEP_LINUX_VISION==='1'?await (await import('./verify-linux-vision-desktop.mjs')).verify(ctx,source):undefined;
  process.send({type:'sep-verified',status:'pass',memory:{available:memory.available,projects:memory.projects.length},budget:{available:budget.available,defaultCny:budget.defaults?.limitCny},compaction:state.compaction.phase,...vision?{vision}:{},...context?{context}:{}});
 }
 // Register the existing controller-selected synthetic directory before UI
 // first use. Never let the first-use helper create an unmanaged workspace.
 if(!source||!ctx.get('workspaceRegistry'))throw Error('SEP_LINUX_WORKSPACE_NOT_MOUNTED');
 await ctx.workspaceRegistry.create(source,'SEP Linux synthetic');
 process.send({type:'ready',url:ctx.connection.authenticatedUrl('http://127.0.0.1:'+ctx.webServer.port),injections:ctx.webServer.collectIndexInjections()});
 process.on('message',async m=>{
  if(m?.type==='stop'){if(ctx.get('sepLinuxRuntime')){const receipt=await ctx.sepLinuxRuntime.close();process.send({type:'sep-close',receipt});if(receipt.status!=='pass')return;}await running.shutdown.shutdown(0);process.disconnect?.();}
  if(m?.type==='inspect'){const agents=ctx.agents.list();process.send({type:'inspection',id:m.id,activeTasks:agents.some(a=>a.status==='running'||a.inbox.nextTurn.length||a.inbox.nextStep.length),scheduledTasks:false});}
 });
}catch(error){console.error(error);process.send?.({type:'failed',code:error.code??error.message});process.exitCode=1;process.disconnect?.();}
