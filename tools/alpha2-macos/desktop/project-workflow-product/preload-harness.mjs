// Test only: execute the complete pinned preload, retaining its original globals.
import vm from 'node:vm';
export function executePreload(source,{isMainFrame=true,protocol='dsh-app:',hostname='app'}={}){
 const exposed=new Map(),calls=[],listeners=new Map();
 const electron={contextBridge:{exposeInMainWorld:(name,value)=>{if(exposed.has(name))throw Error('duplicate bridge');exposed.set(name,value);}},ipcRenderer:{invoke:async(...args)=>{calls.push(args);return {status:'pass'};},send(){},on(name,fn){listeners.set(name,fn);},off(){},removeListener(){}},webUtils:{getPathForFile:()=>''}};
 const document={readyState:'loading',documentElement:{dataset:{},getAttribute:()=>null,classList:{toggle(){}}}};
 vm.runInNewContext(source,{require:name=>{if(name!=='electron')throw Error('unexpected preload import');return electron;},process:{platform:'darwin',isMainFrame},location:{protocol,hostname},document,window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},console,setTimeout,clearTimeout,MutationObserver:class {observe(){}disconnect(){}}},{timeout:2000});
 return {exposed,calls,listeners};
}
