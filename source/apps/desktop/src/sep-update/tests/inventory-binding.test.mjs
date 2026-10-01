import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {inventory,makeReport} from '../update-inventory.mjs';
import {hash} from '../update-core.mjs';
async function fixture({optional=true,external=false,changed=false,untracked=false}={}){
 const root=await mkdtemp(join(tmpdir(),'sep-compat-fixture-')),pkg=join(root,'store/p'),home=join(root,'home');await mkdir(pkg,{recursive:true});await mkdir(home);await mkdir(join(root,'node_modules'));
 const manifest={name:'fixture',version:'1.0.0',peerDependencies:{'sep-fixture-absent-peer':'^1'},peerDependenciesMeta:optional?{'sep-fixture-absent-peer':{optional:true}}:{}};
 const contents={'package.json':JSON.stringify(manifest),'index.mjs':'throw Error("MUST_NOT_IMPORT");'};
 const graph={roots:{fixture:'p'},packages:[{id:'p',name:'fixture',version:'1.0.0',dependencies:{}}],files:[]};
 for(const [name,body]of Object.entries(contents)){await writeFile(join(pkg,name),body);graph.files.push({path:'store/p/'+name,size:Buffer.byteLength(body),sha256:hash(body)});}
 await symlink(pkg,join(root,'node_modules/fixture'),'junction');await writeFile(join(root,'graph.json'),JSON.stringify(graph));await writeFile(join(root,'package.json'),JSON.stringify({dsh:{profile:{bundles:[]}}}));
 let entry=join(root,'node_modules/fixture/index.mjs');if(external){entry=join(home,'external.mjs');await writeFile(entry,contents['index.mjs']);}
 if(changed)await writeFile(join(pkg,'index.mjs'),'throw Error("CHANGED");');
 if(untracked){await mkdir(join(root,'store/node_modules/sep-fixture-absent-peer'),{recursive:true});await writeFile(join(root,'store/node_modules/sep-fixture-absent-peer/package.json'),'{}');}
 await writeFile(join(root,'cordis.patch.yml'),JSON.stringify([{insert:[{id:'test',name:pathToFileURL(entry).href}]}]));
 const inv=await inventory(root,{profileContext:{home,overlayFiles:[],installAnchor:join(root,'package.json')}});
 return {inv,root};
}
function report(inv){return makeReport(inv,inv,{version:'1.0.0'},'1.0.0',()=>true);}
test('verified absent optional peer does not claim unresolved dependency',async()=>{const {inv}=await fixture();const row=inv.plugins.find(p=>p.instanceId==='package:p');assert.equal(row.resolvedDependencies['sep-fixture-absent-peer'],null);assert.deepEqual(inv.hardBlocks,[]);assert.doesNotMatch(report(inv).plugins[0].reasons.join(' '),/解析证据不足/);assert.equal(report(inv).plugins[0].verdict,'unknown');});
test('verified absent required peer is incompatible',async()=>{const {inv}=await fixture({optional:false});assert.equal(report(inv).plugins[0].verdict,'incompatible');});
test('graph-owned file URL inherits exact package dependencies without importing it',async()=>{const {inv}=await fixture();const row=inv.plugins.find(p=>p.instanceId==='test');assert.equal(row.version,'1.0.0');assert.equal(row.entryPath,'index.mjs');assert.equal(row.resolvedDependencies['sep-fixture-absent-peer'],null);assert.deepEqual(inv.hardBlocks,[]);assert.doesNotMatch(report(inv).plugins.at(-1).reasons.join(' '),/无法唯一绑定/);});
test('untracked file URL stays unknown',async()=>{const {inv}=await fixture({external:true});assert.equal(inv.plugins.find(p=>p.instanceId==='test').resolvedDependencies,undefined);assert.match(report(inv).plugins.at(-1).reasons.join(' '),/无法唯一绑定/);});
test('tampered graph file cannot inherit package identity',async()=>{const {inv}=await fixture({changed:true});assert.ok(inv.hardBlocks.some(x=>x.startsWith('INTEGRITY_CHANGED')));assert.equal(inv.plugins.find(p=>p.instanceId==='test').resolvedDependencies,undefined);});
test('untracked ancestor dependency is not asserted absent',async()=>{const {inv}=await fixture({untracked:true});assert.equal(inv.plugins.find(p=>p.instanceId==='package:p').resolvedDependencies['sep-fixture-absent-peer'],undefined);assert.ok(inv.hardBlocks.some(x=>x.startsWith('DEPENDENCY_RESOLUTION_UNVERIFIED')));});
