import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createPreloadApi} from '../project-workflow-ui/electron-adapter.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),pins=JSON.parse(await readFile(new URL('./BASELINE.json',import.meta.url),'utf8'));
export function deriveProjectAsar(kind,bytes){
 if(!['main','preload'].includes(kind)||sha(bytes)!==pins.entries[kind].sha256)throw Error('SEP_PROJECT_PRODUCT_ORIGIN');
 let source=bytes.toString('utf8');const transforms=[];
 const change=(from,to)=>{if(source.split(from).length!==2)throw Error('SEP_PROJECT_PRODUCT_ANCHOR');const inputSha256=sha(source);source=source.replace(from,to);transforms.push({from,to,count:1,inputSha256,resultSha256:sha(source)});};
 if(kind==='preload'){
  change('markDocumentPlatform();',`if (location.protocol === "dsh-app:" && location.hostname === "app" && process.isMainFrame) {
  const prefix = 'sep-current-project:';
  const fail = code => { throw Object.assign(Error(code), {code}); };
  const api = (${createPreloadApi.toString()})(import_electron7.ipcRenderer);
  import_electron7.contextBridge.exposeInMainWorld('sepCurrentProject', api);
}
markDocumentPlatform();`);
 }else{
  change('  let sepProductControl;','  let sepProductControl;\n  let sepCurrentProject;');
  change('import {createRendererReadinessGate} from "./sep-renderer-readiness.mjs";','import {createRendererReadinessGate} from "./sep-renderer-readiness.mjs";\nimport {openCurrentProjectEndpoint} from "./project-workflow-product/endpoint.mjs";');
  change('    inspect: () => backend.host?.inspectQuit(),','    inspect: async () => {const value=await backend.host?.inspectQuit();if(!value)throw Error("SEP_PROJECT_UI_INSPECTION_UNKNOWN");return {...value,activeTasks:value.activeTasks||sepCurrentProject?.inspectQuit().activeTasks===true};},');
  change('  const finishQuit = () => {\n    quitting = true;','  const finishQuit = () => {\n    sepCurrentProject?.closeAdmission();\n    quitting = true;');
  change('  mainWindow = createMainWindow();','  sepCurrentProject = await openCurrentProjectEndpoint({getWindow:currentMainWindow,onFailure:()=>reportFatal(new Error("SEP_PROJECT_UI_CHANNEL"),"current-project")});\n  mainWindow = createMainWindow();\n  sepCurrentProject.attachWindow(mainWindow);');
  // createMainWindow is also used on macOS after the old window was destroyed.
  change('    mainWindow = window2;\n    window2.webContents.on("did-start-navigation"','    mainWindow = window2;\n    sepCurrentProject?.attachWindow(window2);\n    window2.webContents.on("did-start-navigation"');
 }
 return {bytes:Buffer.from(source),origin:{schema:1,kind,inputSha256:sha(bytes),resultSha256:sha(source),transforms}};
}
