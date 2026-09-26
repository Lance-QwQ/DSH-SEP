const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs');const path=require('node:path');
const dir=process.argv.find(x=>x.startsWith('--fixture-dir=')).slice(14);
app.setPath('userData',path.join(dir,'electron-profile'));
// Match the pinned Windows MCP Electron test harness's Chromium UIA setup.
app.commandLine.appendSwitch('force-renderer-accessibility','complete');
app.commandLine.appendSwitch('enable-features','UiaProvider');
let win,count=0;
const publish=()=>fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({pid:process.pid,windowHandle:win.getNativeWindowHandle().readBigUInt64LE().toString(),count}));
ipcMain.on('clicked',()=>{count++;publish();});
app.whenReady().then(async()=>{
 app.setAccessibilitySupportEnabled(true);
 const variant=Number(path.basename(dir).match(/\d+$/)?.[0]??0)%3;
 win=new BrowserWindow({title:'SEP MCP isolated test',x:80+variant*100,y:80+variant*70,width:520+variant*80,height:360,webPreferences:{nodeIntegration:true,contextIsolation:false}});
 win.setMenu(null);
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>SEP MCP isolated test</title><h2>SEP MCP 合成测试窗口</h2><p>仅测试计数，无外部操作。</p><button id="confirm">SEP测试确认</button><p id="result" role="status">准备就绪</p><button>同名测试</button><button>同名测试</button><button disabled>禁用测试</button><script>const {ipcRenderer}=require('electron');let count=0;document.getElementById('confirm').onclick=()=>{count++;document.getElementById('result').textContent='已完成 '+count;ipcRenderer.send('clicked');};</script>`));
 const beforeVisible=win.isVisible();win.show();
 fs.writeFileSync(path.join(dir,'renderer.json'),JSON.stringify({body:await win.webContents.executeJavaScript('document.body.innerText'),accessibility:app.isAccessibilitySupportEnabled(),beforeVisible,afterVisible:win.isVisible(),minimized:win.isMinimized(),bounds:win.getBounds()}));
 publish();
 const timer=setInterval(()=>{if(fs.existsSync(path.join(dir,'close.request'))){clearInterval(timer);app.quit();}},100);
 setTimeout(()=>app.quit(),120000).unref();
});
app.on('window-all-closed',()=>app.quit());
