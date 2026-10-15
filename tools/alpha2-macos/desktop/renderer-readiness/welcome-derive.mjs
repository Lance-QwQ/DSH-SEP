import {createHash} from 'node:crypto';import {createWelcomePreloadBridge} from './welcome-preload.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** The main input is exactly the frozen r35 workspace derivation. Assemblers
 * must first deriveReadiness('main', capturedMain), preserving the ae32... root. */
export const WELCOME_INPUTS=Object.freeze({
 main:{file:'main.js',sha256:'2ac292bb9267394c1e4e8bff54d738a8c3e949c732536185c8570bc575220569'},
 preload:{file:'preload-welcome.cjs',sha256:'af3e3ca766d1b0e5453b4aaa647dd5100a446e63fbbd68952224b0507cd93e46'},
 script:{file:'welcome.js',sha256:'a1658ac72781717c21925c82c7d34955080fd2015f86b900a979b3117fef6ba9'},
 html:{file:'welcome.html',sha256:'02a6b02c152e6bd93d079597151ddc1d45b6ee349cbe83690af779467fdc9813'},
});
export function deriveWelcome(kind,bytes){
 if(!Object.hasOwn(WELCOME_INPUTS,kind)||sha(bytes)!==WELCOME_INPUTS[kind].sha256)throw Error('SEP_MAC_WELCOME_ORIGIN');
 let source=bytes.toString('utf8');const changes=[];
 function change(from,to,label){if(source.split(from).length!==2)throw Error('SEP_MAC_WELCOME_ANCHOR');source=source.replace(from,to);changes.push({label,from,to,count:1});}
 if(kind==='main'){
  change('import {createRendererReadinessGate} from "./sep-renderer-readiness.mjs";','import {createRendererReadinessGate} from "./sep-renderer-readiness.mjs";\nimport {createWelcomeReadinessGate} from "./sep-welcome-readiness.mjs";\nimport {pathToFileURL as sepWelcomeFileURL} from "node:url";','extend the exact r35 workspace main, retaining its independent gate');
  change('var disposeActiveHandlers;\nasync function openWelcomeWindow','var disposeActiveHandlers;\nvar sepWelcomeReadinessByWindow = new WeakMap();\nasync function openWelcomeWindow','keep welcome proofs in private window ownership map');
  change('  let active = true;\n  const disposeHandlers = () => {','  let active = true;\n  const sepWelcomeReadiness = createWelcomeReadinessGate({window,expectedUrl:sepWelcomeFileURL(join8(app2.getAppPath(), "renderer", "welcome.html")).href,isClosing:()=>!active||operations.isClosing?.()===true,onReady:operations.onReady});\n  sepWelcomeReadinessByWindow.set(window, sepWelcomeReadiness);\n  const disposeHandlers = () => {','bind fixed file URL and exact owned window before navigation');
  change('    active = false;\n    for (const channel of [','    active = false;\n    sepWelcomeReadiness.fail();\n    for (const channel of [\n      "sep:welcome-begin",\n      "sep:welcome-committed",\n      "sep:welcome-failed",','dispose welcome proof and its private channels with original handlers');
  change('  ipcMain2.handle(WELCOME_IPC.analyticsEnabled, (event) => {','  ipcMain2.handle("sep:welcome-begin", (event) => {assertSender(event);return sepWelcomeReadiness.begin(event);});\n  ipcMain2.handle("sep:welcome-committed", (event, message) => {assertSender(event);return sepWelcomeReadiness.accept(event, message);});\n  ipcMain2.handle("sep:welcome-failed", (event, message) => {assertSender(event);return sepWelcomeReadiness.bridgeFailed(event, message);});\n  ipcMain2.handle(WELCOME_IPC.analyticsEnabled, (event) => {','receive fixed-shape welcome proof without exposing account data');
  change('  window.once("closed", disposeHandlers);\n  window.webContents.setWindowOpenHandler','  window.once("closed", disposeHandlers);\n  window.webContents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {if(mainFrame&&!inPlace)sepWelcomeReadiness.navigation();});\n  window.webContents.on("preload-error", () => sepWelcomeReadiness.fail());\n  window.webContents.on("render-process-gone", () => sepWelcomeReadiness.fail());\n  window.webContents.on("did-fail-load", (_event, code, _description, _url, mainFrame) => {if(mainFrame&&code!==-3)sepWelcomeReadiness.fail();});\n  window.webContents.setWindowOpenHandler','revoke on document replacement or load/preload/renderer failure');
  change('    await window.loadFile(join8(app2.getAppPath(), "renderer", "welcome.html"));','    await sepWelcomeReadiness.waitForReady(window.loadFile(join8(app2.getAppPath(), "renderer", "welcome.html")));','bound combined navigation and fixed script proof before showing welcome');
  change('      welcomeWindow.focus();\n      return Promise.resolve();','      welcomeWindow.focus();\n      sepWelcomeReadinessByWindow.get(welcomeWindow)?.windowShown();\n      return Promise.resolve();','existing welcome can retain only current validated proof');
  change('      welcomeWindow = await openWelcomeWindow(locale, {\n        analytics: track,','      welcomeWindow = await openWelcomeWindow(locale, {\n        isClosing:()=>isQuitting()||recovery.active||enteredWorkspace,\n        analytics: track,','preserve outer closing and workspace transition ownership');
  change('      if (isQuitting() || recovery.active || enteredWorkspace) window2.close();\n      else mainWindow?.hide();','      if (isQuitting() || recovery.active || enteredWorkspace) window2.close();\n      else {\n        mainWindow?.hide();\n        sepWelcomeReadinessByWindow.get(window2)?.windowShown();\n      }','publish welcome surface only after outer assignment and closing checks');
 }else if(kind==='preload'){
  change('import_electron.contextBridge.exposeInMainWorld("dshWelcome", api);','const sepWelcomeBridge = ('+createWelcomePreloadBridge.toString()+')({\n  begin:()=>import_electron.ipcRenderer.invoke("sep:welcome-begin"),\n  committed:message=>import_electron.ipcRenderer.invoke("sep:welcome-committed",message),\n  failed:message=>import_electron.ipcRenderer.invoke("sep:welcome-failed",message)\n});\nimport_electron.contextBridge.exposeInMainWorld("dshWelcome", {...api,...sepWelcomeBridge});','inline welcome dual latch in isolated preload without local require');
 }else if(kind==='script'){
  change('        showAccount(state);\n      });\n      return () => {','        showAccount(state);\n      });\n      api.bindingsReady();\n      return () => {','prove synchronous account subscription installation without awaiting remote notice');
  change('    root.unmount();\n  }, { once: true });\n})();','    root.unmount();\n  }, { once: true });\n  window.dshWelcome.scriptComplete();\n})();','prove successful flushSync and final cleanup registration');
 }
 const result=Buffer.from(source);return{bytes:result,origin:{schema:1,kind,scope:'independent welcome readiness candidate; actual Electron welcome not run',sourceSha256:sha(bytes),resultSha256:sha(result),changes}};
}
