/** Kept self-contained so the exact function can be inlined in Electron's
 * sandboxed preload, where arbitrary local require() is not supported. */
export function createPreloadReadinessBridge({boot,failed,mounted}){
 let nonce,committed=false,booted=false,sent=false,terminal=false;
 const rejectReceipt=()=>{terminal=true;try{Promise.resolve(failed('SEP_MAC_RENDERER_COMMIT_REJECTED')).catch(()=>{});}catch{}};
 function send(){if(terminal||sent||!nonce||!committed||!booted)return;sent=true;try{Promise.resolve(mounted({schema:1,nonce})).then(r=>{if(r?.status!=='accepted')rejectReceipt();},rejectReceipt);}catch{rejectReceipt();}}
 return Object.freeze({
  async ready(){let value;try{value=await boot();if(typeof value?.sepRendererNonce!=='string'||!/^[a-f0-9]{64}$/.test(value.sepRendererNonce))throw Error('SEP_MAC_RENDERER_NONCE');nonce=value.sepRendererNonce;send();const {sepRendererNonce,...publicValue}=value;return publicValue;}catch(error){terminal=true;throw error;}},
  failed(message){terminal=true;return failed(message);},
  applicationCommitted(){if(terminal)return;committed=true;send();},
  applicationBooted(){if(terminal)return;booted=true;send();},
 });
}
