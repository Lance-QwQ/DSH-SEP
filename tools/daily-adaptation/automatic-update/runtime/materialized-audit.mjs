import {readFile,lstat,realpath,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {assertGraphLayout,packageRoot} from './graph-layout.mjs';
const demand=(value,code)=>{if(!value)throw Error(code);};
const same=(a,b)=>process.platform==='win32'?resolve(a).toLowerCase()===resolve(b).toLowerCase():resolve(a)===resolve(b);
export async function auditMaterializedGraph(root,expected){
 demand(same(await realpath(root),root)&&!(await lstat(root)).isSymbolicLink(),'SEP_GRAPH_ROOT');
 const body=await readFile(join(root,'graph.json')),g=JSON.parse(body);demand(createHash('sha256').update(body).digest('hex')===expected,'SEP_GRAPH_CHANGED');assertGraphLayout(g);
 const files=new Map(g.files.map(f=>[f.path,f]));demand(files.size===g.files.length,'SEP_GRAPH_PATH');let count=0,bytes=0;
 async function walk(at,prefix=''){
  for(const entry of await readdir(at,{withFileTypes:true})){
   const path=join(at,entry.name),rel=prefix+entry.name,s=await lstat(path,{bigint:true});demand(!s.isSymbolicLink(),'SEP_GRAPH_ALIAS');
   if(s.isDirectory()){await walk(path,rel+'/');continue;}
   demand(s.isFile()&&s.nlink===1n,'SEP_GRAPH_FILE');if(rel==='graph.json'||rel==='desktop-runtime.json')continue;
   const row=files.get(rel);demand(row,'SEP_GRAPH_UNTRACKED');const hash=createHash('sha256');let size=0;
   for await(const b of createReadStream(path)){hash.update(b);size+=b.length;}
   const after=await lstat(path,{bigint:true});for(const name of ['dev','ino','size','mtimeNs','ctimeNs','nlink'])demand(s[name]===after[name],'SEP_GRAPH_IDENTITY_CHANGED');
   demand(row.size===size&&row.sha256===hash.digest('hex'),'SEP_GRAPH_FILE_CHANGED');if(process.platform!=='win32')demand(Number(s.mode&0o7777n)===row.mode,'SEP_GRAPH_MODE');count++;bytes+=size;
  }
 }
 await walk(root);demand(count===files.size,'SEP_GRAPH_MISSING');let resolutions=0;
 for(const row of g.packages){const at=packageRoot(root,g,row.id),manifest=JSON.parse(await readFile(join(at,'package.json')));demand(manifest.name===row.name&&manifest.version===row.version,'SEP_GRAPH_MANIFEST');
  for(const [name,id]of Object.entries(row.dependencies??{})){
   let found;for(let parent=at;;parent=dirname(parent)){try{found=await realpath(join(parent,'node_modules',name));break;}catch(e){if(e.code!=='ENOENT')throw e;}if(same(parent,root)||dirname(parent)===parent)break;}
   demand(found&&same(found,packageRoot(root,g,id)),'SEP_GRAPH_RESOLUTION');resolutions++;
  }
 }
 return {status:'pass',graphHash:expected,packages:g.packages.length,files:count,bytes,links:0,resolutions};
}
