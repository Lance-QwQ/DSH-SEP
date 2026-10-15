import {LIMITS,fail,exact,checkBinding,operations,safeCode} from './rules.mjs';
const methods=[...operations,'bind','revoke','page','confirmCommit'];
const error=()=>Object.assign(Error('SEP_PROJECT_UI_CHANNEL'),{code:'SEP_PROJECT_UI_CHANNEL'});

// The composition must pass the exact owned child's private duplex endpoint.
// This module never discovers a socket, accepts a listener, or exposes an HTTP route.
function channel(port,input,onFrame,onBroken){
 const binding=checkBinding(input);let open=true,buffer=Buffer.alloc(0),queued=0;
 function block(){if(!open)return;open=false;buffer=Buffer.alloc(0);onBroken();}
 function send(type,id,value){
  if(!open)throw error();const message={schema:1,...binding,type,id,...value},bytes=Buffer.from(JSON.stringify(message)+'\n');
  if(bytes.length>LIMITS.frameBytes||queued+bytes.length>LIMITS.frameBytes*LIMITS.maxPending){block();throw error();}
  queued+=bytes.length;
  try{port.write(bytes,e=>{queued-=bytes.length;if(e)block();});}catch{block();throw error();}
 }
 port.on('data',chunk=>{
  if(!open)return;
  // Copy only a bounded unfinished frame even when the OS coalesces many frames.
  const bytes=Buffer.from(chunk);let offset=0;
  while(open&&offset<bytes.length){
   const newline=bytes.indexOf(10,offset),end=newline<0?bytes.length:newline+1;
   if(buffer.length+end-offset>LIMITS.frameBytes){block();return;}
   buffer=Buffer.concat([buffer,bytes.subarray(offset,end)]);offset=end;if(newline<0)return;
   const raw=buffer.subarray(0,-1);buffer=Buffer.alloc(0);
   try{
    const text=new TextDecoder('utf-8',{fatal:true}).decode(raw),frame=JSON.parse(text);
    if(JSON.stringify(frame)!==text)throw error();
    const keys=frame.type==='request'?['schema','nonce','programSha256','ownerGeneration','type','id','method','payload']:frame.type==='response'?['schema','nonce','programSha256','ownerGeneration','type','id','payload']:['schema','nonce','programSha256','ownerGeneration','type','id','code'];exact(frame,keys);
    if(frame.schema!==1||frame.nonce!==binding.nonce||frame.programSha256!==binding.programSha256||frame.ownerGeneration!==binding.ownerGeneration||!Number.isSafeInteger(frame.id)||frame.id<1)throw error();
    if(!['request','response','error'].includes(frame.type)||frame.type==='request'&&!methods.includes(frame.method)||frame.type==='error'&&safeCode({code:frame.code})!==frame.code)throw error();
    onFrame(frame);
   }catch{block();}
  }
 });
 for(const event of ['end','close','error'])port.on(event,block);
 return {send,block,isOpen:()=>open};
}

export function createClient(port,binding,{deadlineMs=5000}={}){
 if(!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>30000)fail('SEP_PROJECT_UI_CONFIG');
 const pending=new Map();let sequence=0;
 const wire=channel(port,binding,frame=>{
  if(!['response','error'].includes(frame.type)||!pending.has(frame.id))throw error();
  const value=pending.get(frame.id);pending.delete(frame.id);clearTimeout(value.timer);
  if(frame.type==='error')value.reject(Object.assign(Error(frame.code),{code:frame.code}));else value.resolve(frame.payload);
 },()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error());}pending.clear();});
 return Object.freeze({async request(method,payload){
  if(!wire.isOpen())throw error();if(!methods.includes(method))fail('SEP_PROJECT_UI_OPERATION');if(pending.size>=LIMITS.maxPending)fail('SEP_PROJECT_UI_BUSY');
  const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>wire.block(),deadlineMs);pending.set(id,{resolve,reject,timer});try{wire.send('request',id,{method,payload});}catch{wire.block();}});
 },closeAdmission:wire.block,status:()=>({admissionOpen:wire.isOpen(),pending:pending.size})});
}

export function serveHost(port,host,binding){
 let expected=1,pending=0;
 const wire=channel(port,binding,frame=>{
  if(frame.type!=='request'||frame.id!==expected++||pending>=LIMITS.maxPending)throw error();pending++;
  Promise.resolve().then(()=>host.request(frame.method,frame.payload)).then(payload=>{if(wire.isOpen())wire.send('response',frame.id,{payload});},e=>{if(wire.isOpen())wire.send('error',frame.id,{code:safeCode(e)});}).catch(()=>wire.block()).finally(()=>pending--);
 },()=>host.closeAdmission());
 return Object.freeze({closeAdmission:wire.block,status:()=>({admissionOpen:wire.isOpen(),pending})});
}
