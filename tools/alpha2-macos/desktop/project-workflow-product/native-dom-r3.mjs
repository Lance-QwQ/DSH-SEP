// Test only: semantic DOM actions in the exact owned renderer, synthetic text.
// No dialog shim, approval token, HTTP management call or private main API.
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {setTimeout as pause} from 'node:timers/promises';
import {observeOnboarding} from '../../settings-ui/desktop-onboarding.mjs';
import {observeReady} from './native-readiness.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),fail=code=>{throw Object.assign(Error(code),{code});};
export async function probeCurrentProject({client,windowId,input,preparation,signal}){
 assert(Number.isSafeInteger(windowId)&&windowId>0);assert([1,2].includes(input.round));
 const profile=join(input.dataRoot,'business/PROFILE.json'),beforeProfile=sha(await readFile(profile)),source=join(input.dataRoot,'project/a.txt');
 if(input.round===2)assert.equal(beforeProfile,preparation.profileSha256);
 async function page(expression){
  const code=`(()=>{if(location.protocol!=='dsh-app:'||location.host!=='app')throw Error('SEP_PROJECT_NATIVE_DOCUMENT');const E=e=>!!e&&!e.disabled&&e.getClientRects().length>0&&!e.closest('[hidden],[inert]')&&e.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true})!==false;return ${expression};})()`,nonce=randomUUID();
  await client.eval(`__sepFullProbe.projectDom={nonce:${JSON.stringify(nonce)},status:'pending'};void(async()=>{const w=__sepFullProbe.electron.BrowserWindow.fromId(${windowId});if(!w||w.isDestroyed()||!w.isVisible())throw Error('window changed');return w.webContents.executeJavaScript(${JSON.stringify(code)},false);})().then(value=>{__sepFullProbe.projectDom={nonce:${JSON.stringify(nonce)},status:'pass',value};},()=>{__sepFullProbe.projectDom={nonce:${JSON.stringify(nonce)},status:'fail'};});true`);
  const deadline=Date.now()+10000;while(Date.now()<deadline){const r=await client.eval('__sepFullProbe.projectDom');if(r?.nonce!==nonce)fail('SEP_PROJECT_NATIVE_NONCE');if(r.status==='pass')return r.value;if(r.status==='fail')fail('SEP_PROJECT_NATIVE_RENDERER');await pause(50);}fail('SEP_PROJECT_NATIVE_RENDERER_DEADLINE');
 }
 const modal='document.querySelector(\'[role="dialog"][data-shortcut-modal="settings"]\')',panel='document.querySelector(\'[data-sep-current-project="panel"]\')',review='document.querySelector(\'[data-sep-current-project="review"]\')';
 let observationSequence=0;
 async function wait(expression,code){const samples=[];try{return await observeReady({read:()=>page(expression),deadlineCode:code,timeoutMs:20000,intervalMs:100,signal,onSample:r=>{samples.push(r);if(samples.length>128)samples.splice(1,1);}});}finally{await writeFile(join(input.outputRoot,'DOM-READINESS-'+(++observationSequence)+'.json'),JSON.stringify({schema:1,condition:code,windowId,attempts:samples.at(-1)?.attempt??0,first:samples[0],last:samples.at(-1),samples},null,2)+'\n',{flag:'wx',mode:0o600});}}
 const actions=[];const onboardingDeadline=Date.now()+10000;while(Date.now()<onboardingDeadline){const r=await page('('+observeOnboarding.toString()+')(false)');if(['none','settings'].includes(r.kind))break;if(!['sign-in','api-key'].includes(r.kind)||actions.length>=2)fail('SEP_PROJECT_NATIVE_ONBOARDING');const action=await page('('+observeOnboarding.toString()+')(true)');if(action.action)actions.push(action.action);await pause(150);}
 const opened=await wait(`(()=>{if(E(${modal}))return 'open';const b=[...document.querySelectorAll('button')].filter(E),direct=b.find(e=>['Settings','设置'].includes(e.getAttribute('aria-label')));if(direct){direct.click();return 'opening';}const account=b.find(e=>['Account menu','账号菜单'].includes(e.getAttribute('aria-label')));if(account){if(account.getAttribute('aria-expanded')!=='true')account.click();return 'account';}return false;})()`,'SEP_PROJECT_NATIVE_SETTINGS_TRIGGER');
 if(opened==='account')await wait(`(()=>{if(E(${modal}))return true;const item=[...document.querySelectorAll('[role="menuitem"]')].find(e=>E(e)&&['Settings','设置'].some(s=>e.textContent.trim().startsWith(s)));if(!item)return false;item.click();return true;})()`,'SEP_PROJECT_NATIVE_SETTINGS_MENU');
 await wait(`E(${modal})`,'SEP_PROJECT_NATIVE_SETTINGS_DIALOG');
 await wait(`(()=>{const d=${modal},b=d&&[...d.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='当前项目 · 工作副本');if(!E(b))return false;b.click();return true;})()`,'SEP_PROJECT_NATIVE_PLUGIN_NAV');
 await wait(`(()=>{const p=${panel};return E(p)&&p.querySelector('h2')?.textContent==='当前项目 · 工作副本'&&!p.querySelector('[role="alert"]')&&[...p.querySelectorAll('button')].some(e=>e.textContent==='刷新'&&E(e));})()`,'SEP_PROJECT_NATIVE_PANEL');
 await wait(`(()=>{const a=window.sepCurrentProject;return !!a&&Object.keys(a).sort().join(',')==='begin,call,commit,presented'&&Object.values(a).every(v=>typeof v==='function');})()`,'SEP_PROJECT_NATIVE_PRELOAD');
 const api=await page(`(async()=>{const a=window.sepCurrentProject;if(!a||Object.keys(a).sort().join(',')!=='begin,call,commit,presented')return null;let rejected=false;try{await a.call('confirmCommit',{});}catch{rejected=true;}return{keys:Object.keys(a).sort(),rejected,status:await a.call('status',{}),plans:await a.call('plans',{}),history:await a.call('generations',{after:0,limit:16})};})()`);
 assert(api?.rejected);assert.equal(api.status.current.generation,input.round===1?1:2);assert.equal(api.plans.length,input.round===1?0:1);
 const result={status:'pass',round:input.round,preloadBound:true,panelMounted:true,onboardingActions:actions,publicManagementRejected:true,dialog:{status:'not_run',reason:'Actual native selection requires independently available AX authority; showMessageBox is not replaced.'}};
 async function click(label){await wait(`(()=>{const p=${panel},b=p&&[...p.querySelectorAll('button')].filter(e=>E(e)&&e.textContent.trim()===${JSON.stringify(label)});return b?.length===1;})()`,'SEP_PROJECT_NATIVE_ACTION_UNAVAILABLE');assert.equal(await page(`(()=>{const b=[...${panel}.querySelectorAll('button')].filter(e=>E(e)&&e.textContent.trim()===${JSON.stringify(label)});if(b.length!==1)return false;b[0].click();return true;})()`),true);}
 async function noPlans(){await wait(`(async()=>{const p=${panel};if(!E(p)||p.querySelector('[role="alert"]'))return false;return (await window.sepCurrentProject.call('plans',{})).length===0&&p.textContent.includes('没有待审阅的候选');})()`,'SEP_PROJECT_NATIVE_DISCARD');}
 async function preview(expected){await click('选择并预览');const proof=await wait(`(()=>{const r=${review},b=r&&[...r.querySelectorAll('button')].find(e=>e.textContent.trim()==='确认提交…');if(!E(r)||!E(b))return false;return{id:r.dataset.reviewId,sha256:r.dataset.reviewSha256,text:[...r.querySelectorAll('pre')].map(e=>e.textContent).join('\n')};})()`,'SEP_PROJECT_NATIVE_REVIEW');assert(/^[a-f0-9]{64}$/.test(proof.sha256));assert(proof.text.includes(expected));return{id:proof.id,sha256:proof.sha256,diffTextSha256:sha(proof.text)};}
 if(input.round===1)result.emptyBaseline=true;
 else{
  assert.equal(api.plans[0].planHash,preparation.planHash);result.review=await preview('candidate fixture');result.reviewPresented=true;await click('取消预览');await wait(`!${review}`,'SEP_PROJECT_NATIVE_CANCEL');
  const afterCancel=await page(`(async()=>({status:await window.sepCurrentProject.call('status',{}),plans:await window.sepCurrentProject.call('plans',{})}))()`);assert.equal(afterCancel.status.current.generation,2);assert.equal(afterCancel.plans.length,1);assert.equal(afterCancel.plans[0].planHash,preparation.planHash);result.cancelPreserved=true;
  await click('丢弃此候选');await noPlans();result.discardConfirmed=true;
  await click('创建恢复候选');await wait(`(async()=>{const p=${panel};return E(p)&&(await window.sepCurrentProject.call('plans',{})).length===1&&[...p.querySelectorAll('button')].some(e=>E(e)&&e.textContent==='选择并预览');})()`,'SEP_PROJECT_NATIVE_RESTORE');result.restoreReview=await preview('original');result.restoreCandidate=true;
  await click('取消预览');await wait(`!${review}`,'SEP_PROJECT_NATIVE_CANCEL');await click('丢弃此候选');await noPlans();
 }
 assert.equal(sha(await readFile(source)),preparation.sourceSha256);assert.equal(sha(await readFile(profile)),beforeProfile);result.sourceUnchanged=true;result.profileUnchanged=true;
 if(input.round===2){assert.equal(sha(await readFile(join(input.dataRoot,'business/home/profiles/desktop/cordis.patch.yml'))),preparation.overlayMigration.newSha256);result.overlayMigrated=true;}
 // Closing Settings unmounts its panel; Electron navigation/destruction remains
 // the authority-revocation boundary implemented in the frozen bridge.
 await wait(`(()=>{const d=${modal};return !!d&&[...d.querySelectorAll('button')].some(e=>E(e)&&['Close','关闭'].includes(e.textContent.trim()));})()`,'SEP_PROJECT_NATIVE_CLOSE_READY');
 assert.equal(await page(`(()=>{const d=${modal},b=d&&[...d.querySelectorAll('button')].find(e=>E(e)&&['Close','关闭'].includes(e.textContent.trim()));if(!b)return false;b.click();return true;})()`),true);await wait(`!${modal}`,'SEP_PROJECT_NATIVE_SETTINGS_CLOSE');
 await writeFile(join(input.outputRoot,'PROJECT-DOM.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});return result;
}
