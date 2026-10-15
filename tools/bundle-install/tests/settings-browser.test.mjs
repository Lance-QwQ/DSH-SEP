import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {setup,close,agent,require,root} from './controlled-fixture.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const html=`<!doctype html><meta charset="utf-8"><title>SEP controlled settings fixture</title><style>body{font:14px sans-serif;margin:24px;color:#222;background:#fff}#app{max-width:760px;display:flex;flex-direction:column;gap:32px}input,select,button{font:inherit}small{display:block}</style><div id="app"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script src="/jsx.js"></script><script>
window.frontendErrors=[];window.addEventListener('error',e=>frontendErrors.push(e.message));window.addEventListener('unhandledrejection',e=>frontendErrors.push(String(e.reason)));
window.__ModuleLoader__={load(value){window.settingsFactory=value.factory;}};
</script><script src="/settings.js"></script><script>
const dictionaries=new Map(),sections=new Map(),disposers=[];
const locale={register(ns,values){dictionaries.set(ns,values);return()=>dictionaries.delete(ns);},bind(ns){return key=>dictionaries.get(ns).zh[key]??key;}};
const slots={inject(_name,fn){disposers.push(fn());},register(options,Component){sections.set(options.id,{options,Component});return()=>sections.delete(options.id);}};
const connection={generation:selector=>selector(1),rpc:{async call(channel,method,payload,signal){const response=await fetch(channel+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload}),signal});if(!response.ok)throw Error('transport-'+response.status);return (await response.json()).result;}}};
const ctx={locale,slots,get:name=>name==='connection'?connection:undefined,effect:fn=>{disposers.push(fn());}};
const frontend=settingsFactory(name=>{if(name==='react')return React;if(name==='react/jsx-runtime')return jsxRuntime;throw Error('undeclared frontend import '+name);});frontend.apply(ctx,{enabled:true,requestTimeoutMs:5000});
const app=ReactDOM.createRoot(document.getElementById('app'));
app.render(React.createElement(React.Fragment,null,...['sep-memory','sep-budget','sep-assessment'].map(id=>{const {options,Component}=sections.get(id),injected=options.inject();return React.createElement('div',{'data-section':id,key:id},React.createElement(Component,{...injected,t:locale.bind(options.locale),useConnection:injected.hooks.connection}));})));
window.unmountSettings=()=>{app.unmount();for(const dispose of disposers.reverse())dispose?.();};window.settingsReady=true;
</script>`;
test('real headless browser renders unchanged settings factory and persists memory and budget through native routes',async()=>{
 const f=await setup(),a=await agent(f);let server,child,ws,browserExited,cdp,forced=false;const checks=[];
 const directory=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'browser-'));let childOutput='';
 try{
  const react=dirname(require.resolve('react/package.json')),dom=dirname(require.resolve('react-dom/package.json'));
  const assets=new Map([['/react.js',await readFile(join(react,'umd/react.development.js'))],['/react-dom.js',await readFile(join(dom,'umd/react-dom.development.js'))],['/settings.js',await readFile(join(root,'bundle/modules/ui-settings-memory/lib/client.js'))],['/jsx.js',Buffer.from(`window.jsxRuntime=(()=>{const module={exports:{}},exports=module.exports,process={env:{NODE_ENV:'development'}},require=name=>{if(name==='react')return React;throw Error(name);};\n${await readFile(join(react,'cjs/react-jsx-runtime.development.js'),'utf8')}\nreturn module.exports;})();`)]]);
  const route=f.connection.createSharedFetchHandler('/api');
  server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}if(assets.has(req.url)){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(assets.get(req.url));return;}if(req.url.startsWith('/api/')){const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>20000){res.writeHead(413);res.end();return;}chunks.push(part);}const response=await route.fetch(new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}res.writeHead(404);res.end();}catch{res.writeHead(500);res.end('fixture transport error');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const profile=join(directory,'edge-profile');child=spawn(process.env.SEP_TEST_EDGE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--disable-component-update','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
  child.stderr.on('data',data=>{childOutput=(childOutput+data).slice(-4000);});browserExited=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})));
  let port;for(let i=0;i<100;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}await sleep(100);}assert(port,'owned headless browser did not start');
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let seq=0;const pending=new Map();ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(!message.id)return;const p=pending.get(message.id);if(!p)return;pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(Error(message.error.message)):p.resolve(message.result);});ws.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('owned browser closed'));}pending.clear();});
  cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP deadline '+method));},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text+': '+result.exceptionDetails.exception?.description);return result.result.value;};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(50);}throw Error('UI condition not reached: '+expression);};
  const click=async expression=>{const point=await evaluate(`(()=>{const element=${expression};if(!element||element.disabled)throw Error('missing or disabled UI control');element.scrollIntoView({block:'center'});const rect=element.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()`);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});};
  await cdp('Emulation.setDeviceMetricsOverride',{width:1100,height:1200,deviceScaleFactor:1,mobile:false});await cdp('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  await wait(`window.settingsReady && document.querySelector('[name="defaultLimit"]')?.value==='100' && document.querySelectorAll('[data-section="sep-memory"] input').length===3`);
  assert.equal(await evaluate(`document.body.innerText.includes('受宿主配置限制')`),true);checks.push('real factory registers three sections; memory capture explicitly capped; default100 and budget distinctions render');
  await writeFile(join(directory,'initial.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'));
  const recall=`document.querySelector('[data-section="sep-memory"] input[aria-label="自动引用已有记忆"]')`;await click(recall);await wait(`!${recall}.disabled && !${recall}.checked`);
  const s=f.ctx.suiteEnhancements.memorySettings,id=(await s.list()).projects[0].id;assert.equal((await s.get({projectId:id})).effective.recall,false);checks.push('actual checkbox click saves recall off through native Connection and governed storage');
  const input=`document.querySelector('[name="defaultLimit"]')`;await evaluate(`${input}.focus();${input}.select()`);await cdp('Input.insertText',{text:'25'});const button=`[...document.querySelectorAll('[data-section="sep-budget"] button')].find(b=>b.textContent==='保存默认上限')`;await wait(`!(${button}).disabled`);await click(button);await wait(`${input}?.value==='25' && !${input}.disabled`);assert.equal((await f.ctx.suiteEnhancements.budgetSettings.list()).defaults.limitCny,25);checks.push('actual number input and save click persist default limit25 without resetting spend');
  const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.initialSpent,1);assert.deepEqual(ledger.entries,[]);assert.equal(f.requests.length,0);
  await cdp('Page.reload');await wait(`document.querySelector('[name="defaultLimit"]')?.value==='25' && ${recall} && !${recall}.checked && !${recall}.disabled`);checks.push('browser reload reads saved settings; no model requests, no ledger reset');
  assert.deepEqual(await evaluate('frontendErrors'),[]);await writeFile(join(directory,'saved.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'));
  await evaluate('unmountSettings()');assert.equal(await evaluate(`document.getElementById('app').children.length`),0);assert.equal((await f.api.close()).status,'pass');checks.push('React unmount and controlled host close complete');
  await cdp('Browser.close').catch(error=>{if(error.message!=='owned browser closed')throw error;});await Promise.race([browserExited,sleep(5000).then(()=>{throw Error('owned browser exit deadline');})]);child=undefined;
  await writeFile(join(directory,'RESULT.json'),JSON.stringify({status:'pass',checks,forcedProcessStop:false,scope:'unchanged frontend factory plus React18 in owned headless Edge; slot/locale/Connection-rpc fixture seams; native backend routes actual; not full DSH GUI or BrowserAuth certification'},null,2)+'\n');
 }finally{
  if(child){forced=true;child.kill();await browserExited;}ws?.close();if(server)await new Promise(r=>server.close(r));await close(f);if(forced)await writeFile(join(directory,'CLEANUP-EXCEPTION.json'),JSON.stringify({forcedProcessStop:true,childOutput})+'\n');
 }
});
