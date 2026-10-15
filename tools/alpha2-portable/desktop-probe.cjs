// Test-only observer loaded before the unmodified Alpha.2 default main. No
// replacement renderer, login service, tools, host lifecycle or browser API.
const {app,BrowserWindow,Menu}=require('electron'),fs=require('node:fs');
const log=entry=>fs.appendFileSync(process.env.SEP_DESKTOP_PROBE,JSON.stringify({at:Date.now(),...entry})+'\n');
log({event:'observer-loaded'});
let main,welcome,stage=0,welcomeStage=0;
app.on('browser-window-created',(_e,window)=>{
 window.webContents.on('did-finish-load',()=>{log({event:'loaded',url:window.webContents.getURL(),id:window.id});if(window.webContents.getURL().startsWith('dsh-app://app/'))main=window;if(window.webContents.getURL().endsWith('/renderer/welcome.html'))welcome=window;});
 window.webContents.on('render-process-gone',(_e,details)=>log({event:'renderer-gone',reason:details.reason}));
});
app.on('before-quit',()=>log({event:'before-quit'}));app.on('will-quit',()=>log({event:'will-quit'}));
app.whenReady().then(()=>{
 const timer=setInterval(async()=>{
  try{
   // The vision fixture deliberately has no configured paid adapter. Use
   // actual rendered "API key / later" controls rather than fake auth state.
   if(process.env.SEP_LINUX_VISION==='1'&&welcome&&!welcome.isDestroyed()&&welcome.isVisible()&&welcomeStage<2){const id=welcomeStage===0?'api-key':'skip-key';if(await welcome.webContents.executeJavaScript(`(()=>{const b=document.getElementById(${JSON.stringify(id)});if(!b||b.disabled||b.offsetParent===null)return false;b.click();return true})()`)){welcomeStage++;log({event:welcomeStage===1?'welcome-key-page':'welcome-key-later'});}return;}
   if(!main||main.isDestroyed())return;
   if(process.env.SEP_DESKTOP_CONTINUATION&&stage===0){if(!main.isVisible())return;const ready=await main.webContents.executeJavaScript('document.body.innerText.includes("SEP Linux synthetic")&&document.querySelectorAll("button").length>3');if(!ready)return;stage=10;await require('./desktop-continuation-probe.cjs')(main,log,process.env.SEP_DESKTOP_PROBE);main.close();stage=1;return;}
   if(stage===0){if(!main.isVisible())return;const page=await main.webContents.executeJavaScript('({text:document.body.innerText.length,loading:/Loading settings|Connecting|正在加载|Unable to create default workspace/i.test(document.body.innerText),workspace:document.body.innerText.includes("SEP Linux synthetic"),buttons:document.querySelectorAll("button").length})');if(page.text<100||page.buttons<3||page.loading||!page.workspace)return;stage=1;await main.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await new Promise(resolve=>setTimeout(resolve,700));const image=await main.webContents.capturePage();fs.writeFileSync(process.env.SEP_DESKTOP_PROBE+'.png',image.toPNG());log({event:'main-visible',visible:main.isVisible(),title:main.getTitle(),textLength:page.text,buttons:page.buttons,loading:page.loading,workspace:page.workspace,paintWait:true});if(process.env.SEP_LINUX_FILE_UI==='1')await require('./desktop-file-probe.cjs')(main,log,process.env.SEP_DESKTOP_PROBE);else if(process.env.SEP_LINUX_ATTACHMENT_UI==='1')await require('./desktop-attachment-probe.cjs')(main,log,process.env.SEP_DESKTOP_PROBE);if(process.env.SEP_LINUX_BUSINESS==='1')await require('./desktop-settings-probe.cjs')(main,log,process.env.SEP_DESKTOP_PROBE);main.close();}
   else if(stage===1&&!main.isVisible()){stage=2;log({event:'close-hidden',windows:BrowserWindow.getAllWindows().length});setTimeout(()=>app.emit('activate',{},false),300);}
   else if(stage===2&&main.isVisible()){stage=3;log({event:'reopened',id:main.id});setTimeout(()=>app.quit(),300);clearInterval(timer);}
  }catch(error){log({event:'probe-error',code:error.name});clearInterval(timer);app.quit();}
 },200);
});
