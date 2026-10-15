// Lexical admission is not authorization: prepareNativeEvaluation also requires
// the exact hash-bound packaged entry, canonical private config and state root.
export function validNativeBackendPath(value,entry=false){return typeof value==='string'&&value.length<=2048&&value.startsWith('/')&&!/[\\\x00-\x20\x7f]/.test(value)&&value.split('/').slice(1).every(p=>p&&p!=='.'&&p!=='..')&&(!entry||value.split('/').at(-1)==='lifecycle.py');}
export const validBackendPath=validNativeBackendPath;
export function assertBackendPaths(backend){if(!validNativeBackendPath(backend?.entry,true)||!validNativeBackendPath(backend?.configPath))throw Object.assign(Error('BACKEND_PATH'),{code:'BACKEND_PATH'});}
