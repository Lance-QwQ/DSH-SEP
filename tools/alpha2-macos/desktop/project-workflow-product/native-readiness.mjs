// Test-only condition observation. It never retries a failed action/IPC call.
import {setTimeout as pause} from 'node:timers/promises';
const error=code=>Object.assign(Error(code),{code});
export async function observeReady({read,pendingCode,deadlineCode,timeoutMs=20000,intervalMs=50,signal,onSample=()=>{}}){
 if(typeof read!=='function'||typeof onSample!=='function'||!/^SEP_[A-Z0-9_]+$/.test(deadlineCode??'')||pendingCode!==undefined&&pendingCode!=='SEP_WORKSPACE_BRAND_UNAVAILABLE'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000||!Number.isSafeInteger(intervalMs)||intervalMs<1||intervalMs>1000)throw error('SEP_PROJECT_NATIVE_OBSERVATION_CONFIG');
 if(signal?.aborted)throw error('SEP_WORKSPACE_CLEANUP_REQUESTED');
 const started=performance.now();let attempt=0,done=false,timer,abort;
 const sample=classification=>onSample({attempt,classification,elapsedMs:Math.round(performance.now()-started)});
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{if(!done){done=true;sample('deadline');reject(error(deadlineCode));}},timeoutMs);abort=()=>{if(!done){done=true;sample('cancelled');reject(error('SEP_WORKSPACE_CLEANUP_REQUESTED'));}};if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});});
 const work=(async()=>{while(!done){attempt++;let value;try{value=await read();}catch(e){if(done)return;if(!pendingCode||(e?.code??e?.message)!==pendingCode){sample(/^(?:SEP_[A-Z0-9_]{1,90}|ERR_ASSERTION)$/.test(e?.code??e?.message??'')?e.code??e.message:'error');throw e;}sample(pendingCode);await pause(intervalMs);continue;}if(done)return;if(value){sample('ready');return value;}sample('not-ready');await pause(intervalMs);}})();
 try{return await Promise.race([work,deadline]);}finally{done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
