/** Self-contained for inlining into sandboxed preload. Flags cannot be set by
 * completion of unrelated account/notice requests; no token getter is exposed. */
export function createWelcomePreloadBridge({begin,committed,failed}){
 let bindings=false,script=false,started=false,terminal=false;
 function stop(){if(terminal)return;terminal=true;void Promise.resolve().then(()=>failed({schema:1})).catch(()=>{});}
 function flush(){if(!bindings||!script||started||terminal)return;started=true;void Promise.resolve().then(begin).then(ticket=>{if(!ticket||typeof ticket!=='object'||Array.isArray(ticket)||Object.keys(ticket).sort().join('|')!=='nonce|schema'||ticket.schema!==1||typeof ticket.nonce!=='string'||!/^[a-f0-9]{64}$/.test(ticket.nonce))throw Error('SEP_MAC_WELCOME_TICKET');return committed({schema:1,nonce:ticket.nonce});}).then(receipt=>{if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||Object.keys(receipt).join('|')!=='status'||receipt.status!=='accepted')throw Error('SEP_MAC_WELCOME_RECEIPT');}).catch(stop);}
 return Object.freeze({bindingsReady:()=>{bindings=true;flush();},scriptComplete:()=>{script=true;flush();}});
}
