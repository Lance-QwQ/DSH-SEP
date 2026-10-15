// Read-only, bounded renderer instrumentation for the fixed synthetic CI page.
// No body text, URLs, cookies, identifiers, input values or arbitrary messages.
export function settingsTrace(command,action){
 const key='__sepSettingsStructureTrace';
 const visible=e=>!!e&&!!e.getClientRects().length&&!e.closest('[hidden],[inert]')&&e.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true})!==false;
 const state=e=>({exists:!!e,visible:visible(e),disabled:!!e?.disabled,expanded:['true','false'].includes(e?.getAttribute('aria-expanded'))?e.getAttribute('aria-expanded'):null});
 const snapshot=()=>{const buttons=[...document.querySelectorAll('button')],dialogs=[...document.querySelectorAll('[role="dialog"]')],root=document.querySelector('#root'),settings=document.querySelector('[role="dialog"][data-shortcut-modal="settings"]');return {timeOrigin:performance.timeOrigin,readyState:['loading','interactive','complete'].includes(document.readyState)?document.readyState:'other',rootInert:!!root&&(root.inert||root.hasAttribute('inert')),dialogs:dialogs.length,visibleDialogs:dialogs.filter(visible).length,settings:state(settings),direct:state(buttons.find(b=>['Settings','设置'].includes(b.getAttribute('aria-label')))),account:state(buttons.find(b=>['Account menu','账号菜单'].includes(b.getAttribute('aria-label')))),menuItem:state([...document.querySelectorAll('[role="menuitem"]')].find(e=>['Settings','设置'].some(t=>e.textContent.trim().startsWith(t))))};};
 if(command==='start'){
  window[key]?.observer.disconnect();const data={rows:[],total:0,last:null,observer:null};
  data.take=label=>{const current=snapshot(),encoded=JSON.stringify(current);if(label==='mutation'&&data.last===encoded)return;data.last=encoded;data.total++;data.rows.push({sequence:data.total,atMs:Math.round(performance.now()),action:label,state:current});if(data.rows.length>128)data.rows.shift();};
  data.observer=new MutationObserver(()=>data.take('mutation'));window[key]=data;data.observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-expanded','aria-disabled','disabled','inert','hidden','role','data-shortcut-modal','style','class']});data.take('start');
 }
 const data=window[key];if(!data)return {status:'missing',snapshot:snapshot(),rows:[]};
 if(command==='sample'&&['direct-before','direct-after','account-before','account-after','menu-before','menu-after','dialog-observed','memory-selected','budget-selected','timeout'].includes(action))data.take(action);
 if(command==='stop')data.observer.disconnect();
 return {status:'present',snapshot:snapshot(),rows:data.rows,total:data.total,truncated:data.total>128};
}
