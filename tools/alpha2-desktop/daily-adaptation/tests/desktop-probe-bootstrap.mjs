// Test-only main-process instrument. Never shipped as a production entry.
import {app,BrowserWindow} from 'electron';
import {writeFile} from 'node:fs/promises';
import {readFileSync,appendFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
const input=JSON.parse(readFileSync(process.env.SEP_DESKTOP_PROBE_INPUT??new URL('./sep-test-input.json',import.meta.url),'utf8'));
// Synthetic public-release service only. Managed loopback requests still use
// the real transport; no model invocation or installation is performed.
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>String(url).startsWith('https://api.github.com/')?Promise.resolve(Response.json([])):originalFetch(url,options);
const mark=value=>appendFileSync(input.receipt+'.stages.jsonl',JSON.stringify({time:Date.now(),...value})+'\n');
mark({stage:'bootstrap-entry'});
app.on('web-contents-created',(_event,contents)=>{
 for(const event of ['dom-ready','did-finish-load','did-start-loading','did-stop-loading'])contents.on(event,()=>mark({stage:event,webContentsId:contents.id,url:contents.getURL().split('?')[0]}));
 contents.on('preload-error',(_event,path,error)=>mark({stage:'preload-error',webContentsId:contents.id,errorType:error.name,message:error.message}));
 contents.on('did-fail-load',(_event,code,description)=>mark({stage:'did-fail-load',webContentsId:contents.id,code,description}));
 contents.on('render-process-gone',(_event,details)=>mark({stage:'render-process-gone',webContentsId:contents.id,reason:details.reason}));
 contents.on('console-message',details=>{if(details.level==='error')mark({stage:'renderer-console-error',webContentsId:contents.id,message:details.message.slice(0,500)});});
});
app.setPath('userData',input.userData);app.setName('DSH SEP isolated lifecycle probe');app.setAppUserModelId('DSH.SEP.Isolated.Lifecycle');
if(input.appRoot)app.setAppPath(input.appRoot);
try{await import(input.desktopMain?pathToFileURL(input.desktopMain).href:'./main.js');}catch(error){mark({stage:'main-import-failure',message:error.message});app.exit(1);throw error;}
mark({stage:'main-imported',ownsInstance:app.hasSingleInstanceLock()});
if(app.hasSingleInstanceLock())void (async()=>{
 const deadline=Date.now()+90000,steps=[];
 const snapshot=setTimeout(()=>{for(const window of BrowserWindow.getAllWindows())if(!window.isDestroyed())mark({stage:'window-snapshot',id:window.id,visible:window.isVisible(),loading:window.webContents.isLoading(),url:window.webContents.getURL().split('?')[0]});},15000);
 async function until(work){while(Date.now()<deadline){const result=await work();if(result)return result;await delay(100);}throw Error('DESKTOP_PROBE_DEADLINE');}
 try{
  await app.whenReady();mark({stage:'app-ready'});
  const initial=await until(()=>BrowserWindow.getAllWindows().find(window=>!window.isDestroyed()&&window.isVisible()&&(/dsh-app:\/\/app\//.test(window.webContents.getURL())||window.webContents.getURL().endsWith('/welcome.html'))));
  mark({stage:'initial-visible-window',kind:initial.webContents.getURL().endsWith('/welcome.html')?'welcome':'workspace'});
  if(initial.webContents.getURL().endsWith('/welcome.html')){
   await until(()=>initial.webContents.executeJavaScript('typeof window.dshWelcome?.skip === "function"').catch(()=>false));
   await initial.webContents.executeJavaScript('window.dshWelcome.skip()');
  }
  const window=await until(()=>BrowserWindow.getAllWindows().find(window=>!window.isDestroyed()&&window.webContents.getURL().startsWith('dsh-app://app/')&&window.isVisible()));
  await until(()=>window.webContents.executeJavaScript('document.readyState === "complete" && document.body.innerText.length > 20').catch(()=>false));
  const bridge=await window.webContents.executeJavaScript('({sep:typeof window.dshDesktop?.sepUpdates?.status,host:typeof window.dshDesktop?.updates?.status})');
  if(bridge.sep!=='function'||bridge.host!=='function')throw Error('UPDATE_BRIDGE_MISSING');
  const id=window.id,pid=process.pid;steps.push({step:'renderer-ready',id,pid});
  window.close();await until(()=>!window.isVisible());
  if(window.isDestroyed())throw Error('BACKGROUND_WINDOW_DESTROYED');steps.push({step:'background-retained',id,pid});
  // Exercise the official second-instance handler; this is not a claim about
  // a second executable launch or a real tray menu click.
  app.emit('second-instance',{},[],input.project,{});await until(()=>window.isVisible());
  if(window.id!==id||process.pid!==pid)throw Error('REOPEN_IDENTITY_CHANGED');steps.push({step:'official-second-instance-handler-reopened',id,pid});
  await writeFile(input.receipt,JSON.stringify({status:'pass',scope:'actual Electron app, synthetic data, preconfirmed first-close notice, real official reopen handler, normal quit requested',steps,notVerified:input.notVerified},null,2)+'\n',{flag:'wx'});
  clearTimeout(snapshot);app.quit();
 }catch(error){clearTimeout(snapshot);await writeFile(input.receipt,JSON.stringify({status:'fail',code:error.code??error.name,message:error.message,steps,windows:BrowserWindow.getAllWindows().filter(window=>!window.isDestroyed()).map(window=>({id:window.id,visible:window.isVisible(),url:window.webContents.getURL().split('?')[0]}))},null,2)+'\n',{flag:'wx'}).catch(()=>{});app.exit(1);}
})();
