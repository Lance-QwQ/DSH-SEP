import {lstat,realpath,open,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
const demand=(condition,code)=>{if(!condition)fail(code);};
const same=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs','nlink'].every(k=>a[k]===b[k]);
const key=p=>resolve(p).toLowerCase();
export function safePath(value){
 demand(typeof value==='string'&&value.length>0&&value.length<=4096&&!/[\\\x00-\x1f\x7f:<>?"|*]/.test(value)&&value.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[ .]$/.test(p)&&!/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(p)),'VERIFY_PATH');return value;
}
export async function stableFile(path,{maxBytes=2147483648,capture=false}={}){
 const before=await lstat(path,{bigint:true});
 const regular=s=>s.isFile()&&!s.isSymbolicLink()&&s.nlink===1n&&s.ino!==0n;
 demand(regular(before)&&key(await realpath(path))===key(path),'VERIFY_FILE_IDENTITY');
 demand(before.size<=BigInt(maxBytes),'VERIFY_FILE_LIMIT');
 const file=await open(path,'r');
 try{
  demand(same(before,await file.stat({bigint:true})),'VERIFY_FILE_CHANGED');
  const hash=createHash('sha256'),chunks=[],buffer=Buffer.alloc(1024*1024);let size=0;
  for(;;){const{bytesRead}=await file.read(buffer,0,buffer.length,null);if(!bytesRead)break;size+=bytesRead;demand(size<=maxBytes,'VERIFY_FILE_LIMIT');hash.update(buffer.subarray(0,bytesRead));if(capture)chunks.push(Buffer.from(buffer.subarray(0,bytesRead)));}
  demand(same(before,await file.stat({bigint:true}))&&same(before,await lstat(path,{bigint:true}))&&key(await realpath(path))===key(path),'VERIFY_FILE_CHANGED');
  return {size,sha256:hash.digest('hex'),...(capture?{bytes:Buffer.concat(chunks)}:{})};
 }finally{await file.close();}
}
export async function verifyRecord(root,row){
 safePath(row.path);const actual=await stableFile(join(root,row.path));demand(actual.size===row.size&&actual.sha256===row.sha256,'VERIFY_FILE_CHANGED');return actual;
}
const signature=f=>JSON.stringify([f.size,f.sha256,f.mode]);
function rows(value){
 demand(Array.isArray(value)&&value.length<=150000,'VERIFY_MANIFEST');const names=new Set();
 for(const row of value){safePath(row.path);demand(!names.has(row.path.toLowerCase()),'VERIFY_DUPLICATE_PATH');names.add(row.path.toLowerCase());demand(Number.isSafeInteger(row.size)&&row.size>=0&&row.size<=2147483648&&/^[a-f0-9]{64}$/.test(row.sha256)&&[420,493,384,448].includes(row.mode),'VERIFY_MANIFEST');}
 return value;
}
export async function listRegularFiles(root){
 const files=[];let directories=0;
 async function walk(path,prefix,depth){
  demand(depth<=64&&++directories<=150000,'VERIFY_TREE_LIMIT');
  const before=await lstat(path,{bigint:true});demand(before.isDirectory()&&!before.isSymbolicLink()&&key(await realpath(path))===key(path),'VERIFY_DIRECTORY_IDENTITY');
  for(const entry of await readdir(path,{withFileTypes:true})){
   const rel=prefix+entry.name;safePath(rel);const item=join(path,entry.name),s=await lstat(item,{bigint:true});
   demand(!s.isSymbolicLink(),'VERIFY_FILE_IDENTITY');
   if(s.isDirectory())await walk(item,rel+'/',depth+1);
   else{demand(s.isFile()&&s.nlink===1n,'VERIFY_FILE_IDENTITY');files.push(rel);demand(files.length<=250000,'VERIFY_TREE_LIMIT');}
  }
  const after=await lstat(path,{bigint:true});demand(before.dev===after.dev&&before.ino===after.ino&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs,'VERIFY_DIRECTORY_CHANGED');
 }
 await walk(root,'',0);return files.sort();
}
export async function auditBundle(root,expected){
 root=resolve(root);
 const manifestBytes=await stableFile(join(root,'manifest.json'),{maxBytes:32*1024*1024,capture:true});
 const m=JSON.parse(manifestBytes.bytes.toString('utf8'));
 demand(m.schema===3&&['full','sep'].includes(m.kind)&&m.platform==='win32-x64'&&['hostVersion','sepVersion','revision'].every(k=>m[k]===expected[k]),'VERIFY_MANIFEST');
 demand(m.graph?.path==='graph.json'&&m.descriptor?.path==='desktop-runtime.json','VERIFY_MANIFEST');
 rows([m.graph,m.descriptor]);rows(m.payload);rows(m.required);rows(m.support);
 const graphBytes=await stableFile(join(root,'graph.json'),{maxBytes:32*1024*1024,capture:true});
 demand(graphBytes.size===m.graph.size&&graphBytes.sha256===m.graph.sha256,'VERIFY_FILE_CHANGED');
 const g=JSON.parse(graphBytes.bytes.toString('utf8'));
 demand(g.schema===3&&g.kind==='dsh-sep-materialized-graph'&&g.platform==='win32-x64','VERIFY_GRAPH');rows(g.files);
 const graphMap=new Map(g.files.map(f=>[f.path,signature(f)])),selected=new Set();
 for(const f of [...m.payload,...m.required]){demand(!selected.has(f.path.toLowerCase())&&graphMap.get(f.path)===signature(f),'VERIFY_GRAPH_COVERAGE');selected.add(f.path.toLowerCase());}
 demand(selected.size===g.files.length&&(m.kind==='sep'||m.required.length===0),'VERIFY_GRAPH_COVERAGE');
 for(const f of m.required)safePath(f.sourcePath);
 const expectedFiles=new Map([['manifest.json','manifest.json'],['graph.json','graph.json'],['desktop-runtime.json','desktop-runtime.json']]);
 for(const f of [...m.payload.map(f=>({...f,path:'payload/'+f.path})),...m.support]){const id=f.path.toLowerCase();demand(!expectedFiles.has(id),'VERIFY_DUPLICATE_PATH');expectedFiles.set(id,f.path);}
 await verifyRecord(root,m.descriptor);
 for(const row of m.payload)await verifyRecord(join(root,'payload'),row);
 for(const row of m.support)await verifyRecord(root,row);
 const actual=await listRegularFiles(root),actualSet=new Set(actual.map(x=>x.toLowerCase()));
 demand(actualSet.size===actual.length,'VERIFY_DUPLICATE_PATH');
 demand(actual.length===expectedFiles.size&&actual.every(x=>expectedFiles.get(x.toLowerCase())===x),'VERIFY_UNBOUND_MEMBER');
 const finalManifest=await stableFile(join(root,'manifest.json'),{maxBytes:32*1024*1024});demand(finalManifest.sha256===manifestBytes.sha256,'VERIFY_FILE_CHANGED');
 return {status:'pass',root,kind:m.kind,manifestSha256:manifestBytes.sha256,graphSha256:graphBytes.sha256,archiveRegularFiles:actual.length,payloadFiles:m.payload.length,donorFiles:m.required.length,supportFiles:m.support.length,manifest:m,graph:g};
}
