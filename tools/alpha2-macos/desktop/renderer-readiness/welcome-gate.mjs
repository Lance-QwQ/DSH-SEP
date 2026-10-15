import {randomBytes} from 'node:crypto';
const error=code=>Object.assign(Error(code),{code});
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===keys.slice().sort().join('|');
/** One fixed welcome document per owned window. This gate is independent of
 * workspace hydration. A receipt is not a login, provider or workspace proof. */
export function createWelcomeReadinessGate({window,expectedUrl,isClosing,onReady=()=>{}}){
 const url=new URL(expectedUrl);if(url.protocol!=='file:'||url.hostname!==''||url.search||url.hash||url.href!==expectedUrl||typeof isClosing!=='function')throw error('SEP_MAC_WELCOME_CONFIGURATION');
 let document,loaded=false,fault,waiting,resolveWait,rejectWait,timer,settled=false,published=false;
 function unavailable(){return window.isDestroyed()||isClosing();}
 function sender(event){if(unavailable())throw error('SEP_MAC_WELCOME_UNAVAILABLE');if(!event||!event.senderFrame||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw error('SEP_MAC_WELCOME_SENDER');if(event.senderFrame.url!==expectedUrl)throw error('SEP_MAC_WELCOME_ORIGIN');}
 function current(){return !unavailable()&&!!document&&document.frame===window.webContents.mainFrame&&document.frame.url===expectedUrl;}
 function settle(){if(!waiting||settled)return;if(fault){settled=true;clearTimeout(timer);rejectWait(fault);}else if(loaded&&document?.committed&&current()){settled=true;clearTimeout(timer);resolveWait(Object.freeze({status:'accepted'}));}}
 function stop(code){fault??=error(code);published=false;settle();}
 function begin(event){sender(event);if(fault)throw error('SEP_MAC_WELCOME_FAILED');if(document&&document.frame!==event.senderFrame)throw error('SEP_MAC_WELCOME_STALE');document??={frame:event.senderFrame,nonce:randomBytes(32).toString('hex'),committed:false};return Object.freeze({schema:1,nonce:document.nonce});}
 function accept(event,value){if(!exact(value,['schema','nonce'])||value.schema!==1||typeof value.nonce!=='string'||!/^[a-f0-9]{64}$/.test(value.nonce))throw error('SEP_MAC_WELCOME_MESSAGE');sender(event);if(fault)throw error('SEP_MAC_WELCOME_FAILED');if(!document||document.frame!==event.senderFrame||document.nonce!==value.nonce)throw error('SEP_MAC_WELCOME_STALE');document.committed=true;settle();return{status:'accepted'};}
 function bridgeFailed(event,value){if(!exact(value,['schema'])||value.schema!==1)throw error('SEP_MAC_WELCOME_MESSAGE');sender(event);stop('SEP_MAC_WELCOME_FAILED');return{status:'accepted'};}
 function fail(){stop('SEP_MAC_WELCOME_FAILED');}
 function navigation(){if(document||loaded)stop('SEP_MAC_WELCOME_NAVIGATION');}
 function waitForReady(load,deadlineMs=5000){
  if(!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>10000)throw error('SEP_MAC_WELCOME_DEADLINE_CONFIGURATION');
  if(waiting)return waiting;
  waiting=new Promise((resolve,reject)=>{resolveWait=resolve;rejectWait=reject;});
  timer=setTimeout(()=>stop('SEP_MAC_WELCOME_DEADLINE'),deadlineMs);
  Promise.resolve(load).then(()=>{loaded=true;settle();},()=>stop('SEP_MAC_WELCOME_LOAD_FAILED'));
  settle();return waiting;
 }
 function windowShown(){if(fault||!loaded||!document?.committed||!current()||!window.isVisible())return false;if(!published){published=true;try{onReady(Object.freeze({schema:1,surface:'welcome',rootCommitted:true,handlersBound:true,windowId:window.id}));}catch{stop('SEP_MAC_WELCOME_OBSERVER_FAILED');throw error('SEP_MAC_WELCOME_OBSERVER_FAILED');}}return true;}
 function snapshot(){const ready=!!(!fault&&published&&loaded&&document?.committed&&current()&&window.isVisible());return Object.freeze({ready,surface:ready?'welcome':null});}
 return Object.freeze({begin,accept,bridgeFailed,fail,navigation,waitForReady,windowShown,snapshot});
}
