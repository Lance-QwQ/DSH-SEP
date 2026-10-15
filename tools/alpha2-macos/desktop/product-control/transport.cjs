'use strict';
const error=code=>Object.assign(Error(code),{code});
const hex=(x,n)=>typeof x==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(x);
const extensions={initialize:[],activate:[],requestQuit:[],connected:['replyTo'],ready:['surface'],activated:['replyTo'],quitCancelled:['replyTo'],quitting:[],failure:['code']};
const directions={broker:['initialize','activate','requestQuit'],electron:['connected','ready','activated','quitCancelled','quitting','failure']};
const keys=['protocol','kind','nonce','programSha256','generation','requestId'];
const validBinding=b=>b&&Object.keys(b).sort().join(',')==='generation,nonce,programSha256'&&hex(b.nonce,64)&&hex(b.programSha256,64)&&hex(b.generation,32);
/** Private owned stream only. Parsing a frame does not prove UI or OS cleanup. */
exports.createProductChannel=function({stream,role,binding,programSha256,onFrame,onFailure=()=>{},onEnd=()=>{}}){
 if(!directions[role]||!stream||typeof stream.on!=='function'||typeof stream.write!=='function'||typeof onFrame!=='function'||role==='broker'&&!validBinding(binding)||role==='electron'&&!hex(programSha256,64))throw error('SEP_PRODUCT_CONFIG');
 let bound=role==='broker'?Object.freeze({nonce:binding.nonce,programSha256:binding.programSha256,generation:binding.generation}):null,sendSeq=0n,receiveSeq=0n,blocked=false,peerEnded=false,buffer=Buffer.alloc(0);
 const decoder=new TextDecoder('utf-8',{fatal:true});
 function fail(code='SEP_PRODUCT_PROTOCOL'){if(!blocked){blocked=true;buffer=Buffer.alloc(0);try{onFailure(code);}catch{}stream.destroy();}return error(code);}
 function validate(f,line){
  if(!f||!Object.hasOwn(extensions,f.kind)||Object.keys(f).join(',')!==[...keys,...extensions[f.kind]].join(',')||f.protocol!==2||!hex(f.requestId,24)||JSON.stringify(f)!==line)throw error('SEP_PRODUCT_PROTOCOL');
  if(!validBinding({nonce:f.nonce,programSha256:f.programSha256,generation:f.generation}))throw error('SEP_PRODUCT_PROTOCOL');
  if('replyTo'in f&&!hex(f.replyTo,24)||'surface'in f&&!['workspace','welcome'].includes(f.surface)||'code'in f&&!/^SEP_[A-Z0-9_]{1,90}$/.test(f.code))throw error('SEP_PRODUCT_PROTOCOL');
 }
 function send(kind,extra={}){
  if(blocked)throw error('SEP_PRODUCT_PROTOCOL');if(peerEnded)throw error('SEP_PRODUCT_EOF');
  if(!bound||!directions[role].includes(kind)||sendSeq===0n&&kind!==(role==='broker'?'initialize':'connected')||sendSeq>0n&&['initialize','connected'].includes(kind)||sendSeq>=0xffffffffffffffffffffffffn)throw fail();
  const id=(sendSeq+1n).toString(16).padStart(24,'0'),frame={protocol:2,kind,...bound,requestId:id,...extra},line=JSON.stringify(frame);
  try{validate(frame,line);}catch{throw fail();}
  if(Buffer.byteLength(line)>4096||(stream.writableLength??0)+Buffer.byteLength(line)+1>32768)throw fail('SEP_PRODUCT_QUEUE');
  sendSeq++;try{stream.write(line+'\n',e=>{if(e)fail('SEP_PRODUCT_IO');});}catch{throw fail('SEP_PRODUCT_IO');}return id;
 }
 function dispatch(bytes){
  let f;try{const line=decoder.decode(bytes);f=JSON.parse(line);validate(f,line);
   if(!directions[role==='broker'?'electron':'broker'].includes(f.kind)||BigInt('0x'+f.requestId)!==receiveSeq+1n)throw error();
   if(receiveSeq===0n&&f.kind!==(role==='broker'?'connected':'initialize')||receiveSeq>0n&&['connected','initialize'].includes(f.kind))throw error();
   if(!bound){if(f.programSha256!==programSha256)throw error();bound=Object.freeze({nonce:f.nonce,programSha256:f.programSha256,generation:f.generation});}
   if(f.nonce!==bound.nonce||f.programSha256!==bound.programSha256||f.generation!==bound.generation)throw error();
   receiveSeq++;onFrame(Object.freeze(f));
  }catch{fail();}
 }
 function receive(chunk){if(blocked||peerEnded)return;if(!Buffer.isBuffer(chunk)){fail();return;}let at=0,count=0;while(at<chunk.length&&!blocked){const n=chunk.indexOf(10,at),end=n<0?chunk.length:n;if(buffer.length+end-at>4096){fail('SEP_PRODUCT_FRAME_LIMIT');return;}const part=chunk.subarray(at,end);buffer=buffer.length?Buffer.concat([buffer,part]):Buffer.from(part);if(n<0)return;if(++count>32){fail('SEP_PRODUCT_QUEUE');return;}const frame=buffer;buffer=Buffer.alloc(0);dispatch(frame);at=n+1;}}
 stream.on('data',receive);stream.on('error',()=>fail('SEP_PRODUCT_IO'));stream.on('end',()=>{peerEnded=true;if(buffer.length)fail();try{onEnd();}catch{fail();}if(!stream.destroyed)stream.end();});stream.on('close',()=>{if(!peerEnded&&!blocked)fail('SEP_PRODUCT_EOF');});
 return Object.freeze({send,binding:()=>bound,status:()=>Object.freeze({blocked,peerEnded,received:Number(receiveSeq),sent:Number(sendSeq)})});
};
