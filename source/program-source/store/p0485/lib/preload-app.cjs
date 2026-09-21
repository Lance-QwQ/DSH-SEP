// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/preload-app.ts
var import_electron4 = require("electron");

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/ipc.ts
var DESKTOP_IPC = {
  boot: "dsh-desktop:boot",
  bootFailed: "dsh-desktop:boot-failed",
  directoryPick: "dsh-desktop:directory-pick",
  updatesStatus: "dsh-desktop:updates-status",
  updatesOpen: "dsh-desktop:updates-open",
  updatesPresentation: "dsh-desktop:updates-presentation",
  nativeThemeSet: "dsh-desktop:native-theme-set",
  windowsAppearance: "dsh-desktop:windows-appearance",
  windowsMenu: "dsh-desktop:windows-menu"
};
var SCHEME = "dsh-app";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/preload-platform.ts
function markDocumentPlatform() {
  const mark = () => {
    document.documentElement.dataset.platform = process.platform;
  };
  const root = document.documentElement;
  if (root === null) window.addEventListener("DOMContentLoaded", mark);
  else mark();
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/preload-theme.ts
var import_electron = require("electron");
var THEME_SOURCE_ATTRIBUTE = "data-ds-theme-source";
function syncNativeTheme() {
  if (process.platform !== "darwin") return;
  let sent;
  const send = () => {
    const value = document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE);
    if (value === null || value === sent) return;
    sent = value;
    import_electron.ipcRenderer.send(DESKTOP_IPC.nativeThemeSet, value);
  };
  const observe = () => {
    new MutationObserver(send).observe(document.documentElement, { attributeFilter: [THEME_SOURCE_ATTRIBUTE] });
    send();
  };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", observe);
  else observe();
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/windows-layout.ts
var WINDOWS_TITLEBAR_HEIGHT = 40;

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/preload-windows.ts
var import_electron3 = require("electron");

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/preload-menu.ts
var import_electron2 = require("electron");

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/locale.ts
var en = {
  application: "Application",
  aboutMenu: "About DeepSeek Harness",
  edit: "Edit",
  menuBar: "Application menu",
  delete: "Delete",
  undo: "Undo",
  redo: "Redo",
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  selectAll: "Select All",
  startupFailed: "DeepSeek Harness is unavailable",
  fatalSummary: "The application could not start or stopped unexpectedly.",
  startupAddressInUse: "Another DSH instance (such as dsh web or the desktop app) is running. They cannot start at the same time. Quit the other running DSH instance, then restart.",
  diagnosticTruncated: "\u2026 Error details shortened. The full diagnostic was written to the Electron console.",
  startupReinstallAdvice: "If application files are missing or damaged, close the application and reinstall it. Your tasks are stored separately.",
  exitApplication: "Exit",
  restartApplication: "Restart",
  recoveryOperationFailed: "The recovery operation failed",
  disableThirdPartyPlugins: "Disable third-party plugins, back up profile patch, and restart",
  checkUpdatesMenu: "Check for Updates\u2026",
  sepManagedUpdates: "This installation is managed by DSH SEP. Use SEP Update Center to check compatibility and update while preserving your data and plugins.",
  updateCheckFailedTitle: "Update Check Failed",
  updateCheckFailed: "Could not check for updates. Please try again later.",
  updateDownloadFailed: "Could not download the update. Please try again.",
  updateInstallFailed: "Could not install the update. Please try again later.",
  updateCheckNetworkFailed: "Could not check for updates. Please try again later. The connection was interrupted. Check your network and try again.",
  updateDownloadNetworkFailed: "Could not download the update. Please try again. The connection was interrupted. Check your network and try again.",
  updateInstallNetworkFailed: "Could not install the update. Please try again later. The connection was interrupted. Check your network and try again.",
  unknownError: "Unknown error",
  updateCheckTitle: "Check for Updates",
  updateCurrent: "No updates available. Current version: V{version}",
  updateChecking: "Checking for updates\u2026",
  updateDownload: "Download update",
  updateDownloadedTitle: "DeepSeek Harness v{version} downloaded",
  updateDownloadedDetail: "The update package has downloaded. Select \u201CInstall and Restart\u201D to restart the app and begin installation.",
  updateClose: "Close",
  updateAcknowledge: "OK",
  updateLater: "Update later",
  updateDownloading: "Downloading {percent}%\u2026",
  updateVerifying: "Verifying update files\u2026",
  updateInstalling: "Preparing to restart\u2026",
  updateRetry: "Retry update",
  updateActiveTasks: "Tasks are still in progress",
  updateActiveTasksDetail: "Restarting to update may interrupt these tasks. Continue updating?",
  updateStopTasks: "Stop tasks and update",
  updateTasksChanged: "New tasks started. Review the update confirmation again.",
  updateTasksUnavailable: "Task status is unavailable. Try updating again when the workspace is ready.",
  updateStopFailed: "Tasks could not be stopped safely. The update was not installed. Please try again later.",
  updateTechnicalDetails: "View technical details",
  updateTitle: "DeepSeek Harness Update",
  updateAvailable: "An update is available",
  updateDetail: "DeepSeek Harness {version}\n\nThis release includes its matching dsh version. The application will restart after installation.",
  installAndRestart: "Install and Restart",
  later: "Later",
  updateFailedTitle: "Update Failed",
  mandatoryTitle: "Update required",
  mandatoryDetail: "This version is no longer supported. Update to continue. Existing tasks can keep running until you approve a restart.",
  mandatoryUnavailable: "The update requirement could not be checked. Retry when the connection is available.",
  policyLoginTitle: "Sign in to the test environment",
  policyLoginRequired: "This is a test build. Checking update requirements needs Feishu sign-in. Signing in does not download or install an update.",
  policyLogin: "Sign in with Feishu",
  policyLoginFailed: "Test environment sign-in did not complete. Please check your connection and try again.",
  policyLoginLoading: "Loading sign-in page\u2026",
  mandatoryNoRelease: "No applicable update is available. Check again or contact support.",
  mandatoryRefresh: "Check again",
  mandatoryPage: "Open download page",
  mandatoryCopy: "Copy download address",
  mandatoryPageFailed: "The download page could not be opened. Copy the address below and open it in your browser.",
  mandatoryActionFailed: "The update action failed. Retry; the update requirement remains active.",
  mandatoryReady: "Update ready",
  mandatoryVersion: "V{version}",
  mandatoryReadyDetail: "Installing the update will restart the application.",
  mandatoryDeferred: "Existing tasks can keep running. Update to continue using the application.",
  mandatoryContinue: "Continue installing update",
  mandatoryInspecting: "Checking tasks\u2026",
  mandatoryStopping: "Safely stopping tasks in the application.",
  mandatoryRestarting: "The application will restart shortly. Please wait.",
  mandatoryDownloadFailed: "The update files could not be downloaded or prepared. Please retry.",
  mandatoryInstallFailed: "The update was not installed. Check tasks again and retry.",
  mandatoryOpenHelp: "If the page did not open, you can",
  mandatoryReopen: "Open download page again",
  mandatoryCopied: "Link copied",
  mandatoryCopyFailed: "Copy failed. Select and copy the address below manually.",
  mandatoryAddress: "Download address",
  mandatoryNotification: "Return to the application to confirm installation and restart."
};
var zh = {
  application: "\u5E94\u7528",
  aboutMenu: "\u5173\u4E8E DeepSeek Harness",
  edit: "\u7F16\u8F91",
  menuBar: "\u5E94\u7528\u83DC\u5355",
  delete: "\u5220\u9664",
  undo: "\u64A4\u9500",
  redo: "\u91CD\u505A",
  cut: "\u526A\u5207",
  copy: "\u590D\u5236",
  paste: "\u7C98\u8D34",
  selectAll: "\u5168\u9009",
  startupFailed: "DeepSeek Harness \u65E0\u6CD5\u4F7F\u7528",
  fatalSummary: "\u5E94\u7528\u65E0\u6CD5\u542F\u52A8\u6216\u5DF2\u610F\u5916\u505C\u6B62\u3002",
  startupAddressInUse: "\u6709\u5176\u4ED6\u6B63\u5728\u8FD0\u884C\u7684 DSH\uFF08\u5982\u5176\u4ED6 dsh web\u3001\u684C\u9762\u7AEF\uFF09\uFF0C\u65E0\u6CD5\u540C\u65F6\u542F\u52A8\uFF0C\u8BF7\u9000\u51FA\u5176\u4ED6\u6B63\u5728\u8FD0\u884C\u7684 DSH \u540E\u91CD\u542F\u3002",
  diagnosticTruncated: "\u2026 \u9519\u8BEF\u8BE6\u60C5\u5DF2\u622A\u77ED\uFF0C\u5B8C\u6574\u8BCA\u65AD\u5DF2\u5199\u5165 Electron \u63A7\u5236\u53F0\u3002",
  startupReinstallAdvice: "\u5982\u679C\u5E94\u7528\u6587\u4EF6\u7F3A\u5931\u6216\u635F\u574F\uFF0C\u8BF7\u5173\u95ED\u5E94\u7528\u5E76\u91CD\u65B0\u5B89\u88C5\u3002\u4EFB\u52A1\u6570\u636E\u5B58\u50A8\u5728\u72EC\u7ACB\u4F4D\u7F6E\u3002",
  exitApplication: "\u9000\u51FA",
  restartApplication: "\u91CD\u542F",
  recoveryOperationFailed: "\u6062\u590D\u64CD\u4F5C\u5931\u8D25",
  disableThirdPartyPlugins: "\u7981\u7528\u7B2C\u4E09\u65B9\u63D2\u4EF6\u3001\u5907\u4EFD profile patch \u5E76\u91CD\u542F",
  sepManagedUpdates: "\u6B64\u5B89\u88C5\u7531 DSH SEP \u7BA1\u7406\u3002\u8BF7\u4F7F\u7528 SEP \u66F4\u65B0\u4E2D\u5FC3\u68C0\u67E5\u517C\u5BB9\u6027\u5E76\u66F4\u65B0\uFF0C\u4EE5\u4FDD\u7559\u7528\u6237\u6570\u636E\u548C\u5176\u4ED6\u63D2\u4EF6\u3002",
  checkUpdatesMenu: "\u68C0\u67E5\u66F4\u65B0\u2026",
  updateCheckFailedTitle: "\u66F4\u65B0\u68C0\u67E5\u5931\u8D25",
  updateCheckFailed: "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  updateDownloadFailed: "\u4E0B\u8F7D\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  updateInstallFailed: "\u5B89\u88C5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  updateCheckNetworkFailed: "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002\u7F51\u7EDC\u8FDE\u63A5\u5F02\u5E38\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002",
  updateDownloadNetworkFailed: "\u4E0B\u8F7D\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002\u7F51\u7EDC\u8FDE\u63A5\u5F02\u5E38\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002",
  updateInstallNetworkFailed: "\u5B89\u88C5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002\u7F51\u7EDC\u8FDE\u63A5\u5F02\u5E38\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002",
  unknownError: "\u672A\u77E5\u9519\u8BEF",
  updateCheckTitle: "\u68C0\u67E5\u66F4\u65B0",
  updateCurrent: "\u5F53\u524D\u6682\u65E0\u53EF\u7528\u66F4\u65B0\u3002\u5F53\u524D\u7248\u672C\uFF1AV{version}",
  updateChecking: "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\u2026",
  updateDownload: "\u4E0B\u8F7D\u66F4\u65B0",
  updateDownloadedTitle: "DeepSeek Harness v{version} \u4E0B\u8F7D\u5B8C\u6210",
  updateDownloadedDetail: "\u5B89\u88C5\u5305\u5DF2\u4E0B\u8F7D\u5B8C\u6BD5\uFF0C\u70B9\u51FB\u201C\u5B89\u88C5\u5E76\u91CD\u542F\u201D\uFF0C\u5373\u523B\u91CD\u542F\u5BA2\u6237\u7AEF\uFF0C\u5F00\u59CB\u90E8\u7F72\u3002",
  updateClose: "\u5173\u95ED",
  updateAcknowledge: "\u786E\u5B9A",
  updateLater: "\u7A0D\u540E\u66F4\u65B0",
  updateDownloading: "\u6B63\u5728\u4E0B\u8F7D {percent}%\u2026",
  updateVerifying: "\u6B63\u5728\u6821\u9A8C\u66F4\u65B0\u6587\u4EF6\u2026",
  updateInstalling: "\u6B63\u5728\u51C6\u5907\u91CD\u542F\u2026",
  updateRetry: "\u91CD\u8BD5\u66F4\u65B0",
  updateActiveTasks: "\u4ECD\u6709\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1",
  updateActiveTasksDetail: "\u91CD\u542F\u66F4\u65B0\u53EF\u80FD\u4E2D\u65AD\u8FD9\u4E9B\u4EFB\u52A1\uFF0C\u662F\u5426\u8981\u7EE7\u7EED\u66F4\u65B0\uFF1F",
  updateStopTasks: "\u505C\u6B62\u4EFB\u52A1\u5E76\u66F4\u65B0",
  updateTasksChanged: "\u6709\u65B0\u4EFB\u52A1\u5F00\u59CB\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u66F4\u65B0\u3002",
  updateTasksUnavailable: "\u65E0\u6CD5\u786E\u8BA4\u4EFB\u52A1\u72B6\u6001\uFF0C\u8BF7\u5728\u5DE5\u4F5C\u533A\u5C31\u7EEA\u540E\u91CD\u8BD5\u66F4\u65B0\u3002",
  updateStopFailed: "\u672A\u80FD\u5B89\u5168\u505C\u6B62\u4EFB\u52A1\uFF0C\u66F4\u65B0\u672A\u5B89\u88C5\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  updateTechnicalDetails: "\u67E5\u770B\u6280\u672F\u8BE6\u60C5",
  updateTitle: "DeepSeek Harness \u66F4\u65B0",
  updateAvailable: "\u53D1\u73B0\u53EF\u7528\u66F4\u65B0",
  updateDetail: "DeepSeek Harness {version}\n\n\u65B0\u7248\u672C\u7ED1\u5B9A\u5339\u914D\u7684 dsh\uFF0C\u5B89\u88C5\u540E\u5C06\u91CD\u65B0\u542F\u52A8\u3002",
  installAndRestart: "\u5B89\u88C5\u5E76\u91CD\u542F",
  later: "\u7A0D\u540E",
  updateFailedTitle: "\u66F4\u65B0\u5931\u8D25",
  mandatoryTitle: "\u9700\u8981\u66F4\u65B0",
  mandatoryDetail: "\u5F53\u524D\u7248\u672C\u5DF2\u505C\u6B62\u652F\u6301\uFF0C\u8BF7\u66F4\u65B0\u540E\u7EE7\u7EED\u4F7F\u7528\u3002\u5728\u60A8\u786E\u8BA4\u91CD\u542F\u4E4B\u524D\uFF0C\u73B0\u6709\u4EFB\u52A1\u53EF\u4EE5\u7EE7\u7EED\u8FD0\u884C\u3002",
  mandatoryUnavailable: "\u6682\u65F6\u65E0\u6CD5\u68C0\u67E5\u66F4\u65B0\u8981\u6C42\uFF0C\u8BF7\u5728\u7F51\u7EDC\u6062\u590D\u540E\u91CD\u8BD5\u3002",
  policyLoginTitle: "\u767B\u5F55\u6D4B\u8BD5\u73AF\u5883",
  policyLoginRequired: "\u8FD9\u662F\u6D4B\u8BD5\u7248\u5E94\u7528\uFF0C\u68C0\u67E5\u66F4\u65B0\u8981\u6C42\u9700\u8981\u5148\u901A\u8FC7\u98DE\u4E66\u767B\u5F55\u3002\u767B\u5F55\u4E0D\u4F1A\u4E0B\u8F7D\u6216\u5B89\u88C5\u66F4\u65B0\u3002",
  policyLogin: "\u901A\u8FC7\u98DE\u4E66\u767B\u5F55",
  policyLoginFailed: "\u6D4B\u8BD5\u73AF\u5883\u767B\u5F55\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002",
  policyLoginLoading: "\u6B63\u5728\u52A0\u8F7D\u767B\u5F55\u9875\u9762\u2026",
  mandatoryNoRelease: "\u6682\u65F6\u6CA1\u6709\u53EF\u7528\u7684\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u6216\u8054\u7CFB\u652F\u6301\u4EBA\u5458\u3002",
  mandatoryRefresh: "\u91CD\u65B0\u68C0\u67E5",
  mandatoryPage: "\u524D\u5F80\u5B98\u7F51\u4E0B\u8F7D",
  mandatoryCopy: "\u590D\u5236\u4E0B\u8F7D\u94FE\u63A5",
  mandatoryPageFailed: "\u65E0\u6CD5\u6253\u5F00\u6D4F\u89C8\u5668\uFF0C\u8BF7\u590D\u5236\u4E0B\u8F7D\u94FE\u63A5\u540E\u624B\u52A8\u6253\u5F00\u3002",
  mandatoryActionFailed: "\u66F4\u65B0\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\uFF1B\u5E94\u7528\u4ECD\u9700\u66F4\u65B0\u540E\u624D\u80FD\u7EE7\u7EED\u4F7F\u7528\u3002",
  mandatoryReady: "\u66F4\u65B0\u5DF2\u51C6\u5907\u5C31\u7EEA",
  mandatoryVersion: "V{version}",
  mandatoryReadyDetail: "\u5B89\u88C5\u540E\u5C06\u91CD\u65B0\u542F\u52A8\u5E94\u7528\u3002",
  mandatoryDeferred: "\u73B0\u6709\u4EFB\u52A1\u53EF\u4EE5\u7EE7\u7EED\u8FD0\u884C\u3002\u5B8C\u6210\u66F4\u65B0\u540E\u624D\u80FD\u7EE7\u7EED\u64CD\u4F5C\u5E94\u7528\u3002",
  mandatoryContinue: "\u7EE7\u7EED\u5B89\u88C5\u66F4\u65B0",
  mandatoryInspecting: "\u6B63\u5728\u68C0\u67E5\u4EFB\u52A1\u72B6\u6001\u2026",
  mandatoryStopping: "\u6B63\u5728\u5B89\u5168\u7ED3\u675F\u5E94\u7528\u4E2D\u7684\u4EFB\u52A1\u3002",
  mandatoryRestarting: "\u5E94\u7528\u5373\u5C06\u91CD\u542F\uFF0C\u8BF7\u7A0D\u5019\u3002",
  mandatoryDownloadFailed: "\u66F4\u65B0\u6587\u4EF6\u4E0B\u8F7D\u6216\u51C6\u5907\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  mandatoryInstallFailed: "\u66F4\u65B0\u5C1A\u672A\u5B89\u88C5\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u4EFB\u52A1\u540E\u91CD\u8BD5\u3002",
  mandatoryOpenHelp: "\u82E5\u9875\u9762\u672A\u6253\u5F00\uFF0C\u53EF",
  mandatoryReopen: "\u91CD\u65B0\u6253\u5F00\u5B98\u7F51",
  mandatoryCopied: "\u5DF2\u590D\u5236\u94FE\u63A5",
  mandatoryCopyFailed: "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9\u4E0B\u65B9\u5730\u5740\u590D\u5236\u3002",
  mandatoryAddress: "\u4E0B\u8F7D\u5730\u5740",
  mandatoryNotification: "\u8FD4\u56DE\u5E94\u7528\u786E\u8BA4\u5B89\u88C5\u5E76\u91CD\u542F\u3002"
};
function resolveDesktopLocale(locale) {
  return locale.toLowerCase().startsWith("zh") ? { id: "zh-CN", messages: zh } : { id: "en", messages: en };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/preload-menu.ts
function installWindowsMenu() {
  const host = document.createElement("div");
  host.dataset.windowsMenu = "";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { position: fixed; top: 0; left: var(--dsh-windows-menu-start, 48px); z-index: 1100;
      height: var(--dsh-windows-titlebar-height); display: flex; align-items: center;
      font-family: var(--dsw-font-family); -webkit-app-region: no-drag; }
    [role=menubar] { display: flex; gap: 2px; }
    button { height: 28px; padding: 0 10px; border: 0; border-radius: 6px;
      background: transparent; color: var(--dsw-alias-label-secondary);
      font: inherit; font-size: 14px; cursor: default; }
    button:hover, button[aria-expanded=true] { background: var(--dsw-alias-interactive-bg-hover);
      color: var(--dsw-alias-label-primary); }
    button:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
  `;
  const bar = document.createElement("div");
  bar.setAttribute("role", "menubar");
  let restoreEditor = () => {
  };
  const rememberEditor = (event) => {
    const target = event.composedPath()[0];
    if (!(target instanceof HTMLElement) || target === host || shadow.contains(target)) return;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement) && !target.matches('[contenteditable="true"]')) return;
    const selection = document.getSelection();
    const ranges = selection === null ? [] : Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange());
    const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : void 0;
    const start = input?.selectionStart;
    const end = input?.selectionEnd;
    const direction = input?.selectionDirection;
    restoreEditor = () => {
      if (!target.isConnected) return;
      target.focus({ preventScroll: true });
      if (input !== void 0 && start != null && end != null) input.setSelectionRange(start, end, direction ?? void 0);
      else if (selection !== null && ranges.length > 0) {
        selection.removeAllRanges();
        for (const range of ranges) selection.addRange(range);
      }
    };
  };
  document.addEventListener("focusout", rememberEditor, true);
  const createButton = (name, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.tabIndex = index === 0 ? 0 : -1;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    const open = async () => {
      if (button.getAttribute("aria-expanded") === "true") return;
      const rect = button.getBoundingClientRect();
      button.setAttribute("aria-expanded", "true");
      if (document.activeElement === host) restoreEditor();
      try {
        await import_electron2.ipcRenderer.invoke(DESKTOP_IPC.windowsMenu, name, rect.left, rect.bottom);
      } catch (error) {
        console.error("Desktop caption menu failed", error);
      } finally {
        button.setAttribute("aria-expanded", "false");
      }
    };
    button.addEventListener("click", () => {
      void open();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const next = buttons[index === 0 ? 1 : 0];
        button.tabIndex = -1;
        next.tabIndex = 0;
        next.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        void open();
      }
    });
    bar.append(button);
    return button;
  };
  const buttons = [createButton("application", 0), createButton("edit", 1)];
  shadow.append(style, bar);
  const mount = () => {
    if (document.querySelector("[data-shell-overlay]") === null) return;
    document.body.append(host);
    observer.disconnect();
  };
  const observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
  mount();
  const update = () => {
    const { messages } = resolveDesktopLocale(document.documentElement.lang);
    bar.setAttribute("aria-label", messages.menuBar);
    buttons[0].textContent = messages.application;
    buttons[1].textContent = messages.edit;
  };
  update();
  return {
    update,
    dispose: () => {
      observer.disconnect();
      document.removeEventListener("focusout", rememberEditor, true);
      host.remove();
    }
  };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/preload-windows.ts
function syncWindowsAppearance() {
  if (process.platform !== "win32") return;
  const mark = () => {
    const root = document.documentElement;
    root.dataset.windowsTitlebar = "";
    root.style.setProperty("--dsh-windows-titlebar-height", `${WINDOWS_TITLEBAR_HEIGHT}px`);
  };
  if (document.documentElement !== null) mark();
  const install = () => {
    mark();
    const root = document.documentElement;
    const menu = installWindowsMenu();
    const probe = document.createElement("span");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;background-color:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary)";
    document.body.append(probe);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) throw new Error("Desktop caption requires a 2D canvas context");
    const nativeColor = (color) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 255})`;
    };
    let previous = "";
    const send = () => {
      const style = getComputedStyle(probe);
      const color = nativeColor(style.backgroundColor);
      const symbolColor = nativeColor(style.color);
      const values = [root.lang, color, symbolColor];
      const current = JSON.stringify(values);
      if (current === previous) return;
      previous = current;
      menu.update();
      import_electron3.ipcRenderer.send(DESKTOP_IPC.windowsAppearance, ...values);
    };
    const observer = new MutationObserver(send);
    observer.observe(root, { attributes: true, attributeFilter: ["lang"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme", "style"] });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    document.head.addEventListener("load", send, true);
    window.addEventListener("pagehide", () => {
      observer.disconnect();
      menu.dispose();
      probe.remove();
      document.head.removeEventListener("load", send, true);
    }, { once: true });
    send();
  };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/preload-app.ts
var product = {
  protocolVersion: 1,
  updates: {
    status: () => import_electron4.ipcRenderer.invoke(DESKTOP_IPC.updatesStatus),
    open: () => import_electron4.ipcRenderer.invoke(DESKTOP_IPC.updatesOpen),
    subscribe(listener) {
      const handle = (_event, state) => {
        listener(state);
      };
      import_electron4.ipcRenderer.on(DESKTOP_IPC.updatesPresentation, handle);
      return () => {
        import_electron4.ipcRenderer.off(DESKTOP_IPC.updatesPresentation, handle);
      };
    }
  }
};
if (location.protocol === `${SCHEME}:` && location.hostname === "app") {
  syncWindowsAppearance();
  import_electron4.contextBridge.exposeInMainWorld("__DSH_DIRECTORY_PICKER__", {
    pick: () => import_electron4.ipcRenderer.invoke(DESKTOP_IPC.directoryPick)
  });
  import_electron4.contextBridge.exposeInMainWorld("dshDesktopBoot", {
    ready: () => import_electron4.ipcRenderer.invoke(DESKTOP_IPC.boot),
    failed: (message) => import_electron4.ipcRenderer.invoke(DESKTOP_IPC.bootFailed, message)
  });
}
markDocumentPlatform();
syncNativeTheme();
import_electron4.contextBridge.exposeInMainWorld("dshDesktop", location.protocol === `${SCHEME}:` && location.hostname === "app" ? product : { protocolVersion: 1 });
//# sourceMappingURL=preload-app.cjs.map
