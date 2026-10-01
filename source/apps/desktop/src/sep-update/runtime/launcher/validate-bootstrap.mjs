/** Validate generated bootstrap bytes without running startup or reading credentials. */
import {readFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const required=['desktop-temp.mjs','desktop-payload.mjs','launcher.mjs','startup-report.mjs','startup-coordinator.mjs','startup-diagnostic.mjs','startup-lease.mjs','credential-reader.mjs','checkpoint-inspection.mjs'];
const fail=(code,file)=>{throw Object.assign(Error(code+(file?': '+file:'')),{code})};
async function inspect(path){
 let st;try{st=await lstat(path,{bigint:true})}catch(e){if(e.code==='ENOENT')fail('BOOTSTRAP_RESOURCE_MISSING',path);throw e}
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1n||st.size>4194304n||(process.platform==='win32'?(await realpath(path)).toLowerCase()!==resolve(path).toLowerCase():(await realpath(path))!==resolve(path)))fail('BOOTSTRAP_FILE_IDENTITY',path);
 const bytes=await readFile(path),after=await lstat(path,{bigint:true});
 if(['dev','ino','size','mtimeNs','ctimeNs'].some(k=>st[k]!==after[k]))fail('BOOTSTRAP_CHANGED',path);
 return {path,size:bytes.length,sha256:sha(bytes)};
}
/** Syntax-check the actual generated entry and its required local modules; no startup side effects. */
export async function validateBootstrap({entryPath,managedRoot,nodeExecutable=process.execPath}){
 if(![entryPath,managedRoot,nodeExecutable].every(p=>typeof p==='string'&&isAbsolute(p)))fail('BOOTSTRAP_PATH');
 const files=await Promise.all([entryPath,...required.map(n=>join(managedRoot,n))].map(inspect));
 const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>['systemroot','windir','path','comspec','pathext','os','temp','tmp'].includes(name.toLowerCase())));
 for(const file of files)try{await run(nodeExecutable,['--check',file.path],{windowsHide:true,timeout:10000,maxBuffer:65536,env})}catch{fail('BOOTSTRAP_SYNTAX',file.path)}
 for(const file of files){const after=await inspect(file.path);if(JSON.stringify(file)!==JSON.stringify(after))fail('BOOTSTRAP_CHANGED',file.path)}
 return {status:'pass',kind:'generated-bootstrap-syntax-and-required-resources',files};
}
