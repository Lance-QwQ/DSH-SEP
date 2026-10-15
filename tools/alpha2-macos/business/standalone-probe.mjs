// Dedicated, empty-data process: official runProfile owns process handlers.
import {openMacBusiness} from './standalone.mjs';
let business;
process.on('message',async message=>{
 try{
  if(message.type==='open'){
   business=await openMacBusiness(message.input);
   const response=await fetch(business.ready.url,{signal:AbortSignal.timeout(10000),redirect:'manual'});
   const inspected=await business.inspectQuit();
   process.send({phase:'ready',status:response.status,authenticatedUrlPresent:typeof business.ready.url==='string',injections:Array.isArray(business.ready.injections)?business.ready.injections.length:typeof business.ready.injections,inspected});
  }else if(message.type==='close'){
   const receipt=await business.close();process.send({phase:'closed',receipt},()=>{if(receipt.status==='pass')process.disconnect();});
  }
 }catch(error){process.send({phase:'failed',code:error?.code??error?.name??'UNKNOWN',diagnostic:String(error?.stack??error)},()=>process.disconnect());process.exitCode=1;}
});
