import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex');
export const overlayHashes={
 'lib/main.js':'7b73e57d9f520b76a9dc149bbb08d7e7f3dbaaeb9f961809d3217f546efec357',
 'lib/sep-update/update-desktop.mjs':'8476632f8533b443fadc675b8d8a57b68878f20c5db254e4561da15b22e41047',
};
export function deriveManagedOverlay(path,bytes){
 if(!Object.hasOwn(overlayHashes,path))throw Error('SEP_MAC_OVERLAY_PATH');
 if(hash(bytes)!==overlayHashes[path])throw Error('SEP_MAC_OVERLAY_ORIGIN');
 let source=bytes.toString('utf8');const changes=[];
 const change=(from,to,label)=>{if(source.split(from).length!==2)throw Error('SEP_MAC_OVERLAY_ANCHOR');source=source.replace(from,to);changes.push({label,from,to,count:1});};
 if(path==='lib/main.js'){
  change('import { createManagedUpdater } from "./sep-update/update-desktop.mjs";', 'import { createManagedUpdater } from "./sep-update/update-desktop.mjs";\nimport {requireManagedInvocation,configureManagedIdentity} from "./sep-mac-entry.mjs";\nconst sepManagedInvocation=requireManagedInvocation(process.argv,process.env);','require controlled invocation before desktop initialization');
  change('app6.setAppLogsPath();','configureManagedIdentity(app6,sepManagedInvocation);','independent data home and Electron identity');
  change('const managed = connectionFile === void 0 ? void 0 : await readManagedDesktopConnection(connectionFile);','const managed = await readManagedDesktopConnection(sepManagedInvocation.connectionFile);','never fall back to an unmanaged Host');
  change('managed === void 0 ? void 0 : () => false,','() => false,','native updater always disabled');
  change('const policyConfig = managed === void 0 ? resolveDesktopPolicyConfig(policyInput, !app6.isPackaged) : void 0;','const policyConfig = void 0;','official mandatory update authority disabled');
  change('app6.setAsDefaultProtocolClient("dsh")','app6.setAsDefaultProtocolClient("dsh-sep")','separate external deep-link registration');
  change('url === "dsh://open" || url === "dsh://open/"','url === "dsh-sep://open" || url === "dsh-sep://open/"','separate external deep-link activation');
 }else{
  change("import {readInstalledSepVersion} from './installed-sep-version.mjs';", "import {readInstalledSepVersion} from './installed-sep-version.mjs';\nimport {macInstallUnavailable} from '../sep-mac-update-admission.mjs';",'explicit Mac installation capability gate');
  change('prepareSep=queuePreparation','prepareSep=macInstallUnavailable','block preparation default');
  change(" const directory=join(app.getPath('userData'),'sep-updates');"," prepareSep=macInstallUnavailable;\n const directory=join(app.getPath('userData'),'sep-updates');",'caller cannot override unavailable platform preparation');
  change('async function reviewAndQueue(release,signal){if(!active(signal))return;','async function reviewAndQueue(release,signal){if(!active(signal))return;macInstallUnavailable();','block DSH and SEP publication before mutation');
  change('async function startWorker(id){','async function startWorker(id){macInstallUnavailable();','block worker spawn including old queued requests');
  change("async open(){await recoverQueued();await resumePreparation(directory).catch(async e=>{await save('preparation-resume-result.json',{status:'blocked',code:String(e.code??e.message).slice(0,160)});});await clock.open();return sepClock.open();}","async open(){await save('mac-update-scope.json',{status:'blocked',code:'SEP_MAC_UPDATE_INSTALL_NOT_INTEGRATED',checksAvailable:true});await clock.open();return sepClock.open();}",'never resume incompatible publication state');
 }
 const result=Buffer.from(source);return {bytes:result,origin:{schema:1,path,sourceSha256:hash(bytes),resultSha256:hash(result),sourceKind:'captured Alpha.2 R6 JavaScript, no GTK transformation',changes}};
}
