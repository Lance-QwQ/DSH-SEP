import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setup,close,load,require,root} from './native-browser-fixture.mjs';
const P=resolve(process.env.SEP_PHASE_ROOT),UI='@deepseek-ai/dsh-client-ui-settings-memory';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const bounded=(p,ms=7000)=>{let timer;return Promise.race([p,new Promise((_,j)=>{timer=setTimeout(()=>j(Error('owned fixture deadline')),ms);})]).finally(()=>clearTimeout(timer));};
async function carrier(){
 const f=await setup({mountRoot:false});
 try{
  const profile=join(f.base,'native-profile');await mkdir(profile);await writeFile(join(profile,'package.json'),JSON.stringify({name:'sep-native-test-profile',version:'1.0.0',dsh:{profile:{bundles:[]}}}));await writeFile(join(profile,'cordis.patch.yml'),'[]\n');
  f.ctx.provide('profileContext',{name:'sep-native-test',dir:profile,patchPath:join(profile,'cordis.patch.yml'),installAnchor:resolve(process.env.SEP_OFFICIAL_HARNESS),cwd:f.dirs.project,home:f.base,startedBundles:[],overlays:[]});
  for(const name of ['config-editor','settings'])await f.ctx.plugin((await load('@deepseek-ai/dsh-'+name)).default);
  for(const name of ['typert-registry','api-gateway','api-remotes','api-settings-controller','client-ui-renderer','client-ui-settings','client-locale','client-shortcuts','client-ui-settings-general']){
   await f.ctx.loader.create({id:'browser-'+name,name:pathToFileURL(require.resolve('@deepseek-ai/dsh-'+name)).href});
  }
  await f.ctx.loader.create({id:'test-root',name:pathToFileURL(join(import.meta.dirname,'fixtures/native-browser-carrier/index.js')).href});await f.ctx.loader.await();
  for(const entry of f.ctx.loader.entries())assert.equal(entry.fiber?.state,2,'host entry not active '+entry.options.id);
  for(const name of ['kernel.js','kernel.css']){const body=await readFile(join(P,'assets',name));f.ctx.effect(()=>f.ctx.webServer.register({kind:'exact',path:'/'+name,handler(req,res){if(!f.connection.authorizeIndex(req,res))return;res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(body);}}));}
  f.indexHtml=()=>f.ctx.webServer.renderIndex('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/kernel.css"><title>SEP native browser validation</title><style>body{font:14px sans-serif;margin:24px;background:#fff;color:#222}button,input,select{font:inherit}</style></head><body><div id="root"></div><script type="module" src="/kernel.js"></script></body></html>');
  await f.mount();assert(f.ctx.clientModules.graph().entries.some(e=>e.id==='sep-native-browser-test-carrier'),'test carrier must be discovered by official registry');return f;
 }catch(e){await close(f);throw e;}
}
async function browser(directory){
 const profile=join(directory,'edge-profile'),child=spawn(process.env.SEP_TEST_EDGE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--disable-component-update','--disable-extensions','--lang=zh-CN','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
 let stderr='';child.stderr.on('data',b=>{stderr=(stderr+b).slice(-4000)});const exited=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})));let ws,normal=false;
 const cleanup=async()=>{try{if(!normal){child.kill();await bounded(exited);await writeFile(join(directory,'CLEANUP-EXCEPTION.json'),JSON.stringify({forcedProcessStop:true,stderr})+'\n');}}finally{ws?.close()}};
 try{
  let port;for(let n=0;n<100;n++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break}catch{}await sleep(100)}assert(port,'owned browser did not start');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await bounded(new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})}));
  let seq=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)});ws.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('owned browser closed'))}pending.clear()});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP deadline '+method))},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
  const evaluate=async expression=>{const x=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(x.exceptionDetails)throw Error(x.exceptionDetails.exception?.description??x.exceptionDetails.text);return x.result.value};
  const wait=async expression=>{for(let n=0;n<200;n++){if(await evaluate(`Boolean(${expression})`))return;await sleep(50)}await writeFile(join(directory,'UI-FAILURE.json'),JSON.stringify(await evaluate(`({text:document.body.innerText,errors:window.frontendErrors,bootFailure:window.bootFailure})`),null,2));throw Error('UI deadline: '+expression)};
  const click=async expression=>{const p=await evaluate(`(()=>{const e=${expression};if(!e||e.disabled)throw Error('UI control unavailable');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p})};
  const screenshot=async name=>writeFile(join(directory,name+'.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'));
  return {child,cdp,evaluate,wait,click,screenshot,cleanup,async finish(){await cdp('Browser.close').catch(e=>{if(e.message!=='owned browser closed')throw e});await bounded(exited);normal=true;ws.close()}};
 }catch(e){await cleanup();throw e}
}
const button=text=>`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
test('official browser boot automatically activates SEP inside native SettingsRoot and preserves governed edits across reload, reconnect and removal',{timeout:75000},async()=>{
 const directory=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'native-browser-'));let f,b;const checks=[];
 try{
  f=await carrier();b=await browser(directory);await b.cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  assert.equal((await fetch(f.origin+'/')).status,401);checks.push('real BrowserAuth rejects an unauthenticated index');
  await b.cdp('Page.navigate',{url:f.connection.authenticatedUrl(f.origin+'/')});await b.wait('window.bootSettled');assert.equal(await b.evaluate('window.bootFailure??null'),null);
  const roster=await b.evaluate(`([...entry.ctx.loader.entries()].map(e=>({name:e.options.name,state:e.fiber?.state})))`);assert(roster.some(e=>e.name===UI&&e.state===2));assert(roster.every(e=>e.state===2));checks.push('AppWebEntry + actual script transport + ModuleSystem + Loader automatically activate the host-provided client graph');
  await b.wait(`document.querySelector('button[aria-label="设置"]')`);await b.click(`document.querySelector('button[aria-label="设置"]')`);await b.wait(`document.querySelector('[role="dialog"]')`);
  assert.equal(await b.evaluate(`document.querySelector('[role="dialog"]').getAttribute('aria-modal')`),'true');
  const tabs=await b.evaluate(`[...document.querySelectorAll('nav button')].map(b=>b.textContent.trim())`);assert(tabs.includes('通用设置'));assert(tabs.some(t=>t.includes('记忆')));assert(tabs.includes('会话预算'));assert(tabs.some(t=>t.includes('适配')));checks.push('official native SettingsRoot opens and lists General plus all three SEP sections');
  await b.screenshot('native-general');
  const memory=tabs.find(t=>t.includes('记忆')),budget='会话预算',assessment=tabs.find(t=>t.includes('适配'));
  await b.click(button(memory));const recall=`document.querySelector('input[aria-label="自动引用已有记忆"]')`;await b.wait(`${recall} && !${recall}.disabled`);await b.click(recall);await b.wait(`${recall} && !${recall}.disabled && !${recall}.checked`);
  const projects=await f.ctx.suiteEnhancements.memorySettings.list();assert.equal((await f.ctx.suiteEnhancements.memorySettings.get({projectId:projects.projects[0].id})).effective.recall,false);checks.push('native memory checkbox persists recall off through authenticated Connection and governed storage');
  await b.click(button(budget));const amount=`document.querySelector('[name="defaultLimit"]')`;await b.wait(`${amount}?.value==='100'`);await b.evaluate(`${amount}.focus();${amount}.select()`);await b.cdp('Input.insertText',{text:'25'});await b.wait(`!(${button('保存默认上限')}).disabled`);await b.click(button('保存默认上限'));await b.wait(`${amount}?.value==='25' && !${amount}.disabled`);assert.equal((await f.ctx.suiteEnhancements.budgetSettings.list()).defaults.limitCny,25);await b.screenshot('native-budget');checks.push('native budget number entry saves 25 while preserving initial spent 1');
  await b.click(button(assessment));await b.wait(`document.body.innerText.includes('token')||document.body.innerText.includes('Token')`);checks.push('assessment section is navigable and includes the token-use notice');
  await b.cdp('Page.reload');await b.wait('window.bootSettled && !window.bootFailure');await b.click(`document.querySelector('button[aria-label="设置"]')`);await b.click(button(budget));await b.wait(`${amount}?.value==='25'`);await b.click(button(memory));await b.wait(`${recall} && !${recall}.disabled && !${recall}.checked`);checks.push('full browser reload rediscovers the same native plugin and reads saved settings');
  const generation=await b.evaluate('entry.ctx.connection.generation.getSnapshot()?.id');assert.equal(typeof generation,'number');await b.evaluate('entry.ctx.connection.reconnect()');await b.wait(`entry.ctx.connection.state.getSnapshot()==='connected' && entry.ctx.connection.generation.getSnapshot()?.id>${generation}`);await b.wait(`${recall} && !${recall}.disabled`);assert.equal(await b.evaluate(`${recall}.checked`),false);checks.push('official Connection reconnect advances its generation, retains saved settings and returns connected');
  const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.initialSpent,1);assert.deepEqual(ledger.entries,[]);assert.equal(f.requests.length,0);assert.deepEqual(await b.evaluate('frontendErrors'),[]);
  assert.equal((await f.api.close()).status,'pass');const graph=f.ctx.clientModules.graph();assert(!graph.entries.some(row=>row.id===UI));await b.evaluate(`entry.modules.entries.sync(${JSON.stringify(graph)})`);await b.wait(`![...document.querySelectorAll('nav button')].some(b=>b.textContent.includes('记忆'))`);assert(await b.evaluate(`${button('通用设置')}!==undefined`));checks.push('official graph reconciliation removes SEP client and native navigation while preserving General');
  assert.equal((await b.evaluate(`fetch('/api/sep-budget/list',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'removed',method:'sep-budget/list',payload:{}})}).then(r=>r.status)`)),404);
  await b.evaluate('entry.dispose()');await b.wait(`document.getElementById('root').children.length===0`);await b.finish();await close(f);await assert.rejects(access(join(f.dirs.memory,'.suite-memory/p2/owner.lock')),e=>e.code==='ENOENT');f=undefined;
  await writeFile(join(directory,'RESULT.json'),JSON.stringify({status:'pass',checks,generationBeforeReconnect:generation,modelRequests:0,forcedProcessStop:false,resourcePath:'browser AppWebEntry.dispose, Browser.close, controlled root.close and host fiber.dispose; scoped cleanup only',scope:'real official browser kernel/ModuleSystem/Loader/SettingsRoot/locale/shortcuts/config forms/Remote/Gateway/BrowserAuth; test-owned outer root/sidebar.settings seat and empty sessions snapshot; not full DSH application GUI'},null,2)+'\n');
 }catch(e){if(b)await writeFile(join(directory,'FAILURE.json'),JSON.stringify(await b.evaluate(`({text:document.body.innerText,errors:window.frontendErrors,bootFailure:window.bootFailure,stack:window.bootFailureStack})`).catch(()=>({diagnosticUnavailable:true})),null,2));throw e;
 }finally{try{await b?.cleanup()}finally{if(f)await close(f)}}
});
test('an unavailable official bootstrap bundle produces an explicit browser boot failure without opening settings or changing governed state',{timeout:40000},async()=>{
 const directory=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'native-browser-negative-'));let f,b;
 try{
  f=await carrier();b=await browser(directory);await b.cdp('Network.enable');await b.cdp('Network.setBlockedURLs',{urls:['*plugins/*']});await b.cdp('Page.navigate',{url:f.connection.authenticatedUrl(f.origin+'/')});await b.wait('window.bootSettled');
  const failure=await b.evaluate('window.bootFailure');assert.match(failure,/HTML did not preload.*dsh-client-modules/);assert.equal(await b.evaluate(`Boolean(document.querySelector('[role="dialog"]'))`),false);assert.equal(await b.evaluate(`Boolean(entry.ctx)`),false);
  const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.initialSpent,1);assert.equal(ledger.sessionDefault.limitCny,100);assert.deepEqual(ledger.entries,[]);assert.equal(f.requests.length,0);assert.equal(f.api.status().phase,'active');
  await b.screenshot('bootstrap-unavailable');await b.evaluate('entry.dispose()');await b.finish();assert.equal((await f.api.close()).status,'pass');await close(f);await assert.rejects(access(join(f.dirs.memory,'.suite-memory/p2/owner.lock')),e=>e.code==='ENOENT');f=undefined;
  await writeFile(join(directory,'RESULT.json'),JSON.stringify({status:'pass',expectedFailure:failure,modelRequests:0,ledgerUnchanged:true,forcedProcessStop:false,resourcePath:'expected boot failure followed by AppWebEntry.dispose, Browser.close, controlled close and host dispose; no late recovery required',scope:'CDP blocks only the owned browser plugin script URLs; no official host or daily network configuration changed'},null,2)+'\n');
 }catch(e){if(b)await writeFile(join(directory,'FAILURE.json'),JSON.stringify(await b.evaluate(`({text:document.body.innerText,errors:window.frontendErrors,bootFailure:window.bootFailure,stack:window.bootFailureStack})`).catch(()=>({diagnosticUnavailable:true})),null,2));throw e;
 }finally{try{await b?.cleanup()}finally{if(f)await close(f)}}
});
