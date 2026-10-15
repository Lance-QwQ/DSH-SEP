import {readFile,lstat,readdir,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {hash,compatibility} from './update-core.mjs';
import {effectiveProfile,externalMcp} from './update-profile.mjs';
import {applyPluginEvidence} from './update-evidence.mjs';
import {migrationPreservationBlocks,validateMigrationPolicy} from './update-migration-policy.mjs';
import {sepPreservationBlocks} from './update-sep.mjs';
// Electron's patched fs treats .asar as directories. Hash the physical archive
// without toggling process.noAsar globally while the host is serving requests.
const physicalFs=process.versions.electron?createRequire(import.meta.url)('original-fs'):null;
const physicalStat=physicalFs?physicalFs.promises.lstat:lstat;
export async function jsonFile(path,limit=16000000){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>limit)throw Error('UPDATE_LOCAL_FILE_INVALID');return JSON.parse(await readFile(path,'utf8'));}
export async function fileHash(path){const st=await physicalStat(path);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw Error('UPDATE_SOURCE_IDENTITY');const digest=createHash('sha256');for await(const b of (physicalFs?.createReadStream??createReadStream)(path))digest.update(b);const after=await physicalStat(path);if(after.ino!==st.ino||after.size!==st.size||after.mtimeMs!==st.mtimeMs||after.nlink!==1)throw Error('UPDATE_SOURCE_CHANGED');return digest.digest('hex');}
const inside=(root,path)=>{const r=relative(root,path);return !isAbsolute(r)&&r!=='..'&&!r.startsWith('..\\')&&!r.startsWith('../');};
// Confirm absence on every Node ancestor search directory, including untracked
// directories. An existing but unbound package must not become a known absence.
async function peerAbsent(packageRoot,name){
 if(!/^(?:@[a-zA-Z0-9_][a-zA-Z0-9._-]*\/)?[a-zA-Z0-9_][a-zA-Z0-9._-]*$/.test(name))return false;
 for(let parent=packageRoot;;parent=dirname(parent)){
  try{await lstat(join(parent,'node_modules',name));return false;}catch(e){if(e.code!=='ENOENT')return false;}
  if(dirname(parent)===parent)return true;
 }
}
async function graphFile(root,graph,plugins,path,fp){
 const canonicalRoot=await realpath(root),rel=relative(canonicalRoot,path).replaceAll('\\','/');
 const records=graph.files.filter(f=>f.path.replaceAll('\\','/')===rel);
 if(!inside(canonicalRoot,path)||records.length!==1||records[0].sha256!==fp)return null;
 const parts=rel.split('/');if(parts[0]!=='store'||parts.length<3)return null;
 const owner=plugins.find(p=>p.instanceId==='package:'+parts[1]);if(!owner)return null;
 let walked=canonicalRoot;for(const part of parts){walked=join(walked,part);if((await lstat(walked)).isSymbolicLink())return null;}
 const manifestPath=join(canonicalRoot,'store',parts[1],'package.json'),manifestRecord=graph.files.filter(f=>f.path==='store/'+parts[1]+'/package.json');
 if(manifestRecord.length!==1||await fileHash(manifestPath)!==manifestRecord[0].sha256)return null;
 return {...owner,entryPath:parts.slice(2).join('/'),entryFingerprint:fp};
}
async function loosePackage(root){const rows=[];let count=0;async function walk(path){for(const e of await readdir(path,{withFileTypes:true})){if(++count>10000)throw Error('UPDATE_INVENTORY_LIMIT');if(e.name==='node_modules'||e.name==='.git')continue;const p=join(path,e.name);if(e.isSymbolicLink())throw Error('UPDATE_UNTRACKED_LINK');if(e.isDirectory())await walk(p);else rows.push([relative(root,p),await fileHash(p)]);}}await walk(root);rows.sort();return {manifest:await jsonFile(join(root,'package.json')),fingerprint:hash(rows)};}
// Inspect ESM exports as data. Loading a plugin (or require.resolve selecting its
// require branch) would not prove the entry used by Cordis's dynamic import.
function subpathSpecifier(value){
 if(/[\\%?#\0]/.test(value))return null;
 const parts=value.split('/'),count=value.startsWith('@')?2:1;
 const name=parts.slice(0,count).join('/');
 if(!/^(?:@[a-zA-Z0-9._~-]+\/)?[a-zA-Z0-9._~-]+$/.test(name)||parts.length<=count||parts.some(p=>!p||p==='.'||p==='..'))return null;
 return {name,key:'./'+parts.slice(count).join('/')};
}
function importExport(value){
 if(typeof value==='string')return value;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('UPDATE_EXPORT_UNVERIFIED');
 for(const [condition,target] of Object.entries(value)){
  if(condition.startsWith('.')||/^\d+$/.test(condition))throw Error('UPDATE_EXPORT_UNVERIFIED');
  if(condition==='node'||condition==='import'||condition==='default'){
   const selected=importExport(target);if(selected!==undefined)return selected;
  }else if(!['require','types','browser'].includes(condition))throw Error('UPDATE_EXPORT_UNVERIFIED');
 }
 return undefined;
}
async function graphSubpath(root,graph,plugins,specifier){
 const parsed=subpathSpecifier(specifier);if(!parsed)return null;
 // A custom condition could make an otherwise inactive browser/types branch
 // active. Unimplemented conditions (including node-addons/module-sync) also
 // fail closed instead of guessing another branch.
 if(process.execArgv.some(a=>/^--conditions(?:=|$)|^-C/.test(a))||/--conditions|-C/.test(process.env.NODE_OPTIONS??''))throw Error('UPDATE_EXPORT_UNVERIFIED');
 const id=graph.roots?.[parsed.name],p=plugins.find(p=>p.instanceId==='package:'+id);
 if(!id||!p||p.name!==parsed.name)return null;
 const canonicalRoot=await realpath(root),packageRoot=join(canonicalRoot,'store',id);
 if(resolve(await realpath(join(root,'node_modules',parsed.name)))!==resolve(packageRoot))throw Error('UPDATE_PLUGIN_PACKAGE_UNVERIFIED');
 async function trackedFile(local){
  const parts=local.split('/');let path=canonicalRoot;
  for(const part of ['store',id,...parts]){path=join(path,part);const st=await lstat(path);if(st.isSymbolicLink())throw Error('UPDATE_PLUGIN_ENTRY_UNVERIFIED');}
  if(!inside(packageRoot,path))throw Error('UPDATE_PLUGIN_ENTRY_UNVERIFIED');
  const records=graph.files.filter(f=>f.path.replaceAll('\\','/')==='store/'+id+'/'+local);
  if(records.length!==1||await fileHash(path)!==records[0].sha256)throw Error('UPDATE_PLUGIN_ENTRY_UNVERIFIED');
  return {path,sha256:records[0].sha256};
 }
 const metadata=await trackedFile('package.json'),bytes=await readFile(metadata.path);
 if(hash(bytes)!==metadata.sha256)throw Error('UPDATE_PLUGIN_ENTRY_UNVERIFIED');
 const manifest=JSON.parse(bytes);if(manifest.name!==parsed.name)throw Error('UPDATE_PLUGIN_PACKAGE_UNVERIFIED');
 const exportsMap=manifest.exports;
 if(!exportsMap||typeof exportsMap!=='object'||Array.isArray(exportsMap)||!Object.hasOwn(exportsMap,parsed.key)||Object.keys(exportsMap).some(k=>!k.startsWith('.')))throw Error('UPDATE_EXPORT_UNVERIFIED');
 const target=importExport(exportsMap[parsed.key]);
 if(typeof target!=='string'||!target.startsWith('./')||/[\\%?#\0*]/.test(target)||target.slice(2).split('/').some(p=>!p||p==='.'||p==='..'||p==='node_modules'))throw Error('UPDATE_PLUGIN_ENTRY_UNVERIFIED');
 const entryPath=target.slice(2),entry=await trackedFile(entryPath);
 return {...p,entrySpecifier:specifier,entryPath,entryFingerprint:entry.sha256};
}
export async function inventory(root,{signal,profileContext}={}){
 const graph=await jsonFile(join(root,'graph.json'));if(!Array.isArray(graph.packages)||!Array.isArray(graph.files)||graph.packages.length>3000||graph.files.length>100000)throw Error('UPDATE_GRAPH_INVALID');
 const hardBlocks=[],plugins=[],fingerprints=[],byId=new Map(),versions={};
 for(const p of graph.packages){if(!/^[\w-]+$/.test(p.id)||typeof p.name!=='string')throw Error('UPDATE_GRAPH_INVALID');byId.set(p.id,[]);}
 let cursor=0;const actual=new Array(graph.files.length);await Promise.all(Array.from({length:4},async()=>{while(cursor<graph.files.length){signal?.throwIfAborted();const i=cursor++,f=graph.files[i],path=resolve(root,f.path);if(!inside(root,path))throw Error('UPDATE_GRAPH_PATH');try{actual[i]=await fileHash(path);if(actual[i]!==f.sha256)hardBlocks.push('INTEGRITY_CHANGED: '+f.path);}catch(e){actual[i]='unreadable';hardBlocks.push('INTEGRITY_UNREADABLE: '+f.path);}}}));
 for(let i=0;i<graph.files.length;i++){const f=graph.files[i],id=f.path.replaceAll('\\','/').split('/')[1];byId.get(id)?.push([f.path.split('/').slice(2).join('/'),actual[i]]);}
 for(const p of graph.packages){let manifest;try{manifest=await jsonFile(join(root,'store',p.id,'package.json'));}catch{hardBlocks.push('PACKAGE_METADATA_UNREADABLE: '+p.name);manifest={name:p.name,version:p.version};}const fingerprint=hash(byId.get(p.id));fingerprints.push([p.id,fingerprint]);plugins.push({...manifest,name:p.name,source:'installed-graph',fingerprint,instanceId:'package:'+p.id,enabled:'组件包，实例状态另列'});versions[p.name]=manifest.version;}
 for(const p of plugins){const id=p.instanceId.slice('package:'.length),row=graph.packages.find(x=>x.id===id);p.resolvedDependencies={};for(const name of Object.keys(p.peerDependencies??{})){const targetId=row.dependencies?.[name]??graph.roots?.[name];if(!targetId){if(await peerAbsent(join(root,'store',id),name))p.resolvedDependencies[name]=null;else hardBlocks.push('DEPENDENCY_RESOLUTION_UNVERIFIED: '+p.name+' -> '+name);continue;}const target=graph.packages.find(x=>x.id===targetId);if(!target){hardBlocks.push('DEPENDENCY_GRAPH_INVALID: '+p.name);continue;}const direct=join(root,'store',id,'node_modules',name),fallback=join(root,'node_modules',name);try{let canonical;try{canonical=await realpath(direct);}catch(e){if(e.code!=='ENOENT')throw e;canonical=await realpath(fallback);}if(resolve(canonical).toLowerCase()!==resolve(root,'store',targetId).toLowerCase())throw Error('LINK');p.resolvedDependencies[name]={id:targetId,version:target.version};}catch{hardBlocks.push('DEPENDENCY_RESOLUTION_UNVERIFIED: '+p.name+' -> '+name);}}}
 const roots=new Set(Object.keys(graph.roots??{}));let names=[];for(const e of await readdir(join(root,'node_modules'),{withFileTypes:true})){if(e.name.startsWith('.'))continue;if(e.name.startsWith('@'))for(const n of await readdir(join(root,'node_modules',e.name)))names.push(e.name+'/'+n);else names.push(e.name);}
 for(const name of names.sort()){if(roots.has(name))continue;try{const real=await realpath(join(root,'node_modules',name));const p=await loosePackage(real);plugins.push({...p.manifest,source:'additional-installed-package',fingerprint:p.fingerprint,instanceId:'extra:'+name});fingerprints.push(['extra:'+name,p.fingerprint]);versions[name]=p.manifest.version;}catch{hardBlocks.push('UNTRACKED_PACKAGE: '+name);plugins.push({name,source:'additional-installed-package',instanceId:'extra:'+name,fingerprint:'unreadable'});}}
 let profile={rows:[],fingerprint:hash(null),gaps:[],warnings:[],files:[],context:null};
 try{profile=await effectiveProfile(root,profileContext,{fileHash,signal});hardBlocks.push(...profile.gaps);}catch(e){hardBlocks.push(e.message==='UPDATE_PROFILE_CONTEXT_REQUIRED'?e.message:'PLUGIN_CONFIG_UNREADABLE');profile.gaps.push('PROFILE_COMPOSITION_UNVERIFIED');}
 let origins={};if(graph.provenance!==undefined){if(graph.provenance?.schema!==1||!graph.provenance.entries)hardBlocks.push('PROVENANCE_UNVERIFIED');else origins=graph.provenance.entries;}else try{const bytes=await readFile(join(root,'update-provenance.json'));const tracked=graph.files.find(f=>f.path==='update-provenance.json');if(!tracked||hash(bytes)!==tracked.sha256)throw Error('UNBOUND');const record=JSON.parse(bytes);if(record.schema!==1||!record.entries)throw Error('SCHEMA');origins=record.entries;}catch(e){if(e.code!=='ENOENT')hardBlocks.push('PROVENANCE_UNVERIFIED');}
 for(const p of plugins){const origin=origins[p.instanceId];p.origin=origin&&origin.baselineFingerprint===p.fingerprint?origin:{kind:origin?'user-modified':'unknown',baselineFingerprint:origin?.baselineFingerprint};}
 const configFingerprint=profile.fingerprint;const used=new Set();for(const row of profile.rows){
  signal?.throwIfAborted();let name=row.name;const id=row.id;if(typeof id!=='string'||used.has(id)){hardBlocks.push('PLUGIN_INSTANCE_INVALID');continue;}used.add(id);
  if(row.kind==='configuration-group'){plugins.push({name:typeof name==='string'?name:'[configuration-group]',version:'configuration',instanceId:id,source:'configuration-group',kind:row.kind,fingerprint:hash({group:true}),configFingerprint:hash(row.config??null),activationFingerprint:row.activationFingerprint,enabled:row.enabled,resolvedDependencies:{}});continue;}
  if(typeof name!=='string'){name='[dynamic-plugin-source]';hardBlocks.push('PLUGIN_SOURCE_UNRESOLVED: '+id);profile.gaps.push('PLUGIN_SOURCE_UNRESOLVED: '+id);plugins.push({name,instanceId:id,source:'unresolved',kind:row.kind,fingerprint:'unreadable',configFingerprint:hash(row.config??{}),activationFingerprint:row.activationFingerprint,enabled:row.enabled});continue;}
  let p=plugins.find(p=>p.instanceId===(graph.roots?.[name]?'package:'+graph.roots[name]:'extra:'+name));if(name.startsWith('file:')){try{const path=await realpath(fileURLToPath(name)),fp=await fileHash(path);const owned=await graphFile(root,graph,plugins,path,fp);p=owned?{...owned,name,source:'installed-graph-file',entrySpecifier:name}:{name,version:'local',fingerprint:fp,source:'local-file'};fingerprints.push([id,owned?{fingerprint:owned.fingerprint,entryPath:owned.entryPath,entryFingerprint:fp}:fp]);}catch{hardBlocks.push('LOCAL_PLUGIN_UNREADABLE: '+id);}}
  else if(!p){try{p=await graphSubpath(root,graph,plugins,name);if(p)fingerprints.push([id,{entrySpecifier:p.entrySpecifier,entryPath:p.entryPath,entryFingerprint:p.entryFingerprint}]);}catch{/* Unproved exports and entries retain the source hard block below. */}}
  if(!p){hardBlocks.push('PLUGIN_SOURCE_UNRESOLVED: '+id);profile.gaps.push('PLUGIN_SOURCE_UNRESOLVED: '+id);p={name,source:'unresolved',fingerprint:'unreadable'};}
  const externalProgram=await externalMcp(row,{fileHash});if(externalProgram?.status==='unresolved'){hardBlocks.push(externalProgram.reason+': '+id);profile.gaps.push(externalProgram.reason+': '+id);}
  plugins.push({...p,name:p.name,instanceId:id,kind:row.kind,enabled:row.enabled,activationFingerprint:row.activationFingerprint,configFingerprint:hash(row.config??{}),...(externalProgram?{externalProgram}: {})});
 }
 const configs=[];for(const e of await readdir(root)){if(/\.(ya?ml|json)$/.test(e)&&!['graph.json','installation.json','cordis.patch.yml'].includes(e)){try{configs.push([e,await fileHash(join(root,e))]);}catch{hardBlocks.push('CONFIG_UNREADABLE: '+e);}}}
 const graphHash=hash(await readFile(join(root,'graph.json')));
 const entries=plugins.map(p=>({name:p.name,version:p.version,instanceId:p.instanceId,kind:p.kind??'component-package',source:p.source,enabled:p.enabled,fingerprint:p.fingerprint,configFingerprint:p.configFingerprint,activationFingerprint:p.activationFingerprint,externalProgram:p.externalProgram,peerDependencies:p.peerDependencies,peerDependenciesMeta:p.peerDependenciesMeta,engines:p.engines,origin:p.origin,resolvedDependencies:p.resolvedDependencies,...(p.entrySpecifier?{entrySpecifier:p.entrySpecifier,entryPath:p.entryPath,entryFingerprint:p.entryFingerprint}:{})}));
 return {plugins:entries,versions,rootVersions:Object.fromEntries(Object.entries(graph.roots??{}).map(([n,id])=>[n,graph.packages.find(p=>p.id===id)?.version])),hardBlocks:[...new Set(hardBlocks)],binding:hash({graphHash,fingerprints,configFingerprint,configs,resolutions:entries}),graphHash,configFingerprint,profileContext:profile.context,profileCoverage:{complete:profile.gaps.length===0,files:profile.files,gaps:profile.gaps,warnings:profile.warnings,scope:'配置声明与静态入口；表达式未求值、插件未加载、外部运行行为未验证'}};
}
export function preservationBlocks(current,candidate,migrationPolicy){if(migrationPolicy)return migrationPreservationBlocks(current,candidate,migrationPolicy);const blocks=[];for(const p of current.plugins){
 const instance=!p.instanceId?.startsWith('package:');const trustedHost=p.origin?.kind==='host'&&p.origin.baselineFingerprint===p.fingerprint&&typeof p.origin.sourceIdentity==='string'&&p.origin.sourceIdentity.length>0;const protectedItem=instance||!trustedHost;
 if(!protectedItem)continue;const matches=candidate.plugins.filter(n=>instance?n.instanceId===p.instanceId:n.name===p.name&&n.version===p.version);
 if(!matches.some(n=>n.fingerprint===p.fingerprint&&n.configFingerprint===p.configFingerprint&&n.activationFingerprint===p.activationFingerprint&&hash(n.externalProgram??null)===hash(p.externalProgram??null)&&n.enabled===p.enabled&&n.entrySpecifier===p.entrySpecifier&&n.entryPath===p.entryPath&&n.entryFingerprint===p.entryFingerprint))blocks.push('PLUGIN_PRESERVATION_FAILED: '+p.name+' ['+p.instanceId+']');
 }return blocks;}
export function makeReport(current,candidate,release,installed,satisfies,{pluginEvidence,migrationPolicy,sepPolicy,preservationProof}={}){
 const preservation=candidate?(release.source==='sep'?(sepPolicy?.schema===2?(Array.isArray(preservationProof)?preservationProof:['SEP_PRESERVATION_PROOF_REQUIRED']):sepPreservationBlocks(current,candidate,sepPolicy)):preservationBlocks(current,candidate,migrationPolicy)):[];
 const replacements=new Map(),retirements=new Map();
 if(sepPolicy&&candidate&&!preservation.length)for(const entry of sepPolicy.replacements??[])replacements.set(entry.before.instanceId,entry.after.instanceId);
 if(sepPolicy?.schema===2&&candidate&&!preservation.length)for(const before of current.plugins){
  // The schema-2 proof independently binds the exact same-instance delta.
  // Its replacement must be checked using the target package's declarations.
  const matches=candidate.plugins.filter(p=>p.instanceId===before.instanceId);
  if(matches.length===1&&(matches[0].name!==before.name||matches[0].version!==before.version||matches[0].fingerprint!==before.fingerprint))replacements.set(before.instanceId,matches[0].instanceId);
 }
 if(migrationPolicy&&candidate&&!preservation.length){const {manifest}=validateMigrationPolicy(migrationPolicy);for(const entry of manifest.entries){if(entry.operation==='replace')replacements.set(entry.from.instanceId,entry.to.instanceId);if(entry.operation==='remove')retirements.set(entry.from.instanceId,entry.reason);}}
 const plugins=current.plugins.map(p=>{
  if(!candidate)return {...p,verdict:'unknown',reasons:['尚无目标候选依赖清单和隔离运行证据，不能判断为不兼容或兼容']};
  if(retirements.has(p.instanceId))return {...p,verdict:'unknown',plannedDisposition:'retired',reasons:['此旧组件已列入固定 rc.1 迁移的退役清单；退役不是运行兼容性证明。',retirements.get(p.instanceId)]};
  const replacement=replacements.get(p.instanceId);
  let matches=candidate.plugins.filter(n=>n.instanceId===(replacement??p.instanceId)&&(replacement||n.name===p.name));
  if(!matches.length&&!replacement&&p.instanceId?.startsWith('package:'))matches=candidate.plugins.filter(n=>n.instanceId?.startsWith('package:')&&n.name===p.name&&n.version===p.version&&n.fingerprint===p.fingerprint);
  const resolved=matches.length===1?matches[0].resolvedDependencies:undefined;
  if(!resolved)return {...p,verdict:'unknown',reasons:['无法唯一绑定目标实例的依赖解析，不能使用同名全局版本推断']};
  const known={},declared={},unknown=[];
  const dependencyOwner=replacement?matches[0]:p;
  for(const [name,range] of Object.entries(dependencyOwner.peerDependencies??{})){
   if(!Object.hasOwn(resolved,name))unknown.push(name);
   else {declared[name]=range;if(resolved[name])known[name]=resolved[name].version;}
  }
  const checked=compatibility([{...dependencyOwner,peerDependencies:declared}],known,satisfies)[0];
  const result={...p,verdict:checked.verdict,reasons:checked.reasons,...(replacement?{targetName:matches[0].name,targetVersion:matches[0].version}:{}),...(unknown.length?{reasons:[...(checked.verdict==='incompatible'?checked.reasons:[]),'目标依赖解析证据不足：'+unknown.join(', ')]}:{})};
  return applyPluginEvidence(result,matches[0],{evidence:pluginEvidence,current,candidate,release,allowPositive:unknown.length===0});
 });
 const hardBlocks=[...current.hardBlocks,...(candidate?[...candidate.hardBlocks,...preservation]:['缺少已准备的受控候选，尚不能安装'])];
 return {schema:1,current:installed,target:release.version,checkedAt:new Date().toISOString(),readiness:!candidate?'candidate-missing':hardBlocks.length?'blocked':'review-ready',scope:'静态盘点组件依赖与实际配置插件实例（含禁用、嵌套、home 和启动覆盖层）；外部 MCP 仅绑定声明及本地入口，运行时临时插件与动态来源需另行证明。未执行未知代码。',profileCoverage:current.profileCoverage,binding:hash({current:current.binding,candidate:candidate?.binding??null,release,evidence:pluginEvidence?.fingerprint??null,verdicts:plugins.map(p=>[p.instanceId,p.verdict,p.verifiedScope??null])}),currentBinding:current.binding,candidateBinding:candidate?.binding,hardBlocks,plugins};
}


