import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {join,dirname,resolve,sep} from 'node:path';
import {builtinModules} from 'node:module';
import {init,parse} from 'es-module-lexer';

const root=resolve(process.argv[2]);
const contract=JSON.parse(await readFile(join(root,'bundle/contracts/modules.json'),'utf8'));
const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const hostContract=manifest.dshSepBundle?.sessionPersistenceContract?JSON.parse(await readFile(join(root,manifest.dshSepBundle.sessionPersistenceContract),'utf8')):undefined;
const sourceOnly=hostContract?.sourceOnlyCompanions??[];
const businessContract=manifest.dshSepBundle?.businessRuntimeContract?JSON.parse(await readFile(join(root,manifest.dshSepBundle.businessRuntimeContract),'utf8')):undefined;
const nativeContract=manifest.dshSepBundle?.nativeSettingsContract?JSON.parse(await readFile(join(root,manifest.dshSepBundle.nativeSettingsContract),'utf8')):undefined;
const contextContract=manifest.dshSepBundle?.contextPreparationContract?JSON.parse(await readFile(join(root,manifest.dshSepBundle.contextPreparationContract),'utf8')):undefined;
const additionalCompanions=[...(contextContract?.companionReferences??[]),...(businessContract?.companionReferences??[]),...(nativeContract?.companionReferences??[])];
const observedCompanions=[];
const ownedNames=new Set(contract.modules.map(row=>row.name));
const references=new Set(contract.upstreamOnly.map(row=>row.file));
const builtins=new Set([...builtinModules,...builtinModules.map(name=>'node:'+name)]);
let imports=0,resources=0,dynamic=0,cjsReferences=0;
await init;
const rootEntries=Object.values(manifest.exports).filter(path=>typeof path==='string'&&/\.(m?js)$/.test(path)).map(path=>path.replace(/^\.\//,''));
const queue=[...contract.modules.flatMap(module=>module.files.map(file=>file.path)),...rootEntries,...(hostContract?.runtimeFiles??[])];
const seen=new Set();

function external(name,file){
  if(builtins.has(name))return;
  const pkg=name.startsWith('@')?name.split('/').slice(0,2).join('/'):name.split('/')[0];
  assert.equal(ownedNames.has(pkg),false,'unpublished SEP package still imported');
  assert.ok(manifest.dependencies?.[pkg]||manifest.peerDependencies?.[pkg]||references.has(file)&&pkg==='openclaw','unclassified external package: '+name);
}
async function relative(file,specifier,source,companion){
  const absolute=resolve(root,dirname(file),specifier);
  assert.ok(absolute.startsWith(root+sep),'active relative dependency escapes package: '+file);
  let exists=true;
  try{await access(absolute);}catch{exists=false;}
  if(!exists){
    const exempt=sourceOnly.find(row=>row.file===file&&row.relative===specifier);
    const compiledOnly=exempt&&file.endsWith('.js')&&source.includes('if (!import.meta.url.endsWith(".ts"))');
    assert.ok(compiledOnly||references.has(file)&&(companion||specifier.endsWith('/package.json')),(companion?'active companion file missing: ':'active relative dependency missing: ')+file+': '+specifier);
    return;
  }
  const target=absolute.slice(root.length+1).split(sep).join('/');
  assert.ok(references.has(file)||!references.has(target),'upstream-only entry reachable from active code');
  if(/\.(c?m?js)$/.test(target))queue.push(target);
}

for(let cursor=0;cursor<queue.length;cursor++){
  const file=queue[cursor];if(seen.has(file)||!/\.(c?m?js)$/.test(file))continue;seen.add(file);
  let source;
  try{source=await readFile(join(root,file),'utf8');}
  catch(error){if(error.code==='ENOENT')throw new Error('active relative dependency missing: '+file);throw error;}
  for(const row of parse(source)[0]){
    if(row.n===undefined){if(row.d>=0)dynamic++;continue;}
    imports++;
    if(row.n.startsWith('.'))await relative(file,row.n,source,false);else external(row.n,file);
  }
  if(file.endsWith('.cjs'))for(const match of source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)){
    cjsReferences++;if(match[1].startsWith('.'))await relative(file,match[1],source,false);else external(match[1],file);
  }
  for(const match of source.matchAll(/new URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)){
    resources++;observedCompanions.push({file,relative:match[1]});await relative(file,match[1],source,true);
  }
}
for(const asset of contract.frontendAssets){
  const source=await readFile(join(root,asset.file),'utf8');
  const required=[...new Set([...source.matchAll(/\brequire\("([^"]+)"\)/g)].map(row=>row[1]))].sort();
  assert.deepEqual(required,asset.requirements);
  for(const row of required){const name=row.startsWith('@')?row.split('/').slice(0,2).join('/'):row.split('/')[0];assert.ok(manifest.peerDependencies[name]);}
}
for(const row of additionalCompanions)assert.equal(observedCompanions.filter(actual=>actual.file===row.file&&actual.relative===row.relative).length,1,'declared additional companion not observed exactly once');
assert.equal(new Set(additionalCompanions.map(row=>JSON.stringify(row))).size,additionalCompanions.length,'duplicate additional companion');
assert.equal(resources,contract.assetReferences.length+(hostContract?.companionReferences??[]).length+additionalCompanions.length);
const companionKey=row=>JSON.stringify({file:row.file,relative:row.relative});
const declaredCompanions=[...contract.assetReferences.map(row=>({file:row.file,relative:row.url})),...(hostContract?.companionReferences??[]),...additionalCompanions];
assert.deepEqual(observedCompanions.map(companionKey).sort(),declaredCompanions.map(companionKey).sort(),'companion declarations differ from actual references');
assert.equal(dynamic,contract.dynamicImports.length);
console.log(JSON.stringify({status:'pass',reviewedCodeFiles:seen.size,esmImports:imports,cjsReferences,companionReferences:resources,sourceOnlyCompanions:sourceOnly.length,dynamicImports:dynamic,frontendFactories:contract.frontendAssets.length,scope:'Packed transitive static closure and declared host/external dependencies; runtime semantics remain separately certified.'}));
