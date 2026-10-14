// sep-origin/alpha2-desktop/apps/desktop/src/preload-update-dialog.ts
var import_electron2 = require("electron");

// sep-origin/alpha2-desktop/apps/desktop/src/update-dialog.ts
var import_electron = require("electron");
var UPDATE_DIALOG_IPC = { status: "dsh-update-dialog:status", changed: "dsh-update-dialog:changed", respond: "dsh-update-dialog:respond" };

// sep-origin/alpha2-desktop/apps/desktop/src/preload-update-dialog.ts
var api = {
  status: () => import_electron2.ipcRenderer.invoke(UPDATE_DIALOG_IPC.status),
  respond: (revision, index) => import_electron2.ipcRenderer.invoke(UPDATE_DIALOG_IPC.respond, revision, index),
  subscribe: (listener) => {
    const receive = (_event, view) => {
      listener(view);
    };
    import_electron2.ipcRenderer.on(UPDATE_DIALOG_IPC.changed, receive);
    return () => {
      import_electron2.ipcRenderer.removeListener(UPDATE_DIALOG_IPC.changed, receive);
    };
  }
};
if (location.href === "dsh-app://shell/update-dialog.html") import_electron2.contextBridge.exposeInMainWorld("dshUpdateDialog", api);
