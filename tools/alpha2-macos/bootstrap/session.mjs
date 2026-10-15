import {randomBytes} from 'node:crypto';
const failure=code=>Object.assign(Error(code),{code});
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
/** This validates frames from an already-owned private transport. It cannot
 * authenticate a broker discovered by PID/name/path, or acquire its lease. */
export function decodeBootstrapFrame(bytes){
 try{if(typeof bytes==='string'&&!bytes.isWellFormed())throw Error();const b=Buffer.from(bytes);if(b.length>4096)throw Error();const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));if(!value||Object.getPrototypeOf(value)!==Object.prototype)throw Error();return value;}
 catch{throw failure('SEP_BOOTSTRAP_FRAME');}
}
export function createBootstrapSession({nonce,programSha256,send,requestId=()=>randomBytes(12).toString('hex')}){
 if(!digest(nonce)||!digest(programSha256)||typeof send!=='function'||typeof requestId!=='function')throw failure('SEP_BOOTSTRAP_CONFIG');
 let phase='starting',generation,desktopReady=false,queuedActivation=false,queuedQuit=false,activation,quit,receipt,exit,channelClosed=false,protocolBroken=false,lastCode;
 const bound=(kind,extra={})=>({protocol:1,kind,nonce,programSha256,generation,...extra});
 function block(code){phase='blocked';lastCode=code;queuedActivation=false;queuedQuit=false;}
 function invalid(){protocolBroken=true;block('SEP_BOOTSTRAP_PROTOCOL');throw failure('SEP_BOOTSTRAP_PROTOCOL');}
 function complete(){if(!protocolBroken&&receipt&&exit?.code===0&&exit.signal===null){phase='closed';lastCode=undefined;}}
 function emit(kind){const id=requestId();if(typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id))invalid();try{send(bound(kind,{requestId:id}));}catch{protocolBroken=true;block('SEP_BOOTSTRAP_CHANNEL');throw failure('SEP_BOOTSTRAP_CHANNEL');}return id;}
 function activate(){if(['closed','blocked','closing','quit-requested'].includes(phase))return false;if(!generation||!desktopReady){queuedActivation=true;return true;}if(!activation)activation=emit('activate');return true;}
 function requestQuit(){if(['closed','blocked','closing'].includes(phase))return false;queuedActivation=false;if(!generation){queuedQuit=true;return true;}if(!quit){quit=emit('requestQuit');phase='quit-requested';}return true;}
 function receive(value){
  if(channelClosed||protocolBroken)invalid();
  const common=['protocol','kind','nonce','programSha256','generation'],extensions={owned:[],ready:['desktopReady'],activated:['requestId'],quitCancelled:['requestId'],quitting:[],closed:['status','resourcesConfirmedReleased'],blocked:['code','resourcesConfirmedReleased']};
  if(!value||!Object.hasOwn(extensions,value.kind)||!exact(value,[...common,...extensions[value.kind]])||value.protocol!==1||value.nonce!==nonce||value.programSha256!==programSha256||typeof value.generation!=='string'||!/^[a-f0-9]{32}$/.test(value.generation)||generation&&value.generation!==generation)invalid();
  if(value.kind==='owned'){
   if(generation||phase==='closed')invalid();generation=value.generation;if(queuedQuit){queuedQuit=false;requestQuit();}return;
  }
  if(!generation)invalid();
  if(value.kind==='ready'){
   if(value.desktopReady!==true||desktopReady||receipt)invalid();desktopReady=true;if(phase!=='blocked'&&phase!=='closing'&&phase!=='quit-requested')phase='ready';if(queuedActivation){queuedActivation=false;activate();}return;
  }
  if(value.kind==='activated'){if(!activation||value.requestId!==activation)invalid();activation=undefined;return;}
  if(value.kind==='quitCancelled'){if(!quit||value.requestId!==quit||receipt||phase==='blocked')invalid();quit=undefined;phase=desktopReady?'ready':'starting';return;}
  if(value.kind==='quitting'){if(receipt||phase==='closed')invalid();phase='closing';queuedActivation=false;return;}
  if(value.kind==='blocked'){if(value.resourcesConfirmedReleased!==false||typeof value.code!=='string'||!/^SEP_[A-Z0-9_]{1,90}$/.test(value.code))invalid();block(value.code);return;}
  if(value.status!=='pass'||value.resourcesConfirmedReleased!==true||receipt)invalid();receipt=true;phase='closing';complete();
 }
 function childExit(value){if(!exact(value,['code','signal'])||value.code!==null&&!Number.isSafeInteger(value.code)||value.signal!==null&&(typeof value.signal!=='string'||!/^SIG[A-Z0-9]+$/.test(value.signal)))invalid();if(exit)invalid();exit={...value};block('SEP_BOOTSTRAP_EXIT_UNCONFIRMED');complete();}
 function transportClosed(){channelClosed=true;if(phase!=='closed')block('SEP_BOOTSTRAP_CHANNEL_CLOSED');complete();}
 function deadline(){if(phase!=='closed')block('SEP_BOOTSTRAP_DEADLINE');}
 const status=()=>Object.freeze({phase,generation:generation??null,desktopReady,resourcesConfirmedReleased:phase==='closed',...lastCode?{code:lastCode}:{}});
 return Object.freeze({receive,activate,requestQuit,childExit,transportClosed,deadline,status});
}
