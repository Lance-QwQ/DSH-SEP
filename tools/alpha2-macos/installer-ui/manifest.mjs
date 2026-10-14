export const INSTALLER_PATHS=Object.freeze({payload:'Resources/payload/DSH SEP.app',receipt:'Resources/PAYLOAD.json',node:'Resources/node/node',controller:'Resources/runtime/installer-ui/controller-main.mjs',entryHelper:'Resources/native/installer-account',coreHelper:'Resources/native/first-install'});
const fail=()=>{throw Object.assign(Error('SEP_INSTALLER_MANIFEST'),{code:'SEP_INSTALLER_MANIFEST'});};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join('\0')===[...keys].sort().join('\0');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const item=(v,path)=>exact(v,['path','sha256'])&&v.path===path&&hash(v.sha256);
function runtimePath(path){
 if(typeof path!=='string'||path.length>1024||!path.startsWith('Resources/runtime/')||/[^\x20-\x7e]|[\\:]/.test(path))return false;
 for(const part of path.split('/')){const p=part.toLowerCase();if(!part||part==='.'||part==='..'||/[. ]$/.test(part)||p==='test'||p==='tests'||p==='testing.mjs'||p==='run-native.mjs'||p.startsWith('fixture-')||p.startsWith('fixture.')||p.includes('.test.'))return false;}
 return true;
}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
export function validateInstallerManifest(v){
 if(!exact(v,['schema','layout','payload','node','controller','entryHelper','coreHelper','closure'])||v.schema!==1||v.layout!=='macos-installer-v1')fail();
 if(!exact(v.payload,['path','receipt','programSha256','bootstrapSha256'])||v.payload.path!==INSTALLER_PATHS.payload||!item(v.payload.receipt,INSTALLER_PATHS.receipt)||!hash(v.payload.programSha256)||!hash(v.payload.bootstrapSha256))fail();
 for(const role of ['node','controller','entryHelper','coreHelper'])if(!item(v[role],INSTALLER_PATHS[role]))fail();
 if(!Array.isArray(v.closure)||!v.closure.length||v.closure.length>1024)fail();
 let previous='',controller=false;const seen=new Set();
 for(const row of v.closure){if(!exact(row,['path','sha256'])||!runtimePath(row.path)||!hash(row.sha256)||row.path<=previous||seen.has(row.path.toLowerCase()))fail();previous=row.path;seen.add(row.path.toLowerCase());if(row.path===INSTALLER_PATHS.controller){if(row.sha256!==v.controller.sha256)fail();controller=true;}}
 if(!controller)fail();return freeze(JSON.parse(JSON.stringify(v)));
}
