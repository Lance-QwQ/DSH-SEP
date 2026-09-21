import {Entry} from './entry.mjs';
export const name='dsh-sep-trusted-evaluation-entry';
export const inject=['tools'];
// Trusted host service only: never registered as a model-callable tool.
export async function apply(ctx,config={}){
 const entry=new Entry(ctx,config);
 let receipt={status:'not_run',scope:'disabled'},closing;
 const safeReason=e=>/^[A-Z_]{1,64}$/.test(e?.message??'')?e.message:'ENTRY_OPERATION_FAILED';
 const snapshot=()=>structuredClone({...receipt,phase:entry.state,...entry.state==='blocked'?{status:'blocked',recoveryRequired:true}:{}});
 const stop=()=>closing??=(async()=>{try{receipt=await entry.stop();}catch(e){receipt={status:'blocked',scope:'entry_shutdown_only',reason:safeReason(e)};}return snapshot();})();
 ctx.provide('sepEvaluationEntry',Object.freeze({status:snapshot,stop}));
 ctx.effect(()=>async()=>{await stop();});
 try{receipt=await entry.start();}catch(e){receipt={status:'blocked',scope:'entry_activation_only',reason:safeReason(e),recoveryRequired:true};}
}
