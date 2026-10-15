// sep-origin/alpha2-desktop/apps/desktop/src/preload-mandatory.ts
var import_electron = require("electron");

// sep-origin/alpha2-desktop/apps/desktop/src/mandatory-update-ipc.ts
var MANDATORY_IPC = {
  status: "dsh-desktop:mandatory-status",
  state: "dsh-desktop:mandatory-state",
  action: "dsh-desktop:mandatory-action"
};

// sep-origin/alpha2-desktop/apps/desktop/src/preload-mandatory.ts
var api = {
  status: () => import_electron.ipcRenderer.invoke(MANDATORY_IPC.status),
  action: (action, version, confirmationRevision) => import_electron.ipcRenderer.invoke(MANDATORY_IPC.action, action, version, confirmationRevision),
  subscribe(listener) {
    const handle = (_event, state) => {
      listener(state);
    };
    import_electron.ipcRenderer.on(MANDATORY_IPC.state, handle);
    return () => {
      import_electron.ipcRenderer.off(MANDATORY_IPC.state, handle);
    };
  }
};
if (location.href === "dsh-app://shell/mandatory-update.html") import_electron.contextBridge.exposeInMainWorld("dshMandatoryUpdate", api);
