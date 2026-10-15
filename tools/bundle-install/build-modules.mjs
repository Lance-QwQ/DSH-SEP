import { createHash } from 'node:crypto';
import { lstat, realpath, open, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, parse } from 'es-module-lexer';

export const SOURCE_GRAPH_SHA256 = '96fbacddd11ac56871f1909e1a9f00ccd3669a5a365e8d7061cb8f5cd7ac7143';
export const COMPONENTS = Object.freeze({
  p0621:'system-enhancement-package', p0638:'plugin-group', p0620:'recovery',
  p0637:'context-preparation', p0411:'tool-worker', p0635:'session-migration',
  p0639:'trusted-evaluation-entry', p0601:'ui-settings-memory', p0373:'task-checkpoint', p0636:'sep-brand',
});
export const DEPENDENCIES = Object.freeze({
  '@napi-rs/canvas':'1.0.8', '@sinclair/typebox':'0.34.41',
  'fast-xml-parser':'5.11.1', fflate:'0.8.3', 'pdfjs-dist':'6.2.108', zod:'4.4.3',
});
const upstreamOnly = 'bundle/modules/plugin-group/vendor/lossless-claw/plugin/index.js';
const upstreamReferences = new Set([upstreamOnly,
  'bundle/modules/plugin-group/vendor/lossless-claw/engine.js',
  'bundle/modules/plugin-group/vendor/lossless-claw/cli/main.js',
  'bundle/modules/plugin-group/vendor/lossless-claw/plugin/lcm-command.js',
]);
const upstreamMissingMetadata = new Map([
  ['bundle/modules/plugin-group/vendor/lossless-claw/engine.js','../package.json'],
  ['bundle/modules/plugin-group/vendor/lossless-claw/cli/main.js','../../package.json'],
  ['bundle/modules/plugin-group/vendor/lossless-claw/plugin/lcm-command.js','../../package.json'],
]);
const hash = data => createHash('sha256').update(data).digest('hex');
const reject = code => { throw new Error(code); };
const slash = path => path.replaceAll('\\','/');
const equalPath = (a,b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function safeRelative(path) {
  if(typeof path !== 'string' || !path || path.includes('\\') || isAbsolute(path) || path.split('/').some(part=>!part || part==='.' || part==='..' || part.includes(':'))) reject('BUNDLE_SOURCE_PATH');
  return path;
}
async function canonical(path) {
  if(!isAbsolute(path)) reject('BUNDLE_ABSOLUTE_PATH_REQUIRED');
  const absolute = resolve(path);
  if(!equalPath(await realpath(absolute),absolute)) reject('BUNDLE_PATH_ALIAS');
  for(let cursor=absolute;;cursor=dirname(cursor)) {
    const stat=await lstat(cursor);
    if(stat.isSymbolicLink()) reject('BUNDLE_PATH_ALIAS');
    if(dirname(cursor)===cursor) break;
  }
  return absolute;
}
async function bytes(path, expected, maxBytes=8*1024*1024) {
  await canonical(path);
  const before=await lstat(path,{bigint:true});
  if(!before.isFile() || before.nlink!==1n || before.size>BigInt(maxBytes)) reject('BUNDLE_SOURCE_IDENTITY');
  const file=await open(path,'r');
  try {
    const start=await file.stat({bigint:true});
    const data=await file.readFile();
    const end=await file.stat({bigint:true});
    for(const field of ['dev','ino','size','mtimeNs','ctimeNs']) if(before[field]!==start[field] || start[field]!==end[field]) reject('BUNDLE_SOURCE_CHANGED');
    if(expected && (data.length!==expected.size || hash(data)!==expected.sha256)) reject('BUNDLE_SOURCE_HASH');
    return data;
  } finally { await file.close(); }
}
function targetOf(manifest,specifier) {
  const subpath=specifier===manifest.name ? '.' : './'+specifier.slice(manifest.name.length+1);
  let target=manifest.exports?.[subpath];
  if(target===undefined && subpath==='.') target=typeof manifest.exports==='string' ? manifest.exports : manifest.main;
  if(target && typeof target==='object') target=target.import ?? target.node ?? target.default;
  if(target && typeof target==='object') target=target.default;
  if(typeof target!=='string') reject('BUNDLE_OWN_EXPORT_MISSING');
  return safeRelative(target.startsWith('./')?target.slice(2):target);
}

/** Rewrite module specifiers only; ordinary strings and service identities retain their bytes. */
export async function rewriteOwnedImports(source, outputPath, owned) {
  await init;
  const edits=[];
  for(const row of parse(source)[0]) {
    if(row.n===undefined) continue;
    const owner=owned.find(item=>row.n===item.manifest.name || row.n.startsWith(item.manifest.name+'/'));
    if(!owner) continue;
    const target=join('bundle/modules',owner.folder,targetOf(owner.manifest,row.n));
    let specifier=slash(relative(dirname(outputPath),target));
    if(!specifier.startsWith('.')) specifier='./'+specifier;
    edits.push({start:row.s,end:row.e,from:row.n,to:specifier,dynamic:row.d>=0});
  }
  let text=source;
  for(const edit of edits.slice().reverse()) text=text.slice(0,edit.start)+(edit.dynamic?JSON.stringify(edit.to):edit.to)+text.slice(edit.end);
  return {text,edits:edits.map(({from,to,dynamic})=>({from,to,dynamic}))};
}

/** Produce a NEW review directory. Never writes into a live installation or an existing output. */
export async function buildModules({programRoot, outputRoot, rootManifest, licenseRoot}) {
  const program=await canonical(programRoot);
  const output=resolve(outputRoot);
  if(!isAbsolute(outputRoot)) reject('BUNDLE_ABSOLUTE_PATH_REQUIRED');
  await canonical(dirname(output));
  try { await lstat(output); reject('BUNDLE_OUTPUT_EXISTS'); } catch(error) { if(error.code!=='ENOENT') throw error; }
  const graphBytes=await bytes(join(program,'graph.json'),undefined,16*1024*1024);
  if(hash(graphBytes)!==SOURCE_GRAPH_SHA256) reject('BUNDLE_GRAPH_HASH');
  const graph=JSON.parse(graphBytes);
  const owned=[];
  const files=new Map();
  let totalBytes=0;
  for(const [id,folder] of Object.entries(COMPONENTS)) {
    const pkg=graph.packages.find(row=>row.id===id);
    if(!pkg) reject('BUNDLE_COMPONENT_MISSING');
    const rows=graph.files.filter(row=>row.path.startsWith(`store/${id}/`));
    if(!rows.length || rows.length>300) reject('BUNDLE_COMPONENT_FILES');
    for(const row of rows) {
      safeRelative(row.path);
      const out=`bundle/modules/${folder}/${row.path.slice(`store/${id}/`.length)}`;
      if(files.has(out)) reject('BUNDLE_FILE_DUPLICATE');
      const data=await bytes(join(program,row.path),row);
      totalBytes+=data.length;
      if(totalBytes>32*1024*1024) reject('BUNDLE_TOTAL_LIMIT');
      files.set(out,{data,source:row.path,sourceSha256:row.sha256,edits:[],sanitizedBuildComments:0});
    }
    const manifest=JSON.parse(files.get(`bundle/modules/${folder}/package.json`).data);
    if(manifest.name!==pkg.name || manifest.version!==pkg.version) reject('BUNDLE_COMPONENT_IDENTITY');
    owned.push({id,folder,manifest});
  }
  const licenseSpecs=[
    ['bundle/modules/task-checkpoint/LICENSE-SEP-SUPPLEMENT.txt','LICENSE','95f98fc3f3a9b378be70fe9a09d674205c5d90b6b1a4f6e5065d01a87060c882'],
    ['bundle/modules/task-checkpoint/LICENSE-DSH-UPSTREAM.txt','source/LICENSE','ebb4f09972aee8608be255debaf78451a68e95c290f55c240dec2ecfa16ea6be'],
    ['bundle/licenses/DSH-MIT.txt','source/LICENSE','ebb4f09972aee8608be255debaf78451a68e95c290f55c240dec2ecfa16ea6be'],
  ];
  await canonical(licenseRoot);
  for(const [out,source,expectedHash] of licenseSpecs) {
    const data=await bytes(join(licenseRoot,source));
    if(hash(data)!==expectedHash) reject('BUNDLE_LICENSE_HASH');
    files.set(out,{data,source:'repository/'+source,sourceSha256:expectedHash,edits:[]});
  }
  const referenceFiles=new Set(upstreamReferences);
  for(const path of files.keys()) if(path.startsWith('bundle/modules/plugin-group/vendor/lossless-claw/cli/')) referenceFiles.add(path);
  const assetReferences=[];
  const externalImports=[], dynamicImports=[];
  for(const [path,file] of files) {
    if(!/\.(m?js)$/.test(path)) continue;
    const remapped=await rewriteOwnedImports(file.data.toString('utf8'),path,owned);
    file.data=Buffer.from(remapped.text); file.edits=remapped.edits;
    // Only this hash-verified published asset has the three CSS build-region comments.
    // Keep every non-comment byte and every line break intact; do not rewrite source maps.
    if(path==='bundle/modules/ui-settings-memory/lib/client.js') {
      const cleaned=remapped.text.replace(/^([ \t]*\/\/#region \\0dsh-css:)[A-Za-z]:[\\/][^\r\n]+/gm, (comment,prefix)=>{
        file.sanitizedBuildComments++;
        return prefix+'./'+comment.split(/[\\/]/).at(-1);
      });
      if(file.sanitizedBuildComments!==3) reject('BUNDLE_BUILD_COMMENT_LAYOUT');
      file.data=Buffer.from(cleaned);
    }
    for(const asset of remapped.text.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) {
      if(!asset[1].startsWith('.')) continue;
      const target=slash(join(dirname(path),asset[1]));
      const disposition=files.has(target)?'packaged':referenceFiles.has(path)?'upstream-reference-only':'missing';
      if(disposition==='missing') reject(`BUNDLE_COMPANION_ASSET_MISSING: ${path}: ${asset[1]}`);
      assetReferences.push({file:path,url:asset[1],target,disposition});
    }
    for(const row of parse(remapped.text)[0]) {
      if(row.n===undefined) { if(row.d>=0) dynamicImports.push({file:path,expression:remapped.text.slice(row.s,row.e),scope:'requires-runtime-admission'}); continue; }
      if(row.n.startsWith('.')) {
        const target=slash(join(dirname(path),row.n));
        if(!files.has(target) && upstreamMissingMetadata.get(path)!==row.n) reject(`BUNDLE_RELATIVE_IMPORT_MISSING: ${path}: ${row.n}`);
      } else if(!row.n.startsWith('node:') && !['os','path'].includes(row.n)) {
        const pkg=row.n.startsWith('@')?row.n.split('/').slice(0,2).join('/'):row.n.split('/')[0];
        const disposition=path===upstreamOnly && pkg==='openclaw' ? 'upstream-reference-only' : DEPENDENCIES[pkg] ? 'third-party' : pkg.startsWith('@deepseek-ai/') || pkg==='react' ? 'host-shared' : 'unknown';
        if(disposition==='unknown' || owned.some(item=>item.manifest.name===pkg)) reject(`BUNDLE_UNRESOLVED_IMPORT: ${path}: ${row.n}`);
        externalImports.push({file:path,specifier:row.n,disposition});
      }
    }
  }
  const hostRequirements={};
  const frontendAssets=[];
  for(const path of ['bundle/modules/ui-settings-memory/lib/client.js','bundle/modules/sep-brand/lib/client.js']) {
    const file=files.get(path);
    if(!file) reject('BUNDLE_CLIENT_ASSET_MISSING');
    // These published assets use DSH's factory loader, not Node ESM imports.
    const requirements=[...new Set([...file.data.toString('utf8').matchAll(/\brequire\("([^"]+)"\)/g)].map(row=>row[1]))].sort();
    if(!requirements.length) reject('BUNDLE_CLIENT_FACTORY_UNRECOGNIZED');
    frontendAssets.push({file:path,requirements,status:'not_run',scope:'Factory asset and dependency inventory only; actual browser/host registration belongs to host adaptation.'});
    for(const specifier of requirements) externalImports.push({file:path,specifier,disposition:'host-shared'});
  }
  const modules=owned.map(({id,folder,manifest})=>{
    const expectations={};
    for(const [name,range] of Object.entries({...manifest.dependencies,...manifest.peerDependencies})) {
      if(owned.some(item=>item.manifest.name===name) || DEPENDENCIES[name]) continue;
      if(!name.startsWith('@deepseek-ai/') && name!=='react') reject(`BUNDLE_DEPENDENCY_UNCLASSIFIED: ${name}`);
      expectations[name]=range;
      hostRequirements[name]??=new Set(); hostRequirements[name].add(range);
    }
    const entry=`bundle/modules/${folder}/${targetOf(manifest,manifest.name)}`;
    if(!files.has(entry)) reject('BUNDLE_ENTRY_MISSING');
    const list=[...files].filter(([path])=>path.startsWith(`bundle/modules/${folder}/`)).map(([path,file])=>({path,source:file.source,sourceSha256:file.sourceSha256,sha256:hash(file.data),size:file.data.length,remappedImports:file.edits,...file.sanitizedBuildComments?{sanitizedBuildComments:file.sanitizedBuildComments}:{}}));
    if(!list.some(row=>/LICENSE/i.test(row.path))) reject('BUNDLE_LICENSE_MISSING');
    return {folder,name:manifest.name,version:manifest.version,sourceGraphPackageId:id,entry,manifest:`bundle/modules/${folder}/package.json`,hostExpectations:expectations,files:list};
  });
  for(const row of externalImports.filter(row=>row.disposition==='host-shared')) {
    const name=row.specifier.startsWith('@')?row.specifier.split('/').slice(0,2).join('/'):row.specifier.split('/')[0];
    if(hostRequirements[name]) continue;
    const versions=[...new Set(graph.packages.filter(item=>item.name===name).map(item=>item.version))];
    if(versions.length!==1) reject(`BUNDLE_HOST_EXPECTATION_MISSING: ${name}`);
    hostRequirements[name]=new Set(versions);
  }
  // Keep upstream-only source away from every active runtime import closure.
  for(const [path,file] of files) if(/\.(m?js)$/.test(path) && !referenceFiles.has(path)) {
    for(const row of parse(file.data.toString('utf8'))[0]) if(row.n?.startsWith('.') && referenceFiles.has(slash(join(dirname(path),row.n)))) reject('BUNDLE_UPSTREAM_ENTRY_REACHABLE');
  }
  const manifest={...rootManifest,
    files:[...new Set([...rootManifest.files,'bundle/modules','bundle/licenses','bundle/THIRD-PARTY-NOTICES.md'])],
    dependencies:{...DEPENDENCIES},
    peerDependencies:Object.fromEntries(Object.entries(hostRequirements).sort().map(([name,ranges])=>[name,[...ranges].sort().join(' || ')])),
    peerDependenciesMeta:Object.fromEntries(Object.keys(hostRequirements).sort().map(name=>[name,{optional:true}])),
    dshSepBundle:{...rootManifest.dshSepBundle,preparedRuntime:'modules-only',runtimeContract:'./bundle/contracts/modules.json'},
  };
  if(Object.keys(manifest.scripts??{}).length) reject('BUNDLE_CONSUMER_SCRIPT_FORBIDDEN');
  const contract={schema:1,stage:'prebuilt-modules',businessActivationAllowed:false,
    sourceGraphSha256:SOURCE_GRAPH_SHA256,sourceSuiteVersion:'0.2.1-beta.2',modules,
    thirdPartyDependencies:DEPENDENCIES,hostRequirements:manifest.peerDependencies,
    hostCompatibility:'not_run',externalImports,dynamicImports,frontendAssets,assetReferences,
    upstreamOnly:[...referenceFiles].map(file=>({file,provider:'openclaw',status:'blocked',runtimeEnabled:false,scope:'Upstream reference only; not exported or imported by active modules. Requires upstream metadata and/or OpenClaw SDK. Not a DSH feature.',missingMetadataImport:upstreamMissingMetadata.get(file)??null})),
    externalRuntimeRequirements:['User-configured Python for context preparation and trusted evaluation','Trusted evaluation backend dependencies/container runtime when explicitly enabled','User-configured Windows MCP provider for enhanced computer clicks'],
  };
  await mkdir(output);
  for(const [path,file] of files) { await mkdir(dirname(join(output,path)),{recursive:true}); await writeFile(join(output,path),file.data,{flag:'wx'}); }
  await mkdir(join(output,'bundle/contracts'),{recursive:true});
  await writeFile(join(output,'bundle/contracts/modules.json'),JSON.stringify(contract,null,2)+'\n',{flag:'wx'});
  await writeFile(join(output,'package.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return {modules:modules.length,files:files.size,bytes:totalBytes,remaps:modules.flatMap(row=>row.files).filter(row=>row.remappedImports.length).length};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [programRoot,outputRoot,manifestPath]=process.argv.slice(2);
  const rootManifest=JSON.parse(await bytes(resolve(manifestPath)));
  console.log(JSON.stringify(await buildModules({programRoot,outputRoot,rootManifest,licenseRoot:dirname(resolve(manifestPath))})));
}
