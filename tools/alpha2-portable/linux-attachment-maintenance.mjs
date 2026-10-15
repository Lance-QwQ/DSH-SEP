// The frozen native purge policy is retained. Linux adds private ownership
// checks and directory fsyncs to its file-sync publication order.
import {readFile,lstat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {bundleRoot} from './bundle-modules.mjs';
import {directory,hash,fail} from './project-tree.mjs';
export const origin=Object.freeze({path:'bundle/lib/attachment-maintenance.js',sha256:'c03025681d2b3a65872cb57e1b4f5befcdc48e01a600a714c26e0a5c4c9c9eb6',transformations:[
 ["import {join,resolve,relative,sep} from 'node:path';","import {join,resolve,relative,sep,dirname} from 'node:path';"],
 ["async function publish(path,value){", "async function syncDirectory(path){const handle=await open(path,'r');try{await handle.sync();}finally{await handle.close();}}\nasync function publish(path,value){"],
 ["await file.sync();}finally{await file.close();}}", "await file.sync();}finally{await file.close();}await syncDirectory(dirname(path));}"],
 ["await directory(home);const file=join(home,'owner.json');", "await directory(home);await syncDirectory(storageRoot);const file=join(home,'owner.json');"],
 ["await ancestors(current.home,audit);const intent=", "await ancestors(current.home,audit);await syncDirectory(current.home);const intent="],
 [" let deletedFiles=0;for(const row of current.files)", " input.onEvent?.('attachment-intent-durable');\n let deletedFiles=0;for(const row of current.files)"],
 ["await unlink(file);deletedFiles++;", "await unlink(file);await syncDirectory(dirname(file));deletedFiles++;input.onEvent?.('attachment-copy-unlinked');"],
 [" return receipt;", " input.onEvent?.('attachment-complete-durable');\n return receipt;"],
]});
const filename=join(bundleRoot,origin.path),require=createRequire(filename);let source=await readFile(filename,'utf8');
if(hash(source)!==origin.sha256)fail('SEP_LINUX_ATTACHMENT_ORIGIN_CHANGED');
for(const [before,after]of origin.transformations){if(source.split(before).length!==2)fail('SEP_LINUX_ATTACHMENT_TRANSFORM');source=source.replace(before,after);}
source=source.replace(/from '([^']+)'/g,(all,name)=>name.startsWith('node:')?all:"from '"+pathToFileURL(require.resolve(name)).href+"'");
export const transformedSha256=hash(source);
const native=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
export async function validateAttachmentHome({storageRoot}){
 if(process.platform!=='linux'||process.arch!=='x64')fail('SEP_LINUX_PLATFORM');
 const held=await directory(storageRoot,true);await held.close();const home=join(storageRoot,'.suite-attachments');let count=0;
 async function walk(path,depth){if(++count>4096||depth>16)fail('SEP_ATTACHMENT_INVENTORY_LIMIT');const s=await lstat(path,{bigint:true});if(s.uid!==BigInt(process.getuid())||(s.mode&0o077n)!==0n||s.isSymbolicLink()||!s.ino||!s.isFile()&&!s.isDirectory()||s.isFile()&&s.nlink!==1n)fail('SEP_PROJECT_PATH');if(s.isDirectory()){const h=await directory(path,true);try{for(const name of await readdir('/proc/self/fd/'+h.fd))await walk(join(path,name),depth+1);}finally{await h.close();}}}
 try{await walk(home,0);}catch(e){if(e.code!=='ENOENT')throw e;await lstat(home).then(()=>{throw e;},missing=>{if(missing.code!=='ENOENT')throw missing;});}
}
export async function initializeAttachmentHome(input){await validateAttachmentHome(input);const home=await native.initializeAttachmentHome(input);await validateAttachmentHome(input);return home;}
export async function acquireAttachmentOwner(input){await validateAttachmentHome({...input,storageRoot:join(input.home,'..')});return native.acquireAttachmentOwner(input);}
export async function prepareAttachmentPurge(input){await validateAttachmentHome(input);return native.prepareAttachmentPurge(input);}
export async function applyAttachmentPurge(input){await validateAttachmentHome(input);return native.applyAttachmentPurge(input);}
