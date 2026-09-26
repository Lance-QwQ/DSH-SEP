import {readFile,lstat,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,relative,isAbsolute} from 'node:path';
import assert from 'node:assert/strict';
export async function auditInstalledGraph(root,expected){
 const bytes=await readFile(join(root,'graph.json'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);
 const graph=JSON.parse(bytes);let cursor=0,totalBytes=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<graph.files.length){
  const row=graph.files[cursor++],path=resolve(root,row.path),rel=relative(root,path);
  assert.ok(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../'));
  const before=await lstat(path,{bigint:true});assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n);
  const hash=createHash('sha256');let count=0;for await(const b of createReadStream(path)){hash.update(b);count+=b.length;}
  const after=await lstat(path,{bigint:true});
  for(const k of ['dev','ino','size','mtimeNs','ctimeNs','nlink'])assert.equal(after[k],before[k]);
  assert.equal(count,row.size);assert.equal(hash.digest('hex'),row.sha256);totalBytes+=count;
 }}));
 let links=0;
 for(const [base,deps]of [[root,graph.roots],...graph.packages.map(p=>[join(root,'store',p.id),p.dependencies])]){
  for(const [name,id]of Object.entries(deps??{})){
   assert.equal((await realpath(join(base,'node_modules',name))).toLowerCase(),resolve(root,'store',id).toLowerCase());links++;
  }
 }
 return {status:'pass',graphHash:expected,packages:graph.packages.length,files:graph.files.length,bytes:totalBytes,links};
}
