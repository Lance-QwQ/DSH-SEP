import {randomUUID} from 'node:crypto';
import {SessionId} from '@deepseek-ai/dsh-session';

/** Alpha.2 owns cancellation after publication through activation.dispose().
 * Expose the former suite-owned run shape without mutating the host service.
 * Caller delivery avoids a second model-visible parent notification. */
export async function startSuiteActivation(ctx,input){
 if(typeof ctx.subagents?.startActivation!=='function')throw Object.assign(Error('SEP_ALPHA2_SUBAGENT_UNAVAILABLE'),{code:'SEP_ALPHA2_SUBAGENT_UNAVAILABLE'});
 const {signal,label,...request}=input;signal.throwIfAborted();
 const activation=await ctx.subagents.startActivation({provider:'spawn',childId:SessionId(randomUUID()),label,signal,delivery:'caller',request});
 let closed=false,closing;
 const dispose=()=>{
  if(closed)return Promise.resolve();
  if(closing)return closing;
  closing=Promise.resolve().then(()=>activation.dispose()).then(()=>{closed=true;signal.removeEventListener('abort',abort);}).finally(()=>{closing=undefined;});
  return closing;
 };
 const abort=()=>{void dispose().catch(()=>{});};
 signal.addEventListener('abort',abort,{once:true});
 if(signal.aborted)abort();
 // Both normal finalization and failed teardown retain the caller's disposer.
 const result=activation.result.finally(()=>signal.removeEventListener('abort',abort));
 // Publication is persisted before the caller awaits result. Keep a capture
 // failure observed during that interval; awaiting result still rejects.
 void result.catch(()=>{});
 return {id:activation.childId,result,dispose};
}
