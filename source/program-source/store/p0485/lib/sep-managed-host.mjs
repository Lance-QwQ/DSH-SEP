import {isAbsolute,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const fault=code=>Object.assign(new Error(code),{code});
const key=value=>process.platform==='win32'?resolve(value).toLowerCase():resolve(value);
function connection(value){
 if(!value||typeof value!=='object'||typeof value.endpoint!=='string'||typeof value.token!=='string'||!/^[a-f0-9]{64}$/u.test(value.token)||value.role!=='desktop'||typeof value.projectDir!=='string'||!isAbsolute(value.projectDir)||typeof value.dshVersion!=='string'||!/^[0-9A-Za-z.+-]{1,80}$/u.test(value.dshVersion)||value.protocolVersion!==4)throw fault('RECOVERY_DESKTOP_CONNECTION');
 const url=new URL(value.endpoint);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw fault('RECOVERY_DESKTOP_CONNECTION');
 return {...value,endpoint:url.href};
}
async function boundedJson(response){
 const reader=response.body?.getReader();if(!reader)throw fault('RECOVERY_DESKTOP_RESPONSE');
 let length=0;const chunks=[];
 try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>4*1024*1024){await reader.cancel();throw fault('RECOVERY_DESKTOP_RESPONSE');}chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}finally{reader.releaseLock();}
}
function abortable(work,signal){
 if(signal.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});Promise.resolve(work).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
