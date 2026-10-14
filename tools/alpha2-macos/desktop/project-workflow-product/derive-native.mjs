// Operator-only exact derivation of the already validated lifecycle supervisor.
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex'),fail=code=>{throw Object.assign(Error(code),{code});};
const pins={worker:'a45d1b20e17d5a5af219f3e0337a8d1512c11b8014da9a0c632f384e71c89e55',operator:'c8f803f69fb359386b9fc85a60896894f819295eab4f07c984e6a7a9d60a6665'};
export function deriveNativeProbe(source){
 const outputs={},origin={};
 for(const name of ['worker','operator']){
  if(typeof source[name]!=='string'||sha(source[name])!==pins[name])fail('SEP_PROJECT_NATIVE_ORIGIN');let text=source[name];const changes=[];
  const change=(before,after)=>{if(text.split(before).length!==2)fail('SEP_PROJECT_NATIVE_TRANSFORM');changes.push({before,after});text=text.replace(before,after);};
  if(name==='worker'){
   change("from '../desktop/smoke-inspector.mjs'","from '../smoke-inspector.mjs'");
   change("import {probeSettingsPage} from '../settings-ui/desktop-probe.mjs';","import {probeCurrentProject} from './native-dom.mjs';\nimport {prepareProjectRound,finishProjectRound} from './native-data.mjs';\nimport {fixtureResourcesUnknown} from './native-contract.mjs';");
   change("scope:'one same-product settings DOM persistence round; Inspector-assisted, not physical input'","scope:'one current-project derived-application DOM round; Inspector-assisted, not physical input'");
   change("desktop/managed-broker/launch-full.mjs","desktop/project-workflow-product/launch-full.mjs");
   change("let app,control,client,pending=false","let preparationUnknown=false;let app,control,client,pending=false");
   change("  if(!app)return pending||control?.status().owned?","  if(!app)return preparationUnknown||pending||control?.status().owned?");
   change("  const runtime=join(dirname(dirname(input.programPath)),'Resources/product/runtime');","  result.preparation=await prepareProjectRound(input);\n  const runtime=join(dirname(dirname(input.programPath)),'Resources/product/runtime');");
   change("result.stage='settings';result.settings=await probeSettingsPage({client,windowId:workspace.id,round:input.round,diagnosticRoot:input.outputRoot});\n  assert.equal(result.settings.persistedFromPriorColdStart,input.round>1);","result.stage='project';result.project=await probeCurrentProject({client,windowId:workspace.id,input,preparation:result.preparation});");
   change("}catch(e){result.code=safeCode(e);result.errorType=e.name;if(e.diagnostic)result.diagnostic=e.diagnostic;}","}catch(e){preparationUnknown=fixtureResourcesUnknown(e);result.code=safeCode(e);result.errorType=e.name;if(e.diagnostic)result.diagnostic=e.diagnostic;}");
   change("result.cleanup=await cleanup();if(result.cleanup.status!=='pass')result.status='blocked';finalized=true;","result.cleanup=await cleanup();if(result.cleanup.status!=='pass')result.status='blocked';\n  if(result.cleanup.status==='pass'&&result.preparation)try{result.finalState=await finishProjectRound(input,result.preparation);if(result.finalState.status!=='pass')result.status='fail';}catch(e){if(fixtureResourcesUnknown(e)){result.status='blocked';result.cleanup={status:'blocked',resourcesConfirmedReleased:false};}else result.status='fail';result.code=safeCode(e);}\n  finalized=true;");
  }else{
   change("from '../desktop/product-control/native-launch-runner.mjs'","from '../product-control/native-launch-runner.mjs'");
   change("from '../desktop/managed-broker/program-manifest.mjs'","from '../managed-broker/program-manifest.mjs'");
   change("import {classifySettingsRound as classifyDiagnostic} from './contracts.mjs';","import {classifyProjectRound as classifyDiagnostic} from './native-contract.mjs';");
   change("![1,2,3].includes(round)","![1,2].includes(round)");
   change("['operator.mjs','worker.mjs','contracts.mjs','ORIGIN.json','../settings-ui/desktop-probe.mjs','../settings-ui/desktop-diagnostic.mjs','../settings-ui/desktop-onboarding.mjs','../settings-ui/desktop-trace.mjs','../settings-ui/desktop-screenshot.mjs','../desktop/smoke-inspector.mjs','../desktop/product-control/native-launch-runner.mjs','../desktop/managed-broker/program-manifest.mjs']","['native-operator.mjs','native-worker.mjs','native-contract.mjs','NATIVE-ORIGIN.json','native-dom.mjs','native-data.mjs','../../settings-ui/desktop-onboarding.mjs','../smoke-inspector.mjs','../workspace-diagnostic.mjs','../product-control/native-launch-runner.mjs','../managed-broker/program-manifest.mjs']");
   change("new URL('./worker.mjs',import.meta.url)","new URL('./native-worker.mjs',import.meta.url)");
   change("scope:'one actual unchanged-product settings DOM persistence round; distinct from Finder/physical input'","scope:'one actual derived-product current-project DOM round; distinct from Finder/physical input'");
   change("round:receipt,notVerified:[","round:receipt,notVerified:['native confirmation selection and accepted result','physical current-project interaction',");
  }
  outputs[name]=text;origin[name]={sourceSha256:pins[name],resultSha256:sha(text),changes};
 }
 return {schema:1,scope:'test-only derived operator; no installed runtime mutation',outputs,origin};
}
