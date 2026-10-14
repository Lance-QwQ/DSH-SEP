import {ChildProcess} from 'node:child_process';import {randomBytes} from 'node:crypto';
import {createProductChannel} from './transport.cjs';
const controls=new WeakSet(),error=code=>Object.assign(Error(code),{code});
export function assertLaunchControl(control){if(!controls.has(control))throw error('SEP_PRODUCT_CONTROL');}
/** The launcher calls owned only after its actual lease and durable marker.
 * This adapter observes only the exact ChildProcess passed by that launcher. */
export function createLaunchControl({onEvent,timeoutMs=30000}){
 if(typeof onEvent!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw error('SEP_PRODUCT_CONFIG');
 let identity,child,channel,childClose,connected=false,ready=false,surface=null,quitting=false,blocked=false,poisoned=false,startTimer,queuedActivation,queuedQuit;
 const pending=new Map(),seenSurfaces=new Set();
 function emit(kind,extra={}){try{onEvent(Object.freeze({kind,generation:identity.generation,...extra}));}catch{blocked=true;poisoned=true;throw error('SEP_PRODUCT_OBSERVER');}}
 function block(code,poison=true){poisoned||=poison;blocked=true;clearTimeout(startTimer);for(const p of pending.values())clearTimeout(p.timer);try{emit('blocked',{code,resourcesConfirmedReleased:false});}catch{}}
 function dispatch(kind,requestId){
  const id=channel.send(kind),timer=setTimeout(()=>block('SEP_PRODUCT_DEADLINE',false),timeoutMs);pending.set(id,{kind,requestId,timer});
 }
 function flush(){if(blocked||quitting||!connected)return;if(queuedQuit){const id=queuedQuit;queuedQuit=undefined;dispatch('requestQuit',id);return;}if(ready&&queuedActivation){const id=queuedActivation;queuedActivation=undefined;dispatch('activate',id);}}
 function command(kind,id){
  if(!identity||blocked||quitting)throw error('SEP_PRODUCT_NOT_READY');if(typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id))throw error('SEP_PRODUCT_REQUEST');
  if([...pending.values()].some(p=>p.kind===kind)||kind==='activate'&&queuedActivation||kind==='requestQuit'&&queuedQuit)throw error('SEP_PRODUCT_PENDING');
  if(kind==='activate')queuedActivation=id;else{queuedActivation=undefined;queuedQuit=id;}flush();
 }
 function frame(f){
  if(f.kind==='connected'){if(f.replyTo!=='000000000000000000000001')throw error('SEP_PRODUCT_PROTOCOL');connected=true;flush();return;}
  if(f.kind==='failure'){block(f.code);return;}
  if(f.kind==='ready'){
   if(quitting||seenSurfaces.has(f.surface)||surface==='workspace'&&f.surface==='welcome')throw error('SEP_PRODUCT_PROTOCOL');seenSurfaces.add(f.surface);surface=f.surface;clearTimeout(startTimer);if(!ready){ready=true;emit('ready',{surface});}flush();return;
  }
  if(f.kind==='quitting'){if(quitting)throw error('SEP_PRODUCT_PROTOCOL');quitting=true;queuedActivation=undefined;queuedQuit=undefined;for(const p of pending.values())clearTimeout(p.timer);emit('quitting');return;}
  const p=pending.get(f.replyTo);if(!p||f.kind==='activated'&&p.kind!=='activate'||f.kind==='quitCancelled'&&p.kind!=='requestQuit'||quitting)throw error('SEP_PRODUCT_PROTOCOL');clearTimeout(p.timer);pending.delete(f.replyTo);emit(f.kind,{requestId:p.requestId});flush();
 }
 const api={
  owned(value){if(identity||!value||Object.keys(value).sort().join(',')!=='generation,programSha256'||!/^[a-f0-9]{32}$/.test(value.generation??'')||!/^[a-f0-9]{64}$/.test(value.programSha256??''))throw error('SEP_PRODUCT_CONTROL');identity=Object.freeze({...value});emit('owned');},
  attach(value){if(!identity||child||!(value instanceof ChildProcess)||!value.stdio?.[3])throw error('SEP_PRODUCT_CONTROL');child=value;
   child.once('error',()=>block('SEP_PRODUCT_SPAWN'));child.once('close',(code,signal)=>{childClose={code,signal};clearTimeout(startTimer);for(const p of pending.values())clearTimeout(p.timer);if(code!==0||signal!==null)block('SEP_PRODUCT_EXIT');});
   channel=createProductChannel({stream:child.stdio[3],role:'broker',binding:{nonce:randomBytes(32).toString('hex'),...identity},onFrame:frame,onFailure:c=>block(c),onEnd:()=>{if(!quitting)block('SEP_PRODUCT_EOF');}});
   startTimer=setTimeout(()=>block('SEP_PRODUCT_DEADLINE',false),timeoutMs);channel.send('initialize');
  },
  activate:id=>command('activate',id),requestQuit:(id=randomBytes(12).toString('hex'))=>command('requestQuit',id),
  desktopReceipt(){return childClose?.code===0&&childClose.signal===null&&quitting&&!poisoned&&channel?.status().peerEnded&&!channel.status().blocked?Object.freeze({status:'pass',code:0,signal:null,peerEnded:true}):Object.freeze({status:'blocked',code:'SEP_PRODUCT_EXIT_UNCONFIRMED',resourcesConfirmedReleased:false});},
  status:()=>Object.freeze({owned:!!identity,generation:identity?.generation??null,attached:!!child,connected,ready,surface,quitting,blocked,childClosed:!!childClose,peerEnded:channel?.status().peerEnded??false})
 };controls.add(api);return Object.freeze(api);
}
