import {readFile,realpath,mkdtemp,mkdir,writeFile,copyFile,symlink,unlink,rmdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {after} from 'node:test';
import assert from 'node:assert/strict';
const lock=JSON.parse(await readFile(new URL('./host-lock.json',import.meta.url)));
assert.ok(process.env.SEP_MEMORY_HOST,'Set SEP_MEMORY_HOST to the explicitly pinned installed Host root; no personal-path fallback.');
assert.equal(Number(process.versions.node.split('.')[0]),lock.nodeMajor,'Pinned Node major required');
export const root=resolve(process.env.SEP_MEMORY_HOST),installed=join(root,'node_modules');
const graphBytes=await readFile(join(root,'graph.json')),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(graphBytes),lock.graphSha256,'Host graph differs from committed test lock');
const graph=JSON.parse(graphBytes),ids=new Set();
function collect(id){assert.ok(id);if(ids.has(id))return;ids.add(id);const p=graph.packages.find(p=>p.id===id);assert.ok(p);for(const dep of Object.values(p.dependencies??{}))collect(dep);}
for(const name of lock.entries.filter(n=>n!=='zod')){collect(graph.roots[name]);assert.equal((await realpath(join(installed,name))).toLowerCase(),join(root,'store',graph.roots[name]).toLowerCase());}
const zodId=graph.packages.find(p=>p.id===graph.roots['dsh-system-enhancement-package']).dependencies.zod;
collect(zodId);
const files=graph.files.filter(f=>ids.has(f.path.split('/')[1]));
let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<files.length){const f=files[cursor++],p=join(root,f.path);assert.equal((await realpath(p)).toLowerCase(),p.toLowerCase());assert.equal(hash(await readFile(p)),f.sha256,'Host file changed: '+f.path);}}));
for(const p of graph.packages.filter(p=>ids.has(p.id)))for(const [name,id] of Object.entries(p.dependencies??{}))assert.equal((await realpath(join(root,'store',p.id,'node_modules',name))).toLowerCase(),join(root,'store',id).toLowerCase(),'Host dependency redirected');
export const load=name=>import(pathToFileURL(join(installed,'@deepseek-ai',name,'lib/index.js')));
