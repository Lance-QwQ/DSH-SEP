// Verification only. These anchors and both labels are from the fixed installed
// official ui-renderer/ui-layout/ui-sidebar sources, bound by the probe receipt.
export function isWorkspaceReady(s){
 return !!s&&s.schema===1&&s.readyState==='complete'&&s.bootCount===0&&s.spinnerCount===0&&s.rootCount===1&&s.sidebarCount===1&&s.mainCount===1&&s.slotErrorCount===0&&s.factoryErrorCount===0&&Number.isInteger(s.visibleNewSessionButtons)&&s.visibleNewSessionButtons>=1&&s.sep==='function'&&s.host==='function';
}
export function readWorkspaceReadiness(){
 const count=selector=>document.querySelectorAll(selector).length;
 const visible=button=>{
  if(button.disabled||button.getAttribute('aria-disabled')==='true')return false;
  for(let element=button;element;element=element.parentElement){const style=getComputedStyle(element);if(element.hidden||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;}
  const r=button.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;
 };
 return {schema:1,readyState:document.readyState,textLength:document.body.innerText.length,
  bootCount:count('[data-dsh-boot]'),spinnerCount:count('[data-dsh-boot-spinner]'),
  rootCount:count('[data-slot="root"]'),sidebarCount:count('[data-slot="root"] [data-slot="sidebar"]'),mainCount:count('[data-slot="root"] [data-slot="main"]'),
  slotErrorCount:count('[data-slot-error]'),factoryErrorCount:count('[data-factory-error]'),
  visibleNewSessionButtons:[...document.querySelectorAll('[data-slot="root"] [data-slot="sidebar"] button[aria-label="新建会话"], [data-slot="root"] [data-slot="sidebar"] button[aria-label="New session"]')].filter(visible).length,
  sep:typeof window.dshDesktop?.sepUpdates?.status,host:typeof window.dshDesktop?.updates?.status};
}
export const workspaceExpression=`(${readWorkspaceReadiness.toString()})()`;
