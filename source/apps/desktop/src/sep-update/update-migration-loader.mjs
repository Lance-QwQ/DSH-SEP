import {readFile,lstat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {fileHash} from './update-inventory.mjs';
import {hash} from './update-core.mjs';
import {validateMigrationPolicy} from './update-migration-policy.mjs';

/** Consume only files covered by the already verified signed admission. */
export async function readMigrationPolicy(admission){
 if(admission.migrationPolicy===undefined)return null;
 const locations=admission.migrationPolicy;
 if(!locations||typeof locations!=='object')throw Error('UPDATE_MIGRATION_BINDING');
 async function bound(path){
  const rows=admission.bindings?.filter(b=>b.path===path);
  if(typeof path!=='string'||!isAbsolute(path)||rows?.length!==1||!/^[a-f0-9]{64}$/.test(rows[0].sha256??''))throw Error('UPDATE_MIGRATION_UNBOUND');
  const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>16000000)throw Error('UPDATE_MIGRATION_INPUT_SCOPE');
  if(await fileHash(path)!==rows[0].sha256)throw Error('UPDATE_MIGRATION_CHANGED');
  const bytes=await readFile(path);if(hash(bytes)!==rows[0].sha256||await fileHash(path)!==rows[0].sha256)throw Error('UPDATE_MIGRATION_CHANGED');return bytes;
 }
 const policy={manifestBytes:await bound(locations.manifestPath),sourceBytes:await bound(locations.sourceEvidencePath),reviewBytes:await bound(locations.reviewPath),baselineBytes:await bound(locations.baselineGraphPath),targetBytes:await bound(locations.targetGraphPath),builds:{},inputs:{}};
 const sources=JSON.parse(policy.sourceBytes);
 if(!Array.isArray(sources.records)||sources.records.length>3000)throw Error('UPDATE_MIGRATION_SOURCE_EVIDENCE');
 for(const record of sources.records){
  const path=record.buildEvidence?.path;const bytes=await bound(path);policy.builds[path]=bytes;
  const build=JSON.parse(bytes);if(!Array.isArray(build.inputs)||build.inputs.length>1000)throw Error('UPDATE_MIGRATION_BUILD_INPUT');
  for(const input of build.inputs)if(!Object.hasOwn(policy.inputs,input.path))policy.inputs[input.path]=await bound(input.path);
 }
 const {manifest}=validateMigrationPolicy(policy);
 if(manifest.currentBinding!==admission.currentBinding||manifest.targetBinding!==admission.targetBinding||manifest.targetGraphHash!==admission.targetGraphHash||manifest.targetVersion!==admission.targetVersion)throw Error('UPDATE_MIGRATION_BINDING');
 return policy;
}
