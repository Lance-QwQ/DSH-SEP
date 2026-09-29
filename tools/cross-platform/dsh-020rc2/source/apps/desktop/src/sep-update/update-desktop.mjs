import {readFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {join,isAbsolute,resolve,basename} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {UpdateClock,fetchReleases,selectRelease,renderReport,acceptRisks,decide,hash} from './update-core.mjs';
import {durableJson,sign,verify} from './update-admission.mjs';
import {reviewCandidate} from './update-review.mjs';
import {managedProfileContext,profileContextIdentity} from './update-profile.mjs';
import {processIdentity,cleanEnv} from './update-process.mjs';
import {fetchSepRelease} from './update-sep.mjs';
import {jsonFile} from './update-inventory.mjs';
import {queuePreparation,resumePreparation} from './prepare-queue.mjs';

/** Native desktop service; SEP installation requires a separate exact-plan review. */
export function createManagedUpdater({app,dialog,BrowserWindow,powerMonitor,projectDir,nodeExecutable,profileContext,home=process.env.DSH_HOME,fetcher=fetch,now=Date.now,onState=()=>{},onSepState=()=>{},prepareSep=queuePreparation}){
 const directory=join(app.getPath('userData'),'sep-updates');let closed=false,manual=false,reportWindow,latest=null,lastSuccess=null,lastError=null,prompting=null,scan=null;
 let state={phase:'idle',managed:true};
 const emit=phase=>{state={phase,...(latest?{version:latest.version}:{}),...(lastError?{message:lastError,failedOperation:'check'}:{}),managed:true,lastCheckedAt:lastSuccess};onState({...state});};
 const save=(name,body)=>durableJson(directory,name,body);
 const info=options=>closed?Promise.resolve({response:1}):dialog.showMessageBox({title:'DSH SEP 更新',type:'info',...options});
 const view=async report=>{if(closed)return;if(reportWindow&&!reportWindow.isDestroyed())reportWindow.close();reportWindow=new BrowserWindow({width:1100,height:780,title:'DSH SEP — 全插件兼容性报告',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});reportWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));reportWindow.webContents.on('will-navigate',e=>e.preventDefault());await reportWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(renderReport(report)));};
 async function getReport(release,signal){if(scan){await scan;return getReport(release,signal);}scan=(async()=>{
  const context=profileContext?profileContextIdentity(profileContext):await managedProfileContext(projectDir,home);
  const value=await reviewCandidate({directory,projectDir,release,currentVersion:app.getVersion(),profileContext:context,signal});
  await save('last-report.json',value.report);return value;
 })().finally(()=>scan=null);return scan;}
 async function reviewAndQueue(release,signal){const {report,admission}=await getReport(release,signal);if(closed)return;await view(report);
  if(report.hardBlocks.length){await info({type:'warning',message:'暂不能执行更新',detail:report.hardBlocks.join('\n')+'\n\n完整插件报告已打开。当前程序、插件和数据保持原状。',buttons:['知道了'],cancelId:0});return;}
  const risks=report.plugins.filter(p=>p.verdict!=='compatible');let consent;
  if(risks.length){const answer=await info({type:'warning',message:`${risks.length} 个插件/组件存在兼容性风险或未验证`,detail:'请先阅读已打开的完整报告。继续不会覆盖或禁用插件；部分功能可能不可用。确认只适用于本次版本及风险清单。',buttons:['承担兼容性风险，继续更新','取消更新'],defaultId:1,cancelId:1});if(answer.response!==0||closed)return;consent=acceptRisks(report);}
  else {const answer=await info({message:'兼容检查已满足放行条件',detail:'确认排队更新？完成当前任务并从托盘或应用菜单选择退出应用后，受控更新器才会切换。',buttons:['确认更新','取消'],defaultId:1,cancelId:1});if(answer.response!==0||closed)return;}
  // Repeat the full snapshot after user review; a displayed report is not a lock.
  const fresh=await getReport(release,signal);if(fresh.report.binding!==report.binding||!decide(fresh.report,consent).allowed)throw Error('UPDATE_PLAN_CHANGED_REVIEW_AGAIN');
  if(!admission)throw Error('UPDATE_CANDIDATE_MISSING');
  try{const old=verify(JSON.parse(await readFile(join(directory,'queued-request.json'),'utf8')),await readFile(join(directory,'control-key')));let state;try{state=verify(JSON.parse(await readFile(join(directory,'state-'+old.id+'.json'),'utf8')),await readFile(join(directory,'control-key')));}catch(e){if(e.code!=='ENOENT')throw e;}if(state?.attempted&&!['verified','rolled_back'].includes(state.phase))throw Error('UPDATE_PREVIOUS_TRANSACTION_UNRESOLVED');}catch(e){if(e.code!=='ENOENT')throw e;}
  const id=crypto.randomUUID();const request={schema:3,id,release,currentVersion:app.getVersion(),profileContext:fresh.profileContext,reportBinding:report.binding,currentBinding:report.currentBinding,consent,admissionHash:hash(admission),decision:decide(report,consent).decision,queuedAt:new Date().toISOString(),parentIdentity:await processIdentity(process.pid),projectDir};
  await save('queued-request.json',sign(request,await readFile(join(directory,'control-key'))));
  // Local publisher has already been reviewed and hash-bound by admission. A
  // separate worker waits for the owning desktop to close, then P2 takes locks.
  await startWorker(id);
  await info({message:'更新已排队，等待退出应用',detail:'请完成当前任务后，从托盘或应用菜单选择“退出应用”。关闭窗口只会隐藏到后台，不会开始更新。更新器将取得维护锁、复核计划并切换；不会强行中断任务。可在“应用 → 取消待执行更新”取消。等待超过 3 小时会取消本次请求。',buttons:['知道了']});
 }
 const clock=new UpdateClock({now,check:async signal=>{
  emit('checking');
  try{if(lastSuccess===null){try{const prior=JSON.parse(await readFile(join(directory,'check-state.json'),'utf8'));lastSuccess=typeof prior.lastSuccess==='string'?prior.lastSuccess:null;}catch{}}const releases=await fetchReleases({fetcher,signal});if(closed)return;latest=selectRelease(releases,app.getVersion());lastError=null;lastSuccess=new Date(now()).toISOString();await save('check-state.json',{status:'pass',checkedAt:lastSuccess,current:app.getVersion(),available:latest,lastSuccess});emit(latest?'available':'idle');
   if(latest){const preparation=await getReport(latest,signal);if(closed)return;const ready=preparation.report.readiness==='review-ready';emit(ready?'available':'candidate-unavailable');const answer=await info({message:ready?'发现可审阅的更新候选 '+latest.version:'发现官方新版，但 SEP 适配候选尚不可安装：'+latest.version,detail:'当前版本：'+app.getVersion()+'\n发布日期：'+latest.publishedAt+'\n'+latest.url+'\n\n立即更新会先检查全部插件及受控候选；缺少已适配候选时只展示阻断原因，不会安装。',buttons:[ready?'审阅并更新':'查看准备状态','暂不更新'],defaultId:1,cancelId:1});if(answer.response===0&&!closed)await reviewAndQueue(latest,signal);}
   else if(manual)await info({message:'未发现高于当前版本、属于当前或更稳定通道的官方版本',detail:'当前版本：'+app.getVersion()+'\n检查时间：'+lastSuccess,buttons:['知道了']});
  }catch(e){if(closed||signal.aborted)return;lastError=String(e.message).slice(0,500);emit('error');await save('check-state.json',{status:'fail',checkedAt:new Date(now()).toISOString(),message:String(e.message).slice(0,500),lastSuccess}).catch(()=>{});if(manual)await info({type:'warning',message:'检查或更新准备失败',detail:String(e.message).slice(0,500)+'\n当前版本保持不变；检查失败不代表已是最新。',buttons:['知道了']});}
 }});
 async function startWorker(id){
  // The managed launcher supplies a separate, installed Node runtime. Alpha2's
  // resources.node is Electron and must never be used with this clean environment.
  if(typeof nodeExecutable!=='string'||!isAbsolute(nodeExecutable)||basename(nodeExecutable).toLowerCase()!==(process.platform==='win32'?'node.exe':'node'))throw Error('UPDATE_NODE_RUNTIME_REQUIRED');
  const executable=await realpath(nodeExecutable),identity=await lstat(nodeExecutable);
  if(!identity.isFile()||identity.isSymbolicLink()||identity.nlink!==1||resolve(executable).toLowerCase()!==resolve(nodeExecutable).toLowerCase()||(process.versions.electron&&resolve(executable).toLowerCase()===resolve(process.execPath).toLowerCase()))throw Error('UPDATE_NODE_RUNTIME_REQUIRED');
  const child=spawn(executable,[fileURLToPath(new URL('./update-worker.mjs',import.meta.url)),directory,id],{windowsHide:true,detached:true,stdio:'ignore',env:cleanEnv()});await new Promise((res,rej)=>{child.once('spawn',res);child.once('error',rej);});child.unref();}
 let sepManual=false,sepPrompt=null,sepLatest=null,sepCheckedAt=null;
 let sepState={phase:'idle',managed:true};
 const emitSep=(phase,message)=>{sepState={phase,managed:true,...(sepLatest?{version:sepLatest.sepVersion}:{}),...(message?{message,failedOperation:'check'}:{}),lastCheckedAt:sepCheckedAt};onSepState({...sepState});};
 const sepClock=new UpdateClock({now,check:async signal=>{
  emitSep('checking');
  try{
   const installed=await jsonFile(join(projectDir,'node_modules/dsh-system-enhancement-package/package.json'));
   const found=await fetchSepRelease({installedSepVersion:installed.version,hostVersion:app.getVersion(),fetcher,signal});if(closed)return;
   await save('sep-check-state.json',{status:'pass',checkedAt:new Date(now()).toISOString(),current:installed.version,...found});
   sepLatest=found.release;sepCheckedAt=new Date(now()).toISOString();
   const unknown=found.status==='metadata-unavailable'||found.status==='no-releases';
   const platformUnavailable=found.status==='platform-unavailable';
   emitSep(found.release?'available':platformUnavailable?'candidate-unavailable':unknown?'error':'idle',platformUnavailable?'SEP_UPDATE_PLATFORM_UNAVAILABLE':unknown?'SEP_UPDATE_METADATA_UNAVAILABLE':undefined);
   if(found.release){
    const release=found.release,prepared=await getReport(release,signal);if(closed)return;
    const ready=prepared.report.readiness==='review-ready';
    emitSep(ready?'available':'candidate-unavailable');
    const answer=await info({message:'发现 SEP 本体更新 '+release.sepVersion,detail:'当前 SEP：'+installed.version+'\nDSH 保持：'+release.version+'\n'+release.url+'\n\n'+(ready?'将审阅全部插件兼容性并按已准备计划更新。':'将下载并核验更新包，在独立目录保留配置和插件，检查关键服务。退出应用后会另行展示具体安装计划，准备操作不等于批准安装。'),buttons:[ready?'审阅并更新 SEP':'下载并准备 SEP 更新','暂不更新'],defaultId:1,cancelId:1});
    if(answer.response===0&&!closed){if(ready)await reviewAndQueue(release,signal);else{await prepareSep({directory,release,nodeExecutable,projectDir,userData:app.getPath('userData')});await info({message:'SEP 更新准备已排队',detail:'请完成当前任务，从托盘或应用菜单退出应用。后台准备器随后下载、核验和检查候选，并展示完整插件报告，请你确认具体计划。关闭窗口仅隐藏到后台。等待退出最多 3 小时；可在应用菜单取消待执行更新。',buttons:['知道了']});}}
   }else if(sepManual){
    const unknown=found.status==='metadata-unavailable'||found.status==='no-releases';
    await info({message:platformUnavailable?'尚无适用于当前平台的 SEP 更新包':unknown?'SEP 发布信息尚不足以判断可更新版本':'未发现更高的可用 SEP 版本',detail:'当前 SEP：'+installed.version+'\nDSH：'+app.getVersion()+'\n'+(platformUnavailable?'SEP_UPDATE_PLATFORM_UNAVAILABLE：公开清单目前只提供其他平台的包；不会下载或执行这些包，也不能据此确认当前平台已是最新。':unknown?'SEP_UPDATE_METADATA_UNAVAILABLE：历史包缺少 dsh-sep-update.json。不能据此宣称已是最新，也不会直接运行下载包。':'已按 SEP 独立版本清单检查；DSH 版本未变。'),buttons:['知道了']});
   }
  }catch(error){if(closed||signal.aborted)return;emitSep('error',String(error.message).slice(0,160));await save('sep-check-state.json',{status:'fail',checkedAt:new Date(now()).toISOString(),message:String(error.message).slice(0,160)}).catch(()=>{});if(sepManual)await info({type:'warning',message:'SEP 本体更新检查失败',detail:String(error.message).slice(0,160)+'\n当前安装保持原状，失败不代表已是最新。',buttons:['知道了']});}
 }});
 let recoveryChecked=false;
 async function recoverQueued(){if(recoveryChecked)return;recoveryChecked=true;try{const key=await readFile(join(directory,'control-key')),request=verify(JSON.parse(await readFile(join(directory,'queued-request.json'),'utf8')),key);if(request.schema!==3)throw Error('UPDATE_REQUEST_REVIEW_REQUIRED');
  let state;try{state=verify(JSON.parse(await readFile(join(directory,'state-'+request.id+'.json'),'utf8')),key);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!['verified','rolled_back','runtime_failed'].includes(state?.phase))await startWorker(request.id);
 }catch(e){if(e.code!=='ENOENT')await save('resume-result.json',{status:'blocked',message:'UPDATE_RESUME_REQUIRES_REVIEW'});}}
 const tick=()=>void clock.tick().then(()=>sepClock.tick()).catch(()=>{});const timer=setInterval(tick,60000);timer.unref?.();powerMonitor.on('resume',tick);
 return {
  directory,
  status(){return {...state};},
  sepStatus(){return {...sepState};},
  async open(){await recoverQueued();await resumePreparation(directory).catch(async e=>{await save('preparation-resume-result.json',{status:'blocked',code:String(e.code??e.message).slice(0,160)});});await clock.open();return sepClock.open();},
  async checkSep(){if(sepPrompt)return sepPrompt;sepManual=true;sepPrompt=sepClock.open().finally(()=>{sepManual=false;sepPrompt=null;});return sepPrompt;},
  async check(){if(prompting)return prompting;manual=true;prompting=clock.open().finally(()=>{manual=false;prompting=null;});return prompting;},
  async report(){if(scan)return;try{const release=latest??{version:app.getVersion(),url:'https://github.com/deepseek-ai/deepseek-harness/releases',publishedAt:''};const value=await getReport(release);await view(value.report);}catch(e){await info({type:'warning',message:'插件报告生成失败',detail:String(e.message),buttons:['知道了']});}},
  async cancel(){await save('cancel-request.json',{cancelledAt:new Date().toISOString()});await info({message:'已请求取消尚未开始切换的更新',detail:'已经取得维护锁并开始发布的事务，由受控发布器完成或恢复，不强行中断。',buttons:['知道了']});},
  close(){closed=true;clock.close();sepClock.close();clearInterval(timer);powerMonitor.removeListener('resume',tick);if(reportWindow&&!reportWindow.isDestroyed())reportWindow.close();},
 };
}
