import {readdir,lstat,readFile,writeFile,realpath} from 'node:fs/promises';
import {join,relative,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Bind the same regular-file tree as the official runtime descriptor while
 * recording actual Node dependency resolution for the SEP updater inventory. */
export async function writeProgramGraph(root){
 const files=[],packages=[],packagePaths={},roots={},atPath=new Map();
 async function walk(path){
  const s=await lstat(path);if(s.isSymbolicLink()||!s.isDirectory()&&(!s.isFile()||s.nlink!==1))throw Error('DAILY_GRAPH_IDENTITY');
  const local=relative(root,path).replaceAll('\\','/');
  if(s.isDirectory()){for(const name of (await readdir(path)).sort())await walk(join(path,name));return;}
  // Avoid circular manifests: graph binds program bytes; official descriptor
  // is sealed afterwards and includes graph.json. Launcher binds both hashes.
  if(local==='graph.json'||local==='desktop-runtime.json')return;
  const body=await readFile(path);files.push({path:local,size:body.length,sha256:sha(body),mode:420});
  if(local.endsWith('/package.json')&&/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(local)){
   const manifest=JSON.parse(body),id='m'+packages.length.toString().padStart(4,'0'),packagePath=local.slice(0,-'/package.json'.length);
   if(typeof manifest.name!=='string'||typeof manifest.version!=='string')throw Error('DAILY_GRAPH_PACKAGE');
   packages.push({id,name:manifest.name,version:manifest.version,dependencies:{}});packagePaths[id]=packagePath;atPath.set(resolve(root,packagePath).toLowerCase(),id);
   if(packagePath==='node_modules/'+manifest.name)roots[manifest.name]=id;
  }
 }
 await walk(root);
 for(const row of packages){
  const path=join(root,packagePaths[row.id]),manifest=JSON.parse(await readFile(join(path,'package.json')));
  for(const name of new Set([...Object.keys(manifest.dependencies??{}),...Object.keys(manifest.peerDependencies??{}),...Object.keys(manifest.optionalDependencies??{})])){
   for(let parent=path;;parent=dirname(parent)){
    const candidate=join(parent,'node_modules',name);let canonical;
    try{canonical=await realpath(candidate);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(canonical){const id=atPath.get(resolve(canonical).toLowerCase());if(!id)throw Error('DAILY_DEPENDENCY_UNBOUND: '+name);row.dependencies[name]=id;break;}
    if(parent===root||dirname(parent)===parent)break;
   }
  }
 }
 const graph={schema:3,kind:'dsh-sep-materialized-graph',platform:'win32-x64',roots,packages,packagePaths,files};
 const bytes=JSON.stringify(graph,null,2)+'\n';await writeFile(join(root,'graph.json'),bytes,{flag:'wx'});
 return {graph,sha256:sha(bytes)};
}
