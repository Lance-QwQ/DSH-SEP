// Test-only: unchanged installed product, same-series synthetic Profile, explicit Inspector scope.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {connectSmokeInspector} from '../smoke-inspector.mjs';
import {probeCurrentProject} from './native-dom.mjs';
import {prepareProjectRound,finishProjectRound} from './native-data-r2.mjs';
import {fixtureResourcesUnknown} from './native-contract.mjs';
const error=code=>Object.assign(Error(code),{code});
const safeCode=e=>/^(SEP_|FULL_|P1_|P2_|BUDGET_|FS_|OWNER_|SETTINGS_)[A-Z0-9_]{1,90}$/.test(e?.code??e?.message??'')?e.code??e.message:'SEP_WORKSPACE_DIAGNOSTIC_ASSERTION';

// Both samples are read-only. Early sampling binds the actual child PID, but
// cannot authorize a UI action. The ready sample additionally requires the
// exact installed app path and Electron readiness, after trusted surface proof.
export async function verifyWorkspaceInspector({phase,read,save,expectedPid,expectedAppPath}){
 if(!['early','surface-ready'].includes(phase))throw error('SEP_WORKSPACE_INSPECTOR_PHASE');
 const observed=await read();
 const sample={schema:1,phase,observedPid:observed?.observedPid??null,appPath:observed?.appPath??null,isReady:observed?.isReady??null,expectedPid,expectedAppPath};
 await save('IDENTITY-'+phase+'.json',sample);
 if(sample.observedPid!==expectedPid)throw error('SEP_WORKSPACE_INSPECTOR_PID');
 if(phase==='surface-ready'){
  if(sample.appPath!==expectedAppPath)throw error('SEP_WORKSPACE_INSPECTOR_PATH');
  if(sample.isReady!==true)throw error('SEP_WORKSPACE_INSPECTOR_NOT_READY');
 }
 return sample;
}

// This exact function executes inside the real welcome renderer. Observation
// does not dispatch. The later dispatch repeats all visibility checks once.
export function performWelcomeAction(id,dispatch=true){
 const fail=code=>{throw Object.assign(Error(code),{code});};
 if(!['api-key','skip-key'].includes(id)||typeof dispatch!=='boolean'||location.protocol!=='file:'||!location.pathname.endsWith('/renderer/welcome.html'))fail('SEP_WORKSPACE_ACTION_REJECTED');
 const rows=document.querySelectorAll('#'+id);
 if(rows.length!==1)fail('SEP_WORKSPACE_ACTION_UNAVAILABLE');
 const button=rows[0],rect=button.getBoundingClientRect();
 if(button.tagName!=='BUTTON'||!button.isConnected||button.disabled||button.getAttribute('aria-disabled')==='true'||button.closest('[hidden],[inert],[aria-hidden="true"]')||!button.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||rect.width<=0||rect.height<=0||rect.right<=0||rect.bottom<=0||rect.left>=innerWidth||rect.top>=innerHeight)fail('SEP_WORKSPACE_ACTION_UNAVAILABLE');
 if(dispatch)button.click();
 return {ready:true,control:id,dispatched:dispatch};
}

function measureBrand(){
 if(location.protocol!=='dsh-app:'||location.host!=='app')throw Error('SEP_WORKSPACE_DOCUMENT');
 const badges=document.querySelectorAll('[data-dsh-sep-badge="true"]');
 if(badges.length!==1)throw Error('SEP_WORKSPACE_BRAND_UNAVAILABLE');
 const badge=badges[0],rect=badge.getBoundingClientRect(),wordmark=badge.previousElementSibling;
 const official=wordmark?.tagName.toLowerCase()==='svg'&&wordmark.querySelector('rect[width="52"][height="14"][rx="2"]')!==null;
 if(!badge.isConnected||!badge.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||rect.width<=0||rect.height<=0||rect.right<=0||rect.bottom<=0||rect.left>=innerWidth||rect.top>=innerHeight||badge.textContent.trim()!=='SEP'||!official)throw Error('SEP_WORKSPACE_BRAND_UNAVAILABLE');
 const box=wordmark.getBoundingClientRect(),background=badge.querySelector('rect');
 return {width:rect.width,height:rect.height,gap:rect.left-box.right,officialHarnessPreserved:official,rounded:background?.getAttribute('rx')==='2',devicePixelRatio,decorativeAriaHidden:badge.getAttribute('aria-hidden')==='true'};
}

