import {readFile,writeFile,lstat,realpath,readdir,mkdir,symlink} from 'node:fs/promises';
import {join,dirname,isAbsolute,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fileHash} from './update-inventory.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),yaml=createRequire(require.resolve('@deepseek-ai/dsh-app-boot/package.json'))('js-yaml');
/** Rebase literal paths under the old program only; private/external paths stay fixed. */
export function rebaseProgram(value,currentRoot,targetRoot){
 if(typeof value==='string'){
  if(value.startsWith('file:')){const path=fileURLToPath(value),next=rebaseProgram(path,currentRoot,targetRoot);return next===path?value:pathToFileURL(next).href;}
  if(value===currentRoot||value.startsWith(currentRoot+'\\')||value.startsWith(currentRoot+'/'))return targetRoot+value.slice(currentRoot.length);
  return value;
 }
 if(Array.isArray(value))return value.map(v=>rebaseProgram(v,currentRoot,targetRoot));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rebaseProgram(v,currentRoot,targetRoot)]));
 return value;
}
/** Copy JSON/plain YAML profiles. Executable YAML tags require separate adaptation. */
export async function copyProfile({currentRoot,targetRoot,graph,signal}){
 const bindings=[],copied=[];for(const name of await readdir(currentRoot)){
  signal?.throwIfAborted();if(!/\.(json|ya?ml)$/.test(name)||['graph.json','installation.json'].includes(name))continue;
  const path=join(currentRoot,name),before=await fileHash(path),text=await readFile(path,'utf8');let value;
  try{value=name.endsWith('.json')?JSON.parse(text):yaml.load(text,{schema:yaml.JSON_SCHEMA});}catch{throw Error('SEP_PROFILE_FORMAT_UNSUPPORTED');}
  const original=JSON.stringify(value);
  value=rebaseProgram(value,currentRoot,targetRoot);
  if(name==='package.json'){value.dependencies={...value.dependencies};for(const [name,id]of Object.entries(graph.roots))value.dependencies[name]=graph.packages.find(p=>p.id===id).version;}
  const target=join(targetRoot,name);await writeFile(target,JSON.stringify(value)===original?text:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  if(await fileHash(path)!==before)throw Error('SEP_PROFILE_CHANGED');bindings.push({path,sha256:before});copied.push({source:path,target,sourceHash:before,targetHash:await fileHash(target)});
 }
 if(!copied.some(p=>p.source===join(currentRoot,'package.json')))throw Error('SEP_PROFILE_MANIFEST_REQUIRED');
 const additionalAliases=[];let entries;try{entries=await readdir(join(currentRoot,'node_modules'),{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;entries=[];}
 for(const entry of entries){if(entry.name.startsWith('.'))continue;const names=entry.name.startsWith('@')?(await readdir(join(currentRoot,'node_modules',entry.name))).map(n=>entry.name+'/'+n):[entry.name];
  for(const name of names){signal?.throwIfAborted();if(graph.roots[name])continue;if(!/^(?:@[\w.-]+\/)?[\w.-]+$/.test(name))throw Error('SEP_PROFILE_ALIAS');const original=await realpath(join(currentRoot,'node_modules',name));if(!(await lstat(original)).isDirectory())throw Error('SEP_PROFILE_ALIAS');const dest=join(targetRoot,'node_modules',name);await mkdir(dirname(dest),{recursive:true});await symlink(original,dest,'junction');additionalAliases.push({name,target:original});}
 }
 return {bindings,copied,additionalAliases,scope:'JSON/plain YAML managed profiles; executable tags require adaptation. Does not traverse .env files, configured memory-store directories or Git directories; copied JSON/YAML may contain inline private settings.'};
}
