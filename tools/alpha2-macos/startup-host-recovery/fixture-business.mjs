import {createServer} from 'node:http';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {cleanupFailedStartup} from '../document-business/startup-cleanup.mjs';

// Synthetic business owns a real listening socket. Only its trusted cleanup can
// release it; test cleanup kills only the child object that the test spawned.
export async function openMacBusiness(input){
 const events=join(input.root,'events.log'),gate=join(input.root,'gate');
 const event=value=>appendFile(events,value+'\n');
 if(input.mode==='ordinary'||input.mode==='wrong-code'||input.mode==='missing-function'){
  const error=Object.assign(Error('private startup details'),{code:input.mode==='missing-function'?'SEP_MAC_BUSINESS_STARTUP_CLEANUP_BLOCKED':input.mode==='ordinary'?'private-code':'SEP_MAC_OTHER_FAILURE'});
  if(input.mode==='wrong-code')error.retryCleanup=async()=>{await event('must-never-run');return {status:'pass',resourcesConfirmedReleased:true};};
  throw error;
 }
 const server=createServer((_req,res)=>res.end('held'));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 server.unref(); // After parent disconnect, only the host's keepAlive owns liveness.
 await writeFile(join(input.root,'resource.json'),JSON.stringify({pid:process.pid,port:server.address().port}));
 if(input.openDelayMs)await new Promise(resolve=>setTimeout(resolve,input.openDelayMs));
 const running={ctx:{get:name=>name==='sepMacRuntime'?{close:async()=>{
  await event('runtime-close');const value=await readFile(gate,'utf8').catch(()=>'blocked');
  if(value!=='release')return {status:'blocked',resourcesConfirmedReleased:false};
  await new Promise(resolve=>server.close(resolve));await event('socket-released');return {status:'pass',resourcesConfirmedReleased:true};
 }}:{close:async()=>{await event('profile-close');return {status:'pass',resourcesConfirmedReleased:true};}}},shutdown:{shutdown:async code=>{await event('host-shutdown');process.exitCode=code;}}};
 try{await cleanupFailedStartup(running,Object.assign(Error('private original details'),{code:'SEP_MAC_FIXTURE_START_FAILURE'}));}
 catch(error){
  const retry=error.retryCleanup;
  error.retryCleanup=async()=>{
   const value=await readFile(gate,'utf8').catch(()=>'blocked');
   if(value==='throw')throw Object.assign(Error('private retry details'),{code:'private-retry-code'});
   if(value==='unconfirmed')return {status:'pass',resourcesConfirmedReleased:false};
   if(value==='unknown')return undefined;
   return retry();
  };
  throw error;
 }
}
