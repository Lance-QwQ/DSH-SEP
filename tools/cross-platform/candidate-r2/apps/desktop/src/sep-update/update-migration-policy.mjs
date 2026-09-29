import {createHash} from 'node:crypto';
import {validateFullProfilePolicy,fullProfilePreservationBlocks} from './update-migration-v2.mjs';

export const RC1_COMMIT='46a7f68b0922371ce7144b668b90e377d8e799f4';
const TRUSTED_BASELINE_GRAPHS=new Set([
 '0b54ac82524c0a42db44d5b8a6ebbbca1773a28c8c361839d47f9c12760f35a3',
 '8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52',
 '7a1719d5bf7ce51a6973ab0f10d7532c1b0f2af086553adb7a438d08b1eb47a2',
]);
const sha=value=>createHash('sha256').update(Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const fail=reason=>{throw Error('UPDATE_MIGRATION_'+reason);};
const read=bytes=>{if(!Buffer.isBuffer(bytes)||bytes.length>16000000)fail('EVIDENCE');try{return JSON.parse(bytes);}catch{fail('EVIDENCE');}};
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
const digest=value=>/^[a-f0-9]{64}$/.test(value??'');
const dataKind=p=>p.instanceId?.startsWith('package:')?'package':'instance';
export function migrationSnapshot(p){return {instanceId:p.instanceId,name:p.name,version:p.version,fingerprint:p.fingerprint,configFingerprint:p.configFingerprint??null,activationFingerprint:p.activationFingerprint??null,externalProgramHash:sha(p.externalProgram??null),enabled:p.enabled??null,entrySpecifier:p.entrySpecifier??null,entryPath:p.entryPath??null,entryFingerprint:p.entryFingerprint??null,originHash:sha(p.origin??null)};}
const equalSnapshot=(a,b)=>Object.keys(b).length===Object.keys(a??{}).length&&Object.entries(b).every(([k,v])=>a[k]===v);
function packageRecord(graph,id){
 const matches=graph.packages?.filter(p=>p.id===id);if(matches?.length!==1)fail('PACKAGE_EVIDENCE');
 const rows=graph.files?.filter(f=>f.path.replaceAll('\\','/').startsWith('store/'+id+'/'));
 if(!rows?.length||rows.some(f=>!digest(f.sha256)))fail('PACKAGE_EVIDENCE');
 return {...matches[0],fingerprint:sha(rows.map(f=>[f.path.replaceAll('\\','/').split('/').slice(2).join('/'),f.sha256]))};
}
function entryBound(row,graph,pkg){
 if(row.name!==pkg.name||row.version!==pkg.version||row.fingerprint!==pkg.fingerprint)fail('PACKAGE_BINDING');
 if(dataKind(row)==='package'&&row.instanceId!=='package:'+pkg.id)fail('PACKAGE_BINDING');
 if(row.entrySpecifier==null){if(row.entryPath!=null||row.entryFingerprint!=null)fail('ENTRY_BINDING');return;}
 if(typeof row.entryPath!=='string'||/[\\%?#\0]/.test(row.entryPath)||row.entryPath.split('/').some(p=>!p||p==='.'||p==='..'||p==='node_modules')||!row.entrySpecifier.startsWith(pkg.name+'/'))fail('ENTRY_BINDING');
 const entries=graph.files.filter(f=>f.path.replaceAll('\\','/')==='store/'+pkg.id+'/'+row.entryPath);
 if(entries.length!==1||entries[0].sha256!==row.entryFingerprint)fail('ENTRY_BINDING');
}
/** A signed admission hashes these exact bytes. The review is authorization,
 * not evidence of compatibility; separate migration/health admission stays required. */
export function validateMigrationPolicy(policy){
 if(read(policy?.manifestBytes).schema===2)return validateFullProfilePolicy(policy);
 const manifest=read(policy?.manifestBytes),sources=read(policy?.sourceBytes),review=read(policy?.reviewBytes);
 if(manifest.schema!==1||manifest.kind!=='exact-rc1-plugin-migration'||manifest.targetVersion!=='0.1.7-rc.1'||!['currentBinding','targetBinding','currentGraphHash','targetGraphHash'].every(k=>digest(manifest[k]))||!Array.isArray(manifest.entries)||!manifest.entries.length||manifest.entries.length>6000)fail('MANIFEST');
 if(review.schema!==1||review.kind!=='user-reviewed-exact-plugin-migration'||review.decision!=='approve'||review.reviewer!=='user'||!nonempty(review.authorizationId)||!Number.isFinite(Date.parse(review.reviewedAt))||Date.parse(review.reviewedAt)>Date.now()+30000||review.manifestSha256!==sha(policy.manifestBytes)||review.sourceEvidenceSha256!==sha(policy.sourceBytes))fail('REVIEW');
 const baselineHash=sha(policy.baselineBytes??Buffer.alloc(0)),targetHash=sha(policy.targetBytes??Buffer.alloc(0));
 if(sources.schema!==1||sources.kind!=='rc1-package-source-evidence'||!TRUSTED_BASELINE_GRAPHS.has(baselineHash)||sources.baselineGraph?.sha256!==baselineHash||sources.targetGraph?.sha256!==targetHash||targetHash!==manifest.targetGraphHash||!Array.isArray(sources.records)||sources.records.length>3000)fail('SOURCE_EVIDENCE');
 const baseline=read(policy.baselineBytes),target=read(policy.targetBytes),records=new Map();
 for(const r of sources.records){
  if(!nonempty(r.id)||records.has(r.id)||!['official-dsh','sep-adaptation'].includes(r.classification))fail('SOURCE_CLASSIFICATION');
  const bytes=policy.builds?.[r.buildEvidence?.path];if(!Buffer.isBuffer(bytes)||sha(bytes)!==r.buildEvidence.sha256)fail('BUILD_EVIDENCE');
  const build=read(bytes),to=packageRecord(target,r.toPackageId),from=r.fromPackageId===null?null:packageRecord(baseline,r.fromPackageId);
  if(build.schema!==1||build.kind!=='reviewed-rc1-package-build'||build.upstream?.repository!=='https://github.com/deepseek-ai/deepseek-harness'||build.upstream.commit!==RC1_COMMIT||build.baselineGraphHash!==baselineHash||build.targetGraphHash!==targetHash||build.classification!==r.classification||!nonempty(build.reviewId)||!nonempty(build.reason)||!equalSnapshot(build.package,{id:to.id,name:to.name,version:to.version,fingerprint:to.fingerprint}))fail('BUILD_EVIDENCE');
  if(!Array.isArray(build.inputs)||!build.inputs.length||build.inputs.length>1000)fail('BUILD_INPUT');
  const roles=new Set(),paths=new Set();
  for(const input of build.inputs){const inputBytes=policy.inputs?.[input.path];if(!nonempty(input.path)||paths.has(input.path)||!['fixed-upstream-source','accepted-sep-baseline','reviewed-adaptation'].includes(input.role)||!Buffer.isBuffer(inputBytes)||sha(inputBytes)!==input.sha256)fail('BUILD_INPUT');paths.add(input.path);roles.add(input.role);}
  if(!roles.has('fixed-upstream-source')||(r.classification==='sep-adaptation'&&(!roles.has('accepted-sep-baseline')||!roles.has('reviewed-adaptation'))))fail('BUILD_INPUT');
  records.set(r.id,{...r,from,to});
 }
 return {manifest,sources,review,baseline,target,records};
}
export function migrationPreservationBlocks(current,candidate,policy){
 try{
  if(read(policy?.manifestBytes).schema===2)return fullProfilePreservationBlocks(current,candidate,policy,migrationSnapshot);
  const {manifest,baseline,target,records}=validateMigrationPolicy(policy);
  if(current.binding!==manifest.currentBinding||candidate.binding!==manifest.targetBinding||current.graphHash!==manifest.currentGraphHash||candidate.graphHash!==manifest.targetGraphHash||current.hardBlocks?.length||candidate.hardBlocks?.length)fail('INVENTORY_BINDING');
  const currentById=new Map(),targetById=new Map();
  for(const [rows,map] of [[current.plugins,currentById],[candidate.plugins,targetById]])for(const p of rows){if(!nonempty(p.instanceId)||map.has(p.instanceId))fail('DUPLICATE_INSTANCE');map.set(p.instanceId,p);}
  const fromUsed=new Set(),toUsed=new Set(),sourceUsed=new Set();
  for(const e of manifest.entries){
   if(!['replace','add'].includes(e.operation)||!e.to||!nonempty(e.to.instanceId)||toUsed.has(e.to.instanceId))fail('ENTRY_SCOPE');
   const next=targetById.get(e.to.instanceId),r=records.get(e.sourceId);if(!next||!r||!equalSnapshot(e.to,migrationSnapshot(next)))fail('ENTRY_CHANGED');
   if(['user','custom','user-modified'].includes(next.origin?.kind))fail('USER_OWNERSHIP');
   entryBound(next,target,r.to);
   if(e.operation==='replace'){
    const prior=currentById.get(e.from?.instanceId);if(!prior||!r.from||fromUsed.has(prior.instanceId)||!equalSnapshot(e.from,migrationSnapshot(prior)))fail('ENTRY_CHANGED');
    if(['user','custom','user-modified'].includes(prior.origin?.kind)||(prior.origin?.baselineFingerprint&&prior.origin.baselineFingerprint!==prior.fingerprint))fail('USER_OWNERSHIP');
    entryBound(prior,baseline,r.from);
    if(prior.name!==next.name||dataKind(prior)!==dataKind(next)||(dataKind(prior)==='instance'&&prior.instanceId!==next.instanceId)||(prior.configFingerprint??null)!==(next.configFingerprint??null)||(prior.activationFingerprint??null)!==(next.activationFingerprint??null)||sha(prior.externalProgram??null)!==sha(next.externalProgram??null)||(prior.enabled??null)!==(next.enabled??null))fail('CONFIG_PRESERVATION');
    fromUsed.add(prior.instanceId);
   }else if(e.from!==null||r.from!==null||currentById.has(next.instanceId))fail('ADD_SCOPE');
   toUsed.add(next.instanceId);sourceUsed.add(r.id);
  }
  if(sourceUsed.size!==records.size)fail('UNUSED_SOURCE');
  // In the exact-migration mode there is no blanket trustedHost exemption.
  for(const prior of current.plugins){
   if(fromUsed.has(prior.instanceId))continue;
   const matches=candidate.plugins.filter(next=>!toUsed.has(next.instanceId)&&(dataKind(prior)==='package'?dataKind(next)==='package'&&next.name===prior.name&&next.version===prior.version:next.instanceId===prior.instanceId));
   const expected=migrationSnapshot(prior),next=matches.find(p=>equalSnapshot({...expected,instanceId:p.instanceId},migrationSnapshot(p)));
   if(!next)fail('UNLISTED_CHANGE');toUsed.add(next.instanceId);
  }
  if(toUsed.size!==candidate.plugins.length)fail('UNLISTED_ADDITION');
  return [];
 }catch(e){return [String(e.message).startsWith('UPDATE_MIGRATION_')?e.message:'UPDATE_MIGRATION_EVIDENCE'];}
}
