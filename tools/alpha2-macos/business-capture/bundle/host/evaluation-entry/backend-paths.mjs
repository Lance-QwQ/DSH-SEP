import {posix} from 'node:path';
const ROOT='/opt/dsh-sep-eval/';
export function validBackendPath(value,lifecycle=false){
 if(typeof value!=='string'||value.length>2048||!value.startsWith(ROOT)||/[\\\x00-\x1f\x7f]/.test(value))return false;
 const parts=value.slice(ROOT.length).split('/');
 return parts.every(part=>part&&part!=='.'&&part!=='..')&&posix.normalize(value)===value&&(!lifecycle||posix.basename(value)==='lifecycle.py');
}
export function assertBackendPaths(backend){if(!validBackendPath(backend?.entry,true)||!validBackendPath(backend?.configPath))throw Error('BACKEND_CONFIG');}
