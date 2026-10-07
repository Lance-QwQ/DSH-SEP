import{readFile,realpath}from'node:fs/promises';import{join,resolve}from'node:path';import{readAdditionalEvidence}from'./evidence-inputs.mjs';
const equal=(a,b)=>resolve(a).toLowerCase()===resolve(b).toLowerCase();
export async function readDependencyInputs(){
 const root=import.meta.dirname,path=join(root,'DEPENDENCIES.json'),m=JSON.parse(await readFile(path));
 if(m.schema!==1||m.kind!=='exact-operator-dependency-closure'||m.sourceGraphHash!=='0e36e5b89bc8e1ec3d2685332df0a6455081b910de71d8cd040785cdeff0649b'||JSON.stringify(m.roots)!==JSON.stringify({'@deepseek-ai/dsh-app-boot':'p0068',semver:'p0080',yauzl:'p0617'}))throw Error('OPERATOR_DEPENDENCY_BINDING');
 const deps=join(root,'dependencies');for(const p of[join(root,'node_modules'),join(root,'shared/node_modules')])if(!equal(await realpath(p),join(deps,'node_modules')))throw Error('OPERATOR_DEPENDENCY_ALIAS');
 for(const[base,names]of[[deps,m.roots],...m.packages.map(p=>[join(deps,'store',p.id),p.dependencies])])for(const[name,id]of Object.entries(names??{}))if(!equal(await realpath(join(base,'node_modules',name)),join(deps,'store',id)))throw Error('OPERATOR_DEPENDENCY_ALIAS');
 return[path,...await readAdditionalEvidence(m.bindings.map(row=>({...row,path:resolve(root,row.path)})))];
}