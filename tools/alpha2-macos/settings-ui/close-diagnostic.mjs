// Diagnostic variant only: exact public r28 client, no release/product repair.
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';import {createHash} from 'node:crypto';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {inventoryPackage,verifyPackage} from '../package/package-inventory.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),sourcePin='1a2ef0d71656473fa3aafcc7281de681423a10b218be782f06e93bf4d8d4435e',target='payload/host/node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js',programPin='22457aa1dbc3e9e5f0a0e54907885ba2707b1f5deb6078c8d5c487925d6759de';
export function recordClose(reason,state={}){
 try{if(!['store-close','onboarding-appeared','explicit-onboarding','modal-layer','mask','header','section','root-mounted','root-unmounted'].includes(reason))return;const key='__sepSettingsCloseReasons',data=globalThis[key]??={rows:[],total:0};data.total++;const selected={};for(const k of ['open','appeared','onboardingActive','stepPresent'])if(typeof state[k]==='boolean')selected[k]=state[k];data.rows.push({sequence:data.total,atMs:Math.round(performance.now()),timeOrigin:performance.timeOrigin,reason,state:selected});if(data.rows.length>128)data.rows.shift();}catch{}
}
const diagnosticCallbacks=new WeakMap();
export function diagnosticWrapper(reason,callback){let kinds=diagnosticCallbacks.get(callback);if(!kinds){kinds=new Map();diagnosticCallbacks.set(callback,kinds);}if(!kinds.has(reason))kinds.set(reason,function(...args){recordClose(reason);return Reflect.apply(callback,this,args);});return kinds.get(reason);}
export function deriveCloseDiagnostic(source){
 if(sha(source)!==sourcePin)throw Object.assign(Error('SETTINGS_DIAGNOSTIC_SOURCE_CHANGED'),{code:'SETTINGS_DIAGNOSTIC_SOURCE_CHANGED'});
 const transforms=[],replace=(id,before,after)=>{assert.equal(source.split(before).length,2,'unique '+id);source=source.replace(before,after);transforms.push({id,before,after});};
 replace('bounded-logger','factory: (require) => {','factory: (require) => {\n'+recordClose.toString()+'\nconst diagnosticCallbacks=new WeakMap();\n'+diagnosticWrapper.toString());
 replace('store-close','close: (d) => {\n\t\t\t\t\t\td.open = false;','close: (d) => {\n\t\t\t\t\t\trecordClose("store-close",{open:!!d.open});\n\t\t\t\t\t\td.open = false;');
 replace('onboarding-appeared','if (appeared && open) close();','if (appeared && open) { recordClose("onboarding-appeared",{appeared,open,onboardingActive,stepPresent:onboardingStep!==void 0}); close(); }');
 replace('explicit-onboarding','openOnboarding: (id) => {\n\t\t\t\t\t\t\t\tclose();','openOnboarding: (id) => {\n\t\t\t\t\t\t\t\trecordClose("explicit-onboarding",{open});\n\t\t\t\t\t\t\t\tclose();');
 replace('modal-layer','(panel, true, onClose);','(panel, true, diagnosticWrapper("modal-layer",onClose));');
 replace('mask','"aria-hidden": "true",\n\t\t\t\t\tonClick: onClose','"aria-hidden": "true",\n\t\t\t\t\tonClick: diagnosticWrapper("mask",onClose)');
 replace('header','className: SettingsRoot_module_css_default.close,\n\t\t\t\t\t\t\t\tonClick: onClose,','className: SettingsRoot_module_css_default.close,\n\t\t\t\t\t\t\t\tonClick: diagnosticWrapper("header",onClose),');
 replace('section','renderSlot("settings.section", { close: onClose }, { only: active })','renderSlot("settings.section", { close: diagnosticWrapper("section",onClose) }, { only: active })');
 replace('root-lifecycle','function SettingsRoot(props) {','function SettingsRoot(props) {\n(0, react.useEffect)(()=>{recordClose("root-mounted");return ()=>recordClose("root-unmounted");},[]);');
 return {code:source,sourceSha256:sourcePin,resultSha256:sha(source),transforms};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 assert.equal(process.platform,'darwin');const [rootArg,inventoryArg,outArg]=process.argv.slice(2),root=await realpath(rootArg),out=resolve(outArg),temp=await realpath(process.env.RUNNER_TEMP);assert(root.startsWith(temp+'/')&&out.startsWith(temp+'/')&&!out.startsWith(root+'/'));await mkdir(out,{mode:0o700});
 const original=JSON.parse(await readFile(inventoryArg,'utf8'));await verifyPackage(root,original);assert.equal(sha(await readFile(join(root,'PROGRAM.json'))),programPin);const source=await readFile(join(root,target),'utf8'),derived=deriveCloseDiagnostic(source);await writeFile(join(root,target),derived.code);
 const actual=await inventoryPackage(root);assert.equal(actual.entries.length,original.entries.length);const changes=actual.entries.flatMap((e,i)=>JSON.stringify(e)===JSON.stringify(original.entries[i])?[]:[{before:original.entries[i],after:e}]);assert.equal(changes.length,1);assert.equal(changes[0].after.path,target);assert.equal(changes[0].before.sha256,sourcePin);assert.equal(changes[0].after.sha256,derived.resultSha256);assert.equal(sha(await readFile(join(root,'PROGRAM.json'))),programPin);
 await writeFile(join(out,'SOURCE.json'),JSON.stringify({schema:1,scope:'single-client diagnostic variant; not unchanged r28 product',target,sourceSha256:sourcePin,resultSha256:derived.resultSha256,transforms:derived.transforms},null,2)+'\n',{flag:'wx'});
 await writeFile(join(out,'RESULT.json'),JSON.stringify({schema:1,status:'pass',scope:'diagnostic derivation only',originalTreeSha256:original.treeSha256,diagnosticTreeSha256:actual.treeSha256,changedFiles:changes,unchangedEntries:actual.entries.length-1,program:{sha256:programPin,unchanged:true,clientNotAnEntry:true,explanation:'PROGRAM binds seven executable/manifest entries and host directory location; package inventory independently binds client bytes.'},caveat:'Logging forwards each close exactly once; wrappers are stable per original function and reason, but instrumentation may affect timing. A non-reproduction is not a fix.'},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:'pass',diagnosticVariant:true,changedFiles:1,resultSha256:derived.resultSha256,treeSha256:actual.treeSha256}));
}
