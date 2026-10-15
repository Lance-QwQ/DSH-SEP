import {realpath,lstat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {businessLayout,initializeBusinessProfile,completeBusinessInitialization} from './profile-layout.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
let entered=false;
/** One dedicated Node child, one controlled project, no shared host mount. */
export async function openMacBusiness(input){
 if(process.platform!=='darwin'||process.arch!=='arm64')fail('SEP_MAC_PLATFORM_UNSUPPORTED');
 businessLayout(input);if(entered)fail('SEP_MAC_BUSINESS_ALREADY_USED');entered=true;
 for(const path of[input.programRoot,input.hostRoot,input.bundleRoot]){const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||await realpath(path)!==path)fail('SEP_MAC_BUSINESS_PATH');}
 for(const [key,value]of Object.entries({SEP_OFFICIAL_HARNESS:input.hostRoot,SEP_MAC_BUNDLE_ROOT:input.bundleRoot})){if(process.env[key]&&process.env[key]!==value)fail('SEP_MAC_BUSINESS_ENV_CONFLICT');process.env[key]=value;}
 process.env.DSH_HOME=join(input.dataRoot,'home');process.env.DSH_TELEMETRY_DISABLED='1';
 const record=await initializeBusinessProfile(input),{load}=await import('./host-modules.mjs'),{loadLayeredEnv,loadProfileDirectory}=await load('@deepseek-ai/dsh-app-boot'),{runProfile}=await load('@deepseek-ai/dsh/profile-boot');
 const anchor=join(input.hostRoot,'node_modules/@deepseek-ai/dsh/package.json');let running,closing,terminal,closedResolve;const closed=new Promise(r=>{closedResolve=r;});
 try{
  // The persisted overlay permits creating only its first P2 baseline. Every
  // resumed run supplies a final overlay that requires the existing ledger.
  const patchFiles=record.newlyInitialized?[join(record.profile,'initialize.patch.yml')]:[];
  running=await runProfile({environment:loadLayeredEnv('dsh'),profile:'desktop',patchFiles,resolvedProfile:{profile:loadProfileDirectory('dsh',record.profile,anchor),installAnchor:anchor},args:['--no-open','--host','127.0.0.1','--port','0']});
  const ctx=running.ctx,api=ctx.get('sepMacRuntime'),profile=ctx.get('sepMacProfile');if(!api||!profile||!ctx.connection||!ctx.webServer)fail('SEP_MAC_RUNTIME_MISSING');
  const plan=await api.review();await completeBusinessInitialization(input);await api.activate({planHash:plan.planHash});await ctx.workspaceRegistry.create(record.source,'DSH SEP macOS');
  const inspectQuit=async()=>({activeTasks:api.status().pending>0||profile.status().pending>0||ctx.agents.list().some(a=>a.status==='running'||a.inbox.nextTurn.length>0||a.inbox.nextStep.length>0),scheduledTasks:false});
  const close=()=>{if(terminal)return Promise.resolve(terminal);if(closing)return closing;closing=(async()=>{const runtime=await api.close();if(runtime.status!=='pass')return {...runtime,status:'blocked',resourcesConfirmedReleased:false};const project=await profile.close();if(project.status!=='pass'||project.resourcesConfirmedReleased!==true)return {...project,status:'blocked',resourcesConfirmedReleased:false};
    // The official controller returns only after real app+proxy disposal. A
    // forced child exit cannot deliver this success receipt to the broker.
    await running.shutdown.shutdown(0);terminal={status:'pass',resourcesConfirmedReleased:true};closedResolve(terminal);return terminal;
   })().catch(error=>({status:'blocked',resourcesConfirmedReleased:false,code:/^(?:SEP|FS|P2)_[A-Z0-9_]{1,90}$/.test(error?.code??'')?error.code:'SEP_MAC_BUSINESS_CLOSE_BLOCKED'})).finally(()=>{closing=undefined;});return closing;};
  return Object.freeze({ready:{url:ctx.connection.authenticatedUrl('http://127.0.0.1:'+ctx.webServer.port),injections:ctx.webServer.collectIndexInjections()},inspectQuit,close,whenClosed:()=>closed});
 }catch(error){if(running){await running.ctx.get('sepMacRuntime')?.close();await running.ctx.get('sepMacProfile')?.close();await running.shutdown.shutdown(1);}throw error;}
}
