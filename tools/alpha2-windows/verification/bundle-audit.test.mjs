import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,link} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {auditBundle} from './bundle-audit.mjs';
const root=resolve(process.env.SEP_WINDOWS_VERIFY_TEST_ROOT??'');
assert(root.startsWith('D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1\\'));
await mkdir(root,{recursive:false});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const spec={hostVersion:'0.2.1-alpha.2',sepVersion:'0.2.1-beta.3-alpha2-adapter.1',revision:'windows-package.1'};
let n=0;
async function fixture(kind='full'){
 const home=join(root,String(++n));await mkdir(home);
 async function file(path,bytes){await mkdir(dirname(join(home,path)),{recursive:true});await writeFile(join(home,path),bytes,{flag:'wx'});return {path,size:Buffer.byteLength(bytes),sha256:sha(bytes),mode:420};}
 const payload=await file('payload/a.txt','fixed program');payload.path='a.txt';
 const g={schema:3,kind:'dsh-sep-materialized-graph',platform:'win32-x64',files:[payload]};
 const graph=await file('graph.json',JSON.stringify(g)+'\n');const descriptor=await file('desktop-runtime.json','{}\n');
 const support=await file('installer.mjs','export const synthetic=true;\n');
 const m={schema:3,kind,platform:'win32-x64',...spec,graph,descriptor,payload:[payload],required:[],support:[support]};
 await writeFile(join(home,'manifest.json'),JSON.stringify(m)+'\n',{flag:'wx'});
 return {home,m,g,file,save:async()=>writeFile(join(home,'manifest.json'),JSON.stringify(m)+'\n')};
}
test('accept exact manifest-bound real files and return graph identity',async()=>{const f=await fixture();const r=await auditBundle(f.home,spec);assert.equal(r.status,'pass');assert.equal(r.graphSha256,f.m.graph.sha256);assert.equal(r.archiveRegularFiles,5);assert.equal(r.payloadFiles,1);});
test('unexpected archive member refuses even if manifest still valid',async()=>{const f=await fixture();await f.file('unlisted.txt','extra');await assert.rejects(auditBundle(f.home,spec),{code:'VERIFY_UNBOUND_MEMBER'});});
test('payload byte mutation refuses',async()=>{const f=await fixture();await writeFile(join(f.home,'payload/a.txt'),'bad');await assert.rejects(auditBundle(f.home,spec),{code:'VERIFY_FILE_CHANGED'});});
test('graph digest is bound before graph is interpreted',async()=>{const f=await fixture();await writeFile(join(f.home,'graph.json'),'{}');await assert.rejects(auditBundle(f.home,spec),{code:'VERIFY_FILE_CHANGED'});});
test('missing graph coverage refuses rather than omitting program files',async()=>{const f=await fixture();f.m.payload=[];await f.save();await assert.rejects(auditBundle(f.home,spec),{code:'VERIFY_GRAPH_COVERAGE'});});
test('case aliased record refuses before file lookup',async()=>{const f=await fixture();f.m.support.push({...f.m.support[0],path:'INSTALLER.mjs'});await f.save();await assert.rejects(auditBundle(f.home,spec),{code:'VERIFY_DUPLICATE_PATH'});});
test('Only donor path traversal refuses',async()=>{const f=await fixture('sep');f.m.required=[{...f.m.payload[0],sourcePath:'../a.txt'}];f.m.payload=[];await f.save();await assert.rejects(auditBundle(f.home,spec),{code:'VERIFY_PATH'});});
test('hardlinked archive support file refuses',async()=>{const f=await fixture();await link(join(f.home,'installer.mjs'),join(root,'external-hardlink'));await assert.rejects(auditBundle(f.home,spec),{code:'VERIFY_FILE_IDENTITY'});});
test('wrong host version refuses as incompatible manifest',async()=>{const f=await fixture();f.m.hostVersion='0.2.1-alpha.1';await f.save();await assert.rejects(auditBundle(f.home,spec),{code:'VERIFY_MANIFEST'});});
test('support entry cannot overwrite payload namespace',async()=>{const f=await fixture();f.m.support.push({...f.m.payload[0],path:'payload/a.txt'});await f.save();await assert.rejects(auditBundle(f.home,spec),{code:'VERIFY_DUPLICATE_PATH'});});
