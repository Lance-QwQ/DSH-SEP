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
  if(process.platform!=='win32'){assert.ok([0o600,0o644,0o700,0o755].includes(row.mode),'GRAPH_MODE_REQUIRED');assert.equal(Number(before.mode&0o7777n),row.mode,'GRAPH_MODE_CHANGED');assert.equal(after.mode,before.mode);}
  assert.equal(count,row.size);assert.equal(hash.digest('hex'),row.sha256);totalBytes+=count;
 }}));
 let links=0;
 for(const [base,deps]of [[root,graph.roots],...graph.packages.map(p=>[join(root,'store',p.id),p.dependencies])]){
  for(const [name,id]of Object.entries(deps??{})){
   const actual=await realpath(join(base,'node_modules',name)),expected=resolve(root,'store',id);assert.equal(process.platform==='win32'?actual.toLowerCase():actual,process.platform==='win32'?expected.toLowerCase():expected);links++;
  }
 }
 return {status:'pass',graphHash:expected,packages:graph.packages.length,files:graph.files.length,bytes:totalBytes,links};
}
