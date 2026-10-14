import {frozen,transform,evaluate,hash,fail} from './derive.mjs';
export const origin=Object.freeze({path:'../business/profile-layout.mjs',sha256:'5513a06989b5dfcc4b4429b796be65efe1cab8fa78dab68bc7c9759194690576',media:{path:'../media-business/profile-layout.mjs',sha256:'945f25189729503a41b5fcbc66612f6a04fbd03b547a351d995c83040e17a09e'}});
const file=new URL(origin.path,import.meta.url),original=await frozen(file,origin.sha256);
await frozen(new URL(origin.media.path,import.meta.url),origin.media.sha256);const media=await import('../media-business/profile-layout.mjs');
const mediaDerived=transform(original,media.origin.transformations.map(([before,after])=>({before,after})));
const mediaAbsolute=mediaDerived.source.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?"from '"+new URL(path,file).href+"'":all);
if(hash(mediaAbsolute)!==media.transformedSha256)fail('SEP_MAC_DOCUMENT_TRANSFORM');
const derived=transform(mediaDerived.source,[
 {before:'attachmentHelperSha256,initialize=false',after:'attachmentHelperSha256,parser,initialize=false'},
 {before:"'attachmentHelperSha256','initialize'",after:"'attachmentHelperSha256','parser','initialize'"},
 {before:' const inside=(a,b)=>',after:" if(!parser||typeof parser!=='object'||Array.isArray(parser)||Object.keys(parser).sort().join(',')!=='manifestSha256,runtimeRoot,stateRoot'||typeof parser.runtimeRoot!=='string'||!isAbsolute(parser.runtimeRoot)||resolve(parser.runtimeRoot)!==parser.runtimeRoot||!/^[a-f0-9]{64}$/.test(parser.manifestSha256??'')||parser.stateRoot!==join(dataRoot,'parser'))fail('SEP_MAC_DOCUMENT_PROFILE_INPUT');\n const inside=(a,b)=>"},
 {before:JSON.stringify(new URL('../media-business/runtime.mjs',import.meta.url).href),after:JSON.stringify(new URL('./runtime.mjs',import.meta.url).href)},
 {before:'recall:true,media:false,pluginGroup:true',after:'recall:true,media:true,pluginGroup:true'},
 {before:'p1:{enabled:true,budgetPath},helperPath',after:'p1:{enabled:true,budgetPath},parser:{...parser},helperPath'},
 {before:'attachmentHelperPath,attachmentHelperSha256,shutdownMs,scope:',after:'attachmentHelperPath,attachmentHelperSha256,parser:{...parser},shutdownMs,scope:'},
]);
export const derivation=Object.freeze({media:mediaDerived.receipt,document:derived.receipt});
export const canonicalSha256=hash(derived.source.replaceAll(new URL('../',import.meta.url).href,'<source-root>/'));
export const {businessLayout,initializeBusinessProfile,completeBusinessInitialization}=await evaluate(derived.source,file);
