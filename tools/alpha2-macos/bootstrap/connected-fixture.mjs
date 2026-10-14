// Captured synthetic controller; never included in a product runtime closure.
import {Socket} from 'node:net';
import {randomBytes} from 'node:crypto';
const mode='@@MODE@@',socket=new Socket({fd:3,readable:true,writable:true});
let input='',binding,generation=randomBytes(16).toString('hex'),quits=0,ended=false;
const send=(kind,extra={})=>socket.write(JSON.stringify({protocol:1,kind,...binding,generation,...extra})+'\n');
function finish(exit=0){if(ended)return;ended=true;send('closed',{status:'pass',resourcesConfirmedReleased:true});process.exitCode=exit;socket.end();}
socket.on('data',b=>{input+=b.toString('utf8');for(;;){const at=input.indexOf('\n');if(at<0)return;const frame=JSON.parse(input.slice(0,at));input=input.slice(at+1);
 if(!binding){if(frame.kind!=='initialize')throw Error('FIXTURE_INITIALIZE');binding={nonce:frame.nonce,programSha256:frame.programSha256};send('owned');
  if(mode==='startup-late'){setTimeout(()=>finish(1),3300);continue;}
  if(mode==='failed-startup'){send('blocked',{code:'SEP_PRODUCT_FIXTURE_STARTUP_FAILED',resourcesConfirmedReleased:false});setTimeout(()=>finish(1),50);continue;}
  send('ready',{desktopReady:true});continue;
 }
 if(frame.nonce!==binding.nonce||frame.generation!==generation)throw Error('FIXTURE_BINDING');
 if(frame.kind==='activate')send('activated',{requestId:frame.requestId});
 else if(frame.kind==='requestQuit'){
  quits++;if(mode==='cancel-retry'&&quits===1){send('quitCancelled',{requestId:frame.requestId});continue;}
  send('quitting');setTimeout(()=>finish(),mode==='shutdown-late'?3300:60);
 }else throw Error('FIXTURE_KIND');
}});
socket.on('end',()=>socket.end());
