// A self-contained read-only renderer projection, only for the synthetic CI
// page. No body, arbitrary label, URL, cookie, project ID, path or input value.
export function settingsDomSnapshot(){
 const d=document.querySelector('[role="dialog"][data-shortcut-modal="settings"]');if(!d)return {dialog:false};
 const classify=text=>['Memory enhancement','记忆增强'].includes(text)?'memory':['Session budget','会话预算'].includes(text)?'budget':'other';
 const sections=[...d.querySelectorAll('section')],find=kind=>sections.find(s=>classify(s.querySelector('h2')?.textContent.trim())===kind);
 const state=s=>{if(!s)return {exists:false};const select=s.querySelector('select'),r=[...s.querySelectorAll('input[role="switch"]')].find(e=>['Recall existing memory automatically','自动引用已有记忆'].includes(e.getAttribute('aria-label')));return {exists:true,busy:s.getAttribute('aria-busy')==='true',select:!!select,options:select?.options.length??0,recall:r?{checked:r.checked,disabled:r.disabled}:null};};
 const active=[...d.querySelectorAll('nav button')].find(b=>b.getAttribute('aria-current')==='true');
 const alerts=[...d.querySelectorAll('[role="alert"]')].slice(0,8).map(e=>{const t=e.textContent.trim();if(['Could not read memory settings. Refresh to try again.','无法读取记忆设置，请刷新后重试。'].includes(t))return 'read-error';if(t.includes('unavailable')||t.includes('不可用'))return 'unavailable';if(t.includes('conflict')||t.includes('已被其他'))return 'conflict';return 'other';});
 return {dialog:true,activeNav:classify(active?.textContent.trim()),sections:sections.length,memory:state(find('memory')),budget:state(find('budget')),alerts};
}
