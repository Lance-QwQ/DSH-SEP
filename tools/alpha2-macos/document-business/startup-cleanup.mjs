/** No project lease or host disposal below an unconfirmed owned worker. */
export async function cleanupFailedStartup(running,error){
 const cleaned=new Set();let closing,hostClosed=false,cleanupCause;
 function retryCleanup(){
  if(closing)return closing;
  const attempt=(async()=>{
   let current;
   try{
    if(running){
     for(const name of ['sepMacRuntime','sepMacProfile']){
      if(cleaned.has(name))continue;current=name;const owner=running.ctx.get(name);if(!owner)continue;
      const receipt=await owner.close();
      if(receipt?.status!=='pass'||receipt?.resourcesConfirmedReleased!==true)return {status:'blocked',resourcesConfirmedReleased:false,owner:name};
      cleaned.add(name);
     }
     if(!hostClosed){current='host';await running.shutdown.shutdown(1);hostClosed=true;}
    }
    return {status:'pass',resourcesConfirmedReleased:true};
   }catch(failure){cleanupCause=failure;return {status:'blocked',resourcesConfirmedReleased:false,owner:current};}
  })();
  closing=attempt.finally(()=>{closing=undefined;});return closing;
 }
 const receipt=await retryCleanup();
 if(receipt.status!=='pass')throw Object.assign(Error('SEP_MAC_BUSINESS_STARTUP_CLEANUP_BLOCKED'),{code:'SEP_MAC_BUSINESS_STARTUP_CLEANUP_BLOCKED',cause:error,...receipt,...cleanupCause?{cleanupCause}:{},retryCleanup});
 throw error;
}
