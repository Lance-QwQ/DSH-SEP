import {mkdir,readdir,readFile,writeFile,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Copy the existing process-owned startup/recovery launcher, then bind this
 * generation to its exact graph and cold selection. Does not start anything. */
export async function buildDailyLauncher({sourceRoot,out,graphHash,adapterSource}){
 if(!/^[a-f0-9]{64}$/.test(graphHash))throw Error('DAILY_GRAPH_HASH');
 await mkdir(out);const origins=[];
 for(const name of await readdir(sourceRoot)){
  if(!name.endsWith('.mjs'))continue;const source=join(sourceRoot,name),input=await readFile(source,'utf8');let result=input;const transforms=[];
  const replace=(from,to,all=false)=>{const count=result.split(from).length-1;if(!count||!all&&count!==1)throw Error('DAILY_LAUNCHER_ORIGIN: '+name+' '+from);result=all?result.replaceAll(from,to):result.replace(from,to);transforms.push({from,to,all,count});};
  if(result.includes('\r\n'))replace('\r\n','\n',true);
  if(name==='launcher.mjs'){
   replace("import {installedDesktopExecutable} from './desktop-payload.mjs';", "import {verifyDesktopPayload} from './desktop-payload.mjs';");
   replace('@SEP_GRAPH_HASH@',graphHash);
   replace("'0.2.0-rc.2'","'0.2.1-alpha.1'",true);
   replace('readCredential=true,parentEnv=process.env','readCredential=true,parentEnv=process.env,onHostSpawn');
   replace("service=await openManagedService({controlRoot:config.controlRoot,host:{transport:","service=await openManagedService({controlRoot:config.controlRoot,host:{onSpawn:onHostSpawn,transport:");
   replace("suiteRoot:await realpath(pkg('dsh-system-enhancement-package'))","suiteRoot:await realpath(join(pkg('dsh-sep-bundle'),'bundle/modules/system-enhancement-package'))");
   replace(" env.DSH_CLIENT_VERSION='0.2.1-alpha.1';",` env.DSH_CLIENT_VERSION='0.2.1-alpha.1';
 env.SEP_DAILY_SELECTION_PATH=c.dailySelectionPath;env.SEP_DAILY_SELECTION_SHA256=c.dailySelectionSha256;`);
   replace("'credentialsPath','pnpmEntry']","'credentialsPath','pnpmEntry','dailySelectionPath','desktopRuntimeRoot','desktopPayloadPath','profileRoot']");
   replace("['dailyRoot','releaseRoot','home','storageRoot','controlRoot','lockDirectory','electronUserData','runtimeUser']", "['dailyRoot','releaseRoot','home','storageRoot','controlRoot','lockDirectory','electronUserData','runtimeUser','profileRoot']");
   replace('DSH_DESKTOP_DEV_PROJECT_DIR:c.releaseRoot','DSH_DESKTOP_DEV_PROJECT_DIR:c.profileRoot');
   replace('same(desktop.projectDir,config.releaseRoot)','same(desktop.projectDir,config.profileRoot)');
   replace('desktop:{projectDir:config.releaseRoot','desktop:{projectDir:config.profileRoot');
   replace("'lib/index.js'),config.releaseRoot,config.releaseRoot,","'lib/index.js'),config.releaseRoot,config.profileRoot,");
   replace(' return c;\n}',` if(!/^[a-f0-9]{64}$/.test(c.dailySelectionSha256??'')||!/^[a-f0-9]{64}$/.test(c.runtimeDescriptorSha256??''))fail('DAILY_CONFIG');
 const selection=await regular(c.dailySelectionPath,1048576);if(createHash('sha256').update(selection).digest('hex')!==c.dailySelectionSha256)fail('SEP_DAILY_SELECTION_CHANGED');
 const descriptor=await regular(join(c.releaseRoot,'desktop-runtime.json'),16777216);if(createHash('sha256').update(descriptor).digest('hex')!==c.runtimeDescriptorSha256)fail('DAILY_RELEASE_CHANGED');
 const {verifyDesktopRuntime}=await import(pathToFileURL(join(c.releaseRoot,'build-runtime-helper.mjs')));await verifyDesktopRuntime(c.releaseRoot,'0.2.1-alpha.1',{platform:'win32',arch:'x64'});
 return c;
}`);
   replace('export function desktopExecutable(root,platform=process.platform){',`async function desktopFor(config){
 const bytes=await regular(config.desktopPayloadPath,4194304);if(createHash('sha256').update(bytes).digest('hex')!==config.desktopPayloadSha256)fail('DESKTOP_RECEIPT_CHANGED');
 return verifyDesktopPayload(config.desktopRuntimeRoot,JSON.parse(bytes));
}
export function desktopExecutable(root,platform=process.platform){`);
   replace("config.desktopPayloadSha256?await installedDesktopExecutable(config):desktopExecutable(pkg('electron'))","await desktopFor(config)");
  }
  await writeFile(join(out,name),result);origins.push({file:name,source,sourceSha256:sha(input),transforms,resultSha256:sha(result)});
 }
 await cp(join(adapterSource,'lib/installed-sep-version.mjs'),join(out,'installed-sep-version.mjs'));
 await writeFile(join(out,'ORIGIN.json'),JSON.stringify({schema:1,target:'0.2.1-alpha.1',sep:'0.2.1-beta.3-bundle.24',graphHash,origins},null,2)+'\n');
 return {out,origins};
}
