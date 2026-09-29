import {readFile,writeFile,mkdir,lstat,realpath,copyFile,symlink,readdir} from 'node:fs/promises';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify,isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {fileHash,jsonFile} from './update-inventory.mjs';
const run=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const owners=new Set(['dsh-system-enhancement-package','@deepseek-ai/dsh-recovery','@deepseek-ai/dsh-client-ui-settings-memory','@deepseek-ai/dsh-desktop','dsh-sep-plugin-group','dsh-sep-context-preparation','dsh-tool-worker','dsh-sep-trusted-evaluation-entry','@deepseek-ai/dsh-sep-session-migration','dsh-sep-brand']);
const demand=(v,c)=>{if(!v)throw Error(c);};
const key=p=>resolve(p).toLowerCase();
async function directory(p){const s=await lstat(p);demand(s.isDirectory()&&!s.isSymbolicLink()&&key(await realpath(p))===key(p),'SEP_PACKAGE_DIRECTORY');}
function safePath(p){return typeof p==='string'&&p.length<500&&!/[\\:\0<>"|?*]/.test(p)&&p.split('/').every(s=>s&&!['.','..','node_modules'].includes(s)&&!/[ .]$/.test(s)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s));}
/** Validate an exact same-host delta before copying or loading any candidate code. */
export function validateDelta(base,next,metadata,release){
 demand(metadata?.schema===1&&metadata.kind==='sep-program-delta'&&metadata.platform==='win32-x64'&&metadata.hostVersion===release.version&&metadata.sepVersion===release.sepVersion,'SEP_PACKAGE_METADATA');
 demand(Array.isArray(base.packages)&&Array.isArray(next.packages)&&base.packages.length===next.packages.length&&isDeepStrictEqual(base.roots,next.roots),'SEP_PACKAGE_TOPOLOGY');
 for(const graph of [base,next]){
  demand(graph.packages.length<=5000&&Array.isArray(graph.files)&&graph.files.length<=200000,'SEP_PACKAGE_LIMIT');
  const ids=new Set(),paths=new Set();for(const p of graph.packages){demand(/^[a-zA-Z0-9_-]+$/.test(p.id)&&!ids.has(p.id),'SEP_PACKAGE_ID');ids.add(p.id);}
  for(const f of graph.files){demand(safePath(f.path)&&/^store\/[a-zA-Z0-9_-]+\//.test(f.path)&&ids.has(f.path.split('/')[1])&&!paths.has(f.path.toLowerCase())&&/^[a-f0-9]{64}$/.test(f.sha256)&&Number.isSafeInteger(f.size)&&f.size>=0&&f.size<=2147483648,'SEP_PACKAGE_FILE');paths.add(f.path.toLowerCase());}
  for(const deps of [graph.roots,...graph.packages.map(p=>p.dependencies??{})])for(const [name,id]of Object.entries(deps))demand(/^(?:@[a-zA-Z0-9_][a-zA-Z0-9._-]*\/)?[a-zA-Z0-9_][a-zA-Z0-9._-]*$/.test(name)&&ids.has(id),'SEP_PACKAGE_DEPENDENCY');
 }
 const host=g=>g.packages.find(p=>p.id===g.roots['@deepseek-ai/dsh']),sep=g=>g.packages.find(p=>p.id===g.roots['dsh-system-enhancement-package']);
 demand(host(base)?.version===release.version&&host(next)?.version===release.version&&sep(base)?.version===metadata.fromSepVersion&&sep(next)?.version===release.sepVersion,'SEP_PACKAGE_VERSION');
 const byId=new Map(base.packages.map(p=>[p.id,p])),changed=new Set();
 for(const p of next.packages){const before=byId.get(p.id);demand(before&&before.name===p.name&&isDeepStrictEqual(before.dependencies,p.dependencies),'SEP_PACKAGE_TOPOLOGY');if(!owners.has(p.name))demand(isDeepStrictEqual(before,p),'SEP_PACKAGE_PRESERVATION');}
 const before=new Map(base.files.map(f=>[f.path,f])),after=new Map(next.files.map(f=>[f.path,f]));
 for(const p of new Set([...before.keys(),...after.keys()]))if(!isDeepStrictEqual(before.get(p),after.get(p))){demand(owners.has(byId.get(p.split('/')[1])?.name),'SEP_PACKAGE_PRESERVATION');changed.add(p);}
 return {changed:[...changed],payload:new Set([...changed].filter(p=>after.has(p)).map(p=>after.get(p).sha256))};
}
/** Create an unselected program tree. Failure leaves evidence, never a ready receipt. */
export async function preparePackage({archive,bundleSha256,currentRoot,workRoot,programRoot,release,signal}){
 signal?.throwIfAborted();demand(process.platform==='win32','SEP_PACKAGE_WINDOWS_ONLY');
 for(const p of [archive,currentRoot,workRoot])demand(isAbsolute(p),'SEP_PACKAGE_PATH');
 await directory(currentRoot);await directory(dirname(workRoot));await mkdir(workRoot);await directory(workRoot);
 demand(await fileHash(archive)===bundleSha256,'SEP_PACKAGE_ARCHIVE_HASH');
 const unpacked=join(workRoot,'unpacked');
 try{await run(join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./extract-sep.ps1',import.meta.url)),'-Archive',archive,'-Destination',unpacked],{windowsHide:true,timeout:120000,maxBuffer:65536,signal});}catch(e){if(signal?.aborted)signal.throwIfAborted();throw Error(e.stderr?.match(/SEP_ARCHIVE_[A-Z_]+/)?.[0]??'SEP_ARCHIVE_INVALID');}
 demand(await fileHash(archive)===bundleSha256,'SEP_PACKAGE_ARCHIVE_CHANGED');
 const metadata=await jsonFile(join(unpacked,'sep-package.json')),baseBytes=await readFile(join(unpacked,'base-graph.json')),targetBytes=await readFile(join(unpacked,'target-graph.json'));
 demand(sha(baseBytes)===metadata.baseGraphHash&&sha(targetBytes)===metadata.targetGraphHash,'SEP_PACKAGE_GRAPH_HASH');
 demand(await fileHash(join(currentRoot,'graph.json'))===metadata.baseGraphHash,'SEP_PACKAGE_BASE_UNSUPPORTED');
 const base=JSON.parse(baseBytes),next=JSON.parse(targetBytes),delta=validateDelta(base,next,metadata,release);
 const payload=await readdir(join(unpacked,'payload'));demand(payload.length===delta.payload.size&&payload.every(p=>delta.payload.has(p)),'SEP_PACKAGE_PAYLOAD');
 for(const digest of delta.payload)demand(await fileHash(join(unpacked,'payload',digest))===digest,'SEP_PACKAGE_PAYLOAD_HASH');
 for(const f of base.files){signal?.throwIfAborted();const path=join(currentRoot,f.path);demand(key(await realpath(path))===key(path)&&await fileHash(path)===f.sha256,'SEP_PACKAGE_SOURCE_CHANGED');}
 const root=programRoot??join(workRoot,'program');demand(isAbsolute(root),'SEP_PACKAGE_PATH');await directory(dirname(root));await mkdir(root);await directory(root);
 for(const f of next.files){signal?.throwIfAborted();const src=delta.changed.includes(f.path)?join(unpacked,'payload',f.sha256):join(currentRoot,f.path);await mkdir(dirname(join(root,f.path)),{recursive:true});await copyFile(src,join(root,f.path));demand(await fileHash(join(root,f.path))===f.sha256&&(await lstat(join(root,f.path))).size===f.size,'SEP_PACKAGE_COPY_CHANGED');}
 for(const [parent,deps]of [[root,next.roots],...next.packages.map(p=>[join(root,'store',p.id),p.dependencies])])for(const [name,id]of Object.entries(deps??{})){signal?.throwIfAborted();await mkdir(dirname(join(parent,'node_modules',name)),{recursive:true});await symlink(join(root,'store',id),join(parent,'node_modules',name),'junction');}
 await writeFile(join(root,'graph.json'),targetBytes,{flag:'wx'});
 demand(await fileHash(join(currentRoot,'graph.json'))===metadata.baseGraphHash,'SEP_PACKAGE_SOURCE_CHANGED');
 signal?.throwIfAborted();const result={schema:1,status:'program-prepared',root,graphHash:metadata.targetGraphHash,baseGraphHash:metadata.baseGraphHash,metadata,changed:delta.changed,archive,bundleSha256,scope:'Program files only. Profile preservation, isolated runtime health and exact-plan consent are required before installation.'};
 await writeFile(join(workRoot,'program-prepared.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
