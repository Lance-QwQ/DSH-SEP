import {frozen,transform,hash,fail} from './derive.mjs';
export const origin=Object.freeze({path:'../business/runtime.mjs',sha256:'8148341384289ea23050112e70355dd26a52741c45ce7b715d3699ccbbf09409',media:{path:'../media-business/runtime.mjs',sha256:'1326e33aac1a98fe851ff83c4cbb8c38d698b0bfc8cb521ddccfa4aabbec0e10'}});
export const filename=new URL(origin.path,import.meta.url);
const original=await frozen(filename,origin.sha256);
await frozen(new URL(origin.media.path,import.meta.url),origin.media.sha256);
const media=await import('../media-business/runtime.mjs');
const mediaDerived=transform(original,media.origin.transformations.map(([before,after])=>({before,after})));
const mediaAbsolute=mediaDerived.source.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?"from '"+new URL(path,filename).href+"'":all);
if(hash(mediaAbsolute)!==media.transformedSha256)fail('SEP_MAC_DOCUMENT_TRANSFORM');
const derived=transform(mediaDerived.source,[
 {before:"import {createSettingsConsumers,businessConfig} from './consumers.mjs';",after:"import {createSettingsConsumers,businessConfig} from '../document-business/consumers.mjs';\nimport {openParserServices} from '../parser-integration/services.mjs';"},
 {before:'business:businessConfig,p1:p1Config,',after:"business:businessConfig,p1:p1Config,parser:z.object({runtimeRoot:z.string().min(1),manifestSha256:z.string().regex(/^[a-f0-9]{64}$/),stateRoot:z.string().min(1)}).strict(),"},
 {before:'config.business.context||config.business.click||config.business.evaluation||config.business.media',after:'config.business.click||config.business.evaluation'},
 {before:"let phase='preparing',closing,control,",after:"let parserServices,parserInitializationUnknown=false;\n let phase='preparing',closing,control,"},
 {before:"context:'disabled',vision:",after:"context:config.business.context?'readonly-public-snapshot; trusted-parser':'disabled',parser:parserServices?.status()??{status:parserInitializationUnknown?'cleanup-unconfirmed':'not_run'},vision:"},
 {before:"'context-parser',",after:''},
 {before:"phase='closing';abort.abort();",after:"phase='closing';abort.abort();\n  // Close parser admission immediately; wait for real drain before storage.\n  const parserClose=parserServices?.close();if(parserClose)void parserClose.catch(()=>{});"},
 {before:"const nativeDone=await attempt('native',()=>native?.restore());",after:"const parsersDone=await attempt('parsers',async()=>{if(parserInitializationUnknown)fail('SEP_MAC_PARSER_CLEANUP_UNCONFIRMED');if(parserServices){await parserClose;const receipt=await parserServices.whenClosed();if(receipt?.resourcesConfirmedReleased!==true)fail('SEP_MAC_PARSER_CLEANUP_UNCONFIRMED');}});\n  const nativeDone=await attempt('native',()=>native?.restore());"},
 {before:"if(ordinaryDone&&await attempt('store',()=>store?.close()))",after:"if(parsersDone&&ordinaryDone&&await attempt('store',()=>store?.close()))"},
 {before:'  control=await openControl(',after:"  const parserPaths=[config.parser.runtimeRoot,config.parser.stateRoot];\n  for(const p of parserPaths)if(resolve(p)!==p)fail('SEP_MAC_PARSER_BINDING');\n  const parserDomains=[...roots,resolve(config.nativeLockPath,'..')];\n  for(const p of parserPaths)for(const r of parserDomains)if(!outside(relative(p,r))||!outside(relative(r,p)))fail('SEP_MAC_PARSER_BINDING');\n  parserInitializationUnknown=true;\n  try{parserServices=await openParserServices(config.parser);parserInitializationUnknown=false;}catch(error){if(error.cleanup?.resourcesConfirmedReleased===true)parserInitializationUnknown=false;throw error;}\n  const binding=parserServices.binding;if(!binding||Object.keys(binding).sort().join(',')!=='manifestSha256,runtimeRoot,stateRoot'||Object.entries(config.parser).some(([key,value])=>binding[key]!==value))fail('SEP_MAC_PARSER_BINDING');\n  control=await openControl("},
 {before:'captureModel:config.p1.model,attachmentSelection,onControl:',after:'captureModel:config.p1.model,attachmentSelection,parserServices,onControl:'},
 {before:'view:view.version,business:config.business,p1:config.p1,ledger:',after:'view:view.version,business:config.business,p1:config.p1,parser:config.parser,ledger:'},
]);
export const source=derived.source,derivation=Object.freeze({media:mediaDerived.receipt,document:derived.receipt});
