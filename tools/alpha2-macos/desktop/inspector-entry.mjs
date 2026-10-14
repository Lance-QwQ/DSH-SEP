// Test-only: --inspect-brk may stop before Electron/Node bootstrap finishes.
// Require Electron only at the packaged app's first executable statement.
export async function instrumentAtAppEntry(client,instrument,{timeoutMs=30000,diagnoseExceptions=false}={}){
 const events=[],trace=[],scripts=new Map();let wake,breakpointId,removed=false;
 const record=value=>{trace.push(value);if(trace.length>32)trace.shift();};
 const off=client.onEvent(event=>{
  if(event.method==='Debugger.scriptParsed'){scripts.set(event.params.scriptId,event.params.url);if(/app\.asar|sep-mac|sep-update/.test(event.params.url))record({event:'scriptParsed',url:event.params.url});}
  if(event.method==='Debugger.breakpointResolved')record({event:'breakpointResolved',id:event.params.breakpointId,location:event.params.location});
  if(event.method==='Debugger.paused'){record({event:'paused',reason:event.params.reason,exception:diagnoseExceptions?String(event.params.data?.description??'').slice(0,2048):undefined,hitBreakpoints:event.params.hitBreakpoints,frames:event.params.callFrames?.slice(0,3).map(f=>({name:f.functionName,url:f.url||scripts.get(f.location.scriptId),line:f.location.lineNumber}))});events.push(event.params);wake?.();}
 }),deadline=Date.now()+timeoutMs;
 const next=async()=>{while(!events.length){const remaining=deadline-Date.now();if(remaining<=0)throw Error('INSPECTOR_APP_ENTRY_DEADLINE');await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{wake=undefined;reject(Error('INSPECTOR_APP_ENTRY_DEADLINE'));},remaining);wake=()=>{clearTimeout(timer);wake=undefined;resolve();};});}return events.shift();};
 try{
  await client.call('Debugger.enable');
  if(diagnoseExceptions)await client.call('Debugger.setPauseOnExceptions',{state:'all'});
  ({breakpointId}=await client.call('Debugger.setBreakpointByUrl',{lineNumber:0,urlRegex:'(?:^|/)app\\.asar/lib/main\\.js$'}));
  if(typeof breakpointId!=='string')throw Error('INSPECTOR_APP_ENTRY_BINDING');
  await client.call('Runtime.runIfWaitingForDebugger');
  for(;;){const paused=await next();if(paused.hitBreakpoints?.includes(breakpointId))break;await client.call('Debugger.resume');}
  await instrument();await client.call('Debugger.removeBreakpoint',{breakpointId});removed=true;await client.call('Debugger.resume');
 }catch(error){error.diagnostic={...error.diagnostic,entryTrace:trace,breakpointId};throw error;}
 finally{off();if(breakpointId&&!removed)await client.call('Debugger.removeBreakpoint',{breakpointId}).catch(()=>{});}
}
