import {fail} from './rules.mjs';
const prefix='sep-current-project:';
const names=['begin','call','presented','commit'];
export function installMainHandlers({ipcMain,webContents,bridge}={}){
 if(typeof ipcMain?.handle!=='function'||typeof ipcMain?.removeHandler!=='function'||typeof webContents?.on!=='function'||names.some(name=>typeof bridge?.[name]!=='function'))fail('SEP_PROJECT_UI_CONFIG');
 const installed=[];let disposed=false;
 const navigate=(details,_url,_inPlace,isMainFrame)=>{if(details?.isMainFrame===true||isMainFrame===true)bridge.navigate();};
 const destroyed=()=>bridge.closeAdmission();
 function dispose(){if(disposed)return;disposed=true;bridge.closeAdmission();for(const name of installed)ipcMain.removeHandler(prefix+name);webContents.removeListener('did-start-navigation',navigate);webContents.removeListener('destroyed',destroyed);}
 try{
  for(const name of names){ipcMain.handle(prefix+name,(event,...args)=>bridge[name](event,...args));installed.push(name);}
  webContents.on('did-start-navigation',navigate);webContents.on('destroyed',destroyed);
 }catch(e){dispose();throw e;}
 return dispose;
}
// Pass the returned object to contextBridge.exposeInMainWorld in a fixed preload.
// It contains no nonce, controller, approval object, path, or arbitrary IPC sender.
export function createPreloadApi(ipcRenderer){
 if(typeof ipcRenderer?.invoke!=='function')fail('SEP_PROJECT_UI_CONFIG');
 return Object.freeze({begin:()=>ipcRenderer.invoke(prefix+'begin'),call:(method,input)=>ipcRenderer.invoke(prefix+'call',method,input),presented:value=>ipcRenderer.invoke(prefix+'presented',value),commit:value=>ipcRenderer.invoke(prefix+'commit',value)});
}
