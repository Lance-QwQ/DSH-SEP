const {app,BrowserWindow}=require('electron');app.commandLine.appendSwitch('force-renderer-accessibility');app.commandLine.appendSwitch('disable-gpu');
let window;app.whenReady().then(async()=>{
 window=new BrowserWindow({width:700,height:500,title:'SEP Linux native click validation',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<title>SEP Linux native click validation</title><h1>合成测试</h1><button onclick="document.getElementById(\'count\').textContent=\'点击完成\'+(++window.clickCount)">确认合成动作</button><button disabled>禁用动作</button><button>重复动作</button><button>重复动作</button><button id="stale">旧目标</button><p id="count">未点击</p><script>window.clickCount=0</script>'));
 process.send?.({type:'ready',pid:process.pid});
 process.on('message',async m=>{if(m.type==='inspect')process.send({type:'inspected',count:await window.webContents.executeJavaScript('window.clickCount')});if(m.type==='change'){await window.webContents.executeJavaScript("document.getElementById('stale').remove()");process.send({type:'changed'});}if(m.type==='stop')app.quit();});
});
