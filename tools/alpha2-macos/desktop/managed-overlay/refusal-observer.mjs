// Test-only passive observer. It does not register uncaughtException handlers,
// suppress the product failure, launch a host, or dismiss the native dialog.
export function refusalMonitorSource({receipt,nonce,asarSha256}){
 if(typeof receipt!=='string'||!receipt||!/^\w{32}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(asarSha256))throw Error('REFUSAL_OBSERVER_ARGUMENT');
 return `(()=>{const fs=process.getBuiltinModule('fs'),cp=process.getBuiltinModule('child_process'),M=process.getBuiltinModule('module');let nodeChildCalls=0;for(const key of ['spawn','spawnSync','fork','exec','execSync','execFile','execFileSync']){const original=cp[key];cp[key]=function(...args){nodeChildCalls++;return Reflect.apply(original,this,args);};}M.syncBuiltinESMExports();process.on('uncaughtExceptionMonitor',error=>{const code=/^[A-Z0-9_]{1,100}$/.test(error?.code??'')?error.code:'UNCLASSIFIED';try{const fd=fs.openSync(${JSON.stringify(receipt)},'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({schema:1,nonce:${JSON.stringify(nonce)},asarSha256:${JSON.stringify(asarSha256)},pid:process.pid,code,nodeChildCalls})+'\\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}catch{}});return true;})()`;
}
export function verifyRefusalReceipt(value,{pid,nonce,asarSha256}){
 const expected=['asarSha256','code','nodeChildCalls','nonce','pid','schema'];
 if(!value||JSON.stringify(Object.keys(value).sort())!==JSON.stringify(expected)||value.schema!==1||value.pid!==pid||value.nonce!==nonce||value.asarSha256!==asarSha256||value.code!=='SEP_MAC_CONTROLLED_ENTRY_REQUIRED'||value.nodeChildCalls!==0)throw Error('REFUSAL_RECEIPT_INVALID');return true;
}
