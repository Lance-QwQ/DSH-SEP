import {mkdir,lstat,realpath,readdir,readFile} from 'node:fs/promises';
import {join,resolve,isAbsolute,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
import {boundedRead} from './bounded-read.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
async function optionalText(path){try{return (await boundedRead(path,{maxBytes:1048576})).toString('utf8');}catch(e){if(e.code==='ENOENT')return;throw e;}}
export function businessLayout(input){
 const {programRoot,hostRoot,bundleRoot,dataRoot,projectRoot,helperPath,helperSha256,initialize=false,shutdownMs=5000}=input;
 if(Object.keys(input).some(k=>!['programRoot','hostRoot','bundleRoot','dataRoot','projectRoot','helperPath','helperSha256','initialize','shutdownMs'].includes(k))||[programRoot,hostRoot,bundleRoot,dataRoot,projectRoot,helperPath].some(p=>typeof p!=='string'||!isAbsolute(p)||resolve(p)!==p)||!/^[a-f0-9]{64}$/.test(helperSha256??'')||typeof initialize!=='boolean'||!Number.isSafeInteger(shutdownMs)||shutdownMs<100||shutdownMs>30000)fail('SEP_MAC_BUSINESS_INPUT');
 const inside=(a,b)=>{const r=relative(a,b);return !r||r!=='..'&&!r.startsWith('../')&&!isAbsolute(r);};if(inside(dataRoot,projectRoot)||inside(projectRoot,dataRoot)||[programRoot,hostRoot,bundleRoot].some(p=>inside(p,dataRoot)||inside(p,projectRoot)))fail('SEP_MAC_BUSINESS_PATH');
 const source=projectRoot,managed=join(dataRoot,'managed'),memory=join(dataRoot,'memory'),locks=join(dataRoot,'locks'),budgetPath=join(dataRoot,'budget/ledger.json'),profile=join(dataRoot,'home/profiles/desktop');
 const module=name=>new URL(name,import.meta.url).href;
 const disabled=['jobs','subprocess','fs-sandbox','tool-bash','tool-jobs','tool-fs','tool-fs-search','mcp-resources','plugin-manager','hmr','attachment-local','bash-sandbox','permission','ptc-runtime','desktop-product-telemetry','product-analytics','session-telemetry-otel','open-in-app','job-controller','terminal-controller','ui-sidebar-terminal','ui-jobs','ui-open-in-app','ui-deliverables','workspace-changes'];
 const runtime={source,memory,locks,budgetPath,initialize:false,business:{sources:['.'],capture:false,recall:true,media:false,pluginGroup:true},p1:{enabled:true,budgetPath},helperPath,helperSha256,nativeLockPath:join(managed,'.native.lock'),compaction:{nativeEntryId:'compaction-basic'},shutdownMs};
 // The summary cap stays within the captured P1 default output envelope;
 // ordinary official retry defaults remain in force and share its ledger.
 const patch=[...disabled.map(id=>({id,disabled:true})),{id:'agent-default-model',config:{provider:'deepseek-official',model:'deepseek-v4-flash'}},{id:'storage-json',config:{root:memory}},{id:'working-directory',config:{defaultDirectory:source}},{id:'compaction-basic',disabled:false,config:{auto:true,thresholdRatio:0.8,retainRatio:0.4,maxTokens:2048,compactionRetries:1,maxOverflowRetries:1}},{insert:[
  {id:'mac-controlled',name:module('./profile-plugin.mjs'),config:{root:managed,source,helperPath,helperSha256}},
  {id:'mac-sep-business',name:module('./runtime.mjs'),config:runtime},
  {id:'mac-sep-settings',name:pathToFileURL(join(bundleRoot,'bundle/modules/ui-settings-memory/lib/index.js')).href,config:{enabled:true}},
 ]}];
 const record={schema:1,programRoot,hostRoot,bundleRoot,dataRoot,source,managed,memory,locks,budgetPath,profile,helperPath,helperSha256,shutdownMs,scope:'dedicated macOS controlled file profile; optional untrusted execution disabled'};
 return {record,patch,runtime};
}
export async function initializeBusinessProfile(input){
 const {record,patch,runtime}=businessLayout(input),{dataRoot,source,managed,memory,locks,budgetPath,profile}=record;
 if(input.initialize){await mkdir(dataRoot,{recursive:true,mode:0o700});await mkdir(source,{recursive:true,mode:0o700});}
 for(const path of[dataRoot,source]){const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||await realpath(path)!==path||path===dataRoot&&(s.mode&0o077))fail('SEP_MAC_BUSINESS_PATH');}
 const expected=JSON.stringify(record)+'\n',existing=await optionalText(join(dataRoot,'PROFILE.json'));
 if(existing!==undefined){if(existing!==expected)fail('SEP_MAC_PROFILE_BINDING');const ready=await optionalText(join(dataRoot,'profile-authority/READY.json'));if(ready!==undefined&&ready!==expected)fail('SEP_MAC_PROFILE_BINDING');return {...record,newlyInitialized:ready===undefined};}
 const bootstrap=join(dataRoot,'BOOTSTRAP.json'),prior=await optionalText(bootstrap);
 if(prior!==undefined&&prior!==expected)fail('SEP_MAC_PROFILE_BINDING');
 if(prior===undefined&&(!input.initialize||(await readdir(dataRoot)).length))fail('SEP_MAC_FRESH_PROFILE_REQUIRED');
 const io=createProjectTree({helperPath:input.helperPath,helperSha256:input.helperSha256,lockPath:join(dataRoot,'.native.lock')});
 const publish=async(path,body)=>{const value=await optionalText(join(dataRoot,path));if(value!==undefined){if(value!==body)fail('SEP_MAC_PROFILE_PARTIAL_CHANGED');return;}await io.applyFile(dataRoot,{path,expectedSha256:'absent',text:body});};
 await publish('BOOTSTRAP.json',expected);
 for(const path of[managed,memory,locks,join(budgetPath,'..'),profile,join(dataRoot,'profile-authority')])await mkdir(path,{recursive:true,mode:0o700});
 await publish('home/profiles/desktop/package.json',JSON.stringify({private:true,type:'module',dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}})+'\n');
 // Per-request credentials are owned by the official Models settings UI.
 // No user key or inherited dotenv content is copied into a distributable.
 await publish('home/profiles/desktop/cordis.patch.yml',JSON.stringify(patch,null,2)+'\n');
 await publish('home/profiles/desktop/initialize.patch.yml',JSON.stringify([{id:'mac-sep-business',config:{...runtime,initialize:true}}])+'\n');
 await publish('PROFILE.json',expected);return {...record,newlyInitialized:true};
}
/** Call only after every real domain and ledger opened, before activation.
 * An interrupted initial boot may re-open those existing domains, but P2
 * still refuses ungoverned data and Budget.init never resets its entries. */
export async function completeBusinessInitialization(input){
 const {record}=businessLayout(input),text=JSON.stringify(record)+'\n';if(await optionalText(join(record.dataRoot,'PROFILE.json'))!==text)fail('SEP_MAC_PROFILE_BINDING');
 const root=join(record.dataRoot,'profile-authority'),io=createProjectTree({helperPath:input.helperPath,helperSha256:input.helperSha256,lockPath:join(record.dataRoot,'.native.lock')});
 const ready=await optionalText(join(root,'READY.json'));if(ready!==undefined){if(ready!==text)fail('SEP_MAC_PROFILE_BINDING');return;}
 await io.applyFile(root,{path:'READY.json',expectedSha256:'absent',text});
}
