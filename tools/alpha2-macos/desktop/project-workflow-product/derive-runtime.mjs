// Build/test operator. These exact byte transformations never edit their inputs.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function deriveRuntime(){
 const outputs=[];
 async function derive(name,relative,pin,steps){let source=await readFile(new URL(relative,import.meta.url),'utf8');if(sha(source)!==pin)throw Error('SEP_PROJECT_PRODUCT_ORIGIN');const transforms=[];for(const [before,after,count=1]of steps){if(source.split(before).length-1!==count)throw Error('SEP_PROJECT_PRODUCT_ANCHOR '+name);const inputSha256=sha(source);source=source.split(before).join(after);transforms.push({before,after,count,inputSha256,resultSha256:sha(source)});}outputs.push({name,bytes:Buffer.from(source),origin:{source:relative,inputSha256:pin,resultSha256:sha(source),transforms}});}
 await derive('host-owner.mjs','../managed-broker/host-owner.mjs','23867edb41764a152922d7898e9bcb92b741bcdd6f2ac1b45e4fd9210588b21f',[
  ["import {fork} from 'node:child_process';","import {fork,ChildProcess} from 'node:child_process';import {checkBinding} from '../project-workflow-ui/rules.mjs';import {openProjectRelay} from './relay.mjs';"],
  ['input,env={},startDeadlineMs=40000','input,projectBinding,env={},startDeadlineMs=40000'],
  [' const serialized=JSON.stringify(input);',' const binding=checkBinding(projectBinding);let relay;\n const serialized=JSON.stringify(input);'],
  ["stdio:['ignore','pipe','pipe','ipc']","stdio:['ignore','pipe','pipe','ipc',process.platform==='win32'?'overlapped':'pipe']"],
  ["input:JSON.parse(serialized)}","input:JSON.parse(serialized),projectBinding:binding}"],
  ["closeReceipt=response.receipt;await bound(exited","closeReceipt=response.receipt;child.stdio[4].end();await bound(exited"],
  [' return Object.freeze({status,start,ready:',' function attachProjectDesktop(desktop){if(phase!==\'running\'||relay||!(desktop instanceof ChildProcess)||!Number.isSafeInteger(desktop.pid)||desktop.pid<1||desktop.exitCode!==null||desktop.signalCode!==null||!desktop.stdio[4])throw failure(\'SEP_PROJECT_UI_OWNER\');relay=openProjectRelay({hostPort:child.stdio[4],desktopPort:desktop.stdio[4],binding});return relay;}\n return Object.freeze({status,start,attachProjectDesktop,ready:'],
 ]);
 await derive('business-host.mjs','../managed-broker/business-host.mjs','a1712ce685020656e3994a4af9ea4e2f59eb0d7546032a9b58643e8d482345e5',[
  ["import {readFile,lstat,realpath}","import {Socket} from 'node:net';import {checkBinding} from '../project-workflow-ui/rules.mjs';\nimport {readFile,lstat,realpath}"],
  ['let initialized=false,opening','let projectPort;\nlet initialized=false,opening'],
  ['clearInterval(keepAlive);if(process.connected)process.disconnect();}return receipt;','projectPort?.end();clearInterval(keepAlive);if(process.connected)process.disconnect();}return receipt;'],
  ['try{return await openMacBusiness(input);}','try{const binding=checkBinding(message.projectBinding);projectPort=new Socket({fd:4,readable:true,writable:true});projectPort.on(\'error\',()=>{});return await openMacBusiness(input,{currentProject:{binding,port:projectPort}});}'],
  ['if(!runtime&&!cleanupOwner){clearInterval(keepAlive);','if(!runtime&&!cleanupOwner){projectPort?.end();clearInterval(keepAlive);'],
 ]);
 await derive('launch-full.mjs','../managed-broker/launch-full.mjs','13f021e4b19282028df9ff56475e69ce995f82c677964effc3d66f9fea8e6a7c',[
  ["from './program-manifest.mjs'","from '../managed-broker/program-manifest.mjs'"],
  ["from './desktop-rpc.mjs'","from '../managed-broker/desktop-rpc.mjs'"],
  ["from './launch-state.mjs'","from '../managed-broker/launch-state.mjs'"],
  ["if(control!==undefined)(await import('../product-control/launch-control.mjs')).assertLaunchControl(control);","if(control===undefined)fail('SEP_PROJECT_UI_CONTROL_REQUIRED');(await import('../product-control/launch-control.mjs')).assertLaunchControl(control);"],
  ['owner=createHostOwner({nodeExecutable:','const projectBinding={nonce:randomBytes(32).toString(\'hex\'),programSha256,ownerGeneration:generation};\n  owner=createHostOwner({projectBinding,nodeExecutable:'],
  ["stdio:control?['ignore','pipe','pipe','pipe']:['ignore','pipe','pipe']","stdio:['ignore','pipe','pipe','pipe','pipe']"],
  ['  if(control)control.attach(desktop);','  if(control)control.attach(desktop);\n  owner.attachProjectDesktop(desktop);'],
 ]);
 await derive('controller.mjs','../../bootstrap/controller.mjs','8147922ffe5a15b229ba1a052e452f378c82e886c41c7e68e4c849be48d36efd',[
  ["../desktop/managed-broker/launch-full.mjs","../desktop/project-workflow-product/launch-full.mjs"],
 ]);
 await derive('profile-plugin.mjs','../../business/profile-plugin.mjs','ca30b19aae277b4c6df650723002bc27558d78c266526a1c8445073c045937fc',[
  ["from '../profile/controlled-files.mjs'","from '../../profile/controlled-files.mjs'"],
  ["import {openGovernedMacManagedProject} from '../lifecycle/managed-project-lifecycle.mjs';","import {openWorkflowProject} from '../../project-workflow/project-factory.mjs';import {wrapManagedProject} from '../../project-workflow/derived-lifecycle.mjs';import {openHostBridge} from '../project-workflow-ui/host.mjs';"],
  ["from './host-modules.mjs'","from '../../business/host-modules.mjs'"],["from './readonly-files.mjs'","from '../../business/readonly-files.mjs'"],
  ['const project=await openProject(config);let profile;','const project=await openProject(config);let profile,uiBridge;'],
  ['service=Object.freeze({...controller,withView:','service=Object.freeze({...controller,async openCurrentProject(binding){if(uiBridge||!controller.status().admissionOpen)fail(\'SEP_PROJECT_UI_OWNER\');uiBridge=await openHostBridge({binding,source:config.source,controller,project});return uiBridge;},close(){uiBridge?.closeAdmission();return uiBridge?uiBridge.close():controller.close();},withView:'],
  ['ctx.effect(()=>()=>controller.close())','ctx.effect(()=>()=>service.close())'],
  ['const plugin=createProfilePlugin(input=>openGovernedMacManagedProject(input));','const plugin=createProfilePlugin(async input=>wrapManagedProject(await openWorkflowProject(input)));'],
 ]);
 // Reproduce the validated media/document standalone function first, then add
 // the private bridge. This prevents skipping a frozen intermediate lineage.
 const document=await import('../../document-business/standalone.mjs');
 const core=await readFile(new URL('../../business/standalone.mjs',import.meta.url),'utf8');
 let reproduced=core;
 for(const [a,b]of [
  ['const record=await initializeBusinessProfile(input),','await verifySettingsUi({hostRoot:input.hostRoot});\n const record=await initializeBusinessProfile(input),'],
  ["await ctx.workspaceRegistry.create(record.source,'DSH SEP macOS');","await ctx.workspaceRegistry.create(record.source,'DSH SEP macOS');\n  const settings=await assertSettingsMounted(ctx,{entryId:'mac-sep-settings',hostRoot:input.hostRoot});"],
  ['ready:{url:','ready:{settings,url:'],
  ["}catch(error){if(running){await running.ctx.get('sepMacRuntime')?.close();await running.ctx.get('sepMacProfile')?.close();await running.shutdown.shutdown(1);}throw error;}",'}catch(error){await cleanupFailedStartup(running,error);}'],
 ]){if(reproduced.split(a).length!==2)throw Error('SEP_PROJECT_PRODUCT_ANCHOR standalone lineage');reproduced=reproduced.replace(a,b);}
 reproduced=reproduced.replace("import('./host-modules.mjs')","import('"+new URL('../../business/host-modules.mjs',import.meta.url).href+"')");
 if(reproduced.slice(reproduced.indexOf('export async function')).replace(/^export /,'').trim()!==document.openMacBusiness.toString())throw Error('SEP_PROJECT_PRODUCT_ORIGIN standalone lineage');
 await derive('standalone.mjs','../../business/standalone.mjs','e4ad150db13d7cf173826923f2d047c61c8762ff959b403eeee73fe01e7911c6',[
  ['const record=await initializeBusinessProfile(input),','await verifySettingsUi({hostRoot:input.hostRoot});\n const record=await initializeBusinessProfile(input),'],
  ["await ctx.workspaceRegistry.create(record.source,'DSH SEP macOS');","await ctx.workspaceRegistry.create(record.source,'DSH SEP macOS');\n  const settings=await assertSettingsMounted(ctx,{entryId:'mac-sep-settings',hostRoot:input.hostRoot});"],
  ['ready:{url:','ready:{settings,url:'],
  ["}catch(error){if(running){await running.ctx.get('sepMacRuntime')?.close();await running.ctx.get('sepMacProfile')?.close();await running.shutdown.shutdown(1);}throw error;}",'}catch(error){await cleanupFailedStartup(running,error);}'],
  ["import {realpath,lstat,readFile}","import {checkBinding} from '../project-workflow-ui/rules.mjs';import {serveHost} from '../project-workflow-ui/transport.mjs';import {cleanupFailedStartup} from '../../document-business/startup-cleanup.mjs';import {verifySettingsUi} from '../../settings-ui/adapter.mjs';import {assertSettingsMounted} from '../../settings-ui/required.mjs';\nimport {realpath,lstat,readFile}"],
  ["import('./host-modules.mjs')","import('../../business/host-modules.mjs')"],
  ['export async function openMacBusiness(input){','export async function openMacBusiness(input,{currentProject}={}){\n if(!currentProject||typeof currentProject.port?.write!==\'function\'||typeof currentProject.port?.on!==\'function\')fail(\'SEP_PROJECT_UI_OWNER\');checkBinding(currentProject.binding);'],
  ["const settings=await assertSettingsMounted(ctx,{entryId:'mac-sep-settings',hostRoot:input.hostRoot});","const settings=await assertSettingsMounted(ctx,{entryId:'mac-sep-settings',hostRoot:input.hostRoot});\n  const projectBridge=await profile.openCurrentProject(currentProject.binding),projectServer=serveHost(currentProject.port,projectBridge,currentProject.binding);"],
  ['activeTasks:api.status().pending>0','activeTasks:projectBridge.inspectQuit().activeTasks||projectServer.status().pending>0||api.status().pending>0'],
  ['const close=()=>{if(terminal)','const close=()=>{projectServer.closeAdmission();if(terminal)'],
 ]);
 return outputs;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==3)throw Error('usage: derive-runtime freshOutputRoot');const root=resolve(process.argv[2]);await mkdir(root,{mode:0o700});const outputs=await deriveRuntime();for(const r of outputs)await writeFile(join(root,r.name),r.bytes,{flag:'wx'});await writeFile(join(root,'RUNTIME-ORIGIN.json'),JSON.stringify(outputs.map(({name,bytes,origin})=>({name,bytes:bytes.length,sha256:sha(bytes),origin})),null,2)+'\n',{flag:'wx'});}
