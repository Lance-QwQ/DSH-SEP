export const BOOTSTRAP_PATHS=Object.freeze({program:'Resources/PROGRAM.json',node:'Helpers/DSH SEP Desktop.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node',controller:'Resources/product/runtime/bootstrap/controller.mjs'});
const bad=()=>{throw Object.assign(new Error('SEP_BOOTSTRAP_MANIFEST'),{code:'SEP_BOOTSTRAP_MANIFEST'});};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('\0')===[...keys].sort().join('\0');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function item(v){if(!exact(v,['path','sha256'])||!hash(v.sha256)||typeof v.path!=='string')bad();return Object.freeze({path:v.path,sha256:v.sha256});}
function runtimePath(path){
 if(!path.startsWith('Resources/product/runtime/')||path.length>1024||/[^\x20-\x7e]|[\\:]/.test(path))return false;
 const parts=path.split('/');return parts.every(p=>p!==''&&p!=='.'&&p!=='..'&&!/[. ]$/.test(p)&&!/^tests?$/i.test(p)&&!/^fixture[-.]/i.test(p)&&!/[.]test[.]/i.test(p));
}
/** Packaging-time counterpart to the native, independently enforced reader.
 * Values are exact Contents-relative names; no environment or argv expansion. */
export function validateBootstrapManifest(value){
 if(!exact(value,['schema','layout','program','node','controller','closure'])||value.schema!==1||value.layout!=='macos-app-v1')bad();
 const result={schema:1,layout:'macos-app-v1'};
 for(const role of ['program','node','controller']){result[role]=item(value[role]);if(result[role].path!==BOOTSTRAP_PATHS[role])bad();}
 if(!Array.isArray(value.closure)||value.closure.length===0||value.closure.length>1024)bad();
 const seen=new Set();let previous='',controller=false;
 result.closure=Object.freeze(value.closure.map(v=>{const entry=item(v);if(!runtimePath(entry.path)||entry.path<=previous||seen.has(entry.path.toLowerCase()))bad();previous=entry.path;seen.add(entry.path.toLowerCase());if(entry.path===result.controller.path){if(entry.sha256!==result.controller.sha256)bad();controller=true;}return entry;}));
 if(!controller)bad();return Object.freeze(result);
}
