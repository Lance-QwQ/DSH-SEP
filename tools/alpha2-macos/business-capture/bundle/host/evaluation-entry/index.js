import {Entry} from './entry.mjs';
export const name='dsh-sep-owned-evaluation-entry';
export const inject=['tools','agents'];
export async function apply(ctx,config,ownership){
 const entry=new Entry(ctx,config,{ownership});let receipt={status:'not_run',scope:'entry_not_started'},closing,activationFailure;
 const safeReason=error=>/^[A-Z_]{1,64}$/.test(error?.message??'')?error.message:'ENTRY_OPERATION_FAILED';
 const snapshot=()=>structuredClone({...receipt,phase:entry.state,...activationFailure?{activationFailure}:{}});
 const stop=()=>closing??=(async()=>{receipt=await entry.stop();return snapshot();})().finally(()=>{closing=undefined;});
 ctx.provide('sepEvaluationEntry',Object.freeze({status:snapshot,stop}));
 const abort=()=>{stop().catch(()=>{});};ownership.signal.addEventListener('abort',abort,{once:true});
 ctx.effect(()=>async()=>{ownership.signal.removeEventListener('abort',abort);await stop();});
 try{receipt=await entry.start();if(ownership.signal.aborted)await stop();}
 catch(error){activationFailure=safeReason(error);receipt={status:'blocked',scope:'entry_activation_only',reason:safeReason(error),recoveryRequired:true};}
}
