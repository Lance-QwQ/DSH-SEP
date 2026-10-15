import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [before,after,out]=process.argv.slice(2).map(p=>resolve(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
async function tree(root){const rows=new Map();async function walk(at,prefix=''){for(const r of await readdir(at,{withFileTypes:true})){if(['.git','node_modules'].includes(r.name))continue;const rel=prefix+r.name,p=join(at,r.name);if(r.isDirectory())await walk(p,rel+'/');else if(r.isFile())rows.set(rel,sha(await readFile(p)));else throw Error('SOURCE_ALIAS');}}await walk(root);return rows;}
const [old,next]=await Promise.all([tree(before),tree(after)]),files=[];
for(const path of [...new Set([...old.keys(),...next.keys()])].sort())if(old.get(path)!==next.get(path))files.push({path,kind:!old.has(path)?'added':!next.has(path)?'removed':'modified',before:old.get(path)??null,after:next.get(path)??null});
const manifests={};for(const [path] of next)if(path.endsWith('/package.json')||path==='package.json'){const m=JSON.parse(await readFile(join(after,path)));if(m.name)manifests[m.name]={path,version:m.version,private:m.private??false,dependencies:m.dependencies??{},peerDependencies:m.peerDependencies??{},optionalDependencies:m.optionalDependencies??{}};}
const result={schema:1,before,after,oldFileCount:old.size,newFileCount:next.size,changed:files.length,files,manifests};
await writeFile(join(out,'SOURCE-INVENTORY.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({oldFiles:old.size,newFiles:next.size,changed:files.length,packages:Object.keys(manifests).length}));
console.log(files.filter(r=>/^(packages\/(core|subagent|interaction|llm|fs|subprocess|session|storage|sdk|tools|host|compaction)\/|apps\/desktop-host\/)/.test(r.path)&&/\/src\//.test(r.path)&&!r.path.includes('/tests/')).map(r=>r.path).join('\n'));
