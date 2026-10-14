// sep-origin/alpha2-desktop/apps/desktop/src/preload-platform-account.ts
var import_electron = require("electron");

// sep-origin/alpha2-desktop/apps/desktop/src/platform-ipc.ts
var PLATFORM_IPC = {
  bootstrap: "dsh-platform:bootstrap",
  localeChanged: "dsh-platform:locale-changed",
  open: "dsh-platform:open",
  bounds: "dsh-platform:bounds",
  close: "dsh-platform:close"
};

// sep-origin/alpha2-desktop/apps/desktop/src/preload-platform-account.ts
var originArgument = "--dsh-platform-origin=";
var allowedOrigin = process.argv.find((argument) => argument.startsWith(originArgument))?.slice(originArgument.length);
if (process.isMainFrame && location.origin === allowedOrigin) {
  let token;
  let locale;
  const localeListeners = /* @__PURE__ */ new Set();
  import_electron.ipcRenderer.on(PLATFORM_IPC.localeChanged, (_event, value) => {
    if (value !== "en_US" && value !== "zh_CN") return;
    locale = value;
    for (const listener of localeListeners) {
      try {
        listener(value);
      } catch (error) {
        console.error("Platform locale listener failed", error);
      }
    }
  });
  try {
    const value = import_electron.ipcRenderer.sendSync(PLATFORM_IPC.bootstrap);
    if (typeof value === "object" && value !== null && "token" in value && "origin" in value && typeof value.token === "string" && value.token.length > 0 && value.origin === location.origin && "locale" in value && (value.locale === "en_US" || value.locale === "zh_CN")) {
      token = value.token;
      locale = value.locale;
    }
  } catch {
  }
  import_electron.contextBridge.exposeInMainWorld("dsh", {
    protocolVersion: 1,
    displayMode: "embedded",
    getLocale: () => {
      if (locale === void 0) throw new Error("Platform locale initialization failed");
      return locale;
    },
    onLocaleChange: (listener) => {
      localeListeners.add(listener);
      return () => {
        localeListeners.delete(listener);
      };
    },
    getAuthToken: () => {
      if (token === void 0) throw new Error("Platform initialization failed");
      return token;
    }
  });
}
