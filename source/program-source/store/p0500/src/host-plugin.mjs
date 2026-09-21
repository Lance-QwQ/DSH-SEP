import {createHash} from 'node:crypto';
import {recoveryClient} from './client.mjs';
export const name='dsh-host-recovery';
export const inject=['tools'];
export const provide=['recoveryHost'];
const fail=code=>{throw Object.assign(Error(code),{code});};
export function apply(ctx,config={}) {
 const client=recoveryClient({endpoint:config.endpoint??process.env.DSH_RECOVERY_ENDPOINT,token:config.token??process.env.DSH_RECOVERY_TOKEN});
 const pending=new Set(),lifetime=new AbortController();
 const api={projectForPath:p=>client.call('projectForPath',p),projectById:p=>client.call('projectById',p),checkContinuation:p=>client.call('checkContinuation',p),status:()=>({active:pending.size,closed:lifetime.signal.aborted})};
 ctx.provide('recoveryHost',api);
 const authority=async agent=>{
  const params={cwd:agent?.session?.header?.cwd};
  try{return await api.projectForPath(params);}catch(error){
   if(config.registerSelectedWorkspaces!==true||error.code!=='RECOVERY_PROJECT_UNKNOWN')throw error;
   lifetime.signal.throwIfAborted();
   return client.call('registerProjectForPath',params);
  }
 };
 ctx.on('agent/request',async(payload,next)=>{
  lifetime.signal.throwIfAborted();payload.signal.throwIfAborted();
  await authority(payload.agent);
  lifetime.signal.throwIfAborted();payload.signal.throwIfAborted();return next();
 });
 ctx.on('tools/execute',(exec,next)=>{
  const original=exec.signal;
  lifetime.signal.throwIfAborted();original.throwIfAborted();
  if(pending.size>=128)fail('RECOVERY_ACTIVE_LIMIT');
  // Reserve before the first asynchronous authority/receipt request. Disposal and
  // the admission limit cover the whole lifecycle, including requests not yet dispatched.
  const work=Promise.resolve().then(async()=>{
   let operation,operationId,dispatched=false,timer,polling=false,pollWork;
   const abort=new AbortController(),combined=AbortSignal.any([original,lifetime.signal,abort.signal]);
   const check=()=>{original.throwIfAborted();lifetime.signal.throwIfAborted();combined.throwIfAborted();};
   exec.signal=combined;
   try{
    check();const project=await authority(exec.agent);check();
    const taskId=exec.agent?.id??exec.agent?.session?.header?.id;
    if(typeof taskId!=='string'||typeof exec.callId!=='string')fail('RECOVERY_TASK_ID_REQUIRED');
    operationId=createHash('sha256').update(`${taskId}\n${exec.callId}`).digest('hex');
    // Unknown tools (including ordinary Shell) may have outside effects. No optimistic replay classification.
    const effect=/^(read_file|list_directory|glob|grep|suite_search|suite_memory_(recall|get|export))$/.test(exec.name)?'read':/^suite_(memory_|index|document_delete)/.test(exec.name)?'write':'external';
    operation=await client.call('beginOperation',{projectId:project.id,taskId,operationId,effect,summary:exec.name});
    check();
    timer=setInterval(()=>{
     if(polling||combined.aborted)return;polling=true;
     pollWork=(async()=>{
      try{const current=await authority(exec.agent);if(current.id!==project.id||current.generation!==operation.generation)abort.abort(Error('RECOVERY_GENERATION_CHANGED'));}
      catch{abort.abort(Error('RECOVERY_PROJECT_PAUSED'));}
      finally{polling=false;}
     })();
    },250);timer.unref();
    check();dispatched=true;
    const result=await next();
    await authority(exec.agent);check();
    const receipt=await client.call('finishOperation',{operationId,generation:operation.generation,outcome:result.isError?'unknown':'succeeded'});
    if(!receipt.accepted)fail('RECOVERY_STALE_RESULT');
    return result;
   }catch(error){
    // A received admission plus no next() invocation proves no tool dispatch. Once
    // next() ran, failures remain unknown because outside effects may already exist.
    if(operation)await client.call('finishOperation',{operationId,generation:operation.generation,outcome:dispatched?'unknown':'failed'}).catch(()=>{});
    throw error;
   }finally{clearInterval(timer);await pollWork;exec.signal=original;}
  });
  pending.add(work);return work.finally(()=>pending.delete(work));
 });
 ctx.effect(()=>async()=>{lifetime.abort();await Promise.allSettled([...pending]);});
}
