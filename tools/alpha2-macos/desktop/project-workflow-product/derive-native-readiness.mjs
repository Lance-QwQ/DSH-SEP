// Test-only exact successor. Runtime, renderer, permissions and actions unchanged.
import {createHash} from 'node:crypto';const hash=s=>createHash('sha256').update(s).digest('hex');
const pins={worker:'70969e9da84f5cc3ba674de698124b649adf103d6a5361f4c7a16e6b765c39c8',operator:'a3c6a90e7869125c36d3db1518b292911bcff5aa2eda320c820ec9191800e8bf',dom:'e20c8daf52ce79db06c4071f06caaf68af99ebb08cf738cf7e10604645734c72'};
const fail=()=>{throw Object.assign(Error('SEP_PROJECT_NATIVE_READINESS_ORIGIN'),{code:'SEP_PROJECT_NATIVE_READINESS_ORIGIN'});};
export function deriveNativeReadiness(source){
 const outputs={},origin={};for(const name of Object.keys(pins)){
  if(typeof source[name]!=='string'||hash(source[name])!==pins[name])fail();let text=source[name];const changes=[];
  const once=(before,after)=>{if(text.split(before).length!==2)fail();text=text.replace(before,after);changes.push({before,after});};
  if(name==='worker'){
   once("from './native-dom.mjs'","from './native-dom-r3.mjs'");
   once("import {fixtureResourcesUnknown} from './native-contract.mjs';","import {fixtureResourcesUnknown} from './native-contract.mjs';\nimport {observeReady} from './native-readiness.mjs';");
   once("result.badge=await renderer(workspace.id,'('+measureBrand.toString()+')()');","const brandSamples=[];try{result.badge=await observeReady({read:async()=>{if(control.status().blocked)throw error('SEP_WORKSPACE_CONTROL_BLOCKED');return renderer(workspace.id,'('+measureBrand.toString()+')()');},pendingCode:'SEP_WORKSPACE_BRAND_UNAVAILABLE',deadlineCode:'SEP_WORKSPACE_BRAND_DEADLINE',timeoutMs:20000,signal:abort.signal,onSample:r=>{brandSamples.push(r);if(brandSamples.length>128)brandSamples.splice(1,1);}});}finally{await save('BRAND-READINESS.json',{schema:1,windowId:workspace.id,attempts:brandSamples.at(-1)?.attempt??0,first:brandSamples[0],last:brandSamples.at(-1),samples:brandSamples});}");
   once('probeCurrentProject({client,windowId:workspace.id,input,preparation:result.preparation})','probeCurrentProject({client,windowId:workspace.id,input,preparation:result.preparation,signal:abort.signal})');
   once('}catch(e){preparationUnknown=fixtureResourcesUnknown(e);',"}catch(e){result.failureStage=result.stage;preparationUnknown=fixtureResourcesUnknown(e);");
  }else if(name==='dom'){
   once("import {observeOnboarding} from '../../settings-ui/desktop-onboarding.mjs';","import {observeOnboarding} from '../../settings-ui/desktop-onboarding.mjs';\nimport {observeReady} from './native-readiness.mjs';");
   once('probeCurrentProject({client,windowId,input,preparation})','probeCurrentProject({client,windowId,input,preparation,signal})');
   once(" async function wait(expression,code){const deadline=Date.now()+20000;while(Date.now()<deadline){const v=await page(expression);if(v)return v;await pause(100);}fail(code);}"," let observationSequence=0;\n async function wait(expression,code){const samples=[];try{return await observeReady({read:()=>page(expression),deadlineCode:code,timeoutMs:20000,intervalMs:100,signal,onSample:r=>{samples.push(r);if(samples.length>128)samples.splice(1,1);}});}finally{await writeFile(join(input.outputRoot,'DOM-READINESS-'+(++observationSequence)+'.json'),JSON.stringify({schema:1,condition:code,windowId,attempts:samples.at(-1)?.attempt??0,first:samples[0],last:samples.at(-1),samples},null,2)+'\\n',{flag:'wx',mode:0o600});}}");
   once(' const api=await page('," await wait(`(()=>{const a=window.sepCurrentProject;return !!a&&Object.keys(a).sort().join(',')==='begin,call,commit,presented'&&Object.values(a).every(v=>typeof v==='function');})()`,'SEP_PROJECT_NATIVE_PRELOAD');\n const api=await page(");
   once(" assert.equal(await page(`(()=>{const d=${modal},b=d&&[...d.querySelectorAll('button')].find(e=>E(e)&&['Close','关闭'].includes(e.textContent.trim()));if(!b)return false;b.click();return true;})()`),true);", " await wait(`(()=>{const d=${modal};return !!d&&[...d.querySelectorAll('button')].some(e=>E(e)&&['Close','关闭'].includes(e.textContent.trim()));})()`,'SEP_PROJECT_NATIVE_CLOSE_READY');\n assert.equal(await page(`(()=>{const d=${modal},b=d&&[...d.querySelectorAll('button')].find(e=>E(e)&&['Close','关闭'].includes(e.textContent.trim()));if(!b)return false;b.click();return true;})()`),true);");
  }else{
   once("['native-operator-r2.mjs','native-worker-r2.mjs'","['native-operator-r3.mjs','native-worker-r3.mjs','native-readiness.mjs','derive-native-readiness.mjs','NATIVE-READINESS-ORIGIN.json'");
   once("'native-dom.mjs'","'native-dom-r3.mjs'");
   once("new URL('./native-worker-r2.mjs',import.meta.url)","new URL('./native-worker-r3.mjs',import.meta.url)");
  }
  outputs[name]=text;origin[name]={sourceSha256:pins[name],resultSha256:hash(text),changes};
 }
 return {schema:1,scope:'test-only bounded observable readiness; original final assertions and single actions retained',outputs,origin};
}
