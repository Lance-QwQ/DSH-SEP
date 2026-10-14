import {readFile} from 'node:fs/promises';
import {hash} from '../business/bounded-read.mjs';
const file=new URL('../business/profile-layout.mjs',import.meta.url),runtime=new URL('./runtime.mjs',import.meta.url).href,cold=new URL('./cold-attachments.mjs',import.meta.url).href,llm=new URL('./after-attachments-llm.mjs',import.meta.url).href;
export const origin=Object.freeze({source:'../business/profile-layout.mjs',sha256:'5513a06989b5dfcc4b4429b796be65efe1cab8fa78dab68bc7c9759194690576',transformations:[
 ['helperPath,helperSha256,initialize=false','helperPath,helperSha256,attachmentHelperPath,attachmentHelperSha256,initialize=false'],
 ["'helperSha256','initialize'","'helperSha256','attachmentHelperPath','attachmentHelperSha256','initialize'"],
 ['projectRoot,helperPath].some','projectRoot,helperPath,attachmentHelperPath].some'],
 ['!/^[a-f0-9]{64}$/.test(helperSha256??\'\')','!/^[a-f0-9]{64}$/.test(helperSha256??\'\')||!/^[a-f0-9]{64}$/.test(attachmentHelperSha256??\'\')'],
 ["const module=name=>new URL(name,import.meta.url).href;","const module=name=>name==='./runtime.mjs'?"+JSON.stringify(runtime)+":new URL(name,"+JSON.stringify(file.href)+").href;"],
 ["const disabled=['jobs'","const disabled=['llm','jobs'"],
 ["recall:true,media:false,pluginGroup:true","recall:true,media:false,pluginGroup:true,vision:{enabled:true,allowUpload:true}"],
 ["join(bundleRoot,'bundle/modules/ui-settings-memory/lib/index.js')","join(hostRoot,'node_modules/@deepseek-ai/dsh-client-ui-settings-memory/lib/index.js')"],
 ["{insert:[","{id:'agent-preset-registry',config:{default:'sep-mac-images'}},{insert:[\n  {id:'mac-cold-attachments',name:"+JSON.stringify(cold)+",config:{source,storageRoot:memory,initialize:false,helperPath:attachmentHelperPath,helperSha256:attachmentHelperSha256}},\n  {id:'mac-after-attachments-llm',name:"+JSON.stringify(llm)+"},\n  {id:'mac-image-preset',name:'@deepseek-ai/dsh-agent-preset',config:{id:'sep-mac-images',name:'SEP macOS governed images',description:'Dedicated managed file and image Profile; unrelated preset trees are unavailable.',plugins:[]}},"],
 ['profile,helperPath,helperSha256,shutdownMs','profile,helperPath,helperSha256,attachmentHelperPath,attachmentHelperSha256,shutdownMs'],
 ["[{id:'mac-sep-business',config:{...runtime,initialize:true}}]","[{id:'mac-cold-attachments',config:{source,storageRoot:memory,initialize:true,helperPath:input.attachmentHelperPath,helperSha256:input.attachmentHelperSha256}},{id:'mac-sep-business',config:{...runtime,initialize:true}}]"],
]});
let source=await readFile(file,'utf8');if(hash(source)!==origin.sha256)throw Error('SEP_MAC_MEDIA_LAYOUT_ORIGIN');for(const [before,after]of origin.transformations){if(source.split(before).length!==2)throw Error('SEP_MAC_MEDIA_LAYOUT_ANCHOR '+before);source=source.replace(before,after);}
source=source.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?"from '"+new URL(path,file).href+"'":all);
export const transformedSha256=hash(source);
export const {businessLayout,initializeBusinessProfile,completeBusinessInitialization}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
