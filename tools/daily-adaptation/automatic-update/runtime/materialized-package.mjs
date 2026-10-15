import {isDeepStrictEqual} from 'node:util';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {packageOwner,assertGraphLayout} from './graph-layout.mjs';
const demand=(value,code)=>{if(!value)throw Error(code);};
const owners=new Set(['dsh-sep-bundle','@deepseek-ai/dsh-recovery','@deepseek-ai/dsh-desktop','@deepseek-ai/dsh-desktop-host','@deepseek-ai/dsh-client-ui-settings-memory','dsh-sep-brand']);
const safe=p=>typeof p==='string'&&p.length<500&&!/[\\:\x00-\x1f<>"|?*]/.test(p)&&p.split('/').every(s=>s&&!['.','..'].includes(s)&&!/[ .]$/.test(s)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s));
export function materializedOwner(graph,path){return packageOwner(graph,path)?.id??(path.startsWith('daily-adapter/')?'@daily-adapter':path==='package.json'?'@root-manifest':null);}
export async function verifyMaterializedRootManifest(baseRoot,nextRoot,graph){
 const before=JSON.parse(await readFile(join(baseRoot,'package.json'))),after=JSON.parse(await readFile(join(nextRoot,'package.json'))),expected=structuredClone(before);
 for(const [name,id]of Object.entries(graph.roots))if(Object.hasOwn(expected.dependencies??{},name))expected.dependencies[name]=graph.packages.find(p=>p.id===id).version;
 demand(isDeepStrictEqual(after,expected),'SEP_PACKAGE_ROOT_MANIFEST');
}
/** Exact same-host/same-topology deltas only. A nested dependency retains its
 * own ownership even below an SEP-owned directory. No downloaded installer runs. */
export function validateMaterializedDelta(base,next,metadata,release){
 demand(metadata?.schema===2&&metadata.kind==='sep-materialized-delta'&&metadata.platform===process.platform+'-'+process.arch&&metadata.hostVersion===release.version&&metadata.sepVersion===release.sepVersion,'SEP_PACKAGE_METADATA');
 demand(base?.schema===3&&next?.schema===3&&base.platform===metadata.platform&&next.platform===metadata.platform&&Array.isArray(base.packages)&&Array.isArray(next.packages)&&base.packages.length===next.packages.length&&isDeepStrictEqual(base.roots,next.roots)&&isDeepStrictEqual(base.packagePaths,next.packagePaths),'SEP_PACKAGE_TOPOLOGY');
 for(const g of [base,next]){
  demand(g.packages.length<=5000&&Array.isArray(g.files)&&g.files.length<=200000,'SEP_PACKAGE_LIMIT');assertGraphLayout(g);
  const paths=new Set(),ids=new Set(g.packages.map(p=>p.id)),packagePaths=Object.values(g.packagePaths);
  demand(new Set(packagePaths.map(p=>p.toLowerCase())).size===packagePaths.length,'SEP_PACKAGE_TOPOLOGY');
  for(const p of g.packages)demand(/^[a-zA-Z0-9_-]+$/.test(p.id),'SEP_PACKAGE_ID');
  for(const f of g.files){demand(safe(f.path)&&!['graph.json','desktop-runtime.json'].includes(f.path)&&!paths.has(f.path.toLowerCase())&&/^[a-f0-9]{64}$/.test(f.sha256)&&Number.isSafeInteger(f.size)&&f.size>=0&&f.size<=2147483648,'SEP_PACKAGE_FILE');demand([0o600,0o644,0o700,0o755].includes(f.mode),'SEP_PACKAGE_MODE');paths.add(f.path.toLowerCase());}
  for(const deps of [g.roots,...g.packages.map(p=>p.dependencies??{})])for(const [name,id]of Object.entries(deps))demand(/^(?:@[a-zA-Z0-9_][a-zA-Z0-9._-]*\/)?[a-zA-Z0-9_][a-zA-Z0-9._-]*$/.test(name)&&ids.has(id)&&g.packages.find(p=>p.id===id).name===name,'SEP_PACKAGE_DEPENDENCY');
 }
 const root=(g,name)=>g.packages.find(p=>p.id===g.roots[name]);
 demand(root(base,'@deepseek-ai/dsh')?.version===release.version&&root(next,'@deepseek-ai/dsh')?.version===release.version&&root(base,'dsh-sep-bundle')?.version===metadata.fromSepVersion&&root(next,'dsh-sep-bundle')?.version===release.sepVersion,'SEP_PACKAGE_VERSION');
 const byId=new Map(base.packages.map(p=>[p.id,p]));
 for(const p of next.packages){const old=byId.get(p.id);demand(old&&p.name===old.name&&isDeepStrictEqual(p.dependencies,old.dependencies),'SEP_PACKAGE_TOPOLOGY');if(!owners.has(p.name))demand(isDeepStrictEqual(old,p),'SEP_PACKAGE_PRESERVATION');}
 const before=new Map(base.files.map(f=>[f.path,f])),after=new Map(next.files.map(f=>[f.path,f])),changed=[];
 for(const path of new Set([...before.keys(),...after.keys()]))if(!isDeepStrictEqual(before.get(path),after.get(path))){const id=materializedOwner(base,path)??materializedOwner(next,path);demand(id==='@daily-adapter'||id==='@root-manifest'||owners.has(byId.get(id)?.name),'SEP_PACKAGE_PRESERVATION');changed.push(path);}
 return {changed,payload:new Set(changed.filter(p=>after.has(p)).map(p=>after.get(p).sha256))};
}
