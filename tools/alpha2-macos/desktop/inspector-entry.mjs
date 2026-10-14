// Test-only: --inspect-brk may stop before Electron/Node bootstrap finishes.
// Require Electron only at the packaged app's first executable statement.
export async function instrumentAtAppEntry(client,instrument,{timeoutMs=30000}={}){
 const events=[];let wake,breakpointId,removed=false;
 const off=client.onEvent(event=>{if(event.method==='Debugger.paused'){events.push(event.params);wake?.();}}),deadline=Date.now()+timeoutMs;
 const next=async()=>{while(!events.length){const remaining=deadline-Date.now();if(remaining<=0)throw Error('INSPECTOR_APP_ENTRY_DEADLINE');await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{wake=undefined;reject(Error('INSPECTOR_APP_ENTRY_DEADLINE'));},remaining);wake=()=>{clearTimeout(timer);wake=undefined;resolve();};});}return events.shift();};
 try{
  await client.call('Debugger.enable');
  ({breakpointId}=await client.call('Debugger.setBreakpointByUrl',{lineNumber:0,urlRegex:'(?:^|/)app\\.asar/lib/main\\.js$'}));
  if(typeof breakpointId!=='string')throw Error('INSPECTOR_APP_ENTRY_BINDING');
  await client.call('Runtime.runIfWaitingForDebugger');
  for(;;){const paused=await next();if(paused.hitBreakpoints?.includes(breakpointId))break;await client.call('Debugger.resume');}
  await instrument();await client.call('Debugger.removeBreakpoint',{breakpointId});removed=true;await client.call('Debugger.resume');
 }finally{off();if(breakpointId&&!removed)await client.call('Debugger.removeBreakpoint',{breakpointId}).catch(()=>{});}
}