async function main(){
 if(process.platform!=='darwin'||process.arch!=='arm64'||process.argv.length!==4)throw error('SEP_WORKSPACE_PLATFORM');
 const bytes=await readFile(process.argv[2]);assert.equal(createHash('sha256').update(bytes).digest('hex'),process.argv[3]);
 const input=JSON.parse(bytes);assert.equal(process.execPath,input.nodeExecutable);
 const result={schema:1,status:'fail',scope:'one current-project derived-application DOM round; Inspector-assisted, not physical input',roundNumber:input.round,programSha256:input.programSha256,assemblyResultSha256:input.assemblyResultSha256,stage:'prepare',actions:[],events:[],cleanup:{status:'blocked',resourcesConfirmedReleased:false},forcedTermination:false};
 const abort=new AbortController();process.on('message',m=>{if(m&&Object.keys(m).length===1&&m.kind==='requestCleanup')abort.abort();});
 let preparationUnknown=false;let app,control,client,pending=false,launchPromise,closed,finalized=false,serial=0;
 async function save(name,value){const path=join(input.outputRoot,name),tmp=path+'.'+(++serial)+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(tmp,path);}
 async function bounded(promise,ms,allowAbort=true){let timer,listener;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(error('SEP_WORKSPACE_DEADLINE')),ms);listener=()=>reject(error('SEP_WORKSPACE_CLEANUP_REQUESTED'));if(allowAbort){if(abort.signal.aborted)listener();else abort.signal.addEventListener('abort',listener,{once:true});}});try{return await Promise.race([promise,deadline]);}finally{clearTimeout(timer);abort.signal.removeEventListener('abort',listener);}}
 async function until(predicate,ms,code){const end=Date.now()+ms;while(Date.now()<end){if(abort.signal.aborted)throw error('SEP_WORKSPACE_CLEANUP_REQUESTED');if(control?.status().blocked)throw error('SEP_WORKSPACE_CONTROL_BLOCKED');const value=await predicate();if(value)return value;await delay(50);}throw error(code);}
 async function generation(){try{const s=JSON.parse(await readFile(join(input.dataRoot,'launcher/generation.json'),'utf8'));return{generation:s.generation,phase:s.phase,resourcesConfirmedReleased:s.resourcesConfirmedReleased===true};}catch{return null;}}
 async function cleanup(){
  client?.close();client=undefined;
  if(!app)return preparationUnknown||pending||control?.status().owned?{status:'blocked',resourcesConfirmedReleased:false,code:'SEP_WORKSPACE_LAUNCH_UNCONFIRMED'}:{status:'pass',resourcesConfirmedReleased:true,noOwnedGeneration:true};
  const normalCleanupAttempted=closed===undefined;
  try{const receipt=closed??await bounded(app.close({requestDesktop:true}),15000,false);if(receipt.status!=='pass'||receipt.resourcesConfirmedReleased!==true)throw error('SEP_WORKSPACE_CLEANUP_UNCONFIRMED');await bounded(app.whenClosed(),1000,false);const state=await generation();if(state?.phase!=='closed'||state.generation!==app.generation||state.resourcesConfirmedReleased!==true||control.desktopReceipt().status!=='pass')throw error('SEP_WORKSPACE_CLEANUP_UNCONFIRMED');return{status:'pass',resourcesConfirmedReleased:true,receipt,generation:state,normalCleanupAttempted};}catch(e){return{status:'blocked',resourcesConfirmedReleased:false,normalCleanupAttempted,code:safeCode(e),generation:await generation()};}
 }
 try{
  result.preparation=await prepareProjectRound(input);
  const runtime=join(dirname(dirname(input.programPath)),'Resources/product/runtime');
  const {launchFull}=await import(pathToFileURL(join(runtime,'desktop/project-workflow-product/launch-full.mjs'))),{createLaunchControl}=await import(pathToFileURL(join(runtime,'desktop/product-control/launch-control.mjs')));
  control=createLaunchControl({onEvent:e=>result.events.push(e)});result.stage='launch';pending=true;
  launchPromise=launchFull({programPath:input.programPath,programSha256:input.programSha256,dataRoot:input.dataRoot,diagnosticInspector:true,control}).then(value=>{app=value;pending=false;void app.whenClosed().then(async receipt=>{closed=receipt;if(finalized&&result.cleanup.status!=='pass')await save('LATE-CLEANUP.json',{status:receipt.status,receipt,originalStatus:result.status,notRetroactive:true}).catch(()=>{});});return value;},e=>{pending=false;throw e;});
  await bounded(launchPromise,100000);assert.equal(app.status,'running');result.generation=app.generation;result.desktopPid=app.desktopPid;result.hostPid=app.hostPid;
  result.stage='inspector-early';const endpoint=await until(()=>app.diagnostics().inspectorEndpoint,30000,'SEP_WORKSPACE_INSPECTOR_DEADLINE');client=await connectSmokeInspector(endpoint);
  const asar=join(input.application,'Contents/Helpers/DSH SEP Desktop.app/Contents/Resources/app.asar');
  const readIdentity=()=>client.eval(`(()=>{const require=process.getBuiltinModule('module').createRequire(${JSON.stringify(asar+'/package.json')});globalThis.__sepWorkspaceProbe??={electron:require('electron')};return{observedPid:process.pid,appPath:__sepWorkspaceProbe.electron.app.getAppPath()??null,isReady:__sepWorkspaceProbe.electron.app.isReady()};})()`);
  result.earlyIdentity=await verifyWorkspaceInspector({phase:'early',read:readIdentity,save,expectedPid:app.desktopPid,expectedAppPath:asar});
  result.stage='surface-ready';const readySurface=await until(()=>{const s=control.status();return s.ready===true&&s.blocked===false&&['welcome','workspace'].includes(s.surface)?s.surface:null;},60000,'SEP_WORKSPACE_SURFACE_READY');result.initialSurface=readySurface;
  result.stage='inspector-ready';result.readyIdentity=await verifyWorkspaceInspector({phase:'surface-ready',read:readIdentity,save,expectedPid:app.desktopPid,expectedAppPath:asar});
  await client.eval('globalThis.__sepFullProbe=globalThis.__sepWorkspaceProbe;true');
  result.stage='welcome';
  const welcomeUrl=pathToFileURL(join(asar,'renderer/welcome.html')).href;
  const snapshots=()=>client.eval(`__sepWorkspaceProbe.electron.BrowserWindow.getAllWindows().map(w=>({id:w.id,visible:w.isVisible(),loading:w.webContents.isLoading(),surface:w.webContents.getURL()===${JSON.stringify(welcomeUrl)}?'welcome':w.webContents.getURL().startsWith('dsh-app://app/')?'workspace':'other'}))`);
  const welcome=readySurface==='welcome'?await until(async()=>{const ws=(await snapshots()).filter(w=>w.visible&&!w.loading&&w.surface==='welcome');assert(ws.length<=1);return ws[0];},30000,'SEP_WORKSPACE_WELCOME_WINDOW'):null;
  let operation=0;
  async function renderer(windowId,script){
   const id=++operation;
   const envelope=`(()=>{try{return{ok:true,value:(${script})};}catch(e){return{ok:false,code:/^SEP_[A-Z0-9_]{1,90}$/.test(e?.code??e?.message??'')?(e.code??e.message):'SEP_WORKSPACE_RENDERER_FAILED'};}})()`;
   await client.eval(`__sepWorkspaceProbe.operation={id:${id},pending:true};void(async()=>{const w=__sepWorkspaceProbe.electron.BrowserWindow.fromId(${windowId});if(!w||w.isDestroyed()||!w.isVisible())throw Error('SEP_WORKSPACE_WINDOW_CHANGED');const reply=await w.webContents.executeJavaScript(${JSON.stringify(envelope)},false);__sepWorkspaceProbe.operation=reply.ok?{id:${id},done:true,value:reply.value}:{id:${id},done:true,code:reply.code};})().catch(()=>{__sepWorkspaceProbe.operation={id:${id},done:true,code:'SEP_WORKSPACE_RENDERER_FAILED'};});true`);
   const receipt=await until(async()=>{const v=await client.eval('__sepWorkspaceProbe.operation');return v?.id===id&&v.done?v:null;},15000,'SEP_WORKSPACE_RENDERER_DEADLINE');if(receipt.code)throw error(receipt.code);return receipt.value;
  }
  if(welcome)for(const id of ['api-key','skip-key']){
   result.stage='button-'+id;
   await until(async()=>{try{return (await renderer(welcome.id,'('+performWelcomeAction.toString()+')('+JSON.stringify(id)+',false)')).ready;}catch(e){if(e.code==='SEP_WORKSPACE_ACTION_UNAVAILABLE')return false;throw e;}},20000,'SEP_WORKSPACE_ACTION_UNAVAILABLE');
   // Once dispatched, missing response is unknown; do not retry the click.
   const receipt=await renderer(welcome.id,'('+performWelcomeAction.toString()+')('+JSON.stringify(id)+',true)');assert.equal(receipt.dispatched,true);result.actions.push(receipt);
  }
  result.stage='workspace';await until(()=>control.status().surface==='workspace',60000,'SEP_WORKSPACE_COMMIT_DEADLINE');result.workspaceReady=control.status();assert.equal(result.workspaceReady.ready,true);assert.equal(result.workspaceReady.blocked,false);
  const workspace=await until(async()=>{const ws=(await snapshots()).filter(w=>w.visible&&!w.loading&&w.surface==='workspace');assert(ws.length<=1);return ws[0];},30000,'SEP_WORKSPACE_WINDOW_DEADLINE');result.workspaceWindowId=workspace.id;
  result.stage='brand';result.badge=await renderer(workspace.id,'('+measureBrand.toString()+')()');assert(Math.abs(result.badge.width-32)<0.05&&Math.abs(result.badge.height-14)<0.05);assert(result.badge.gap>=5.5);assert.equal(result.badge.rounded,true);assert.equal(result.badge.officialHarnessPreserved,true);
  result.stage='project';result.project=await probeCurrentProject({client,windowId:workspace.id,input,preparation:result.preparation});
  result.stage='quit';client.close();client=undefined;control.requestQuit(randomBytes(12).toString('hex'));const receipt=await bounded(app.whenClosed(),30000);assert.equal(receipt.status,'pass');assert.equal(receipt.resourcesConfirmedReleased,true);assert.equal(control.desktopReceipt().status,'pass');assert.equal(control.status().blocked,false);result.status='pass';result.stage='desktop-closed';
 }catch(e){preparationUnknown=fixtureResourcesUnknown(e);result.code=safeCode(e);result.errorType=e.name;if(e.diagnostic)result.diagnostic=e.diagnostic;}
 finally{
  result.cleanup=await cleanup();if(result.cleanup.status!=='pass')result.status='blocked';
  if(result.cleanup.status==='pass'&&result.preparation)try{result.stage='final-inspection';result.finalState=await finishProjectRound(input,result.preparation);if(result.finalState.status!=='pass')result.status='fail';else result.stage='complete';}catch(e){if(fixtureResourcesUnknown(e)){result.status='blocked';result.cleanup={status:'blocked',resourcesConfirmedReleased:false};}else result.status='fail';result.code=safeCode(e);}
  finalized=true;await save('WORKER-RESULT.json',result);
  if(pending&&launchPromise)void launchPromise.then(async()=>{await save('LATE-CLEANUP.json',{cleanup:await cleanup(),originalStatus:result.status,notRetroactive:true});},()=>{}).catch(()=>{});
 }
 if(result.status==='blocked')setInterval(()=>{},1000); // Retain unknown owner; no test SIGKILL.
 else if(process.connected)process.disconnect();
 process.exitCode=result.status==='pass'?0:1;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(JSON.stringify({status:'blocked',code:safeCode(e)}));process.exitCode=1;});
