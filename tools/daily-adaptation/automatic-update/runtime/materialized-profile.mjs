import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {rebaseProgram,copyProfile} from './prepare-profile.mjs';
import {fileHash,jsonFile} from './update-inventory.mjs';
import {profileContextIdentity} from './update-profile.mjs';
import {buildDailyLauncher} from './alpha1-launcher-build.mjs';
const demand=(v,c)=>{if(!v)throw Error(c);};
export function materializedContext(c){return profileContextIdentity({home:c.home,profileRoot:c.profileRoot,installAnchor:join(c.releaseRoot,'node_modules/@deepseek-ai/dsh/package.json'),overlayFiles:[join(c.releaseRoot,'node_modules/@deepseek-ai/dsh-desktop-host/lib/sep-policy.json')]});}
export async function prepareCandidateProfile({installation,prepared,signal}){
 const graph=await jsonFile(join(prepared.root,'graph.json'));
 if(graph.schema!==3)return copyProfile({currentRoot:installation.releaseRoot,targetRoot:prepared.root,graph,signal});
 const c=installation,base=c.releaseRoot,target=prepared.root;demand(c.profileRoot&&c.dailySelectionPath,'SEP_MATERIALIZED_PROFILE_REQUIRED');
 const beforeSelection=await fileHash(c.dailySelectionPath);demand(beforeSelection===c.dailySelectionSha256,'SEP_DAILY_SELECTION_CHANGED');
 const selection=await jsonFile(c.dailySelectionPath);demand(selection.schema===2&&selection.dsh==='0.2.1-alpha.1','SEP_MATERIALIZED_SELECTION');
 for(const b of selection.bindings)demand(await fileHash(b.path)===b.sha256,'SEP_DAILY_PROGRAM_CHANGED');
 const root=join(prepared.workRoot,'profile');await mkdir(root);const copied=[];
 for(const name of await readdir(c.profileRoot)){
  signal?.throwIfAborted();demand(['package.json','cordis.yml','cordis.patch.yml','compatibility.json'].includes(name),'SEP_MATERIALIZED_PROFILE_UNSUPPORTED');
  const path=join(c.profileRoot,name),hash=await fileHash(path),text=await readFile(path,'utf8');let value;
  // Current alpha.1 daily profiles are inert JSON even with .yml suffix.
  try{value=JSON.parse(text);}catch{throw Error('SEP_PROFILE_FORMAT_UNSUPPORTED');}
  const rebased=rebaseProgram(value,base,target),bytes=JSON.stringify(value)===JSON.stringify(rebased)?text:JSON.stringify(rebased,null,2)+'\n';await writeFile(join(root,name),bytes,{flag:'wx',mode:0o600});
  demand(await fileHash(path)===hash,'SEP_PROFILE_CHANGED');copied.push({path,sha256:hash});
 }
 demand(copied.some(r=>r.path===join(c.profileRoot,'package.json')),'SEP_PROFILE_MANIFEST_REQUIRED');
 const next=rebaseProgram(selection,base,target),manifest=await jsonFile(join(target,'node_modules/dsh-sep-bundle/package.json'));next.sep=manifest.version;
 for(const b of next.bindings)b.sha256=await fileHash(b.path);
 demand(await fileHash(c.dailySelectionPath)===beforeSelection,'SEP_DAILY_SELECTION_CHANGED');
 const selectionPath=join(prepared.workRoot,'daily-selection.json');await writeFile(selectionPath,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600});
 prepared.profileRoot=root;prepared.selectionPath=selectionPath;prepared.profileSourceBindings=[...copied,{path:c.dailySelectionPath,sha256:beforeSelection}];
 return {copied,selectionPath,profileRoot:root};
}
export async function createMaterializedLaunch({installation,prepared,out}){
 await buildDailyLauncher({sourceRoot:join(import.meta.dirname,'runtime/launcher'),out,graphHash:prepared.graphHash,adapterSource:join(import.meta.dirname,'runtime/alpha1-support')});
 const config={...installation,releaseRoot:prepared.root,graphHash:prepared.graphHash,profileRoot:prepared.profileRoot,dailySelectionPath:prepared.selectionPath,dailySelectionSha256:await fileHash(prepared.selectionPath),runtimeDescriptorSha256:await fileHash(join(prepared.root,'desktop-runtime.json'))};
 return {config,launcherRoot:out};
}
