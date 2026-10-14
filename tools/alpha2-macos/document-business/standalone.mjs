import {frozen,transform,evaluate,hash} from './derive.mjs';
export const origin=Object.freeze({path:'../media-business/standalone.mjs',sha256:'97416ab8bbaa94e5e44a92a9c8efef411cc1dbd4e4e57026de855034efe2fb58'});
const file=new URL(origin.path,import.meta.url),source=await frozen(file,origin.sha256);
const derived=transform(source,[
 {before:"path==='./profile-layout.mjs'?new URL(path,import.meta.url)",after:"path==='./profile-layout.mjs'?new URL('../document-business/profile-layout.mjs',import.meta.url)"},
 {before:'const substitutions=[',after:'const substitutions=[\n '+JSON.stringify(["}catch(error){if(running){await running.ctx.get('sepMacRuntime')?.close();await running.ctx.get('sepMacProfile')?.close();await running.shutdown.shutdown(1);}throw error;}","}catch(error){await cleanupFailedStartup(running,error);}"])+','},
 {before:'export const transformedSha256=hash(source);',after:'source='+JSON.stringify("import {cleanupFailedStartup} from '"+new URL('./startup-cleanup.mjs',import.meta.url).href+"';\n")+'+source;\nexport const transformedSha256=hash(source);'},
 {before:'import.meta.url',after:JSON.stringify(file.href),count:4},
]);
export const derivation=derived.receipt;
export const canonicalSha256=hash(derived.source.replaceAll(new URL('../',import.meta.url).href,'<source-root>/'));
export const {openMacBusiness}=await evaluate(derived.source,file);
