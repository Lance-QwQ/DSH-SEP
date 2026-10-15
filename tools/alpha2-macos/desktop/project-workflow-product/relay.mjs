import {checkBinding,LIMITS,fail} from '../project-workflow-ui/rules.mjs';
// Exact owned endpoints are supplied by the verified launcher. No listener or
// endpoint discovery exists here. EOF revokes admission, never resource ownership.
export function openProjectRelay({hostPort,desktopPort,binding:input,onFailure=()=>{}}={}){
 const binding=checkBinding(input);for(const p of [hostPort,desktopPort])if(typeof p?.write!=='function'||typeof p?.on!=='function'||p.destroyed)fail('SEP_PROJECT_UI_CONFIG');
 let open=true,code,queued=0;const listeners=[];
 function block(){if(!open)return;open=false;code='SEP_PROJECT_UI_CHANNEL';try{onFailure(code);}catch{}}
 function write(port,bytes){if(!open)return;if(queued+bytes.length>LIMITS.frameBytes*LIMITS.maxPending){block();return;}queued+=bytes.length;try{port.write(bytes,e=>{queued-=bytes.length;if(e)block();});}catch{queued-=bytes.length;block();}}
 function direction(from,to){let buffer=Buffer.alloc(0);const data=chunk=>{if(!open)return;const bytes=Buffer.from(chunk);let offset=0;while(open&&offset<bytes.length){const nl=bytes.indexOf(10,offset),end=nl<0?bytes.length:nl+1;if(buffer.length+end-offset>LIMITS.frameBytes){block();return;}buffer=Buffer.concat([buffer,bytes.subarray(offset,end)]);offset=end;if(nl<0)return;write(to,buffer);buffer=Buffer.alloc(0);}};from.on('data',data);listeners.push([from,'data',data]);for(const event of ['end','close','error']){from.on(event,block);listeners.push([from,event,block]);}}
 direction(hostPort,desktopPort);direction(desktopPort,hostPort);
 write(desktopPort,Buffer.from(JSON.stringify({schema:1,type:'initialize',...binding})+'\n'));
 return Object.freeze({status:()=>({admissionOpen:open,queuedBytes:queued,...code?{code}:{}}),closeAdmission(){block();for(const [p,event,fn]of listeners)if(event==='data')p.removeListener(event,fn);}});
}
