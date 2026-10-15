import {mkdir,lstat,realpath,open,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createFreshProfile} from './fresh-profile.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const demand=(value,code)=>{if(!value)fail(code);};
const key=p=>resolve(p).toLowerCase();
const inside=(parent,child)=>{const r=relative(parent,child);return r===''||r!=='..'&&!r.startsWith('..\\')&&!r.startsWith('../')&&!isAbsolute(r);};
export function safePath(path){
 demand(typeof path==='string'&&path.length>0&&path.length<=4096&&!path.includes('\\')&&!path.startsWith('/')&&path.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[\x00-\x1f<>:"|?*]/.test(part)&&!/[. ]$/.test(part)&&!/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(part)),'RELEASE_PATH_INVALID');return path;
}
const identity=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs','nlink'].every(k=>a[k]===b[k]);
const regular=s=>demand(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1n&&s.ino!==0n,'RELEASE_FILE_IDENTITY');
async function recordIO(root,record,destination){
 const path=join(root,safePath(record.path)),before=await lstat(path,{bigint:true});regular(before);demand(key(await realpath(path))===key(path),'RELEASE_FILE_IDENTITY');
 const file=await open(path,'r');let target;try{
  const opened=await file.stat({bigint:true});regular(opened);demand(identity(before,opened),'RELEASE_FILE_CHANGED');
  if(destination){await mkdir(dirname(destination),{recursive:true});target=await open(destination,'wx',record.mode);}
  const digest=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let total=0;
  while(true){const{bytesRead}=await file.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;demand(total<=record.size,'RELEASE_FILE_CHANGED');digest.update(buffer.subarray(0,bytesRead));if(target){let written=0;while(written<bytesRead){const r=await target.write(buffer,written,bytesRead-written,null);demand(r.bytesWritten>0,'RELEASE_WRITE_FAILED');written+=r.bytesWritten;}}}
  const after=await file.stat({bigint:true}),named=await lstat(path,{bigint:true});regular(after);regular(named);demand(identity(before,after)&&identity(after,named)&&key(await realpath(path))===key(path)&&total===record.size&&digest.digest('hex')===record.sha256,'RELEASE_FILE_CHANGED');if(target)await target.sync();
 }finally{await target?.close();await file.close();}
}
function records(rows){demand(Array.isArray(rows)&&rows.length<=150000,'RELEASE_MANIFEST');const names=new Set();for(const row of rows){safePath(row.path);demand(!names.has(row.path.toLowerCase()),'RELEASE_DUPLICATE');names.add(row.path.toLowerCase());demand(Number.isSafeInteger(row.size)&&row.size>=0&&/^[a-f0-9]{64}$/.test(row.sha256)&&[0o644,0o755,0o600,0o700].includes(row.mode),'RELEASE_MANIFEST');}return rows;}
async function json(path,limit){const s=await lstat(path,{bigint:true});regular(s);demand(s.size<=BigInt(limit)&&key(await realpath(path))===key(path),'RELEASE_MANIFEST');return JSON.parse(await readFile(path,'utf8'));}
async function checkDestination(destination,roots){
 demand(isAbsolute(destination),'RELEASE_DESTINATION_ABSOLUTE');for(const root of roots)demand(!inside(root,destination)&&!inside(destination,root),'RELEASE_DESTINATION_OVERLAP');
 try{await lstat(destination);fail('RELEASE_DESTINATION_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 const parent=dirname(destination);demand((await lstat(parent)).isDirectory()&&key(await realpath(parent))===key(parent),'RELEASE_DESTINATION_ALIAS');
}
function checkManifest(m,g){
 demand(m.schema===3&&['full','sep'].includes(m.kind)&&m.platform==='win32-x64'&&m.hostVersion==='0.2.1-alpha.2'&&m.sepVersion==='0.2.1-beta.3-alpha2-adapter.1'&&m.revision==='windows-package.2','RELEASE_MANIFEST');
 demand(m.graph.path==='graph.json'&&m.descriptor.path==='desktop-runtime.json','RELEASE_MANIFEST');records([m.graph,m.descriptor]);
 demand(g.schema===3&&g.kind==='dsh-sep-materialized-graph'&&g.platform==='win32-x64','RELEASE_GRAPH');records(g.files);records(m.payload);records(m.required);records(m.support);
 if(m.kind==='full')demand(m.required.length===0,'RELEASE_MANIFEST');
 const expected=new Map(g.files.map(f=>[f.path,JSON.stringify([f.size,f.sha256,f.mode])])),selected=new Set();
 for(const f of [...m.payload,...m.required]){demand(!selected.has(f.path.toLowerCase())&&expected.get(f.path)===JSON.stringify([f.size,f.sha256,f.mode]),'RELEASE_GRAPH_COVERAGE');selected.add(f.path.toLowerCase());}demand(selected.size===g.files.length,'RELEASE_GRAPH_COVERAGE');
 for(const f of g.files)demand(!['graph.json','desktop-runtime.json'].includes(f.path),'RELEASE_GRAPH_COVERAGE');
 for(const f of m.required)safePath(f.sourcePath);
 const allowed=f=>/^(?:runtime\/|managed\/bootstrap\/|installer\/|docs\/)/.test(f.path)||/^(?:installer\.mjs|README\.md|LICENSE|LICENSING\.md|THIRD_PARTY_NOTICES\.md)$/.test(f.path);
 for(const f of m.support)demand(allowed(f),'RELEASE_SUPPORT_SCOPE');
 const d=m.desktop;demand(d?.schema===1&&d.platform==='win32-x64'&&d.executable==='electron.exe'&&d.version==='44.7.0'&&Array.isArray(d.links)&&d.links.length===0,'RELEASE_DESKTOP_BINDING');records(d.files);
 const supportMap=new Map(m.support.map(f=>[f.path,f]));for(const f of d.files){const actual=supportMap.get('runtime/desktop/'+f.path);demand(actual&&actual.size===f.size&&actual.sha256===f.sha256&&actual.mode===f.mode,'RELEASE_DESKTOP_BINDING');}
 demand(d.files.length===m.support.filter(f=>f.path.startsWith('runtime/desktop/')).length&&d.files.some(f=>f.path===d.executable),'RELEASE_DESKTOP_BINDING');
 for(const p of ['runtime/node/node.exe','runtime/pnpm/bin/pnpm.cjs','managed/bootstrap/launcher.mjs'])demand(supportMap.has(p),'RELEASE_SUPPORT_REQUIRED');
}
/** Fresh installation only. An explicit, non-aliased absent target is required.
 * Source trees are read-only; every copy is checked before and during transfer. */
export async function install({bundle,destination,hostRoot}={}){
 demand(process.platform==='win32'&&process.arch==='x64','RELEASE_PLATFORM');demand(typeof bundle==='string'&&typeof destination==='string','RELEASE_ARGUMENT');demand(isAbsolute(destination),'RELEASE_DESTINATION_ABSOLUTE');
 bundle=resolve(bundle);destination=resolve(destination);if(hostRoot)hostRoot=resolve(hostRoot);
 demand(key(await realpath(bundle))===key(bundle),'RELEASE_SOURCE_ALIAS');
 const manifest=await json(join(bundle,'manifest.json'),32*1024*1024);
 if(manifest.kind==='sep'){demand(hostRoot,'RELEASE_SOURCE_REQUIRED');demand(key(await realpath(hostRoot))===key(hostRoot),'RELEASE_SOURCE_ALIAS');}
 await checkDestination(destination,[bundle,...hostRoot?[hostRoot]:[]]);
 records(manifest.payload);records(manifest.required);records(manifest.support);records([manifest.graph,manifest.descriptor]);
 await recordIO(bundle,manifest.graph);await recordIO(bundle,manifest.descriptor);
 const graph=await json(join(bundle,manifest.graph.path),32*1024*1024);checkManifest(manifest,graph);
 const inputs=[...manifest.payload.map(f=>({root:join(bundle,'payload'),source:f,target:'program/'+f.path})),...manifest.required.map(f=>({root:hostRoot,source:{...f,path:f.sourcePath},target:'program/'+f.path})),...manifest.support.map(f=>({root:bundle,source:f,target:f.path})),{root:bundle,source:manifest.graph,target:'program/graph.json'},{root:bundle,source:manifest.descriptor,target:'program/desktop-runtime.json'}];
 for(const input of inputs)await recordIO(input.root,input.source);
 // On later failure retain the incomplete tree and marker, never delete data.
 await checkDestination(destination,[bundle,...hostRoot?[hostRoot]:[]]);await mkdir(destination);
 await writeFile(join(destination,'INSTALLING.json'),JSON.stringify({schema:1,status:'installing',graphSha256:manifest.graph.sha256,revision:manifest.revision})+'\n',{flag:'wx',mode:0o600});
 for(const input of inputs)await recordIO(input.root,input.source,join(destination,input.target));
 const fresh=await createFreshProfile({destination,manifest});
 const modulePath=join(destination,'program/node_modules/dsh-sep-bundle/bundle/modules/system-enhancement-package/src/p2/control.js');
 const {openControl}=await import(pathToFileURL(modulePath));const control=await openControl({storageRoot:fresh.config.storageRoot,mode:'maintenance',initialize:true});await control.close();
 const {Budget}=await import(pathToFileURL(join(destination,'program/node_modules/dsh-sep-bundle/bundle/modules/system-enhancement-package/src/budget-ledger.js')));await new Budget(fresh.budgetPath,{limit:100,initialSpent:0,taskLimitCny:5}).init();
 const receipt={schema:1,status:'pass',kind:manifest.kind,hostVersion:manifest.hostVersion,sepVersion:manifest.sepVersion,revision:manifest.revision,installationRoot:destination,programGraphSha256:manifest.graph.sha256,privateDataImported:false,originalHostModified:false,modelCalls:0,applicationStarted:false,configPath:fresh.configPath,launcherPath:fresh.launcherPath,managedLauncherPath:fresh.managedLauncherPath};
 await writeFile(join(destination,'installed.pending'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});await rename(join(destination,'installed.pending'),join(destination,'installed.json'));await unlink(join(destination,'INSTALLING.json'));return receipt;
}
