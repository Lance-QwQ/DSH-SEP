import {readFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve,isAbsolute,basename} from 'node:path';
import {resolveBundleDir,readProfileManifest,loadOptionalPatches,loadOverlayPatches,composeEntries} from '@deepseek-ai/dsh-app-boot';
import {hash} from './update-core.mjs';

const expression=v=>v&&typeof v==='object'&&Object.hasOwn(v,'__jsExpr');
const key=p=>resolve(p).toLowerCase();
export function profileContextIdentity(context){
  if(!context||!Object.hasOwn(context,'home')||!Array.isArray(context.overlayFiles)||!(context.home===null||typeof context.home==='string'&&isAbsolute(context.home))||context.overlayFiles.some(p=>typeof p!=='string'||!isAbsolute(p))||typeof context.installAnchor!=='string'||!isAbsolute(context.installAnchor))throw Error('UPDATE_PROFILE_CONTEXT_REQUIRED');
  return {home:context.home===null?null:resolve(context.home),installAnchor:resolve(context.installAnchor),overlayFiles:context.overlayFiles.map(p=>resolve(p))};
}

/** Uses the trusted installed host's inert YAML parser and exact patch algebra.
 * Never imports a module from the profile being inspected, nor evaluates !!js.
 */
export async function effectiveProfile(root,context,{fileHash,signal}){
  const ctx=profileContextIdentity(context),warnings=[];
  const known=[join(root,'package.json'),join(root,'cordis.patch.yml'),join(root,'compatibility.json'),...(ctx.home?[join(ctx.home,'cordis.patch.yml')]:[]),...ctx.overlayFiles];
  async function digest(path){
    signal?.throwIfAborted();
    try{const s=await lstat(path);if(s.size>8000000)throw Error('UPDATE_PROFILE_FILE_LIMIT');return await fileHash(path);}
    catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  for(const path of known)await digest(path);
  async function capture(){
    const manifest=readProfileManifest('sep-update',root),bundles=manifest.dsh?.profile?.bundles??[];
    if(!Array.isArray(bundles)||bundles.length>1000||!bundles.every(name=>typeof name==='string'))throw Error('UPDATE_PROFILE_BUNDLE_LIMIT');
    const files=[...known],layers=[],gaps=[];
    // Inventory declarations even when the running inspector's DSH version
    // would skip a bundle. Compatibility is evaluated separately against the
    // candidate dependency graph, never by mounting the inspected plugins.
    for(const name of bundles){
      try{
        const dir=resolveBundleDir('sep-update',name,ctx.installAnchor,root),metadata=join(dir,'package.json');
        await digest(metadata);files.push(metadata);
        const declared=readProfileManifest('sep-update',dir).dsh?.bundle?.patch;
        const patches=typeof declared==='string'?[declared]:declared;
        if(!Array.isArray(patches)||patches.length>1000||!patches.every(path=>typeof path==='string'))throw Error('UPDATE_PROFILE_BUNDLE_FORMAT');
        const paths=patches.map(path=>join(dir,path));if(files.length+paths.length>10000)throw Error('UPDATE_PROFILE_FILE_LIMIT');
        for(const path of paths){await digest(path);files.push(path);}
        layers.push(paths.flatMap(path=>loadOverlayPatches('sep-update',path)));
      }catch{gaps.push('PROFILE_BUNDLE_UNVERIFIED: '+name);}
    }
    const profile=loadOptionalPatches('sep-update',join(root,'cordis.patch.yml'))??[];
    const home=ctx.home?loadOptionalPatches('sep-update',join(ctx.home,'cordis.patch.yml'))??[]:[];
    const overlays=ctx.overlayFiles.map(p=>loadOverlayPatches('sep-update',p));
    return {gaps,files:[...new Set(files.map(p=>resolve(p)))].sort(),entries:composeEntries([...layers,profile,home,...overlays],()=>warnings.push('PROFILE_PATCH_TARGET_UNRESOLVED'))};
  }
  const discovered=await capture(),before=await Promise.all(discovered.files.map(async p=>[p,await digest(p)]));
  const captured=await capture();if(JSON.stringify(discovered.files)!==JSON.stringify(captured.files)||JSON.stringify(discovered.gaps)!==JSON.stringify(captured.gaps))throw Error('UPDATE_PROFILE_CHANGED');
  const after=await Promise.all(captured.files.map(async p=>[p,await digest(p)]));
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('UPDATE_PROFILE_CHANGED');
  const rows=[],gaps=[...captured.gaps],used=new Set();let count=0;
  function visit(entries,ancestors=[],parentDisabled=false){
    if(!Array.isArray(entries)){gaps.push('PROFILE_DYNAMIC_GROUP');return;}
    for(const row of entries){
      if(++count>10000)throw Error('UPDATE_PROFILE_ENTRY_LIMIT');
      if(!row||typeof row!=='object'||Array.isArray(row)){gaps.push('PROFILE_ENTRY_INVALID');continue;}
      const id=typeof row.id==='string'&&row.id?row.id:'unidentified:'+rows.length;
      if(id.startsWith('unidentified:')||used.has(id))gaps.push('PROFILE_INSTANCE_ID_UNVERIFIED: '+id);used.add(id);
      const disabled=parentDisabled||row.disabled===true;
      const dynamic=expression(row.disabled)||ancestors.some(a=>expression(a.disabled));
      const enabled=disabled?false:dynamic?'动态启用条件；未求值':'配置启用；未执行加载探测';
      const activation={disabled:row.disabled??false,filter:row.filter??null,isolate:row.isolate??null,ancestors};
      const group=row.group===true;
      rows.push({...row,id,enabled,kind:group?'configuration-group':'plugin-instance',activationFingerprint:hash(activation)});
      if(row.name==='@deepseek-ai/cordis-plugin-include')gaps.push('PROFILE_RUNTIME_INCLUDE_UNVERIFIED: '+id);
      if(expression(row.group))gaps.push('PROFILE_DYNAMIC_GROUP: '+id);
      if(group)visit(row.config,[...ancestors,{id,disabled:row.disabled??false,filter:row.filter??null,isolate:row.isolate??null}],disabled);
    }
  }
  visit(captured.entries);
  return {rows,context:ctx,files:after.map(([path,sha256])=>({path,sha256})),fingerprint:hash({context:ctx,files:after,entries:captured.entries}),gaps:[...new Set(gaps)],warnings:[...new Set(warnings)]};
}

export async function externalMcp(row,{fileHash}){
  if(row.name!=='@deepseek-ai/dsh-mcp-client')return null;
  const c=row.config;
  if(!c||typeof c!=='object'||expression(c))return {status:'unresolved',reason:'MCP_CONFIG_UNVERIFIED'};
  if(c.transport==='streamable-http')return {status:'remote-unverified',configurationFingerprint:hash(c),scope:'远端 MCP 行为与内容不由本地文件清单证明'};
  if(c.transport!=='stdio'||typeof c.command!=='string'||!isAbsolute(c.command)||!Array.isArray(c.args??[])||!(c.args??[]).every(a=>typeof a==='string')||typeof c.cwd!=='string'||!isAbsolute(c.cwd))return {status:'unresolved',reason:'MCP_COMMAND_UNVERIFIED'};
  // A launcher binary alone does not bind npx downloads, scripts or shell text.
  if(/^(?:node|nodejs|python(?:\d+(?:\.\d+)*)?|pwsh|powershell|cmd|npx|npm|pnpm|uv|uvx)(?:\.exe|\.cmd)?$/i.test(basename(c.command)))return {status:'unresolved',reason:'MCP_LAUNCHER_PAYLOAD_UNVERIFIED'};
  try{
    const fingerprint=await fileHash(c.command),canonical=await realpath(c.command);
    if(key(canonical)!==key(c.command))throw Error('LINK');
    if(!(await lstat(c.cwd)).isDirectory())throw Error('CWD');
    return {status:'entry-bound',fingerprint,configurationFingerprint:hash(c),scope:'仅绑定 stdio 入口文件与配置；未启动、未握手，传递依赖及桌面行为未验证'};
  }catch{return {status:'unresolved',reason:'MCP_PROGRAM_UNREADABLE'};}
}

/** The managed desktop host always appends its SEP policy overlay. */
export async function managedProfileContext(root,home){
  if(typeof home!=='string'||!isAbsolute(home))throw Error('UPDATE_PROFILE_HOME_REQUIRED');
  const graph=JSON.parse(await readFile(join(root,'graph.json'),'utf8')),id=graph.roots?.['@deepseek-ai/dsh-desktop-host'];
  if(typeof id!=='string'||!/^\w[\w-]*$/.test(id))throw Error('UPDATE_HOST_PROFILE_UNVERIFIED');
  const dir=join(root,'store',id);
  return profileContextIdentity({home,installAnchor:join(dir,'package.json'),overlayFiles:[join(dir,'lib/sep-policy.json')]});
}
