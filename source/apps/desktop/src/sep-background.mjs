// Desktop-only lifecycle policy. Explicit app.quit keeps the existing bounded
// backend shutdown path; ordinary window close leaves the same host running.
export function createSepBackgroundLifecycle({enabled,app,Tray,Menu,icon,show,canHide,onUnavailable=()=>{}}) {
  let tray, active=false, sessionEnding=false;
  const windows=new Map();
  if(enabled)try {
    tray=new Tray(icon);
    tray.setToolTip('DSH SEP — 后台运行');
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:'打开 DSH SEP',click:show},
      {type:'separator'},
      {label:'退出 DSH SEP',click:()=>app.quit()},
    ]));
    tray.on('double-click',show);
    active=true;
  }catch(error){tray?.destroy();tray=undefined;onUnavailable(error);}
  function unbind(window){const handlers=windows.get(window);if(!handlers)return;for(const [name,handler]of Object.entries(handlers))window.removeListener(name,handler);windows.delete(window);}
  return {
    bindWindow(window){
      if(!active||windows.has(window))return;
      const handlers={
        close(event){if(active&&!sessionEnding&&canHide()){event.preventDefault();window.hide();}},
        'query-session-end'(){sessionEnding=true;},
        closed(){unbind(window);},
      };
      windows.set(window,handlers);for(const[name,handler]of Object.entries(handlers))window.on(name,handler);
    },
    dispose(){active=false;for(const window of [...windows.keys()])unbind(window);tray?.destroy();tray=undefined;},
  };
}
