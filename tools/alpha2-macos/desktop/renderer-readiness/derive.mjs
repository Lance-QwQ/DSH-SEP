import {createHash} from 'node:crypto';
import {createPreloadReadinessBridge} from './preload-bridge.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const SOURCE_INPUTS=Object.freeze({
 main:{file:'main.js',sha256:'ae32d9e028479fdc0268463292ce0cde01dfe887c96fa67fcb46ade7a0e3ef6c'},
 preload:{file:'preload.cjs',sha256:'8d5a4517dd628d072653e33e93413bec34a1a3648a15bf262cf9d0c339ae05ba'},
 frontend:{file:'frontend.js',sha256:'1819a4e82b0d929b43ef88ef1ec899b419ae1a5f479fc4c0df5f0af4196f8d1c'},
 'ui-renderer':{file:'ui-renderer.js',sha256:'e40ba7ee84a5d93f5f0894bab866a76bc0879ee6631d5d8c17269696754e3c4b'},
});
/** Independent candidate only. The caller must separately bind the actual
 * ASAR frontend, rebuild ASAR integrity, sign, and update PROGRAM/inventory. */
export function deriveReadiness(kind,bytes){
 if(!Object.hasOwn(SOURCE_INPUTS,kind)||sha(bytes)!==SOURCE_INPUTS[kind].sha256)throw Error('SEP_MAC_READINESS_ORIGIN');
 let source=bytes.toString('utf8');const changes=[];
 function change(from,to,label){if(source.split(from).length!==2)throw Error('SEP_MAC_READINESS_ANCHOR');source=source.replace(from,to);changes.push({label,from,to,count:1});}
 if(kind==='main'){
  change('const sepManagedInvocation=requireManagedInvocation(process.argv,process.env);','const sepManagedInvocation=requireManagedInvocation(process.argv,process.env);\nimport {createRendererReadinessGate} from "./sep-renderer-readiness.mjs";','import fixed local readiness gate');
  change('  let navigation;\n  const navigateMain = (url) => {','  const sepRendererReadiness = createRendererReadinessGate({getWindow:()=>mainWindow,isClosing:()=>isQuitting()||recovery.active});\n  let navigation;\n  const navigateMain = (url) => {','keep readiness inside existing owned window closure');
  change('    return { injections, streamBaseUrl: new URL(hostUrl).origin };','    assertProductSender(event);\n    const sepRendererNonce = sepRendererReadiness.begin(event);\n    return { injections, streamBaseUrl: new URL(hostUrl).origin, sepRendererNonce };','issue nonce only to current owned primary document');
  change('  ipcMain6.handle(DESKTOP_IPC.bootFailed, (event, message) => {','  ipcMain6.handle("sep:renderer-committed", (event, message) => {\n    assertProductSender(event);\n    return sepRendererReadiness.accept(event, message);\n  });\n  ipcMain6.handle(DESKTOP_IPC.bootFailed, (event, message) => {','receive exact committed document proof');
  change('    if (typeof message !== "string") throw new Error("dsh desktop: startup failure must be text");\n    reportFatal(new Error(message), "web-boot");','    if (typeof message !== "string") throw new Error("dsh desktop: startup failure must be text");\n    sepRendererReadiness.invalidate(mainWindow, "failure");\n    reportFatal(new Error(message), "web-boot");','revoke current document without replacing the original failure handler');
  change('    mainWindow = window2;\n    browserGuests.bind','    mainWindow = window2;\n    window2.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {\n      if (isMainFrame && !isInPlace) sepRendererReadiness.invalidate(window2, "navigation");\n    });\n    browserGuests.bind','navigation revokes prior document nonce');
  change('      if (mainWindow === window2) mainWindow = void 0;','      sepRendererReadiness.invalidate(window2, "failure");\n      if (mainWindow === window2) mainWindow = void 0;','closed window cannot retain readiness');
  change('      if (isMainFrame && code !== -3 && !quitting && !window2.isDestroyed()) {\n        reportFatal','      if (isMainFrame && code !== -3 && !quitting && !window2.isDestroyed()) {\n        sepRendererReadiness.invalidate(window2, "failure");\n        reportFatal','main load failure revokes readiness');
  change('    window2.webContents.on("preload-error", (_event, _path, error) => {\n      if','    window2.webContents.on("preload-error", (_event, _path, error) => {\n      sepRendererReadiness.invalidate(window2, "failure");\n      if','preload failure revokes readiness');
  change('    window2.webContents.on("render-process-gone", (_event, details) => {\n      navigation','    window2.webContents.on("render-process-gone", (_event, details) => {\n      sepRendererReadiness.invalidate(window2, "failure");\n      navigation','renderer exit revokes readiness');
  change('    enteredWorkspace = true;\n    if (welcomeWindow','    enteredWorkspace = true;\n    sepRendererReadiness.windowShown(window2);\n    if (welcomeWindow','combine successful visible workspace with document commit');
 }else if(kind==='preload'){
  const from='  import_electron7.contextBridge.exposeInMainWorld("dshDesktopBoot", {\n    ready: () => import_electron7.ipcRenderer.invoke(DESKTOP_IPC.boot),\n    failed: (message) => import_electron7.ipcRenderer.invoke(DESKTOP_IPC.bootFailed, message)\n  });';
  change(from,'  const sepRendererBridge = ('+createPreloadReadinessBridge.toString()+')({\n    boot:()=>import_electron7.ipcRenderer.invoke(DESKTOP_IPC.boot),\n    failed:(message)=>import_electron7.ipcRenderer.invoke(DESKTOP_IPC.bootFailed,message),\n    mounted:(message)=>import_electron7.ipcRenderer.invoke("sep:renderer-committed",message)\n  });\n  import_electron7.contextBridge.exposeInMainWorld("dshDesktopBoot", sepRendererBridge);','inline document-scoped dual latch without sandboxed local require');
 }else if(kind==='frontend'){
  change('await mM(u,this.container)}catch(n)','await mM(u,this.container);globalThis.dshDesktopBoot.applicationBooted()}catch(n)','report loader-complete only inside successful boot path');
 }else{
  change('\t\tfunction apply(ctx) {\n\t\t\tnew SlotRegistry(ctx).install(createSlotRenderer());','\t\tfunction SepCommittedApplication(props) {\n\t\t\t(0, react.useLayoutEffect)(() => {\n\t\t\t\tconst bridge = globalThis.dshDesktopBoot;\n\t\t\t\tif (typeof bridge?.applicationCommitted === "function") bridge.applicationCommitted();\n\t\t\t}, []);\n\t\t\treturn props.app();\n\t\t}\n\t\tfunction apply(ctx) {\n\t\t\tnew SlotRegistry(ctx).install(createSlotRenderer());','stable root wrapper reports desktop commit while preserving ordinary browsers');
  change('\t\t\t\tconst root = mountApp(container, buildRenderApp({ ctx }));','\t\t\t\tconst app = buildRenderApp({ ctx });\n\t\t\t\tconst root = mountApp(container, () => (0, react.createElement)(SepCommittedApplication, {app}));','preserve BootHandoff hooks and original provider subtree');
 }
 const result=Buffer.from(source);return {bytes:result,origin:{schema:1,kind,scope:'independent candidate; actual Electron integration not run',sourceSha256:sha(bytes),resultSha256:sha(result),changes}};
}
