import {readFile,realpath} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {validateDelta} from './prepare-package.mjs';
import {rebaseProgram} from './prepare-profile.mjs';
import {effectiveProfile} from './update-profile.mjs';
import {fileHash,jsonFile} from './update-inventory.mjs';
const demand=(v,c)=>{if(!v)throw Error(c);};
/** Check actual composed configuration and byte identities, independently of policy claims. */
export function verifyPreservation({base,target,metadata,release,oldRoot,newRoot,rows,after,current,candidate,ownedFileInstances=[]}){
 const delta=validateDelta(base,target,metadata,release),changedIds=new Set(delta.changed.map(p=>p.split('/')[1]));
 for(const p of target.packages)if(!isDeepStrictEqual(base.packages.find(b=>b.id===p.id),p))changedIds.add(p.id);
 demand(isDeepStrictEqual(rebaseProgram(rows,oldRoot,newRoot),after),'SEP_PRESERVATION_CONFIG');
 demand(current.length===candidate.length,'SEP_PRESERVATION_PLUGIN_COUNT');
 const owned=new Set(ownedFileInstances),used=new Set();
 for(const before of current){
  const matches=candidate.filter(p=>p.instanceId===before.instanceId);demand(matches.length===1&&!used.has(before.instanceId),'SEP_PRESERVATION_PLUGIN_ID');used.add(before.instanceId);const next=matches[0];
  demand(next.name===rebaseProgram(before.name,oldRoot,newRoot),'SEP_PRESERVATION_PLUGIN_NAME');
  demand(isDeepStrictEqual(before.externalProgram,next.externalProgram)&&before.enabled===next.enabled&&before.activationFingerprint===next.activationFingerprint,'SEP_PRESERVATION_ACTIVATION');
  const packageId=before.instanceId.startsWith('package:')?before.instanceId.slice(8):base.roots[before.name];
  if(!changedIds.has(packageId)&&!owned.has(before.instanceId))demand(before.fingerprint===next.fingerprint&&before.version===next.version,'SEP_PRESERVATION_PLUGIN_BYTES');
 }
 return true;
}
/** Recompute every preservation fact from installed roots during review and publication. */
export async function verifyPreparedPolicy({policy,current,candidate,currentRoot,targetRoot,currentContext,targetContext,release}){
 demand(policy?.schema===2&&policy.kind==='sep-program-delta-policy'&&policy.currentRoot===currentRoot&&policy.targetRoot===targetRoot&&policy.currentBinding===current.binding&&policy.targetBinding===candidate.binding,'SEP_PRESERVATION_BINDING');
 const base=await jsonFile(join(currentRoot,'graph.json')),target=await jsonFile(join(targetRoot,'graph.json'));
 demand(await fileHash(join(currentRoot,'graph.json'))===policy.metadata.baseGraphHash&&await fileHash(join(targetRoot,'graph.json'))===policy.metadata.targetGraphHash,'SEP_PRESERVATION_GRAPH');
 const [beforeProfile,afterProfile]=await Promise.all([effectiveProfile(currentRoot,currentContext,{fileHash}),effectiveProfile(targetRoot,targetContext,{fileHash})]);
 const changes=validateDelta(base,target,policy.metadata,release).changed,changed=new Set(changes),ownedFileInstances=[];
 for(const p of current.plugins)if(p.name.startsWith('file:')){
  const path=await realpath(fileURLToPath(p.name)),rel=relative(currentRoot,path).replaceAll('\\','/');
  // A graph-owned file entry also binds its owning package's metadata and
  // dependencies. An unchanged entry can therefore acquire a new fingerprint.
  const owner=base.files.some(f=>f.path===rel)?/^store\/([^/]+)\//.exec(rel)?.[1]:undefined;
  if(changed.has(rel)||(owner&&changes.some(f=>f.split('/')[1]===owner))){
   const next=candidate.plugins.find(n=>n.instanceId===p.instanceId);demand(next?.name===rebaseProgram(p.name,currentRoot,targetRoot),'SEP_PRESERVATION_FILE');
   demand(await realpath(fileURLToPath(next.name))===join(targetRoot,rel),'SEP_PRESERVATION_FILE');ownedFileInstances.push(p.instanceId);
  }
 }
 verifyPreservation({base,target,metadata:policy.metadata,release,oldRoot:currentRoot,newRoot:targetRoot,rows:beforeProfile.rows,after:afterProfile.rows,current:current.plugins,candidate:candidate.plugins,ownedFileInstances});return [];
}
