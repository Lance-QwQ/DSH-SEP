// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/preload-update-dialog.ts
var import_electron3 = require("electron");

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-dialog.ts
var import_electron2 = require("electron");

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-overlay.ts
var import_electron = require("electron");

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-dialog.ts
var UPDATE_DIALOG_IPC = { status: "dsh-update-dialog:status", respond: "dsh-update-dialog:respond" };

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/preload-update-dialog.ts
var api = {
  status: () => import_electron3.ipcRenderer.invoke(UPDATE_DIALOG_IPC.status),
  respond: (index) => import_electron3.ipcRenderer.invoke(UPDATE_DIALOG_IPC.respond, index)
};
if (location.href === "dsh-app://shell/update-dialog.html") import_electron3.contextBridge.exposeInMainWorld("dshUpdateDialog", api);
//# sourceMappingURL=preload-update-dialog.cjs.map
