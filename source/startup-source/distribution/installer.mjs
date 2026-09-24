import {readFile,writeFile,mkdir,lstat,realpath,copyFile,symlink,rename} from 'node:fs/promises';
import {join,resolve,dirname,relative,isAbsolute,sep} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash,randomUUID} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex'),fail=s=>{throw Error(s);},inside=(a,b)=>{const r=relative(a,b);return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));};
export function safePath(p){if(typeof p!=='string'||!p||p.includes('\\')||p.split('/').some(x=>!x||x==='.'||x==='..'||/[<>:"|?*\x00-\x1f]/.test(x)||/[. ]$/.test(x)))fail('PACKAGE_PATH');return p;}
export async function verifyFile(p,f){const s=await lstat(p);if(!s.isFile()||s.isSymbolicLink())fail('FILE_IDENTITY');const b=await readFile(p);if(b.length!==f.size||sha(b)!==f.sha256)fail('CONTENT_CHANGED: '+p);return b;}
export async function checkDestination(p,sources=[]){p=resolve(p);if(sources.some(s=>inside(resolve(s),p)||inside(p,resolve(s))))fail('DESTINATION_OVERLAP');try{await lstat(p);fail('DESTINATION_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}if((await realpath(dirname(p))).toLowerCase()!==dirname(p).toLowerCase())fail('DESTINATION_ALIAS');return p;}
export function settings(root,graphHash){return {schema:1,kind:'dsh-sep-managed-daily',dailyRoot:root,releaseRoot:join(root,'program'),graphHash,nodeExecutable:join(root,'runtime/node/node.exe'),home:join(root,'home'),storageRoot:join(root,'data/storage'),controlRoot:join(root,'state/center/control'),lockDirectory:join(root,'state/locks'),electronUserData:join(root,'state/electron'),runtimeUser:join(root,'state/user'),credentialsPath:join(root,'.env'),pnpmEntry:join(root,'runtime/pnpm/bin/pnpm.cjs'),projects:[{id:randomUUID(),root:join(root,'workspace')}]};}
export async function install({bundle,destination,hostRoot}={}){
 bundle=await realpath(resolve(bundle));destination=await checkDestination(destination,[bundle,...(hostRoot?[hostRoot]:[])]);
 const m=JSON.parse(await readFile(join(bundle,'manifest.json'),'utf8'));if(m.schema!==1||!['full','sep'].includes(m.kind))fail('PACKAGE_SCHEMA');if(process.platform!=='win32'||process.arch!=='x64')fail('WINDOWS_X64_REQUIRED');
 const gb=await verifyFile(join(bundle,'graph.json'),m.graph),g=JSON.parse(gb);if(g.kind!=='dsh-sep-local-offline-graph')fail('GRAPH_SCHEMA');
 const ids=new Set(g.packages.map(p=>p.id));for(const p of g.packages){safePath(p.id);safePath(p.name);}for(const deps of [g.roots,...g.packages.map(p=>p.dependencies)])for(const [name,id]of Object.entries(deps)){safePath(name);if(!ids.has(id))fail('GRAPH_REFERENCE');}
 let hg;if(m.kind==='sep'){if(!hostRoot)fail('HOST_REQUIRED');hostRoot=await realpath(resolve(hostRoot));try{hg=JSON.parse(await readFile(join(hostRoot,'graph.json')));}catch{}const hp=join(hostRoot,'node_modules/@deepseek-ai/dsh/package.json');const v=JSON.parse(await readFile(hp)).version;if(v!=='0.1.6-alpha.2')fail('HOST_VERSION_UNSUPPORTED: '+v);}
 const sources=new Map(),payload=new Set(m.payload);const seen=new Set();
 for(const f of g.files){safePath(f.path);if(seen.has(f.path.toLowerCase())||!f.path.startsWith('store/')||!ids.has(f.path.split('/')[1]))fail('GRAPH_PATH');seen.add(f.path.toLowerCase());let src;
  if(m.kind==='full'||payload.has(f.path))src=join(bundle,'payload',f.path);else {const p=g.packages.find(p=>p.id===f.path.split('/')[1]),rel=f.path.split('/').slice(2).join('/');let base;if(hg){const matches=hg.packages.filter(x=>x.name===p.name&&x.version===p.version);if(matches.length!==1)fail('HOST_PACKAGE_AMBIGUOUS: '+p.name);base=join(hostRoot,'store',matches[0].id);}else base=join(hostRoot,'node_modules',p.name);src=join(base,rel);}
  await verifyFile(src,f);sources.set(f.path,src);
 }
 for(const f of m.support){safePath(f.path);await verifyFile(join(bundle,f.path),f);}
 // All inputs checked before mutation; create-only installation. Original host is never patched in place.
 await mkdir(destination);await writeFile(join(destination,'INSTALLING.json'),JSON.stringify({kind:m.kind,graphHash:sha(gb),startedAt:new Date().toISOString()}));
 const program=join(destination,'program');await mkdir(program);for(const f of g.files){const p=join(program,f.path);await mkdir(dirname(p),{recursive:true});await writeFile(p,await verifyFile(sources.get(f.path),f),{flag:'wx'});}
 async function links(base,deps){for(const [name,id]of Object.entries(deps)){const p=join(base,'node_modules',name);await mkdir(dirname(p),{recursive:true});await symlink(join(program,'store',id),p,'junction');}}
 for(const p of g.packages)await links(join(program,'store',p.id),p.dependencies);await links(program,g.roots);await writeFile(join(program,'graph.json'),gb);
 // Install only manifest-bound public documents; installer/control files remain bundle-only.
 const publicDocuments=new Set(['LICENSE','LICENSING.md','THIRD_PARTY_NOTICES.md','RELEASE-STATUS.json','SOURCE-PROVENANCE.json']);
 for(const f of m.support.filter(f=>f.path.startsWith('runtime/')||f.path.startsWith('docs/')||publicDocuments.has(f.path))){const p=join(destination,f.path);await mkdir(dirname(p),{recursive:true});await writeFile(p,await verifyFile(join(bundle,f.path),f),{flag:'wx'});}
 const c=settings(destination,sha(gb));for(const p of [c.home,join(c.home,'sessions'),c.storageRoot,c.controlRoot,c.lockDirectory,c.electronUserData,c.runtimeUser,join(c.runtimeUser,'temp'),join(c.projects[0].root,'knowledge'),join(destination,'managed')])await mkdir(p,{recursive:true});
 const templates=JSON.parse(await readFile(join(bundle,'templates.json'))),proj=c.projects[0];
 function substitute(v){if(Array.isArray(v))return v.map(substitute);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,substitute(x)]));if(typeof v==='string')return v.replaceAll('@ROOT@',destination).replaceAll('@PROGRAM_URL@',pathToFileURL(program).href).replaceAll('@PROJECT_ID@',proj.id);return v;}
 const suite=substitute(templates.suite),patch=substitute(templates.patch);await writeFile(join(destination,'managed/suite-config.json'),JSON.stringify(suite,null,2));await writeFile(join(program,'cordis.patch.yml'),JSON.stringify(patch,null,2));
 for(const [n,v]of Object.entries(templates.program))await writeFile(join(program,safePath(n)),typeof v==='string'?v:JSON.stringify(v,null,2));
 await installBootstrap({bundle,destination,manifest:m,graphHash:c.graphHash});
 await writeFile(join(destination,'deployment.json'),JSON.stringify(c,null,2));await writeFile(join(destination,'.env'),'# Fill locally; never send this file to others.\nDEEPSEEK_API_KEY=\n');
 await copyFile(join(bundle,'README.md'),join(destination,'README.md'));
 const {openControl}=await import(pathToFileURL(join(program,'node_modules/dsh-system-enhancement-package/src/p2/control.js')));const ctl=await openControl({storageRoot:c.storageRoot,mode:'maintenance',initialize:true});await ctl.close();
 const receipt={schema:1,status:'installed',kind:m.kind,instanceId:randomUUID(),graphHash:c.graphHash,projectId:proj.id,root:destination,hostSource:hostRoot??null,originalHostModified:false,privateDataImported:false,modelCalls:0,installedAt:new Date().toISOString()};await writeFile(join(destination,'installed.pending.json'),JSON.stringify(receipt,null,2));await rename(join(destination,'installed.pending.json'),join(destination,'installed.json'));console.log(JSON.stringify(receipt));return receipt;
}
if(import.meta.main){const [destination,hostRoot]=process.argv.slice(2);if(!destination)throw Error('Usage: node installer.mjs <new-directory> [supported-host-root]');await install({bundle:import.meta.dirname,destination:resolve(destination),hostRoot});}


export async function installBootstrap({bundle,destination,manifest,graphHash}){
 if(manifest.bootstrap?.schema!==1||!Array.isArray(manifest.bootstrap.files))fail('BOOTSTRAP_MANIFEST');
 const records=[],seen=new Set();
 for(const f of manifest.bootstrap.files){safePath(f.path);if(seen.has(f.path.toLowerCase()))fail('BOOTSTRAP_DUPLICATE');seen.add(f.path.toLowerCase());const bound=manifest.support.find(x=>x.path==='bootstrap/'+f.path);if(!bound||bound.sha256!==f.sha256||bound.size!==f.size)fail('BOOTSTRAP_UNBOUND');const b=await verifyFile(join(bundle,'bootstrap',f.path),f);records.push({file:f.path,bytes:b});}
 for(const p of ['launcher.mjs','launch.mjs','start.vbs','start.ps1'])if(!seen.has(p))fail('BOOTSTRAP_MISSING');
 const roots=new Set(['launch.mjs','start.vbs','start.ps1']);const installed=[];
 for(const f of records){const target=roots.has(f.file)?f.file:'managed/'+f.file;let b=f.bytes;if(f.file==='launcher.mjs')b=Buffer.from(b.toString().replaceAll('@GRAPH_HASH@',graphHash));if(f.file==='launch.mjs')b=Buffer.from(b.toString().replaceAll('@MANAGED_DIR@','managed').replaceAll('@CONFIG_FILE@','deployment.json'));await mkdir(dirname(join(destination,target)),{recursive:true});await writeFile(join(destination,target),b,{flag:'wx'});installed.push({path:target,size:b.length,sha256:sha(b)});}
 await writeFile(join(destination,'managed/bootstrap-receipt.json'),JSON.stringify({schema:1,graphHash,files:installed},null,2),{flag:'wx'});return installed;
}
