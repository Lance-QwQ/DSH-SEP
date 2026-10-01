import {app,BrowserWindow,dialog} from 'electron';
import {readFile} from 'node:fs/promises';import {join} from 'node:path';import {setTimeout as delay} from 'node:timers/promises';
import {verify,sign,durableJson} from './update-admission.mjs';import {jsonFile,fileHash} from './update-inventory.mjs';import {requestPlanConsent,reviewArguments} from './prepare-review-ui.mjs';import {renderReport} from './update-core.mjs';
async function main(){
const {directory,id}=reviewArguments(process.argv);
const key=await readFile(join(directory,'control-key')),request=verify(await jsonFile(join(directory,'auto-request.json')),key);if(request.id!==id)throw Error('SEP_REVIEW_REQUEST');
app.setPath('userData',join(request.workRoot,'review-window'));app.setName('DSH SEP');await app.whenReady();let decided=false;
const window=new BrowserWindow({width:1080,height:760,title:'DSH SEP — 更新准备',icon:join(request.installation.releaseRoot,'node_modules/@deepseek-ai/dsh-desktop/resources/icon-windows.png'),webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
let cancelling=false;
window.on('close',event=>{if(decided)return;event.preventDefault();if(cancelling)return;cancelling=true;void durableJson(request.workRoot,'review-cancelled.json',sign({schema:1,id,cancelledAt:new Date().toISOString()},key)).then(()=>{decided=true;window.destroy();app.quit();}).catch(()=>app.exit(1));});
await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>body{font:17px system-ui;padding:32px}</style><h1>正在准备 SEP 更新</h1><p>正在核验安装包、保留插件配置并检查空白环境中的关键服务。</p><p>准备完成后会展示具体计划。关闭此窗口可取消准备。</p>'));
try{
 const deadline=Date.now()+1800000;let ready;
 while(Date.now()<deadline&&!window.isDestroyed()){
  try{ready=verify(await jsonFile(join(request.workRoot,'prepared-review.json')),key);break;}catch(e){if(e.code!=='ENOENT')throw e;}
  try{const state=verify(await jsonFile(join(request.workRoot,'preparation-state.json')),key);if(state.status==='cancelled'){decided=true;window.destroy();app.quit();return;}if(state.status==='blocked')throw Error(state.code);}catch(e){if(e.code!=='ENOENT')throw e;}
  await delay(500);
 }
 if(window.isDestroyed())app.quit();
 else {
  if(!ready)throw Error('SEP_PREPARATION_EXPIRED');if(ready.id!==id||await fileHash(ready.reportPath)!==ready.expected.reportHash)throw Error('SEP_REVIEW_CHANGED');
  const report=await jsonFile(ready.reportPath);await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(renderReport(report)));window.setTitle('DSH SEP — 更新计划审阅');
  const expiry=setTimeout(()=>{if(!window.isDestroyed())window.close();},1800000);
  try{const answer=await requestPlanConsent({expected:ready.expected,report,dialog,window});if(window.isDestroyed())return;await durableJson(ready.planDirectory,'consent.json',sign(answer,key));decided=true;window.destroy();app.quit();}finally{clearTimeout(expiry);}
 }
}catch(error){const expiry=setTimeout(()=>app.exit(1),60000);try{if(!window.isDestroyed())await dialog.showMessageBox(window,{title:'DSH SEP',type:'warning',message:'更新准备未完成',detail:String(error.message).slice(0,180)+'\n当前版本未执行切换。',buttons:['关闭']});}finally{clearTimeout(expiry);decided=true;app.quit();}}
}
void main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.message)?error.message:'SEP_REVIEW_START_FAILED');app.exit(1);});
