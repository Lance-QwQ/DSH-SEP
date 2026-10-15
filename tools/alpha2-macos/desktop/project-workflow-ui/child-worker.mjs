// TEST ONLY. IPC fd4 is a harness control channel, never shipped in the runtime closure.
import {Socket} from 'node:net';
import {fixture,binding,planHash} from './portable-fixture.mjs';
import {serveHost} from './transport.mjs';
import {safeCode} from './rules.mjs';
const native=process.argv[2]==='native',f=native?await (await import('./native-fixture.mjs')).nativeFixture():await fixture();
const port=new Socket({fd:3,readable:true,writable:true});
let readBytes=0,writeBytes=0,dispatched=0;port.on('data',bytes=>{readBytes+=bytes.length;});const write=port.write.bind(port);port.write=(bytes,...rest)=>{writeBytes+=bytes.length;return write(bytes,...rest);};
const server=serveHost(port,{request:(...args)=>{dispatched++;return f.host.request(...args);},closeAdmission:()=>f.host.closeAdmission()},binding);let stopping=false;
process.on('message',async request=>{
 try{
  if(request?.command==='stage'){const hash=native?await f.stage():planHash;process.send({id:request.id,value:{planHash:hash}});}
  else if(request?.command==='observe'){process.send({id:request.id,value:native?await f.observe():{generation:f.generation}});}
  else if(request?.command==='close'&&!stopping){
   stopping=true;const receipt=await f.host.close();process.stdout.write(JSON.stringify({readBytes,writeBytes,dispatched,channel:server.status()})+'\n');process.send({id:request.id,value:receipt},()=>{if(receipt.status==='pass'&&receipt.resourcesConfirmedReleased===true){server.closeAdmission();port.end();process.disconnect();}else stopping=false;});
  }else process.send({id:request?.id,error:'SEP_PROJECT_UI_TEST_COMMAND'});
 }catch(e){process.send({id:request?.id,error:safeCode(e)});}
});
process.send({ready:true,mode:native?'native':'portable',pid:process.pid});
