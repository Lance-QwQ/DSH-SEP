import{createLaunchControl}from'./launch-control.mjs';
const error=code=>Object.assign(Error(code),{code}),hex=(x,n)=>typeof x==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(x);
const exact=(v,keys)=>v&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function createControllerBridge({stream,programSha256,initializationMs=5000}){
 if(!hex(programSha256,64)||!stream||typeof stream.write!=='function'||!Number.isSafeInteger(initializationMs)||initializationMs<1||initializationMs>10000)throw error('SEP_PRODUCT_CONFIG');
 let nonce,generation,blocked=false,poisoned=false,closed=false,peerEnded=false,buffer=Buffer.alloc(0),resolveInit,rejectInit,resolveClosed,rejectClosed;
 const requests=new Set(),decoder=new TextDecoder('utf-8',{fatal:true});
 const initialized=new Promise((r,j)=>{resolveInit=r;rejectInit=j;}),transportClosed=new Promise((r,j)=>{resolveClosed=r;rejectClosed=j;});transportClosed.catch(()=>{});
 function send(kind,extra={}){
  if(!generation||stream.destroyed||peerEnded)throw error('SEP_PRODUCT_BOOTSTRAP_IO');const data=JSON.stringify({protocol:1,kind,nonce,programSha256,generation,...extra})+'\n';if((stream.writableLength??0)+Buffer.byteLength(data)>32768)throw error('SEP_PRODUCT_QUEUE');
  stream.write(data,e=>{if(e)block('SEP_PRODUCT_BOOTSTRAP_IO');});
 }
 function block(code){if(poisoned)return;blocked=true;poisoned=true;clearTimeout(timer);rejectInit(error(code));rejectClosed(error(code));if(generation){try{send('blocked',{code,resourcesConfirmedReleased:false});}catch{}}stream.destroy();}
 const control=createLaunchControl({onEvent(event){
  if(!nonce||poisoned)throw error('SEP_PRODUCT_BOOTSTRAP_PROTOCOL');
  if(event.kind==='owned'){if(generation)throw error('SEP_PRODUCT_BOOTSTRAP_PROTOCOL');generation=event.generation;send('owned');return;}
  if(event.generation!==generation)throw error('SEP_PRODUCT_BOOTSTRAP_PROTOCOL');
  if(event.kind==='ready')send('ready',{desktopReady:true});
  else if(['activated','quitCancelled'].includes(event.kind))send(event.kind,{requestId:event.requestId});
  else if(event.kind==='quitting')send('quitting');
  else if(event.kind==='blocked'){blocked=true;send('blocked',{code:event.code,resourcesConfirmedReleased:false});}
 }});
 const timer=setTimeout(()=>block('SEP_PRODUCT_BOOTSTRAP_DEADLINE'),initializationMs);
 function dispatch(bytes){try{
  const line=decoder.decode(bytes),f=JSON.parse(line),rawKeys=[...line.matchAll(/"([^"\\]*)"\s*:/g)].map(x=>x[1]);if(new Set(rawKeys).size!==rawKeys.length||rawKeys.length!==Object.keys(f??{}).length)throw error();
  if(!nonce){if(!exact(f,['protocol','kind','nonce','programSha256'])||f.protocol!==1||f.kind!=='initialize'||!hex(f.nonce,64)||f.programSha256!==programSha256)throw error();nonce=f.nonce;clearTimeout(timer);resolveInit(Object.freeze({nonce,programSha256}));return;}
  if(blocked||!generation||!exact(f,['protocol','kind','nonce','programSha256','generation','requestId'])||f.protocol!==1||!['activate','requestQuit'].includes(f.kind)||f.nonce!==nonce||f.programSha256!==programSha256||f.generation!==generation||!hex(f.requestId,24)||requests.has(f.requestId)||requests.size>=4096)throw error();
  requests.add(f.requestId);if(f.kind==='activate')control.activate(f.requestId);else control.requestQuit(f.requestId);
 }catch{block('SEP_PRODUCT_BOOTSTRAP_PROTOCOL');}}
 stream.on('data',chunk=>{if(poisoned||closed)return;if(!Buffer.isBuffer(chunk)){block('SEP_PRODUCT_BOOTSTRAP_PROTOCOL');return;}let at=0,count=0;while(at<chunk.length&&!poisoned){const n=chunk.indexOf(10,at),end=n<0?chunk.length:n;if(buffer.length+end-at>4096){block('SEP_PRODUCT_FRAME_LIMIT');return;}const part=chunk.subarray(at,end);buffer=buffer.length?Buffer.concat([buffer,part]):Buffer.from(part);if(n<0)return;if(++count>32){block('SEP_PRODUCT_QUEUE');return;}const frame=buffer;buffer=Buffer.alloc(0);dispatch(frame);at=n+1;}});
 stream.on('error',()=>block('SEP_PRODUCT_BOOTSTRAP_IO'));stream.on('end',()=>{peerEnded=true;if(!closed||buffer.length)block('SEP_PRODUCT_BOOTSTRAP_EOF');else stream.end();});stream.on('close',()=>{if(closed&&peerEnded&&!poisoned)resolveClosed();else block('SEP_PRODUCT_BOOTSTRAP_EOF');});
 return Object.freeze({initialized,control,status:()=>Object.freeze({owned:!!generation,generation:generation??null,blocked,closed}),async complete(receipt){
  if(receipt?.status!=='pass'||receipt.resourcesConfirmedReleased!==true||!generation||poisoned||closed)throw error('SEP_PRODUCT_CLEANUP_UNCONFIRMED');
  send('closed',{status:'pass',resourcesConfirmedReleased:true});closed=true;stream.end();await transportClosed;
 }});
}