/** A desktop follows the guardian; it never requests another automatic restart. */
export class ManagedDesktopHost {
 constructor(value,onFailure,options={}){
  this.connection=connection(value);this.onFailure=onFailure;this.options=options;this.stopping=false;this.failed=false;
  this.pollIntervalMs=options.pollIntervalMs??1000;this.recoveryTimeoutMs=options.recoveryTimeoutMs??60000;this.requestTimeoutMs=options.requestTimeoutMs??5000;
  for(const value of [this.pollIntervalMs,this.recoveryTimeoutMs,this.requestTimeoutMs])if(!Number.isSafeInteger(value)||value<1||value>60000)throw fault('RECOVERY_DESKTOP_OPTIONS');
 }
 async call(method,signal,timeout=this.requestTimeoutMs){
  const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);
  const response=await fetch(new URL('rpc',this.connection.endpoint),{method:'POST',headers:{authorization:`Bearer ${this.connection.token}`,'content-type':'application/json'},body:JSON.stringify({method,params:{}}),signal:requestSignal,redirect:'error'});
  if(response.status===401||response.status===403){await response.body?.cancel();throw fault('RECOVERY_DESKTOP_CONNECTION');}
  const body=await boundedJson(response);
  if(!response.ok||body.ok!==true||body.result===null||typeof body.result!=='object')throw fault('RECOVERY_DESKTOP_UNAVAILABLE');
  return body.result;
 }
 async identity(signal){
  const status=await this.call('desktopStatus',signal);
  if(typeof status.projectDir!=='string'||key(status.projectDir)!==key(this.connection.projectDir)||status.dshVersion!==this.connection.dshVersion||status.protocolVersion!==4||status.transport!=='desktop-http')throw fault('RECOVERY_DESKTOP_IDENTITY');
  return status;
 }
 checkedReady(ready,guardian){
  if(!guardian||ready.transport!=='desktop-http'||ready.dshVersion!==this.connection.dshVersion||!Array.isArray(ready.injections)||!Number.isSafeInteger(ready.generation)||ready.generation<1||!Number.isSafeInteger(ready.pid)||ready.pid<1||ready.generation!==guardian.generation||ready.pid!==guardian.pid||guardian.phase!=='running'||guardian.intent!=='active'||guardian.closed||typeof ready.url!=='string')throw fault('RECOVERY_DESKTOP_IDENTITY');
  if(this.generation!==undefined&&(ready.generation<this.generation||ready.generation===this.generation&&ready.pid!==this.pid))throw fault('RECOVERY_DESKTOP_IDENTITY');
  let url;try{url=new URL(ready.url);}catch{throw fault('RECOVERY_DESKTOP_IDENTITY');}
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.hash||url.pathname!=='/'||[...url.searchParams.keys()].length!==1||!/^[A-Za-z0-9_-]{16,256}$/u.test(url.searchParams.get('token')??''))throw fault('RECOVERY_DESKTOP_IDENTITY');
  return {...ready,url:url.href};
 }
 async start(){
  await this.identity();const started=await this.call('startHost',undefined,55000);
  if(started.phase!=='running')throw fault('RECOVERY_DESKTOP_UNAVAILABLE');
  const ready=await this.call('desktopReady'),status=await this.identity();
  this.checkedReady(ready,started);this.checkedReady(ready,status.guardian);
  this.generation=ready.generation;this.pid=ready.pid;this.stopping=false;this.failed=false;
  if(this.onFailure)this.watch();return ready;
 }
 watch(){
  if(this.stopping||this.failed)return;
  clearTimeout(this.poll);this.poll=setTimeout(()=>{void this.check().finally(()=>this.watch());},this.pollIntervalMs);this.poll.unref?.();
 }
 async check(){
  if(this.stopping||this.failed)return;
  let status,error;
  try{status=await this.identity();const guardian=status.guardian;if(this.stopping)return;if(guardian?.intent==='active'&&guardian.phase==='running'&&guardian.generation===this.generation&&guardian.pid===this.pid&&!guardian.closed)return;}catch(e){error=e;}
  if(this.stopping)return;
  try{await this.reconnect(status,error);}catch(e){if(this.stopping)return;this.failed=true;this.options.onUnavailable?.('blocked');this.onFailure?.(e instanceof Error?e:fault('RECOVERY_DESKTOP_UNAVAILABLE'));}
 }
 async reconnect(status,initialError){
  this.options.onUnavailable?.('recovering');
  const controller=this.recovery=new AbortController();const timer=setTimeout(()=>controller.abort(fault('RECOVERY_DESKTOP_RECOVERY_TIMEOUT')),this.recoveryTimeoutMs);
  const signal=controller.signal;
  try{
   if(initialError&&!this.transient(initialError))throw initialError;
   for(;;){
    signal.throwIfAborted();if(this.stopping)return;
    try{
     status??=await this.identity(signal);const guardian=status.guardian;
     if(!guardian||guardian.closed||guardian.intent!=='active'||!['starting','running','restarting'].includes(guardian.phase))throw fault('RECOVERY_DESKTOP_RECOVERY_BLOCKED');
     if(guardian.phase==='running'){
      const ready=this.checkedReady(await this.call('desktopReady',signal),guardian);
      this.checkedReady(ready,(await this.identity(signal)).guardian);
      if(typeof this.options.authenticate!=='function'||typeof this.options.onReconnected!=='function')throw fault('RECOVERY_DESKTOP_RECONNECT_UNAVAILABLE');
      const cookie=await abortable(this.options.authenticate(ready.url,signal),signal);
      this.checkedReady(ready,(await this.identity(signal)).guardian);
      signal.throwIfAborted();if(this.stopping)return;
      this.generation=ready.generation;this.pid=ready.pid;
      await abortable(this.options.onReconnected(ready,cookie,signal),signal);
      signal.throwIfAborted();return;
     }
    }catch(error){if(signal.aborted)throw signal.reason;if(!this.transient(error))throw error;}
    status=undefined;await delay(this.pollIntervalMs,undefined,{signal});
   }
  }catch(error){throw signal.aborted?signal.reason:error;}finally{clearTimeout(timer);if(this.recovery===controller)this.recovery=undefined;}
 }
 transient(error){return error?.code==='RECOVERY_DESKTOP_UNAVAILABLE'||error?.name==='TypeError'||error?.name==='TimeoutError';}
 async stop(requireCleanStop=false){
  this.stopping=true;clearTimeout(this.poll);this.recovery?.abort(fault('RECOVERY_DESKTOP_CANCELLED'));
  if(this.stopPromise)return this.stopPromise;
  this.stopPromise=(async()=>{const stopped=await this.call('stopHost',undefined,55000);const exit=stopped.lastExit;if(stopped.phase!=='stopped'||requireCleanStop&&(exit?.forced!==false||exit.code!==0))throw fault('RECOVERY_DESKTOP_STOP_UNCONFIRMED');})();return this.stopPromise;
 }
 async updateTasks(){throw fault('SEP_CONTROLLED_UPDATE_REQUIRED');}
}
