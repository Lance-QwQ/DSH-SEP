// Synthetic controller only: no host, files, model, shell or descendants.
import {Socket} from 'node:net';
import {createInterface} from 'node:readline';
const scenario=process.argv[2],socket=new Socket({fd:3,readable:true,writable:true});
const lines=createInterface({input:socket,crlfDelay:Infinity});
let binding,quits=0;
const send=(kind,extra={})=>socket.write(JSON.stringify({...binding,kind,...extra})+'\n');
socket.on('error',()=>{process.exitCode=1;socket.destroy();});
for await(const line of lines){
 const value=JSON.parse(line);
 if(value.kind==='initialize'){
  binding={protocol:1,nonce:value.nonce,programSha256:value.programSha256,generation:'c'.repeat(32)};
  if(scenario==='wrong-nonce'){send('owned',{nonce:'0'.repeat(64)});socket.end();break;}
  send('owned');send('ready',{desktopReady:true});
  if(scenario==='exit-without-proof'){socket.end();break;}
 }else if(value.kind==='activate')send('activated',{requestId:value.requestId});
 else if(value.kind==='requestQuit'){
  if(scenario==='quit-no-reply')continue;
  if(scenario==='cancel-then-quit'&&quits++===0)send('quitCancelled',{requestId:value.requestId});
  else{send('quitting');send('closed',{status:'pass',resourcesConfirmedReleased:true});socket.end();break;}
 }else throw Error('SYNTHETIC_BOOTSTRAP_FRAME');
}
