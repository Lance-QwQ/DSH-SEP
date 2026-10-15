import {isAbsolute,join} from 'node:path';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
import {openTrustedProject} from './transaction-store.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
// The installer supplies a fixed packaged helper and its verified manifest
// digest. There is no user/model setting for selecting a POSIX test binary.
export async function openMacManagedProject({root,source,helperPath,helperSha256,onEvent}={}){
 if(process.platform!=='darwin'||process.arch!=='arm64')fail('SEP_MAC_PLATFORM_UNAVAILABLE');
 if(typeof root!=='string'||!isAbsolute(root)||source!==undefined&&(typeof source!=='string'||!isAbsolute(source))||typeof helperPath!=='string'||!isAbsolute(helperPath)||!/^[a-f0-9]{64}$/.test(helperSha256??''))fail('SEP_PROJECT_CONFIG');
 const io=createProjectTree({helperPath,helperSha256,lockPath:join(root,'.native.lock')});
 return openTrustedProject({root,source,io,onEvent});
}
