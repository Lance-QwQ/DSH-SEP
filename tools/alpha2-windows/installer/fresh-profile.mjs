import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {buildProfileSelection} from './daily-profile.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const save=async(path,value)=>{const bytes=JSON.stringify(value,null,2)+'\n';await writeFile(path,bytes,{flag:'wx',mode:0o600});return sha(bytes);};
// Public fresh-install defaults. This module never reads another instance's
// profile, credentials, budgets, sessions or workspace.
export async function createFreshProfile({destination,manifest}){
 const program=join(destination,'program'),home=join(destination,'home'),managed=join(destination,'managed');
 const project={id:randomUUID(),root:join(destination,'workspace')};
 const roots={sessions:join(home,'sessions'),memory:join(destination,'data/storage'),locks:join(destination,'state/locks'),backups:join(home,'file-recovery')};
 const budgetPath=join(destination,'state/budget/budget.json'),profileRoot=join(managed,'profile'),savedSourceRoot=join(home,'saved-cordis-sources');
 for(const path of [profileRoot,...Object.values(roots),dirname(budgetPath),savedSourceRoot,join(home,'profiles'),join(destination,'state/center/control'),join(destination,'state/electron'),join(destination,'state/user/temp'),join(destination,'state/user/roaming'),join(destination,'state/user/local'),join(project.root,'knowledge')])await mkdir(path,{recursive:true});
 const suite={projects:[{sources:['knowledge'],userProfile:'instance-user'}],memoryAutomation:{capture:false,recall:true,model:'deepseek-flash'},modules:{media:false},vision:{model:'deepseek-flash'},p1:{enabled:true,model:'deepseek-flash',budgetPath,limitCny:100,initialSpentCny:0,timeoutMs:60000,maxTokens:2048,standards:[],prework:true,profileLimits:{maxOutputTokens:32768,maxInputBytes:2000000}}};
 const patches=[
  {id:'fs-sandbox',config:{cwd:project.root,requireRecovery:true,recovery:{root:roots.backups,maxFileBytes:67108864,maxTotalBytes:1073741824,maxEntries:1000,retentionMs:2592000000}}},
  {id:'cordis-host-runner',config:{persistence:{root:savedSourceRoot,projectRoot:project.root,maxVersionBytes:1048576,maxTotalBytes:16777216,maxPlugins:32,maxVersions:16,maxPendingFiles:16}}},
  {id:'storage-json',config:{root:roots.memory}},
  {id:'session-persistence-jsonl',config:{root:roots.sessions,compression:'none'}},
  {id:'agent-default-model',config:{provider:'deepseek-official',model:'deepseek-flash'}}
 ];
 const converted=buildProfileSelection({programRoot:program,project,roots,budgetPath,savedSourceRoot,suite,patches});
 await save(join(profileRoot,'package.json'),{name:'dsh-sep-windows-alpha2-profile',private:true,type:'module',dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}});
 await writeFile(join(profileRoot,'cordis.yml'),'[]\n',{flag:'wx',mode:0o600});
 await save(join(profileRoot,'cordis.patch.yml'),converted.patches);
 await writeFile(join(home,'cordis.patch.yml'),'[]\n',{flag:'wx',mode:0o600});
 const bundleRoot=join(program,'node_modules/dsh-sep-bundle'),dailyAdapterRoot=join(program,'daily-adapter');
 const bindingPaths=[join(bundleRoot,'package.json'),...(await readdir(dailyAdapterRoot)).sort().map(name=>join(dailyAdapterRoot,name))];
 const bindings=[];for(const path of bindingPaths)bindings.push({path,sha256:sha(await readFile(path))});
 const selection={schema:2,dsh:manifest.hostVersion,sep:manifest.sepVersion,bundleRoot,dailyAdapterRoot,nativeCompactionEntryKey:converted.nativeEntryKey,configuration:{runtime:converted.runtime,ui:{enabled:true,requestTimeoutMs:120000}},bindings};
 const dailySelectionPath=join(managed,'daily-selection.json'),dailySelectionSha256=await save(dailySelectionPath,selection);
 const desktopPayloadPath=join(managed,'desktop-payload.json'),desktopPayloadSha256=await save(desktopPayloadPath,manifest.desktop);
 await writeFile(join(destination,'.env'),'# Configure locally in DSH SEP. Never redistribute this file.\nDEEPSEEK_API_KEY=\n',{flag:'wx',mode:0o600});
 const config={schema:1,kind:'dsh-sep-managed-daily',dailyRoot:destination,releaseRoot:program,graphHash:manifest.graph.sha256,nodeExecutable:join(destination,'runtime/node/node.exe'),home,storageRoot:roots.memory,controlRoot:join(destination,'state/center/control'),lockDirectory:roots.locks,electronUserData:join(destination,'state/electron'),runtimeUser:join(destination,'state/user'),credentialsPath:join(destination,'.env'),pnpmEntry:join(destination,'runtime/pnpm/bin/pnpm.cjs'),projects:[project],profileRoot,dailySelectionPath,dailySelectionSha256,desktopRuntimeRoot:join(destination,'runtime/desktop'),desktopPayloadPath,desktopPayloadSha256,runtimeDescriptorSha256:manifest.descriptor.sha256};
 const configPath=join(destination,'deployment-rc2.json');await save(configPath,config);
 await writeFile(join(destination,'launch.mjs'),"import {join,resolve} from 'node:path';\nimport {lstat,readFile} from 'node:fs/promises';\nimport {run} from './managed/bootstrap/launcher.mjs';\nconst root=import.meta.dirname,fail=()=>{throw Object.assign(Error('RELEASE_INSTALLATION_INCOMPLETE'),{code:'RELEASE_INSTALLATION_INCOMPLETE'});};\ntry{await lstat(join(root,'INSTALLING.json'));fail();}catch(error){if(error.code!=='ENOENT')throw error;}\ntry{const path=join(root,'installed.json'),s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>65536)fail();const receipt=JSON.parse(await readFile(path,'utf8'));if(receipt.status!=='pass'||resolve(receipt.installationRoot).toLowerCase()!==resolve(root).toLowerCase())fail();}catch{fail();}\nawait run(join(root,'deployment-rc2.json'));\n",{flag:'wx'});
 await writeFile(join(destination,'start.ps1'),"$ErrorActionPreference = 'Stop'\r\n& (Join-Path $PSScriptRoot 'runtime\\node\\node.exe') (Join-Path $PSScriptRoot 'launch.mjs')\r\nexit $LASTEXITCODE\r\n",{flag:'wx'});
 await writeFile(join(destination,'start.vbs'),'Set sh = CreateObject("WScript.Shell")\r\nSet fs = CreateObject("Scripting.FileSystemObject")\r\nroot = fs.GetParentFolderName(WScript.ScriptFullName)\r\nsh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & root & "\\start.ps1" & Chr(34), 0, False\r\n',{flag:'wx'});
 return {config,configPath,budgetPath,launcherPath:join(destination,'launch.mjs'),managedLauncherPath:join(managed,'bootstrap/launcher.mjs')};
}
