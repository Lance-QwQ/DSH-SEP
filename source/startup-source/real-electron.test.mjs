import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,writeFile,mkdir,realpath,access} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {inspectWindowsProcess} from './ownership/owner-file.mjs';
const work=await realpath(fileURLToPath(new URL('.',import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
if(!process.env.SEP_TEST_INSTALL_ROOT)throw Error('SEP_TEST_INSTALL_ROOT_REQUIRED');
const root=await realpath(resolve(process.env.SEP_TEST_INSTALL_ROOT)),rel=relative(work,root);assert.ok(/^installed-[^\\/]+$/.test(rel)&&!isAbsolute(rel));
let name='deployment.json';try{await access(join(root,name));}catch{name='deployment-rc2.json';}
const config=JSON.parse(await readFile(join(root,name),'utf8'));
for(const field of ['dailyRoot','releaseRoot','electronUserData','controlRoot','credentialsPath']){const r=relative(root,config[field]);assert.ok(!r.startsWith('..')&&!isAbsolute(r));}
assert.match(await readFile(config.credentialsPath,'utf8'),/^DEEPSEEK_API_KEY=\s*$/m);
const evidence=join(work,'real-electron-evidence',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());await mkdir(evidence,{recursive:true});
const launcher=await import(pathToFileURL(join(root,'managed/launcher.mjs'))),coordinator=await import(pathToFileURL(join(root,'managed/startup-coordinator.mjs')));
async function unusedPort(){const server=createServer();await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});const p=server.address().port;await new Promise(yes=>server.close(yes));return p;}
async function wait(fn,timeout=60000){const until=Date.now()+timeout;let last;while(Date.now()<until){try{const v=await fn();if(v)return v;}catch(e){last=e;}await delay(100);}throw Error('ELECTRON_TEST_TIMEOUT '+(last?.code??last?.message??''));}
async function cdp(url){
 const ws=new WebSocket(url),pending=new Map();let next=0;
 await new Promise((yes,no)=>{ws.addEventListener('open',yes,{once:true});ws.addEventListener('error',no,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);const call=pending.get(m.id);if(!call)return;pending.delete(m.id);clearTimeout(call.timer);m.error?call.no(Error(m.error.message)):call.yes(m.result);});
 ws.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.no(Error('CDP_CLOSED'));}pending.clear();});
 return {call(method,params={}){const id=++next;return new Promise((yes,no)=>{const timer=setTimeout(()=>{pending.delete(id);no(Error('CDP_TIMEOUT'));},5000);pending.set(id,{yes,no,timer});ws.send(JSON.stringify({id,method,params}));});},close(){ws.close();}};
}
test('actual isolated Electron entry renders and reuses the same center on second launch',{timeout:180000},async()=>{
 let runtime,primary,secondary,page,browser,status='fail',failure;const cleanup=[];let before,dom;
 const children=[];
 async function launch(label,port){
  const exe=join(config.releaseRoot,'node_modules/electron/dist/electron.exe'),app=join(config.releaseRoot,'node_modules/@deepseek-ai/dsh-desktop');
  const args=[app,'--user-data-dir='+config.electronUserData,'--sep-recovery-connection='+join(dirname(config.controlRoot),'recovery-connection.json'),...(port?['--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port]:[])];
  const child=spawn(exe,args,{cwd:root,env:launcher.buildEnvironment(config,process.env),windowsHide:true,stdio:['ignore','pipe','pipe']});const held={label,child,log:'',exit:null,identity:null};children.push(held);
  child.stdout.on('data',b=>held.log+=b);child.stderr.on('data',b=>held.log+=b);child.on('error',e=>{held.error=e;});child.once('exit',(code,signal)=>{held.exit={code,signal};});
  const identity=await inspectWindowsProcess(child.pid);
  if(identity.state==='alive')held.identity=identity;
  else if(label==='secondary'&&identity.state==='absent')await wait(()=>held.exit,1000);
  else assert.equal(identity.state,'alive');
  return held;
 }
 try{
  runtime=await coordinator.startCoordinated(join(root,name),launcher);assert.ok(runtime.service,'GUI test must own its synthetic center');
  before=await runtime.client.call('status');assert.equal(before.guardian.phase,'running');const port=await unusedPort();primary=await launch('primary',port);
  const target=await wait(async()=>{if(primary.exit)throw Error('ELECTRON_EXITED '+primary.exit.code);const rows=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return rows.find(x=>x.type==='page'&&x.url.startsWith('dsh-app://'));});
  page=await cdp(target.webSocketDebuggerUrl);
  dom=await wait(async()=>{const {result}=await page.call('Runtime.evaluate',{expression:'({title:document.title,url:location.href,readyState:document.readyState,bodyTextLength:document.body?.innerText.length??0,root:!!document.querySelector("#root"),width:innerWidth,height:innerHeight})',returnByValue:true});const x=result.value;return x?.readyState==='complete'&&x.bodyTextLength>50?x:null;});
  assert.match(dom.title,/DeepSeek|Harness|DSH/i);assert.ok(dom.width>0&&dom.height>0);
  const png=await page.call('Page.captureScreenshot',{format:'png'});await writeFile(join(evidence,'window.png'),Buffer.from(png.data,'base64'));
  secondary=await launch('secondary');await wait(()=>secondary.exit,15000);assert.equal(secondary.exit.code,0);assert.equal(primary.exit,null);
  const after=await runtime.client.call('status');assert.equal(after.guardian.pid,before.guardian.pid);assert.equal(after.guardian.ownerPid,process.pid);assert.equal(after.guardian.generation,before.guardian.generation);
  const responsiveness=await page.call('Runtime.evaluate',{expression:'new Promise(resolve=>requestAnimationFrame(()=>resolve({visible:!document.hidden,tick:performance.now()})))',awaitPromise:true,returnByValue:true});assert.equal(typeof responsiveness.result.value.tick,'number');
  status='pass';
  // Browser.close is protocol-driven application termination, not a mouse test.
  const version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();browser=await cdp(version.webSocketDebuggerUrl);
  try{await browser.call('Browser.close');cleanup.push({action:'CDP Browser.close',result:'accepted'});}catch(e){cleanup.push({action:'CDP Browser.close',result:e.message});}
  await wait(()=>primary.exit,15000).catch(e=>cleanup.push({action:'wait-native-exit',result:e.message}));
 }catch(error){failure=error.message;throw error;}
 finally{
  page?.close();browser?.close();
  for(const held of children.reverse()){
   if(!held.exit&&held.identity){const current=await inspectWindowsProcess(held.identity.pid);if(current.state==='alive'&&current.startTimeUtcTicks===held.identity.startTimeUtcTicks){held.child.kill();cleanup.push({action:'forced-owned-Electron-exit',pid:held.identity.pid,reason:'test teardown after protocol close failed or test failure'});await wait(()=>held.exit,10000);}}
   await writeFile(join(evidence,held.label+'.log'),held.log);
  }
  if(runtime?.service){await runtime.close();cleanup.push({action:'normal-owned-center-close',result:'completed'});}
  const graph=await readFile(join(config.releaseRoot,'graph.json'));
  await writeFile(join(evidence,'result.json'),JSON.stringify({schema:1,status,failure,scope:'Actual isolated Electron entry, real host, CDP DOM/screenshot/responsiveness and second-process reuse; no GUI mouse interaction, model call, or normal window-close claim',graphHash:sha(graph),dom,hostPid:before?.guardian.pid,cleanup,processes:children.map(x=>({label:x.label,pid:x.child.pid,exit:x.exit}))},null,2)+'\n');
  console.log(JSON.stringify({status,evidence,cleanup}));
 }
});
