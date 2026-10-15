import {mkdir,writeFile,access,readFile,rename,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {linuxImagePresetPatch} from './linux-image-preset.mjs';
import {syncDirectory} from './project-tree.mjs';
export async function initializeProfile(program,data){
 const source=join(data,'project'),managed=join(data,'managed'),memory=join(data,'memory'),locks=join(data,'locks'),budgetPath=join(data,'budget/ledger.json'),profile=join(data,'home/profiles/desktop'),url=name=>pathToFileURL(join(program,'src',name)).href;
 const record={schema:1,program,source,managed,memory,locks,budgetPath,profile,scope:'one controlled ext4 project; fresh private data; optional evaluation/click disabled until controller configuration'};
 try{const prior=JSON.parse(await readFile(join(data,'PROFILE.json')));if(JSON.stringify(prior)!==JSON.stringify(record))throw Error('SEP_LINUX_PROFILE_BINDING');return;}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const path of [source,managed,memory,locks,join(data,'budget'),profile,join(data,'electron-home'),join(data,'xdg')])await mkdir(path,{recursive:true,mode:0o700});
 const publish=async(path,body)=>{
  try{const current=await readFile(path,'utf8');if(current!==body)throw Error('SEP_LINUX_PROFILE_PARTIAL_CHANGED');return;}catch(e){if(e.code!=='ENOENT')throw e;}
  const tmp=path+'.preparing';let f;
  try{f=await open(tmp,'wx',0o600);await f.writeFile(body);await f.sync();}
  catch(e){if(e.code!=='EEXIST')throw e;
   f=await open(tmp,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await f.stat();
   if(!stat.isFile()||stat.uid!==process.getuid()||stat.nlink!==1||(stat.mode&0o777)!==0o600||await f.readFile('utf8')!==body)throw Error('SEP_LINUX_PROFILE_PARTIAL_CHANGED');
   await f.sync();
  }finally{await f?.close();}
  await rename(tmp,path);await syncDirectory(join(path,'..'));
 };
 await publish(join(profile,'package.json'),JSON.stringify({private:true,type:'module',dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}})+'\n');
 // Preserve any credential already written during interrupted initialization.
 try{await access(join(profile,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;await publish(join(profile,'.env'),'DEEPSEEK_API_KEY=\n');}
 // These native subprocess consumers cannot borrow an unprotected service
 // just to activate. Telemetry is deliberately off in the isolated preview.
 const disabled=['jobs','subprocess','fs-sandbox','tool-bash','tool-jobs','tool-fs','tool-fs-search','mcp-resources','plugin-manager','hmr','attachment-local','llm','bash-sandbox','permission','ptc-runtime','desktop-product-telemetry','product-analytics','open-in-app','job-controller','terminal-controller','ui-sidebar-terminal','ui-jobs','ui-open-in-app','ui-deliverables','workspace-changes'];
 const patch=[...disabled.map(id=>({id,disabled:true})),...linuxImagePresetPatch(),{id:'agent-default-model',config:{provider:'deepseek-official',model:'deepseek-v4-flash'}},{id:'storage-json',config:{root:memory}},{id:'compaction-basic',disabled:false,config:{auto:true,thresholdRatio:0.8,retainRatio:0.4,maxTokens:64,compactionRetries:0,maxOverflowRetries:1}},{insert:[
 {id:'linux-controlled',name:url('linux-profile-plugin.mjs'),config:{root:managed,source,isolation:{bwrap:join(program,'sandbox-runtime/usr/bin/bwrap'),binarySha256:'e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71'},servers:{}}},
 {id:'linux-cold-attachments',name:url('linux-attachments.mjs'),config:{source,storageRoot:memory,initialize:true,files:{enabled:true}}},
 {id:'linux-owned-llm',name:url('linux-vision-llm.mjs')},
 {id:'linux-sep-business',name:url('linux-sep-runtime.mjs'),config:{source,memory,locks,budgetPath,initialize:true,business:{sources:['.'],capture:false,recall:true,media:true,pluginGroup:true,vision:{enabled:true,allowUpload:true}},p1:{enabled:true,budgetPath},compaction:{nativeEntryId:'compaction-basic'}}},
 {id:'linux-sep-settings',name:pathToFileURL(join(program,'host/node_modules/@deepseek-ai/dsh-client-ui-settings-memory/lib/index.js')).href,config:{enabled:true}},
 ]}];
 await publish(join(profile,'cordis.patch.yml'),JSON.stringify(patch,null,2)+'\n');await mkdir(join(data,'font-cache'),{recursive:true,mode:0o700});const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');await publish(join(data,'fonts.conf'),'<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n<fontconfig><include>/etc/fonts/fonts.conf</include><dir>'+xml(join(program,'fonts'))+'</dir><cachedir>'+xml(join(data,'font-cache'))+'</cachedir><alias><family>sans-serif</family><prefer><family>Noto Sans CJK SC</family></prefer></alias></fontconfig>\n');await publish(join(data,'PROFILE.json'),JSON.stringify(record)+'\n');
}
