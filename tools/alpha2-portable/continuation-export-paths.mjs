import {posix,win32} from 'node:path';
const output='D:\\AIData\\ProjectWork\\DSH\\alpha2-linux-desktop-continuation-20261013-r1\\';
const bad=()=>{throw Error('EXPORT_SCOPE');};
export function validateExportPaths(source,destination){
 if(typeof source!=='string'||typeof destination!=='string'||source.length>4096||destination.length>4096||/[\x00-\x1f\x7f\\]/.test(source)||!/^\/opt\/dsh-sep-cross-platform\/alpha2-portable-desktop-continuation-[a-z0-9-]+\//.test(source)||posix.normalize(source)!==source||source.split('/').slice(1).some(s=>!s||s==='.'||s==='..'))bad();
 if(!destination.startsWith(output)||win32.normalize(destination)!==destination)bad();
 const parts=destination.slice(output.length).split('\\');if(!parts.length||parts.some(s=>!s||s==='.'||s==='..'||/[\x00-\x1f\x7f<>:"/|?*]/.test(s)||/[ .]$/.test(s)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)))bad();
 return {source,destination};
}
