// Real OS file picker is opened and driven outside this renderer observer.
// No DOM.setFileInputFiles, chooser interception, dialog stub or pathFor override.
module.exports=async(window,log,base)=>{
 const fs=require('node:fs'),path=require('node:path'),root=process.env.SEP_BUNDLE_TEST_ROOT,f=JSON.parse(fs.readFileSync(path.join(root,'DESKTOP-FIXTURE.json'))),web=window.webContents;
 const evaluate=code=>web.executeJavaScript(code),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async(code,label,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await evaluate(code))return;await sleep(100);}throw Error(label);};
 const click=pattern=>evaluate(`(()=>{const r=new RegExp(${JSON.stringify(pattern)},'i'),b=[...document.querySelectorAll('button,[role=option]')].find(x=>[x.getAttribute('aria-label')||'',x.title||'',x.textContent||''].some(s=>r.test(s.trim())));if(!b||b.disabled)return false;b.click();return true})()`);
 const screenshot=async name=>{await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await sleep(350);fs.writeFileSync(base+'.'+name+'.png',(await web.capturePage()).toPNG());};
 try{
  if(process.env.SEP_DESKTOP_CONTINUATION==='2'){
   const state=JSON.parse(fs.readFileSync(path.join(root,'PERSISTED-PROBE.json')));await evaluate(`location.hash=${JSON.stringify(state.route.hash)}`);await wait("document.body.innerText.includes('中文说明.txt')&&document.body.innerText.includes('synthetic attachment read verified')",'RESTART_UI_HISTORY_MISSING');await screenshot('restart-history');log({event:'restart-ui-history-visible',sessionId:state.sessionId});return;
  }
  if(!await click('^New session in SEP Linux synthetic$'))throw Error('WORKSPACE_SESSION_CONTROL_MISSING');await sleep(500);if(!await evaluate('document.querySelector("[contenteditable=true]")!==null')){await click('^Choose workspace$');await sleep(300);if(!await click('^SEP Linux synthetic$'))throw Error('WORKSPACE_OPTION_MISSING');}await wait('document.querySelector("input[type=file]")!==null','FILE_UI_NOT_READY');
  await evaluate("window.__sepPickerSelections=[];document.addEventListener('change',e=>{if(e.target.type==='file')window.__sepPickerSelections.push([...e.target.files].map(f=>({name:f.name,size:f.size,type:f.type})))},{capture:true});document.querySelector('input[type=file]').addEventListener('cancel',()=>{window.__sepPickerCancelled=true})");
  const picker=async(kind,name)=>{const before=await evaluate('window.__sepPickerSelections.length');log({event:'os-picker-request',kind,path:name?path.join(f.uploads,name):undefined});await web.executeJavaScript('document.querySelector("input[type=file]").click()',true);if(kind==='cancel'){await wait("window.__sepPickerCancelled===true",'PICKER_CANCEL_DEADLINE',30000);if(await evaluate('window.__sepPickerSelections.length')!==before)throw Error('PICKER_CANCEL_SELECTION');}else await wait('window.__sepPickerSelections.length>'+before,'PICKER_SELECTION_DEADLINE',30000);log({event:'os-picker-returned',kind,selections:await evaluate('window.__sepPickerSelections')});};
  // Cancellation receipt is written by the external driver after observing
  // that the real OS dialog disappeared; it cannot stand in for selection.
  const cancelWatch=setInterval(()=>{if(fs.existsSync(path.join(root,'picker-cancelled')))void evaluate('window.__sepPickerCancelled=true');},100);
  try{await picker('cancel');}finally{clearInterval(cancelWatch);}await screenshot('cancel');log({event:'os-picker-cancelled-no-draft'});
  await picker('path-reference','unsupported.txt');await wait("document.querySelector('[contenteditable=true]').innerText.includes('unsupported.txt')",'PICKER_PATH_REFERENCE_MISSING');await screenshot('path-reference');log({event:'os-picker-path-reference',uploaded:false});
  await evaluate("document.querySelector('[contenteditable=true]').focus()");for(const event of [{type:'keyDown',keyCode:'A',modifiers:['control']},{type:'keyUp',keyCode:'A',modifiers:['control']},{type:'keyDown',keyCode:'Backspace'},{type:'keyUp',keyCode:'Backspace'}])web.sendInputEvent(event);await wait("document.querySelector('[contenteditable=true]').innerText.trim()===''",'REFERENCE_NOT_REMOVED');
  await picker('image-upload','picker-image.png');await wait("[...document.querySelectorAll('[data-composer-card] img')].some(x=>x.naturalWidth===8)",'PICKER_IMAGE_PREVIEW');await screenshot('image-preview');if(!await click('^Send message$|^Send$|^发送$'))throw Error('IMAGE_SEND_MISSING');await wait("document.body.innerText.includes('synthetic desktop visual interpretation')",'IMAGE_MODEL_REPLY_MISSING');log({event:'os-picker-image-upload-verified'});
  await require('./desktop-file-probe.cjs')(window,log,base);
  fs.writeFileSync(path.join(root,'UI-SESSION.json'),JSON.stringify(await evaluate('({hash:location.hash,pathname:location.pathname})')));
  log({event:'continuation-first-round-complete'});
 }catch(error){log({event:'continuation-probe-failure',code:error.message,syntheticDom:await evaluate('document.body.innerText')});throw error;}
};
