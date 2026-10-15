import {allowsUpdateChannel,validateUpdateFilter} from './update-filter.mjs';
import semver from 'semver';
import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const SEP_RELEASES='https://api.github.com/repos/Lance-QwQ/DSH-SEP/releases?per_page=100';
const supportedPlatforms=new Set(['win32-x64','linux-x64','linux-arm64','darwin-x64','darwin-arm64']);
const releasesBase='https://github.com/Lance-QwQ/DSH-SEP/releases';
async function json(url,{fetcher,signal,limit}){
 let target=url;
 for(let hop=0;hop<3;hop++){
  const response=await fetcher(target,{method:'GET',redirect:'manual',credentials:'omit',headers:{accept:target.includes('/releases/assets/')?'application/octet-stream':'application/vnd.github+json','user-agent':'DSH-SEP-Self-Update','x-github-api-version':'2022-11-28'},signal});
  if([301,302,303,307,308].includes(response.status)){
   const next=new URL(response.headers.get('location')??'',target);
   if(next.protocol!=='https:'||next.username||next.password||!['api.github.com','release-assets.githubusercontent.com'].includes(next.hostname))throw Error('SEP_UPDATE_ORIGIN');
   await response.body?.cancel();target=next.href;continue;
  }
  if(!response.ok)throw Error('SEP_UPDATE_HTTP_'+response.status);
  const reader=response.body?.getReader();if(!reader)throw Error('SEP_UPDATE_EMPTY');const parts=[];let bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit){await reader.cancel();throw Error('SEP_UPDATE_TOO_LARGE');}parts.push(value);}}finally{reader.releaseLock();}
  const body=Buffer.concat(parts);return {value:JSON.parse(body.toString('utf8')),hash:digest(body)};
 }
 throw Error('SEP_UPDATE_REDIRECT_LIMIT');
}
/** Discover SEP releases independently from the host. Old archives without a
 * machine-readable update manifest remain explicitly unverified. Coverage counts
 * verified manifests separately from missing or download-limited metadata;
 * metadata-partial compares only verified manifests for this platform. */
export async function fetchSepRelease({installedSepVersion,hostVersion,platform=process.platform+'-'+process.arch,fetcher=fetch,signal,filterStrength='strong'}={}){
 validateUpdateFilter(filterStrength);
 if(!semver.valid(installedSepVersion)||!semver.valid(hostVersion))throw Error('SEP_UPDATE_LOCAL_VERSION');
 if(!supportedPlatforms.has(platform))throw Error('SEP_UPDATE_LOCAL_PLATFORM');
 const bounded=AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])]);
 const {value:rows}=await json(SEP_RELEASES,{fetcher,signal:bounded,limit:2000000});
 if(!Array.isArray(rows)||rows.length>100)throw Error('SEP_UPDATE_METADATA_INVALID');
 let best=null;let manifests=0,matchingPlatforms=0,foreignPlatform=false,missingManifests=0,manifestLimitReached=false;
 for(const row of rows){
  if(row?.draft===true)continue;
  if(!row||typeof row.tag_name!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(row.tag_name)||row.html_url!==releasesBase+'/tag/'+row.tag_name||!Array.isArray(row.assets)||!Number.isFinite(Date.parse(row.published_at)))throw Error('SEP_UPDATE_ORIGIN');
  const matches=row.assets.filter(a=>a.name==='dsh-sep-update.json');if(!matches.length){missingManifests++;continue;}if(matches.length!==1)throw Error('SEP_UPDATE_METADATA_INVALID');
  // GitHub returns newest first. Bound metadata downloads, not just response size.
  if(manifests===5){manifestLimitReached=true;break;}
  const asset=matches[0];if(!Number.isSafeInteger(asset.id)||asset.id<=0||asset.browser_download_url!==releasesBase+'/download/'+row.tag_name+'/dsh-sep-update.json'||!/^sha256:[a-f0-9]{64}$/.test(asset.digest??''))throw Error('SEP_UPDATE_ORIGIN');
  const parsed=await json('https://api.github.com/repos/Lance-QwQ/DSH-SEP/releases/assets/'+asset.id,{fetcher,signal:bounded,limit:65536});
  if(asset.digest!=='sha256:'+parsed.hash)throw Error('SEP_UPDATE_MANIFEST_CHANGED');
  const m=parsed.value;
  if(m?.schema!==1||m.product!=='dsh-sep'||!supportedPlatforms.has(m.platform)||!semver.valid(m.sepVersion)||!semver.valid(m.hostVersion)||!m.bundle||!/^[a-zA-Z0-9._-]+\.zip$/.test(m.bundle.name??'')||!/^\w{64}$/.test(m.bundle.sha256??'')||!/^[a-f0-9]{64}$/.test(m.bundle.sha256)||m.bundle.url!==releasesBase+'/download/'+row.tag_name+'/'+m.bundle.name)throw Error('SEP_UPDATE_MANIFEST_INVALID');
  manifests++;
  if(m.platform!==platform){foreignPlatform=true;continue;}matchingPlatforms++;
  if(!allowsUpdateChannel(m.sepVersion,filterStrength)||!semver.gt(m.sepVersion,installedSepVersion))continue;
  if(m.hostVersion!==hostVersion)throw Error('SEP_UPDATE_HOST_ADAPTATION_REQUIRED');
  if(!best||semver.gt(m.sepVersion,best.sepVersion))best={source:'sep',platform,version:hostVersion,sepVersion:m.sepVersion,url:row.html_url,publishedAt:row.published_at,manifestHash:parsed.hash,bundle:m.bundle};
 }
 const incomplete=missingManifests>0||manifestLimitReached;
 return {status:best?'available':foreignPlatform&&!matchingPlatforms?'platform-unavailable':incomplete?(matchingPlatforms?'metadata-partial':'metadata-unavailable'):manifests?'current':'no-releases',release:best,coverage:{verifiedManifests:manifests,matchingPlatforms,missingManifests,manifestLimitReached}};
}
// These packages contain SEP code or the reviewed desktop integration seam.
// An authenticated local policy must also bind each exact before/after instance.
const owners=new Set(['dsh-system-enhancement-package','@deepseek-ai/dsh-recovery','@deepseek-ai/dsh-client-ui-settings-memory','@deepseek-ai/dsh-desktop','dsh-sep-plugin-group','dsh-sep-context-preparation','dsh-tool-worker','dsh-sep-trusted-evaluation-entry','@deepseek-ai/dsh-sep-session-migration']);
/** Preserve every installed component unless a locally admitted SEP policy
 * names its exact old and new inventory entries; never change the host version. */
