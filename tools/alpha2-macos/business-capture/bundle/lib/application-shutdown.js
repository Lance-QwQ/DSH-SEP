const fail=code=>{throw Object.assign(new Error(code),{code});};

/** Bind one explicitly dedicated application to its host's process controller.
 * This is a trusted launcher API, not an Agent tool or a shared-host unload.
 * The host supplies its actual exit/dispose functions; no process names or
 * external PIDs are selected here. A deadline exit remains blocked cleanup.
 */
export function createApplicationShutdown(options){
 const {dedicatedHost,installation,dispose,createProcessShutdown,forceExit,complete,timeoutMs=5000}=options??{};
 if(dedicatedHost!==true||!installation||['close','whenClosed'].some(key=>typeof installation[key]!=='function')||[dispose,createProcessShutdown,forceExit,complete].some(value=>typeof value!=='function')||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000)fail('SEP_APPLICATION_SHUTDOWN_INPUT');
 let phase='ready',closing;
 const begin=()=>{
  if(phase!=='ready')return;
  phase='stopping';
  // close() synchronously withdraws admission before the process controller's
  // asynchronous disposal tick. Preserve any rejection for its disposer.
  try{closing=Promise.resolve(installation.close());}catch(error){closing=Promise.reject(error);}
  void closing.catch(()=>{});
 };
 const controller=createProcessShutdown(async()=>{
  const receipt=await closing;
  if(receipt.status!=='pass')await installation.whenClosed();
  await dispose();
 },code=>{phase='forced';forceExit(code);},code=>{phase='closed';complete(code);},timeoutMs);
 return Object.freeze({
  status:()=>({status:phase==='closed'?'pass':'blocked',phase,timeoutMs,dedicatedHost:true,resourcesConfirmedReleased:phase==='closed'}),
  shutdown(code){begin();return controller.shutdown(code);},
  interrupt(code){begin();controller.interrupt(code);},
 });
}
