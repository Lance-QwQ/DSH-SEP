import {z} from 'zod';
import {failureDiagnostic} from './failure-diagnostic.js';
import {createHash} from 'node:crypto';
import * as Runtime from './settings-runtime.js';
import * as SettingsUi from './native-settings-ui.js';

export const name='dsh-sep-native-settings-installation';
export const inject=[...Runtime.inject,'connection','clientModules'];
export const provide=['sepControlledInstallation'];
const schema=z.object({runtime:z.record(z.string(),z.unknown()),ui:z.object({enabled:z.literal(true).default(true),requestTimeoutMs:z.number().int().min(1000).max(300000).default(120000)}).strict().default({enabled:true,requestTimeoutMs:120000})}).strict();
const fail=code=>{throw Object.assign(new Error(code),{code});};
// A dependency refresh may rerun apply on the same root fiber. Only an
// explicit fresh root instance may reopen a composition that accepted close.
const retiredRoots=new WeakSet();
const key=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=value=>createHash('sha256').update(key(value)).digest('hex');

/** Explicit cold assembly only. Default bundle admission stays pending.
 * Prerequisites must already be prepared by the trusted host; no automatic
 * retirement of unknown providers, YAML persistence or private adoption.
 * close() bounds the receipt, not actual settlement. A failed UI mount whose
 * cleanup is still blocked returns recovery controls, never business admission.
 * Throwing at that point would enter Cordis rollback, which joins unbounded
 * settlement. Fiber disposal intentionally retains that ownership guarantee.
 */
export async function apply(ctx,input){
 if(retiredRoots.has(ctx.fiber))fail('SEP_INSTALLATION_STATE');
 let config;try{config=schema.parse(input);}catch{fail('SEP_INSTALLATION_INPUT_INVALID');}
 SettingsUi.assertOwner(ctx);
 if(ctx.get('sepControlledInstallation',false)||ctx.get('suiteEnhancements',false))fail('SEP_INSTALLATION_PROVIDER_CONFLICT');
 let phase='preparing',runtimeFiber,uiFiber,runtime,plan,transition,finishing,problem,mountFailure,mountCause;
 const closed=Promise.withResolvers(),startup=Promise.withResolvers();
 const receipt=()=>({status:phase==='closed'?'pass':'blocked',phase:mountFailure&&phase!=='closed'?'mount-failed-blocked':phase,resourcesRetained:phase!=='closed',runtime:runtime?.status(),completeProfileStatus:'blocked',businessEnabled:false,wholeApplicationDeadlineVerified:false,...mountFailure?{mountFailure,mountCause}:{},...problem?{code:problem}:{}});
 async function mount(plugin,options,capture){let fiber;ctx.effect(function*(){fiber=ctx.plugin(plugin,options);capture(fiber);yield fiber.dispose;yield shutdownWait;});await fiber;}
 function finishWhenClosed(){
  if(phase==='closed')return Promise.resolve(receipt());
  if(finishing)return finishing;
  finishing=(async()=>{
   // Do not unload children while their apply() can still publish routes.
   await startup.promise;
   await runtime?.whenClosed();
   try{await ctx.get('sepNativeSettingsUi')?.close();await uiFiber?.dispose();await runtimeFiber?.dispose();phase='closed';problem=undefined;closed.resolve();}
   catch{phase='cleanup-blocked';problem='SEP_INSTALLATION_CLEANUP_BLOCKED';}
   return receipt();
  })().finally(()=>{finishing=undefined;});return finishing;
 }
 async function close(){
  retiredRoots.add(ctx.fiber);
  if(phase==='closed')return receipt();
  phase='draining';let timer;
  const work=(async()=>{
   const stopped=runtime?.close();
   await startup.promise;
   await Promise.allSettled(transition?[transition]:[]);
   await (stopped??runtime?.close());return finishWhenClosed();
  })();
  try{return await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>resolve(receipt()),config.runtime.shutdownMs??5000);})]);}finally{clearTimeout(timer);}
 }
 async function shutdownWait(){await close();await finishWhenClosed();}
 // Each child also installs this last-yield disposer. Cordis must join the
 // original synchronous-generator cleanup; async generators unwrap thenables.
 ctx.effect(()=>shutdownWait);
 try{
  // Publish control before any asynchronous initialization can acquire owners.
  // review/activate/stream remain gated by the root phase.
  ctx.provide('sepControlledInstallation',{
   status:receipt,whenClosed:()=>closed.promise,
   async review(){
    if(phase!=='ready'||transition)fail('SEP_INSTALLATION_STATE');
    const inner=await runtime.review();if(phase!=='ready')fail('SEP_INSTALLATION_STATE');
    plan={runtimeHash:inner.planHash,planHash:hash({runtimeHash:inner.planHash,ui:config.ui,scope:'controlled-cold-native-settings-v1'})};
    return {...plan,scope:'explicit cold settings root; default admission and complete SEP remain blocked'};
   },
   async activate(input){
    if(phase!=='ready'||transition)fail('SEP_INSTALLATION_STATE');
    if(!plan||!input||Object.keys(input).length!==1||input.planHash!==plan.planHash)fail('SEP_INSTALLATION_PLAN_INVALID');
    const current=plan;
    transition=(async()=>{await runtime.activate({planHash:current.runtimeHash});if(phase!=='ready')fail('SEP_INSTALLATION_STATE');phase='active';return {phase};})().finally(()=>{transition=undefined;});return transition;
   },close,stream:options=>{if(phase!=='active')fail(phase==='ready'||phase==='preparing'?'SEP_P1_NOT_ACTIVE':'SEP_P1_CLOSED');return runtime.stream(options);},
  });
  // Bind the inner controller to this exact root, independently of inherited
  // Loader Entry identity and any later dependency-triggered inner fibers.
  const ownedRuntime={...Runtime,apply:(child,input)=>Runtime.apply(child,input,{owner:ctx.fiber,onControl(value){runtime=value;if(phase!=='preparing')void runtime.close();}})};
  await mount(ownedRuntime,config.runtime,fiber=>{runtimeFiber=fiber;});if(!runtime)fail('SEP_INSTALLATION_RUNTIME_UNAVAILABLE');
  if(runtime.status().phase!=='ready')fail('SEP_INSTALLATION_RUNTIME_UNAVAILABLE');
  await mount(SettingsUi,config.ui,fiber=>{uiFiber=fiber;});
  if(phase!=='preparing')fail('SEP_INSTALLATION_STATE');phase='ready';startup.resolve();
 }catch(error){
  mountFailure='SEP_INSTALLATION_MOUNT_FAILED';mountCause=failureDiagnostic(error);problem=mountFailure;startup.resolve();
  const result=await close();
  if(!runtime||result.status==='pass')throw error;
  // Keep a mounted, non-admitting control owner on blocked. The trusted caller
  // repairs the underlying cause and retries close(); a fresh root is required.
 }
}
