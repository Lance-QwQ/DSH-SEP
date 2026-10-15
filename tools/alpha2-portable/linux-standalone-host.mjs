import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const [program,data]=process.argv.slice(2);process.env.SEP_OFFICIAL_HARNESS=join(program,'host');process.env.SEP_PORTABLE_ROOT=program;process.env.DSH_HOME=join(data,'home');
let running,closing;
try{
 const f=JSON.parse(await readFile(join(data,'PROFILE.json'))),{load}=await import('./host-modules.mjs'),{loadLayeredEnv,loadProfileDirectory}=await load('@deepseek-ai/dsh-app-boot'),{runProfile}=await load('@deepseek-ai/dsh/profile-boot'),anchor=join(program,'host/node_modules/@deepseek-ai/dsh/package.json');
 running=await runProfile({environment:loadLayeredEnv('dsh'),profile:'desktop',patchFiles:[],resolvedProfile:{profile:loadProfileDirectory('dsh',f.profile,anchor),installAnchor:anchor},args:['--no-open','--host','127.0.0.1','--port','0']});
 const ctx=running.ctx;if(!ctx.get('sepLinuxRuntime'))throw Error('SEP_LINUX_RUNTIME_MISSING');const plan=await ctx.sepLinuxRuntime.review();await ctx.sepLinuxRuntime.activate({planHash:plan.planHash});await ctx.workspaceRegistry.create(f.source,'DSH SEP Linux');
 const stop=()=>closing??=(async()=>{const receipt=await ctx.sepLinuxRuntime.close();process.send?.({type:'close',receipt});if(receipt.status!=='pass'){closing=undefined;return;}await running.shutdown.shutdown(0);process.disconnect?.();})().catch(e=>{process.send?.({type:'close',receipt:{status:'blocked',code:/^[A-Z_]{1,64}$/.test(e.code??'')?e.code:'SEP_LINUX_CLOSE_BLOCKED'}});closing=undefined;});
 process.on('SIGTERM',stop);process.on('SIGINT',stop);process.on('disconnect',stop);process.on('message',async m=>{if(m?.type==='stop')await stop();if(m?.type==='inspect')process.send?.({type:'inspection',id:m.id,activeTasks:ctx.agents.list().some(a=>a.status==='running'||a.inbox.nextTurn.length||a.inbox.nextStep.length),scheduledTasks:false});});
 process.send?.({type:'ready',url:ctx.connection.authenticatedUrl('http://127.0.0.1:'+ctx.webServer.port),injections:ctx.webServer.collectIndexInjections(),phase:ctx.sepLinuxRuntime.status().phase});
}catch(e){process.send?.({type:'failed',code:/^[A-Z_]{1,64}$/.test(e.code??e.message??'')?(e.code??e.message):'SEP_LINUX_HOST_START_FAILED'});process.exitCode=1;process.disconnect?.();}
