import {frozen,transform} from '../../../document-business/derive.mjs';
export const filename=new URL('../../../business/runtime.mjs',import.meta.url);
export const originalCore=await frozen(filename,'8148341384289ea23050112e70355dd26a52741c45ce7b715d3699ccbbf09409');
export function derivePendingRuntime(source,{document=false}={}){
 return transform(source,[
  {before:"import {createSnapshotScope} from './snapshot-scope.mjs';",after:"import {createSnapshotScope} from '../desktop/project-workflow-product/pending-startup/snapshot-scope.mjs';"},
  {before:document?"import {createSettingsConsumers,businessConfig} from '../document-business/consumers.mjs';":"import {createSettingsConsumers,businessConfig} from './consumers.mjs';",after:document?"import {createSettingsConsumers,businessConfig} from '../desktop/project-workflow-product/pending-startup/consumers.mjs';":"import {createCoreSettingsConsumers as createSettingsConsumers,businessConfig} from '../desktop/project-workflow-product/pending-startup/consumers.mjs';"},
  {before:'const config=schema.parse(input);',after:"const config=schema.parse(input);if(config.business.sources.length!==1||config.business.sources[0]!=='.')fail('SEP_PENDING_SCOPE_CONFIG');"},
  {before:'local=new AsyncLocalStorage(),abort=',after:'local=new AsyncLocalStorage(),metadata=new AsyncLocalStorage(),abort='},
  {before:' const accept=()=>',after:" const bodyAvailable=()=>{available();if(carrier.status().needsSelection)fail('SEP_MAC_RESTART_REVIEW_REQUIRED');};\n const metadataEnter=()=>{available();return accept();};\n const metadataAccess=work=>metadata.run(true,()=>storage.withAccess(work));\n const accept=()=>"},
  {before:'const enter=()=>{available();return accept();};',after:'const enter=()=>{bodyAvailable();return accept();};'},
  {before:'const access=work=>local.getStore()?storage.withAccess(work):',after:"const access=work=>metadata.getStore()===true||phase==='preparing'||local.getStore()?storage.withAccess(work):"},
  {before:'JSON.stringify({phase,status:',after:"JSON.stringify({phase,reviewRequired:carrier.status().needsSelection,bodyAdmissionOpen:phase==='active'&&!carrier.status().needsSelection,status:"},
  {before:document?'available();if(attachmentSelection)await attachmentSelection.validate();yield* next(options);':'available();yield* next(options);',after:document?'bodyAvailable();if(attachmentSelection)await attachmentSelection.validate();yield* next(options);':'bodyAvailable();yield* next(options);'},
  {before:'await carrier.withView(view=>local.run(view,async()=>{scope=await createSnapshotScope({source:config.source,sources:config.business.sources,userProfile:config.business.userProfile,workingDirectory:ctx.workingDirectory,view:async()=>local.getStore()??await carrier.withView(v=>v)});}));',after:'scope=await createSnapshotScope({source:config.source,sources:config.business.sources,userProfile:config.business.userProfile,workingDirectory:ctx.workingDirectory,startupIdentity:()=>carrier.startupIdentity(),view:async()=>local.getStore()??await carrier.withView(v=>v)});'},
  {before:'documentDescription});',after:'documentDescription,metadataEnter,metadataAccess});'},
  {before:'view=await carrier.withView(v=>v);return createHash',after:'view=await carrier.startupIdentity();return createHash'},
  {before:'view:view.version,business:',after:'view:view.version,selection:view,business:'},
  {before:'stream:options=>{available();return ctx.llm.stream',after:'stream:options=>{bodyAvailable();return ctx.llm.stream'},
 ]);
}
