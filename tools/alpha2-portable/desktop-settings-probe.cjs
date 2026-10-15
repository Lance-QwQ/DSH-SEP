// Synthetic-only renderer validation. Uses real rendered controls and routes.
module.exports=async function inspect(window,log,base){
 const fs=require('node:fs');
 const evaluate=code=>window.webContents.executeJavaScript(code);
 const wait=async(code,label)=>{const end=Date.now()+12000;while(Date.now()<end){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,100));}throw Error(label);};
 const click=async(pattern)=>evaluate(`(()=>{const re=new RegExp(${JSON.stringify(pattern)},'i');const b=[...document.querySelectorAll('button,[role=tab],[role=menuitem]')].find(x=>[x.getAttribute('aria-label')||'',x.getAttribute('title')||'',x.textContent].some(s=>re.test(s.trim())));if(!b)return false;b.click();return true})()`);
 await click('Account menu');
 await new Promise(r=>setTimeout(r,100));
 if(!await click('^\\s*(settings|设置)(?:Ctrl|\\s|$)')){
  log({event:'settings-control-missing',buttons:await evaluate(`([...document.querySelectorAll('button')].map(x=>({title:x.title,aria:x.getAttribute('aria-label'),text:x.textContent})))`)});
  throw Error('SETTINGS_CONTROL_MISSING');
 }
 await wait(`/Memory enhancement|记忆增强/.test(document.body.innerText)&&/Session budget|会话预算/.test(document.body.innerText)`,'SEP_SETTINGS_LIST_MISSING');
 log({event:'sep-settings-listed',memory:true,budget:true});
 if(!await click('Memory enhancement|记忆增强'))throw Error('MEMORY_TAB_MISSING');
 await wait(`/Automatic memory|自动记忆/.test(document.body.innerText)&&document.querySelector('select')!==null`,'MEMORY_PANEL_MISSING');
 const memory=await evaluate(`({hasProject:[...document.querySelectorAll('option')].some(x=>x.textContent.includes('synthetic-source')),unavailable:/MEMORY_SETTINGS_UNAVAILABLE|SEP_LINUX_NOT_ACTIVE/.test(document.body.innerText)})`);
 if(!memory.hasProject||memory.unavailable)throw Error('MEMORY_PANEL_UNAVAILABLE');
 fs.writeFileSync(base+'.memory.png',(await window.webContents.capturePage()).toPNG());log({event:'sep-memory-ui',...memory});
 if(!await click('Session budget|会话预算'))throw Error('BUDGET_TAB_MISSING');
 await wait(`([...document.querySelectorAll('input')].some(x=>x.value==='100'))`,'BUDGET_DEFAULT_MISSING');
 const budget=await evaluate(`({default100:[...document.querySelectorAll('input')].some(x=>x.value==='100'),unavailable:/BUDGET_SETTINGS_UNAVAILABLE|SEP_LINUX_NOT_ACTIVE/.test(document.body.innerText)})`);
 if(budget.unavailable)throw Error('BUDGET_PANEL_UNAVAILABLE');
 fs.writeFileSync(base+'.budget.png',(await window.webContents.capturePage()).toPNG());log({event:'sep-budget-ui',...budget});
};
