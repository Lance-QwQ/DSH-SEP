// Diagnostic-only minimal native Electron reproducer, never included in payload.
const {app,BrowserWindow,dialog,Menu}=require('electron');
const fs=require('node:fs');
const mode=process.env.SEP_REPRO_MODE;let quitting=false,w;
const mark=event=>fs.writeSync(1,JSON.stringify({event,mode})+'\n');
app.whenReady().then(async()=>{
 w=new BrowserWindow({width:640,height:480,webPreferences:{sandbox:true}});
 await w.loadURL('data:text/html,<p>Native quit diagnostic: synthetic content only</p>');
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Application',submenu:[{role:'quit'}]}]));mark('ready');
 app.on('before-quit',e=>{
  if(quitting)return;e.preventDefault();
  const finish=()=>{quitting=true;mark('destroy-before');w.hide();w.destroy();mark('destroy-after');app.quit();};
  if(mode==='no-dialog'){finish();return;}
  dialog.showMessageBox({type:'warning',buttons:['Quit','Cancel'],defaultId:0,cancelId:1,message:'Quit synthetic test?',detail:'Synthetic local task; no paid model.'}).then(r=>{
   mark('response-'+r.response);if(r.response!==0)return;
   if(mode==='defer')setTimeout(finish,0);else finish();
  });
 });
});
