import assert from 'node:assert/strict';
import {readFile,realpath,mkdir,mkdtemp,cp,symlink,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
const lock=JSON.parse(await readFile(new URL('./host-lock.json',import.meta.url)));
assert.ok(process.env.SEP_HISTORY_HOST,'SEP_HISTORY_HOST is required; no ambient daily lookup');
assert.ok(process.env.SEP_HISTORY_EVIDENCE_ROOT,'SEP_HISTORY_EVIDENCE_ROOT is required');
export const root=resolve(process.env.SEP_HISTORY_HOST);
assert.equal(Number(process.versions.node.split('.')[0]),24);
const bytes=await readFile(join(root,'graph.json'));assert.equal(hash(bytes),lock.graphSha256,'Host graph differs');
export const graph=JSON.parse(bytes),modules=new Map(),ids=new Set();
function collect(id){assert.ok(id);if(ids.has(id))return;ids.add(id);const p=graph.packages.find(p=>p.id===id);assert.ok(p);for(const dep of Object.values(p.dependencies??{}))collect(dep);}
for(const name of lock.entries)collect(graph.roots[name]);
collect(graph.roots['dsh-system-enhancement-package']);collect(graph.roots['dsh-sep-plugin-group']);
let cursor=0;const files=graph.files.filter(f=>ids.has(f.path.split('/')[1]));
await Promise.all(Array.from({length:4},async()=>{while(cursor<files.length){const f=files[cursor++],p=join(root,f.path);assert.equal((await realpath(p)).toLowerCase(),p.toLowerCase());assert.equal(hash(await readFile(p)),f.sha256,'Host file changed: '+f.path);}}));
for(const p of graph.packages.filter(p=>ids.has(p.id)))for(const [name,id] of Object.entries(p.dependencies??{}))assert.equal((await realpath(join(root,'store',p.id,'node_modules',name))).toLowerCase(),join(root,'store',id).toLowerCase(),'Dependency redirected');
export const load=name=>import(pathToFileURL(join(root,'store',graph.roots['@deepseek-ai/'+name],'lib/index.js')));
for(const name of lock.entries){const mod=await import(pathToFileURL(join(root,'store',graph.roots[name],'lib/index.js')));modules.set(name.slice('@deepseek-ai/'.length),mod.default??mod);}
await mkdir(resolve(process.env.SEP_HISTORY_EVIDENCE_ROOT),{recursive:true});
export const evidence=await mkdtemp(join(resolve(process.env.SEP_HISTORY_EVIDENCE_ROOT),'run-'));
export const stage=join(evidence,'suite-stage');await mkdir(stage);
export const source=process.env.SEP_HISTORY_SOURCE?resolve(process.env.SEP_HISTORY_SOURCE):fileURLToPath(new URL('../../src',import.meta.url));
await cp(source,join(stage,'src'),{recursive:true,errorOnExist:true,force:false});
await writeFile(join(stage,'package.json'),' {"type":"module"}\n');
await symlink(join(root,'store',graph.roots['dsh-system-enhancement-package'],'node_modules'),join(stage,'node_modules'),'junction');
export const plugin=await import(pathToFileURL(join(stage,'src/index.js')));
export const sourceBinding={hostVersion:lock.hostVersion,hostGraphSha256:hash(bytes),verifiedHostFiles:files.length,nodeVersion:process.version,source,sourceHashes:Object.fromEntries(await Promise.all(['p1.js','store.js','p1-failures.js','layered-memory.js','native-image-budget.js','deepseek.js','budget-lock.js','budget-ledger.js','budget-scope.js','budget-pricing.js','budget-request.js','index.js'].map(async f=>{try{return [f,hash(await readFile(join(stage,'src',f)))];}catch(error){if(error.code==='ENOENT'&&f==='native-image-budget.js')return [f,null];throw error;}})))};
await writeFile(join(evidence,'source-binding.json'),JSON.stringify(sourceBinding,null,2)+'\n');
console.log('Synthetic composition evidence:',evidence);

// Mount the actual SEP group source with pinned host dependencies.
export const groupStage=join(evidence,'group-stage');await mkdir(groupStage);
const groupSource=resolve(source,'../../plugin-group');
for(const part of ['source','vendor'])await cp(join(groupSource,part),join(groupStage,part),{recursive:true});
await writeFile(join(groupStage,'package.json'),' {"type":"module"}\n');
await symlink(join(root,'store',graph.roots['dsh-sep-plugin-group'],'node_modules'),join(groupStage,'node_modules'),'junction');
export const groupPlugin=await import(pathToFileURL(join(groupStage,'source/index.mjs')));
sourceBinding.groupSourceHashes=Object.fromEntries(await Promise.all(['index.mjs','prework.mjs','policies.mjs'].map(async f=>[f,hash(await readFile(join(groupStage,'source',f)))])));
await writeFile(join(evidence,'source-binding.json'),JSON.stringify(sourceBinding,null,2)+'\n');
