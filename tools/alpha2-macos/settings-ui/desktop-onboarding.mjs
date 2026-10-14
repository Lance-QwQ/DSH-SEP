// Test-only observed UI prerequisite. No sign-in, credentials or payment action.
// Self-contained for execution in the actual renderer, and for contract tests.
export function observeOnboarding(act=false){
 const eligible=e=>!!e&&!e.disabled&&e.getClientRects().length>0&&!e.closest('[hidden],[inert]')&&e.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true})!==false;
 const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(eligible),d=dialogs.at(-1);if(!d)return {kind:'none',action:null};
 if(d.getAttribute?.('data-shortcut-modal')==='settings')return {kind:'settings',action:null};
 const title=d.querySelector('h2')?.textContent.trim();let kind='other',labels=[];
 if(['Get started','开始使用'].includes(title)){kind='sign-in';labels=['Close','关闭'];}
 else if(['Add an API key to get started','添加一个 API Key 开始使用'].includes(title)){kind='api-key';labels=['Configure later','稍后配置'];}
 const b=[...d.querySelectorAll('button')].find(b=>eligible(b)&&labels.includes(kind==='sign-in'?b.getAttribute('aria-label'):b.textContent.trim()));
 // A filled key field is outside this intentionally empty, uncredentialed test.
 const filled=[...d.querySelectorAll('input[type="password"]')].some(e=>e.value.length>0);
 if(!act||!b||filled)return {kind,action:null};b.click();return {kind,action:kind==='sign-in'?'dismiss-sign-in':'defer-key'};
}
