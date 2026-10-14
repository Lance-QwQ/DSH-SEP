// Synthetic child-process fixture only; excluded from runtime payloads.
export async function openMacBusiness(input){
 if(input.failCode)throw Object.assign(Error('private fixture error details'),{code:input.failCode});
 let attempts=0;const hold=setInterval(()=>{},1000);
 return {ready:{url:'http://127.0.0.1:32123/?token=abcdefghijklmnop',injections:[]},inspectQuit:async()=>({activeTasks:input.active===true,scheduledTasks:false}),
 async close(){attempts++;if(input.blockFirst&&attempts===1)return{status:'blocked',resourcesConfirmedReleased:false};clearInterval(hold);return{status:'pass',resourcesConfirmedReleased:true};}};
}
