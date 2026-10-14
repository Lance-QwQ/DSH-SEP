import {posix} from 'node:path';
const fail=code=>{throw Object.assign(Error(code),{code});};
function absolute(path){return typeof path==='string'&&path.startsWith('/')&&path.length>1&&path.length<4096&&!/[\\\x00-\x1f\x7f]/.test(path)&&!path.split('/').slice(1).some(p=>!p||p==='.'||p==='..');}
/** Shape gate only. The broker and R6 discovery reader retain identity authority. */
export function requireManagedInvocation(argv,env,platform=process.platform){
 if(platform!=='darwin')fail('SEP_MAC_PLATFORM');
 const entries=argv.filter(v=>typeof v==='string'&&v.startsWith('--sep-recovery-connection='));
 const connectionFile=entries[0]?.slice('--sep-recovery-connection='.length);
 if(entries.length!==1||!absolute(connectionFile))fail('SEP_MAC_CONTROLLED_ENTRY_REQUIRED');
 if(!absolute(env.DSH_SEP_DATA_ROOT)||!absolute(env.DSH_DESKTOP_DSH_DIR))fail('SEP_MAC_ROOT_REQUIRED');
 if(!absolute(env.DSH_DESKTOP_NODE_BINARY)||posix.basename(env.DSH_DESKTOP_NODE_BINARY)!=='node')fail('SEP_MAC_NODE_REQUIRED');
 return Object.freeze({connectionFile,dataRoot:env.DSH_SEP_DATA_ROOT,programRoot:env.DSH_DESKTOP_DSH_DIR,nodeExecutable:env.DSH_DESKTOP_NODE_BINARY});
}
export function configureManagedIdentity(app,invocation,env=process.env){
 app.setName('DSH SEP');app.setPath('userData',posix.join(invocation.dataRoot,'electron'));
 env.DSH_HOME=posix.join(invocation.dataRoot,'home');app.setAppLogsPath(posix.join(invocation.dataRoot,'logs'));
}
