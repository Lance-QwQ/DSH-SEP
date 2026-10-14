import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,realpath,link,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createProjectTree} from './project-tree.mjs';
const root=process.env.SEP_APFS_TEST_ROOT,helperPath=process.env.SEP_APFS_HELPER;
assert.ok(root&&helperPath,'explicit synthetic test paths required');
await mkdir(root,{mode:0o700});assert.equal(await realpath(root),root);
const helperSha256=createHash('sha256').update(await readFile(helperPath)).digest('hex');
const api=createProjectTree({helperPath,helperSha256,lockPath:join(root,'.native.lock')});
let counter=0;
async function folder(){const p=join(root,'case-'+(++counter));await mkdir(p,{mode:0o700});await writeFile(join(p,'note.txt'),'original',{mode:0o600});return p;}
test('tree hashes native content and omits content from public receipt',async()=>{
 const source=await folder(),a=await api.tree(source),b=await api.tree(source);
 assert.equal(a.sha256,b.sha256);assert.equal(a.version,b.version);assert.equal(a.bytes,8);
 assert.deepEqual(a.entries,[{path:'note.txt',kind:'file',size:8,sha256:'0682c5f2076f099c34cfdd15a9e063849ed437a49677e6fcc5b4198c76575be5',executable:false}]);
 assert.ok(!JSON.stringify(a).includes('original'));
});
test('copy receipt equals source and safe apply preserves old original',async()=>{
 const source=await folder(),dest=join(root,'copy');await mkdir(dest,{mode:0o700});
 const copied=await api.tree(source,{copyTo:dest});const current=await api.tree(dest);assert.equal(copied.sha256,current.sha256);
 await api.applyFile(dest,{path:'note.txt',expectedSha256:current.entries[0].sha256,text:'changed'});
 assert.equal(await readFile(join(dest,'note.txt'),'utf8'),'changed');assert.equal(await readFile(join(source,'note.txt'),'utf8'),'original');
});
test('wrong expected hash rejects without change',async()=>{
 const source=await folder();await assert.rejects(api.applyFile(source,{path:'note.txt',expectedSha256:'0'.repeat(64),text:'wrong'}),{code:'SEP_PROJECT_STALE_FILE'});
 assert.equal(await readFile(join(source,'note.txt'),'utf8'),'original');
});
test('create and delete use observed authorization',async()=>{
 const source=await folder();await api.applyFile(source,{path:'new',expectedSha256:'absent',text:'new'});
 const view=await api.tree(source);const row=view.entries.find(x=>x.path==='new');await api.applyFile(source,{path:'new',expectedSha256:row.sha256,delete:true});
 await assert.rejects(readFile(join(source,'new')),{code:'ENOENT'});
});
test('native error classification is retained without body',async()=>{
 const source=await folder();await link(join(source,'note.txt'),join(root,'hardlink'));
 await assert.rejects(api.tree(source),{code:'SEP_PROJECT_UNSAFE_TREE'});
});
test('directory handle owns fd and rejects after directory swap',async()=>{
 const source=await folder(),held=await api.directory(source,true);const stat=await held.stat({bigint:true});assert.equal(typeof stat.ino,'bigint');
 await rename(source,source+'-old');await mkdir(source,{mode:0o700});
 await assert.rejects(held.stat({bigint:true}),{code:'SEP_PROJECT_TREE_CHANGED'});await held.close();
});
test('helper hash mismatch refuses before data operations',async()=>{
 const source=await folder(),wrong=createProjectTree({helperPath,helperSha256:'0'.repeat(64),lockPath:join(root,'.native.lock')});
 await assert.rejects(wrong.tree(source),{code:'SEP_PROJECT_HELPER_CHANGED'});
});
