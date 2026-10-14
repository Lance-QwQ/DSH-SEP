/** Exact fixed-version full-Profile transition; no general plugin exemption. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const COMMIT='46a7f68b0922371ce7144b668b90e377d8e799f4';
const BASELINE='0b54ac82524c0a42db44d5b8a6ebbbca1773a28c8c361839d47f9c12760f35a3';
const sha=x=>createHash('sha256').update(Buffer.isBuffer(x)||typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const fail=reason=>{throw Error('UPDATE_MIGRATION_'+reason);};
const demand=(condition,reason)=>{if(!condition)fail(reason);};
const digest=x=>/^[a-f0-9]{64}$/.test(x??'');
const read=b=>{demand(Buffer.isBuffer(b)&&b.length<=16000000,'EVIDENCE');return JSON.parse(b);};
const key=p=>resolve(p).toLowerCase();
const packageRow=p=>p.instanceId?.startsWith('package:');
const retired=new Map([['agent-presets','@deepseek-ai/dsh-agent-presets'],['ui-settings-unarchive-sessions','@deepseek-ai/dsh-client-ui-settings-unarchive-sessions']]);
const settingsRename=(a,b)=>a?.instanceId==='settings'&&a.name==='@deepseek-ai/dsh-settings-file'&&b?.name==='@deepseek-ai/dsh-settings';
function rebase(value,roots){
 if(typeof value==='string'){
  if(value.startsWith('file:'))return pathToFileURL(rebase(fileURLToPath(value),roots)).href;
  if(value===roots.current||value.startsWith(roots.current+'\\')||value.startsWith(roots.current+'/'))return roots.target+value.slice(roots.current.length);
  return value;
 }
 if(Array.isArray(value))return value.map(v=>rebase(v,roots));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rebase(v,roots)]));
 return value;
}
function normalizePatch(value,roots){
 const result=rebase(value,roots);
 function visit(v){
  if(!v||typeof v!=='object')return;
  if(v.id==='llm-deepseek'&&Object.hasOwn(v.config??{},'protocol')){demand(v.config.protocol==='messages','PROTOCOL_UNSUPPORTED');delete v.config.protocol;}
  for(const item of Object.values(v))visit(item);
 }
 visit(result);return result;
}
export function validateFullProfilePolicy(policy){
 const manifest=read(policy.manifestBytes),sources=read(policy.sourceBytes),review=read(policy.reviewBytes);
 demand(manifest.schema===2&&manifest.kind==='exact-rc1-full-profile-migration'&&manifest.targetVersion==='0.1.7-rc.1'&&['currentBinding','targetBinding','currentGraphHash','targetGraphHash'].every(k=>digest(manifest[k]))&&Array.isArray(manifest.entries)&&manifest.entries.length>0&&manifest.entries.length<=6000,'MANIFEST');
 demand(review.schema===2&&review.kind==='operator-reviewed-authorized-rc1-adaptation'&&review.reviewer==='codex'&&review.decision==='approve'&&review.authorization?.kind==='user-authorized-scope'&&review.authorization.statement==='允许按明确清单适配新版（推荐）'&&review.manifestSha256===sha(policy.manifestBytes)&&review.sourceEvidenceSha256===sha(policy.sourceBytes)&&Number.isFinite(Date.parse(review.reviewedAt))&&Date.parse(review.reviewedAt)<=Date.now()+30000,'REVIEW');
 demand(sha(policy.baselineBytes)===BASELINE&&manifest.currentGraphHash===BASELINE&&sha(policy.targetBytes)===manifest.targetGraphHash,'SOURCE_EVIDENCE');
 const baseline=read(policy.baselineBytes),target=read(policy.targetBytes);
 demand(sources.schema===2&&sources.kind==='rc1-full-profile-source-evidence'&&sources.records?.length===1,'SOURCE_EVIDENCE');
 const source=sources.records[0],buildBytes=policy.builds?.[source.buildEvidence?.path];
 demand(source.classification==='reviewed-full-profile-adaptation'&&Buffer.isBuffer(buildBytes)&&sha(buildBytes)===source.buildEvidence.sha256,'BUILD_EVIDENCE');
 const build=read(buildBytes);
 demand(build.schema===2&&build.kind==='reviewed-rc1-full-profile-build'&&build.upstream?.repository==='https://github.com/deepseek-ai/deepseek-harness'&&build.upstream.commit===COMMIT&&build.baselineGraphHash===BASELINE&&build.targetGraphHash===manifest.targetGraphHash&&Array.isArray(build.inputs)&&build.inputs.length>0&&build.inputs.length<=1000,'BUILD_EVIDENCE');
 const bound=new Set(),roles=new Set();
 for(const input of build.inputs){demand(typeof input.path==='string'&&!bound.has(input.path)&&Buffer.isBuffer(policy.inputs?.[input.path])&&sha(policy.inputs[input.path])===input.sha256&&['fixed-upstream-source','accepted-sep-baseline','reviewed-adaptation'].includes(input.role),'BUILD_INPUT');bound.add(input.path);roles.add(input.role);}
 demand(['fixed-upstream-source','accepted-sep-baseline','reviewed-adaptation'].every(r=>roles.has(r))&&bound.has(build.assemblyPath),'BUILD_INPUT');
 const assembly=read(policy.inputs[build.assemblyPath]);demand(assembly.schema===1&&assembly.upstream===COMMIT&&assembly.r2Graph===BASELINE&&assembly.result?.sha256===manifest.targetGraphHash&&assembly.result.packages===target.packages.length&&assembly.result.files===target.files.length,'BUILD_EVIDENCE');
 const roots=manifest.roots,files=manifest.profileFiles;
 demand(roots&&isAbsolute(roots.current??'')&&isAbsolute(roots.target??'')&&key(roots.current)!==key(roots.target)&&files&&Object.values(files).every(p=>bound.has(p)),'PROFILE_BINDING');
 for(const [field,root,name]of [['currentPackage',roots.current,'package.json'],['targetPackage',roots.target,'package.json'],['currentPatch',roots.current,'cordis.patch.yml'],['targetPatch',roots.target,'cordis.patch.yml']])demand(key(files[field])===key(join(root,name)),'PROFILE_BINDING');
 const oldPackage=read(policy.inputs[files.currentPackage]),newPackage=read(policy.inputs[files.targetPackage]);
 const dependencies=Object.fromEntries(Object.entries(target.roots).map(([name,id])=>[name,target.packages.find(p=>p.id===id)?.version]));
 demand(equal({...oldPackage,dependencies},newPackage),'PROFILE_METADATA_CHANGED');
 const oldPatch=read(policy.inputs[files.currentPatch]),newPatch=read(policy.inputs[files.targetPatch]);
 demand(equal(normalizePatch(oldPatch,roots),newPatch),'CONFIG_PRESERVATION');
 return {manifest,sources,review,baseline,target,records:new Map(),oldPatch,newPatch};
}
const fingerprintCaches=new WeakMap();
function fingerprint(graph,id){
 let cache=fingerprintCaches.get(graph);
 if(!cache){const rows=new Map();for(const file of graph.files){const parts=file.path.replaceAll('\\','/').split('/');if(parts[0]!=='store')continue;const list=rows.get(parts[1])??[];list.push([parts.slice(2).join('/'),file.sha256]);rows.set(parts[1],list);}cache=new Map([...rows].map(([name,entries])=>[name,sha(entries)]));fingerprintCaches.set(graph,cache);}
 return cache.get(id)??sha([]);
}
function fileReference(name,root){if(!name?.startsWith('file:'))return null;const path=relative(root,fileURLToPath(name)).replaceAll('\\','/');return !isAbsolute(path)&&path!=='..'&&!path.startsWith('../')?path:null;}
function trusted(row,graph,root){
 if(['user','custom','user-modified'].includes(row.origin?.kind))return false;
 if(row.kind==='configuration-group')return true;
 const ref=fileReference(row.name,root);
 if(ref){
  const parts=ref.split('/');let id,local;
  if(parts[0]==='store'){id=parts[1];local=parts.slice(2).join('/');}
  else if(parts[0]==='node_modules'){const n=parts[1]?.startsWith('@')?3:2;id=graph.roots[parts.slice(1,n).join('/')];local=parts.slice(n).join('/');}
  return !!id&&graph.files.some(f=>f.path.replaceAll('\\','/')==='store/'+id+'/'+local&&f.sha256===row.fingerprint);
 }
 const id=packageRow(row)?row.instanceId.slice(8):graph.roots[row.name],pkg=graph.packages.find(p=>p.id===id);
 if(!pkg||pkg.name!==row.name||pkg.version!==row.version||fingerprint(graph,id)!==row.fingerprint)return false;
 return row.entryPath==null||graph.files.some(f=>f.path.replaceAll('\\','/')==='store/'+id+'/'+row.entryPath&&f.sha256===row.entryFingerprint);
}
function configRow(patch,id){const matches=[];function visit(v){if(!v||typeof v!=='object')return;if(v.id===id&&v.config)matches.push(v);for(const x of Object.values(v))visit(x);}visit(patch);return matches.length===1?matches[0]:null;}
export function fullProfilePreservationBlocks(current,candidate,policy,snapshot){
 try{
  const v=validateFullProfilePolicy(policy),{manifest:m,baseline,target}=v;
  demand(current.binding===m.currentBinding&&candidate.binding===m.targetBinding&&current.graphHash===m.currentGraphHash&&candidate.graphHash===m.targetGraphHash&&!current.hardBlocks.length&&!candidate.hardBlocks.length,'INVENTORY_BINDING');
  for(const [inventory,graph,root]of [[current,baseline,m.roots.current],[candidate,target,m.roots.target]]){
   demand(key(inventory.profileContext?.installAnchor??'')===key(join(root,'store',graph.roots['@deepseek-ai/dsh-desktop-host'],'package.json')),'PROFILE_BINDING');
   const required=[join(root,'package.json'),join(root,'cordis.patch.yml'),m.profileFiles.homePatch];
   for(const path of required){
    const rows=inventory.profileCoverage.files.filter(f=>key(f.path)===key(path));
    demand(rows.length===1&&rows[0].sha256===sha(policy.inputs[path]),'PROFILE_BINDING');
   }
  }
  demand(key(current.profileContext.home)===key(candidate.profileContext.home)&&key(m.profileFiles.homePatch)===key(join(current.profileContext.home,'cordis.patch.yml')),'PROFILE_BINDING');
  const old=new Map(current.plugins.map(p=>[p.instanceId,p])),next=new Map(candidate.plugins.map(p=>[p.instanceId,p])),from=new Set(),to=new Set();
  demand(old.size===current.plugins.length&&next.size===candidate.plugins.length,'DUPLICATE_INSTANCE');
  for(const e of m.entries){
   demand(['retain','replace','remove','add'].includes(e.operation),'ENTRY_SCOPE');
   const a=e.from?old.get(e.from.instanceId):null,b=e.to?next.get(e.to.instanceId):null;
   if(e.from){demand(a&&!from.has(a.instanceId)&&equal(snapshot(a),e.from),'ENTRY_CHANGED');from.add(a.instanceId);}
   if(e.to){demand(b&&!to.has(b.instanceId)&&equal(snapshot(b),e.to),'ENTRY_CHANGED');to.add(b.instanceId);}
   if(e.operation==='retain'){demand(a&&b&&equal({...snapshot(a),instanceId:b.instanceId},snapshot(b))&&(packageRow(a)||a.instanceId===b.instanceId),'CONFIG_PRESERVATION');continue;}
   if(a)demand(trusted(a,baseline,m.roots.current),'USER_OWNERSHIP');if(b)demand(trusted(b,target,m.roots.target),'TARGET_SOURCE');
   if(e.operation==='remove'){
    demand(a&&!b,'ENTRY_SCOPE');
    demand(packageRow(a)?!current.plugins.some(p=>!packageRow(p)&&p.name===a.name&&p.version===a.version&&retired.get(p.instanceId)!==p.name&&!settingsRename(p,next.get(p.instanceId))):retired.get(a.instanceId)===a.name,'REMOVAL_SCOPE');continue;
   }
   if(e.operation==='add'){demand(!a&&b,'ENTRY_SCOPE');continue;}
   demand(a&&b&&packageRow(a)===packageRow(b)&&(packageRow(a)||a.instanceId===b.instanceId),'ENTRY_SCOPE');
   demand(a.name===b.name||settingsRename(a,b)||(fileReference(a.name,m.roots.current)!==null&&fileReference(a.name,m.roots.current)===fileReference(b.name,m.roots.target)),'RENAME_SCOPE');
   demand(sha(a.externalProgram??null)===sha(b.externalProgram??null),'CONFIG_PRESERVATION');
   if((a.configFingerprint??null)!==(b.configFingerprint??null)){
    const row=configRow(v.oldPatch,a.instanceId),normalized=row?normalizePatch([row],m.roots)[0]:null;
    const owns=row&&sha(row.config)===a.configFingerprint&&sha(normalized.config)===b.configFingerprint;
    const spill=a.instanceId==='spill-policy'&&a.name==='@deepseek-ai/dsh-spill-policy'&&a.configFingerprint===sha({maxInlineBytes:50000})&&b.configFingerprint===sha({maxInlineTokens:12500});
    demand(owns||spill,'CONFIG_PRESERVATION');
   }
   if(a.activationFingerprint!==b.activationFingerprint||a.enabled!==b.enabled)demand(['settings','ui-sidebar-browser'].includes(a.instanceId),'ACTIVATION_PRESERVATION');
  }
  demand(from.size===old.size&&to.size===next.size,'UNLISTED_CHANGE');return [];
 }catch(e){return [String(e.message).startsWith('UPDATE_MIGRATION_')?e.message:'UPDATE_MIGRATION_EVIDENCE'];}
}
