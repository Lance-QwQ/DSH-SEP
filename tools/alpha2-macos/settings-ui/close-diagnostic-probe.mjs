import {probeSettingsPage as originalProbe} from './desktop-probe.mjs';
import {randomUUID} from 'node:crypto';import {setTimeout as pause} from 'node:timers/promises';import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
async function readReasons({client,windowId}){
 const nonce=randomUUID();await client.eval(`__sepFullProbe.closeReasons={nonce:${JSON.stringify(nonce)},status:'pending'};void __sepFullProbe.electron.BrowserWindow.fromId(${windowId}).webContents.executeJavaScript('globalThis.__sepSettingsCloseReasons??null').then(value=>{__sepFullProbe.closeReasons={nonce:${JSON.stringify(nonce)},status:'pass',value};},()=>{__sepFullProbe.closeReasons={nonce:${JSON.stringify(nonce)},status:'fail'};});true`);
 const deadline=Date.now()+5000;while(Date.now()<deadline){const r=await client.eval('__sepFullProbe.closeReasons');if(r?.nonce!==nonce||r.status==='fail')return {status:'blocked',code:'CLOSE_DIAGNOSTIC_UNAVAILABLE'};if(r.status==='pass')return {status:r.value?'pass':'blocked',scope:'diagnostic close observations only',value:r.value};await pause(50);}return {status:'blocked',code:'CLOSE_DIAGNOSTIC_DEADLINE'};
}
export async function probeSettingsPage(input){
 let result,error;try{result=await originalProbe(input);}catch(e){error=e;}
 const receipt=await readReasons(input).catch(()=>({status:'blocked',code:'CLOSE_DIAGNOSTIC_UNAVAILABLE'}));if(input.diagnosticRoot)await writeFile(join(input.diagnosticRoot,'close-reasons.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 if(error){error.diagnostic??={};error.diagnostic.closeReasons=receipt;throw error;}return {...result,diagnosticVariant:true,closeReasons:receipt};
}
