import {randomBytes} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
function isApplicationOrigin(value){try{const u=new URL(value);return u.protocol==='dsh-app:'&&u.hostname==='app'&&u.port===''&&u.username===''&&u.password==='';}catch{return false;}}
/** Candidate main-process gate. The callback is internal to the fixed main
 * closure; no page, IPC or test backdoor can supply a replacement observer. */
export function createRendererReadinessGate({getWindow,isClosing,onReady=()=>{}}){
 let document;
 function sender(event){const window=getWindow();if(!window||window.isDestroyed()||isClosing())fail('SEP_MAC_RENDERER_UNAVAILABLE');if(!event||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||!event.senderFrame)fail('SEP_MAC_RENDERER_SENDER');if(!isApplicationOrigin(event.senderFrame.url))fail('SEP_MAC_RENDERER_ORIGIN');return window;}
 function same(window,frame){return document?.window===window&&document.frame===frame;}
 function publish(){if(!document||document.failed||!document.committed||document.published)return;const window=getWindow();if(window!==document.window||window.isDestroyed()||isClosing()||window.webContents.mainFrame!==document.frame||!isApplicationOrigin(document.frame.url)||!window.isVisible())return;document.published=true;try{onReady(Object.freeze({schema:1,surface:'workspace',rootCommitted:true,loaderCompleted:true,windowId:window.id}));}catch{document.failed=true;document.published=false;fail('SEP_MAC_RENDERER_OBSERVER_FAILED');}}
 function begin(event){const window=sender(event);if(same(window,event.senderFrame)){if(document.failed)fail('SEP_MAC_RENDERER_FAILED');return document.nonce;}document={window,frame:event.senderFrame,nonce:randomBytes(32).toString('hex'),committed:false,published:false,failed:false};return document.nonce;}
 function accept(event,message){if(!exact(message,['schema','nonce'])||message.schema!==1||typeof message.nonce!=='string'||!/^[a-f0-9]{64}$/.test(message.nonce))fail('SEP_MAC_RENDERER_MESSAGE');const window=sender(event);if(document?.failed)fail('SEP_MAC_RENDERER_FAILED');if(!same(window,event.senderFrame)||document.nonce!==message.nonce)fail('SEP_MAC_RENDERER_STALE');document.committed=true;publish();return {status:'accepted'};}
 function invalidate(window,reason){if(window!==getWindow())return;if(reason==='navigation')document=undefined;else{if(!document||document.window!==window)document={window,frame:window.webContents.mainFrame,nonce:null,committed:false,published:false,failed:true};document.failed=true;document.published=false;}}
 function failed(event){const window=sender(event);if(!same(window,event.senderFrame))begin(event);invalidate(window,'failure');}
 function windowShown(window){if(window===getWindow())publish();}
 function snapshot(){const window=getWindow();return Object.freeze({ready:!!(document?.published&&!document.failed&&window===document.window&&!window.isDestroyed()&&!isClosing()&&window.webContents.mainFrame===document.frame),surface:document?.published?'workspace':null});}
 return Object.freeze({begin,accept,failed,invalidate,windowShown,snapshot});
}
