// Transport prototype only. An acknowledgment conveys no UI or lease readiness.
const MAX_FRAME=4096,MAX_PENDING=8,MAX_WRITE_BUFFER=32768,MAX_BATCH=32;
const fields=['protocol','kind','nonce','programSha256','generation','requestId'];
const error=code=>Object.assign(new Error(code),{code});
const hex=(value,length)=>typeof value==='string'&&new RegExp('^[a-f0-9]{'+length+'}$').test(value);

export function createProbeChannel({stream,binding,role,timeoutMs=2000}) {
  if(!stream||typeof stream.write!=='function'||typeof stream.on!=='function'||
     !['controller','responder'].includes(role)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||
     !binding||Object.keys(binding).sort().join(',')!=='generation,nonce,programSha256'||
     !hex(binding.nonce,64)||!hex(binding.programSha256,64)||!hex(binding.generation,32))throw error('SEP_CONTROL_CONFIG');
  binding=Object.freeze({...binding});
  let state='initial',code=null,sequence=0n,acceptedRequests=0,acceptedAcks=0,buffer=Buffer.alloc(0),resolveClosed;
  const pending=new Map(),decoder=new TextDecoder('utf-8',{fatal:true});
  const whenClosed=new Promise(resolve=>{resolveClosed=resolve;});
  const status=()=>Object.freeze({state,code,pending:pending.size,acceptedRequests,acceptedAcks});
  const inactive=()=>state==='closed'||state==='blocked';
  function terminate(nextCode,local=false){
    if(inactive())return;
    code=nextCode;state=local?'closed':'blocked';buffer=Buffer.alloc(0);
    for(const request of pending.values()){clearTimeout(request.timer);request.reject(error(code));}pending.clear();
    stream.removeListener('data',receive);stream.removeListener('end',ended);stream.removeListener('close',ended);
    stream.destroy();resolveClosed(status());
  }
  const ended=()=>terminate('SEP_CONTROL_EOF');
  function send(kind,requestId){
    const bytes=Buffer.from(JSON.stringify({protocol:1,kind,...binding,requestId})+'\n');
    if(bytes.length>MAX_FRAME+1||(stream.writableLength??0)+bytes.length>MAX_WRITE_BUFFER){terminate('SEP_CONTROL_QUEUE_FULL');return;}
    try{stream.write(bytes,err=>{if(err)terminate('SEP_CONTROL_IO');});}catch{terminate('SEP_CONTROL_IO');}
  }
  function processFrame(bytes){
    let line,frame;
    try{line=decoder.decode(bytes);frame=JSON.parse(line);}catch{terminate('SEP_CONTROL_FRAME');return;}
    if(!frame||typeof frame!=='object'||Array.isArray(frame)||Object.keys(frame).join(',')!==fields.join(',')||
       frame.protocol!==1||!['hello','ping','ack'].includes(frame.kind)||!hex(frame.requestId,24)||
       JSON.stringify(frame)!==line){terminate('SEP_CONTROL_FRAME');return;}
    if(frame.nonce!==binding.nonce||frame.programSha256!==binding.programSha256||frame.generation!==binding.generation){terminate('SEP_CONTROL_BINDING');return;}
    if(role==='controller'){
      const first=pending.entries().next().value;
      if(frame.kind!=='ack'||!first||frame.requestId!==first[0]){terminate('SEP_CONTROL_SEQUENCE');return;}
      const [id,request]=first;clearTimeout(request.timer);pending.delete(id);acceptedAcks++;
      if(request.kind==='hello')state='open';
      request.resolve(Object.freeze({kind:'ack',requestId:id}));
    }else{
      const expected=(sequence+1n).toString(16).padStart(24,'0');
      if(frame.requestId!==expected||(state==='initial'?frame.kind!=='hello':frame.kind!=='ping')){terminate('SEP_CONTROL_SEQUENCE');return;}
      sequence++;acceptedRequests++;state='open';send('ack',frame.requestId);
    }
  }
  function receive(chunk){
    if(inactive())return;
    if(!Buffer.isBuffer(chunk)){terminate('SEP_CONTROL_FRAME');return;}
    let start=0,batch=0;
    while(start<chunk.length&&!inactive()){
      const newline=chunk.indexOf(10,start),end=newline<0?chunk.length:newline,length=end-start;
      if(buffer.length+length>MAX_FRAME){terminate('SEP_CONTROL_FRAME_LIMIT');return;}
      const part=chunk.subarray(start,end);buffer=buffer.length?Buffer.concat([buffer,part]):Buffer.from(part);
      if(newline<0)return;
      if(++batch>MAX_BATCH){terminate('SEP_CONTROL_QUEUE_FULL');return;}
      const frame=buffer;buffer=Buffer.alloc(0);processFrame(frame);start=newline+1;
    }
  }
  function request(kind){
    if(inactive())return Promise.reject(error(code));
    if(role!=='controller'||(kind==='hello'?state!=='initial':state!=='open'))return Promise.reject(error('SEP_CONTROL_SEQUENCE'));
    if(pending.size>=MAX_PENDING)return Promise.reject(error('SEP_CONTROL_QUEUE_FULL'));
    if(sequence>=0xffffffffffffffffffffffffn){terminate('SEP_CONTROL_SEQUENCE');return Promise.reject(error(code));}
    const id=(++sequence).toString(16).padStart(24,'0');if(kind==='hello')state='opening';
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>terminate('SEP_CONTROL_TIMEOUT'),timeoutMs);pending.set(id,{kind,resolve,reject,timer});send(kind,id);
    });
  }
  stream.on('data',receive);stream.on('end',ended);stream.on('close',ended);stream.on('error',()=>terminate('SEP_CONTROL_IO'));
  return Object.freeze({hello:()=>request('hello'),ping:()=>request('ping'),status,whenClosed,close:()=>terminate('SEP_CONTROL_CLOSED',true)});
}
