// Fixed-source test derivation only. No installed application file is changed.
import{createHash}from'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const fixed={worker:'4f8620bc08a7cba335de715b7616504085c43d28553b58f67b17cf4e781418a7',operator:'223edd0596d86cda5dd22d6522badc89bd3428474c294ef7accbcae8ce194f5e'};
const fail=code=>{throw Object.assign(Error(code),{code});};
export function deriveDiagnostic(source){
 const outputs={},origin={};for(const name of ['worker','operator'])if(typeof source[name]!=='string'||sha(source[name])!==fixed[name])fail('SEP_SETTINGS_ORIGIN_CHANGED');
 for(const name of ['worker','operator']){
  let value=source[name];const transforms=[];
  const change=(before,after)=>{if(value.split(before).length!==2)fail('SEP_SETTINGS_TRANSFORM');transforms.push({before,after});value=value.replace(before,after);};
  if(name==='worker'){
   change('// Test-only: real installed product, one blank Profile, explicit Inspector scope.','// Test-only: unchanged installed product, same-series synthetic Profile, explicit Inspector scope.');
   change('// exact installed app path and Electron readiness, after trusted welcome proof.','// exact installed app path and Electron readiness, after trusted surface proof.');
   change("import {connectSmokeInspector} from './smoke-inspector.mjs';","import {connectSmokeInspector} from '../desktop/smoke-inspector.mjs';\nimport {probeSettingsPage} from '../settings-ui/desktop-probe.mjs';");
   change('/^(SEP_|FULL_|P1_|P2_|BUDGET_|FS_|OWNER_)','/^(SEP_|FULL_|P1_|P2_|BUDGET_|FS_|OWNER_|SETTINGS_)');
   change("if(!['early','welcome-ready'].includes(phase))","if(!['early','surface-ready'].includes(phase))");
   change("if(phase==='welcome-ready')","if(phase==='surface-ready')");
   change("scope:'one blank-data Inspector-assisted welcome-to-workspace DOM diagnostic; not Finder or physical input'","scope:'one same-product settings DOM persistence round; Inspector-assisted, not physical input',roundNumber:input.round");
   change("result.stage='welcome-ready';await until(()=>control.status().surface==='welcome',60000,'SEP_WORKSPACE_WELCOME_READY');","result.stage='surface-ready';const readySurface=await until(()=>{const s=control.status();return s.ready===true&&s.blocked===false&&['welcome','workspace'].includes(s.surface)?s.surface:null;},60000,'SEP_WORKSPACE_SURFACE_READY');result.initialSurface=readySurface;");
   change("result.readyIdentity=await verifyWorkspaceInspector({phase:'welcome-ready',read:readIdentity,save,expectedPid:app.desktopPid,expectedAppPath:asar});","result.readyIdentity=await verifyWorkspaceInspector({phase:'surface-ready',read:readIdentity,save,expectedPid:app.desktopPid,expectedAppPath:asar});\n  await client.eval('globalThis.__sepFullProbe=globalThis.__sepWorkspaceProbe;true');");
   change("const welcome=await until(async()=>{const ws=(await snapshots()).filter(w=>w.visible&&!w.loading&&w.surface==='welcome');assert(ws.length<=1);return ws[0];},30000,'SEP_WORKSPACE_WELCOME_WINDOW');","const welcome=readySurface==='welcome'?await until(async()=>{const ws=(await snapshots()).filter(w=>w.visible&&!w.loading&&w.surface==='welcome');assert(ws.length<=1);return ws[0];},30000,'SEP_WORKSPACE_WELCOME_WINDOW'):null;");
   change("for(const id of ['api-key','skip-key']){","if(welcome)for(const id of ['api-key','skip-key']){");
   change("result.stage='quit';client.close();client=undefined;","result.stage='settings';result.settings=await probeSettingsPage({client,windowId:workspace.id,round:input.round,diagnosticRoot:input.outputRoot});\n  assert.equal(result.settings.persistedFromPriorColdStart,input.round>1);\n  result.stage='quit';client.close();client=undefined;");
   change("}catch(e){result.code=safeCode(e);result.errorType=e.name;}","}catch(e){result.code=safeCode(e);result.errorType=e.name;if(e.diagnostic)result.diagnostic=e.diagnostic;}");
  }else{
   change("import {readAssemblyReceipt} from './product-control/native-launch-runner.mjs';","import {readAssemblyReceipt} from '../desktop/product-control/native-launch-runner.mjs';");
   change("import {loadProgram} from './managed-broker/program-manifest.mjs';","import {loadProgram} from '../desktop/managed-broker/program-manifest.mjs';\nimport {classifySettingsRound as classifyDiagnostic} from './contracts.mjs';");
   const start=value.indexOf('export function classifyDiagnostic('),end=value.indexOf('\nasync function main(){',start);if(start<0||end<0)fail('SEP_SETTINGS_TRANSFORM');change(value.slice(start,end),'export {classifyDiagnostic};');
   change("process.argv.length!==5","process.argv.length!==7");
   change("const [assemblyPath,assemblySha,outputRoot]=process.argv.slice(2),temp=await realpath(process.env.RUNNER_TEMP);","const [assemblyPath,assemblySha,outputRoot,sharedDataRoot,roundArg]=process.argv.slice(2),round=Number(roundArg),temp=await realpath(process.env.RUNNER_TEMP);\n if(![1,2,3].includes(round)||!isAbsolute(sharedDataRoot)||resolve(sharedDataRoot)!==sharedDataRoot||!sharedDataRoot.startsWith(temp+sep)||resolve(outputRoot,'..')!==resolve(sharedDataRoot,'..'))fail('SEP_SETTINGS_ROUND_INPUT');");
   change("brandSha256:hash(brand),outputRoot,dataRoot:join(outputRoot,'data'),tmpRoot:join(outputRoot,'tmp'),sourceInputs:[]","brandSha256:hash(brand),outputRoot,round,dataRoot:sharedDataRoot,tmpRoot:join(outputRoot,'tmp'),sourceInputs:[]");
   change("await mkdir(input.dataRoot,{mode:0o700});await mkdir(input.tmpRoot,{mode:0o700});","if(round===1)await mkdir(input.dataRoot,{mode:0o700});else assert.equal(await realpath(input.dataRoot),input.dataRoot);await mkdir(input.tmpRoot,{mode:0o700});");
   change("['workspace-diagnostic.mjs','workspace-diagnostic-worker.mjs','workspace-diagnostic.test.mjs','smoke-inspector.mjs','product-control/native-launch-runner.mjs','managed-broker/program-manifest.mjs']","['operator.mjs','worker.mjs','contracts.mjs','ORIGIN.json','../settings-ui/desktop-probe.mjs','../settings-ui/desktop-diagnostic.mjs','../settings-ui/desktop-onboarding.mjs','../settings-ui/desktop-trace.mjs','../settings-ui/desktop-screenshot.mjs','../desktop/smoke-inspector.mjs','../desktop/product-control/native-launch-runner.mjs','../desktop/managed-broker/program-manifest.mjs']");
   change("new URL('./workspace-diagnostic-worker.mjs',import.meta.url)","new URL('./worker.mjs',import.meta.url)");
   change("LANG:'en_US.UTF-8',TMPDIR:input.tmpRoot,TMP:input.tmpRoot,TEMP:input.tmpRoot","LANG:'en_US.UTF-8',RUNNER_TEMP:temp,TMPDIR:input.tmpRoot,TMP:input.tmpRoot,TEMP:input.tmpRoot");
   change("scope:'one same-product Inspector-assisted DOM round; distinct from Finder and no-Inspector lifecycle',expectedRounds:1","scope:'one actual unchanged-product settings DOM persistence round; distinct from Finder/physical input',roundNumber:round,expectedRounds:1");
  }
  outputs[name]=value;origin[name]={sourceSha256:fixed[name],resultSha256:sha(value),transforms};
 }
 return {schema:1,outputs,origin};
}
