import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,lstat,link} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateRows,portableImports,copyVerifiedProgram} from './program-files.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const output=process.env.SEP_WINDOWS_TEST_ROOT;
assert.match(output??'',/^D:[\\/]/i);
async function fixture(){const root=await mkdtemp(join(output,'program-')),source=join(root,'source'),out=join(root,'out');await mkdir(source);return {root,source,out};}
function row(path,body){return {path,size:Buffer.byteLength(body),sha256:hash(body),mode:420};}
test('valid input rows preserve exact package-relative paths',()=>assert.deepEqual(validateRows([row('node_modules/a/index.js','a')]),[row('node_modules/a/index.js','a')]));
test('reject traversal, aliases and case collisions before copying',()=>{
 for(const path of ['../secret','a/../secret','a\\b','C:/secret','a//b','a:stream','NUL','dir/CON.txt','file.','dir/file '])assert.throws(()=>validateRows([row(path,'a')]),{code:'PACKAGE_PATH_INVALID'});
 assert.throws(()=>validateRows([row('A.js','a'),row('a.js','a')]),{code:'PACKAGE_DUPLICATE_PATH'});
});
test('invalid lengths and digests are not accepted as a graph',()=>{
 for(const patch of [{size:-1},{size:1.2},{sha256:'x'},{mode:511}])assert.throws(()=>validateRows([{...row('a.js','a'),...patch}]),{code:'PACKAGE_FILE_RECORD_INVALID'});
});
test('approved adapter imports resolve relative to installed program',()=>{
 const root=join(output,'synthetic-source'),url=pathToFileURL(join(root,'node_modules/dsh-sep-bundle/bundle/lib/a.js')).href;
 const result=portableImports(`import {a} from '${url}';\n`,root);
 assert.equal(result.text,"import {a} from '../node_modules/dsh-sep-bundle/bundle/lib/a.js';\n");assert.equal(result.transforms.length,1);
});
test('adapter rejects external and non-core file imports',()=>{
 const root=join(output,'synthetic-source');
 for(const path of [join(output,'outside.js'),join(root,'node_modules/user-plugin/a.js')])assert.throws(()=>portableImports(`import {a} from '${pathToFileURL(path).href}';`,root),{code:'PACKAGE_EXTERNAL_IMPORT'});
});
test('copy is byte exact and source remains unchanged',async()=>{
 const {source,out}=await fixture();await mkdir(join(source,'sub'));await writeFile(join(source,'sub/a.js'),'export const a=1;');
 const rows=[row('sub/a.js','export const a=1;')];const result=await copyVerifiedProgram({source,out,files:rows});
 assert.equal(result.files,1);assert.equal(await readFile(join(out,'sub/a.js'),'utf8'),'export const a=1;');assert.equal(await readFile(join(source,'sub/a.js'),'utf8'),'export const a=1;');
});
test('tampered source and existing target refuse without overwriting',async()=>{
 const {source,out}=await fixture();await writeFile(join(source,'a.js'),'changed');
 await assert.rejects(copyVerifiedProgram({source,out,files:[row('a.js','original')]}),{code:'PACKAGE_SOURCE_CHANGED'});
 const other=join(source,'existing');await mkdir(other);await writeFile(join(other,'marker'),'keep');
 await assert.rejects(copyVerifiedProgram({source,out:other,files:[row('a.js','changed')]}),{code:'PACKAGE_DESTINATION_INVALID'});assert.equal(await readFile(join(other,'marker'),'utf8'),'keep');
});
test('hard-linked source refuses even with matching content hash',async()=>{
 const {root,source,out}=await fixture();await writeFile(join(root,'private-like-fixture'),'fixture');await link(join(root,'private-like-fixture'),join(source,'a.js'));
 assert.equal((await lstat(join(source,'a.js'))).nlink,2);
 await assert.rejects(copyVerifiedProgram({source,out,files:[row('a.js','fixture')]}),{code:'PACKAGE_SOURCE_IDENTITY'});
});