export function sepPreservationBlocks(current,candidate,policy){
 if(policy?.schema!==1||policy.kind!=='sep-only-replacement-policy'||policy.currentBinding!==current.binding||policy.targetBinding!==candidate.binding||policy.targetGraphHash!==candidate.graphHash||!Array.isArray(policy.replacements)||!Array.isArray(policy.additions??[]))throw Error('SEP_UPDATE_POLICY_BINDING');
 if(current.rootVersions['@deepseek-ai/dsh']!==policy.hostVersion||candidate.rootVersions['@deepseek-ai/dsh']!==policy.hostVersion)throw Error('SEP_UPDATE_HOST_CHANGED');
 if(current.rootVersions['dsh-system-enhancement-package']!==policy.fromSepVersion||candidate.rootVersions['dsh-system-enhancement-package']!==policy.toSepVersion)throw Error('SEP_UPDATE_VERSION_CHANGED');
 const planned=new Map();for(const item of policy.replacements){
  const packagePair=item.before?.instanceId?.startsWith('package:')&&item.after?.instanceId?.startsWith('package:');
  if(!owners.has(item.before?.name)||item.after?.name!==item.before.name||!packagePair&&item.before.instanceId!==item.after.instanceId)throw Error('SEP_UPDATE_POLICY_OWNER');
  if(planned.has(item.before.instanceId))throw Error('SEP_UPDATE_POLICY_DUPLICATE');planned.set(item.before.instanceId,item);
 }
 const added=new Map();for(const item of policy.additions??[]){if(!owners.has(item.name)||added.has(item.instanceId))throw Error('SEP_UPDATE_POLICY_OWNER');added.set(item.instanceId,item);}
 const blocks=[],consumed=new Set();
 for(const old of current.plugins){
  const plan=planned.get(old.instanceId),targets=candidate.plugins.filter(p=>p.instanceId===(plan?.after.instanceId??old.instanceId));
  if(targets.length!==1){blocks.push('PLUGIN_PRESERVATION_FAILED: '+old.name);continue;}
  const next=targets[0];
  if(consumed.has(next.instanceId))blocks.push('SEP_UPDATE_POLICY_DUPLICATE: '+old.name);consumed.add(next.instanceId);
  if(plan){if(digest(old)!==digest(plan.before)||digest(next)!==digest(plan.after)||old.configFingerprint!==next.configFingerprint||old.activationFingerprint!==next.activationFingerprint||digest(old.externalProgram??null)!==digest(next.externalProgram??null)||old.enabled!==next.enabled)blocks.push('SEP_UPDATE_POLICY_CHANGED: '+old.name);planned.delete(old.instanceId);}
  else if(digest(old)!==digest(next))blocks.push('PLUGIN_PRESERVATION_FAILED: '+old.name);
 }
 for(const item of candidate.plugins.filter(p=>!consumed.has(p.instanceId))){if(digest(item)!==digest(added.get(item.instanceId)??null))blocks.push('SEP_UPDATE_ADDITION_UNREVIEWED: '+item.name);added.delete(item.instanceId);}
 if(planned.size||added.size)blocks.push('SEP_UPDATE_POLICY_UNUSED_ENTRY');return blocks;
}
