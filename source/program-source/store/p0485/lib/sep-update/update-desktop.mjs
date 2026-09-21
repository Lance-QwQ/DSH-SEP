import {readFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {join,isAbsolute,resolve,basename} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import semver from 'semver';
import {UpdateClock,fetchReleases,selectRelease,renderReport,acceptRisks,decide,hash} from './update-core.mjs';
import {inventory,makeReport} from './update-inventory.mjs';
import {loadAdmission,durableJson,sign,verify} from './update-admission.mjs';
import {processIdentity,cleanEnv} from './update-process.mjs';

/** Native desktop service. No model tools, imported plugin code, or network installers. */
export function createManagedUpdater({app,dialog,BrowserWindow,powerMonitor,projectDir,nodeExecutable,fetcher=fetch,now=Date.now,onState=()=>{}}){
 const directory=join(app.getPath('userData'),'sep-updates');let closed=false,manual=false,reportWindow,latest=null,lastSuccess=null,lastError=null,prompting=null,scan=null;
 let state={phase:'idle',managed:true};
 const emit=phase=>{state={phase,...(latest?{version:latest.version}:{}),...(lastError?{message:lastError,failedOperation:'check'}:{}),managed:true,lastCheckedAt:lastSuccess};onState({...state});};
 const save=(name,body)=>durableJson(directory,name,body);
 const info=options=>closed?Promise.resolve({response:1}):dialog.showMessageBox({title:'DSH SEP 更新',type:'info',...options});
 const view=async report=>{if(closed)return;if(reportWindow&&!reportWindow.isDestroyed())reportWindow.close();reportWindow=new BrowserWindow({width:1100,height:780,title:'DSH SEP — 全插件兼容性报告',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});reportWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));reportWindow.webContents.on('will-navigate',e=>e.preventDefault());await reportWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(renderReport(report)));};
 async function getReport(release,signal){if(scan)return scan;scan=(async()=>{
  const current=await inventory(projectDir,{signal});let admission=null,candidate=null,block;
  try{admission=await loadAdmission(directory,release,current.binding);if(admission){candidate=await inventory(admission.targetRoot,{signal});if(candidate.binding!==admission.targetBinding||candidate.rootVersions['@deepseek-ai/dsh']!==release.version)throw Error('UPDATE_CANDIDATE_CHANGED');}}catch(e){block=e.message;admission=null;candidate=null;}
  const report=makeReport(current,candidate,release,app.getVersion(),(v,r)=>semver.satisfies(v,r,{includePrerelease:true}));if(block)report.hardBlocks.push(block);
  if(admission){report.binding=hash({report:report.binding,admission});report.admission=hash(admission);}
  await save('last-report.json',report);return {report,admission};
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
  const id=crypto.randomUUID();const request={schema:2,id,release,reportBinding:report.binding,currentBinding:report.currentBinding,consent,admissionHash:hash(admission),decision:decide(report,consent).decision,queuedAt:new Date().toISOString(),parentIdentity:await processIdentity(process.pid),projectDir};
  await save('queued-request.json',sign(request,await readFile(join(directory,'control-key'))));
  // Local publisher has already been reviewed and hash-bound by admission. A
  // separate worker waits for the owning desktop to close, then P2 takes locks.
  await startWorker(id);
  await info({message:'更新已排队，等待退出应用',detail:'请完成当前任务后，从托盘或应用菜单选择“退出应用”。关闭窗口只会隐藏到后台，不会开始更新。更新器将取得维护锁、复核计划并切换；不会强行中断任务。可在“应用 → 取消待执行更新”取消。等待超过 3 小时会取消本次请求。',buttons:['知道了']});
 }
 const clock=new UpdateClock({now,check:async signal=>{
  emit('checking');
  try{if(lastSuccess===null){try{const prior=JSON.parse(await readFile(join(directory,'check-state.json'),'utf8'));lastSuccess=typeof prior.lastSuccess==='string'?prior.lastSuccess:null;}catch{}}const releases=await fetchReleases({fetcher,signal});if(closed)return;latest=selectRelease(releases,app.getVersion());lastError=null;lastSuccess=new Date(now()).toISOString();await save('check-state.json',{status:'pass',checkedAt:lastSuccess,current:app.getVersion(),available:latest,lastSuccess});emit(latest?'available':'idle');
   if(latest){const answer=await info({message:'发现官方 DSH 新版本 '+latest.version,detail:'当前版本：'+app.getVersion()+'\n发布日期：'+latest.publishedAt+'\n'+latest.url+'\n\n立即更新会先检查全部插件及受控候选；缺少已适配候选时只展示阻断原因，不会安装。',buttons:['立即更新','暂不更新'],defaultId:1,cancelId:1});if(answer.response===0&&!closed)await reviewAndQueue(latest,signal);}
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
 let recoveryChecked=false;
 async function recoverQueued(){if(recoveryChecked)return;recoveryChecked=true;try{const key=await readFile(join(directory,'control-key')),request=verify(JSON.parse(await readFile(join(directory,'queued-request.json'),'utf8')),key);if(request.schema!==2)return;
  let state;try{state=verify(JSON.parse(await readFile(join(directory,'state-'+request.id+'.json'),'utf8')),key);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!['verified','rolled_back','runtime_failed'].includes(state?.phase))await startWorker(request.id);
 }catch(e){if(e.code!=='ENOENT')await save('resume-result.json',{status:'blocked',message:'UPDATE_RESUME_REQUIRES_REVIEW'});}}
 const tick=()=>void clock.tick().catch(()=>{});const timer=setInterval(tick,60000);timer.unref?.();powerMonitor.on('resume',tick);
 return {
  directory,
  status(){return {...state};},
  async open(){await recoverQueued();return clock.open();},
  async check(){if(prompting)return prompting;manual=true;prompting=clock.open().finally(()=>{manual=false;prompting=null;});return prompting;},
  async report(){if(scan)return;try{const release=latest??{version:app.getVersion(),url:'https://github.com/deepseek-ai/deepseek-harness/releases',publishedAt:''};const value=await getReport(release);await view(value.report);}catch(e){await info({type:'warning',message:'插件报告生成失败',detail:String(e.message),buttons:['知道了']});}},
  async cancel(){await save('cancel-request.json',{cancelledAt:new Date().toISOString()});await info({message:'已请求取消尚未开始切换的更新',detail:'已经取得维护锁并开始发布的事务，由受控发布器完成或恢复，不强行中断。',buttons:['知道了']});},
  close(){closed=true;clock.close();clearInterval(timer);powerMonitor.removeListener('resume',tick);if(reportWindow&&!reportWindow.isDestroyed())reportWindow.close();},
 };
}
