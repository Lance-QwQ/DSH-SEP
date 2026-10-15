import {isAbsolute} from 'node:path';
import {release as osRelease} from 'node:os';
import {hash} from './update-core.mjs';
import {jsonFile,fileHash} from './update-inventory.mjs';
const checkedDocuments=new WeakMap();
const states=new Set(['pass','fail','blocked','not_run']);
const digest=/^[a-f0-9]{64}$/;
const same=(a,b)=>hash(a)===hash(b);
const strings=a=>Array.isArray(a)&&a.length>0&&a.length<=200&&a.every(v=>typeof v==='string'&&v.length>0&&v.length<=1000)&&new Set(a).size===a.length;
export function pluginSubject(p){return {name:p.name,instanceId:p.instanceId,version:p.version,fingerprint:p.fingerprint,configFingerprint:p.configFingerprint,activationFingerprint:p.activationFingerprint,enabled:p.enabled,externalProgram:p.externalProgram??null};}

/** The caller supplies reviewed preparation bindings or a validated admission.
 * Offline publication binds these same files in its P2 plan. Plain unchecked
 * objects passed to makeReport are ignored.
 */
export async function readPluginEvidence(admission){
 if(!admission?.compatibilityEvidencePath)return null;
 async function readBound(path){
  const bindings=admission.bindings?.filter(b=>b.path===path);
  if(typeof path!=='string'||!isAbsolute(path)||bindings?.length!==1||!digest.test(bindings[0].sha256??''))throw Error('UPDATE_PLUGIN_EVIDENCE_UNBOUND');
  const before=await fileHash(path);if(before!==bindings[0].sha256)throw Error('UPDATE_PLUGIN_EVIDENCE_CHANGED');
  const data=await jsonFile(path,8000000);if(await fileHash(path)!==before)throw Error('UPDATE_PLUGIN_EVIDENCE_CHANGED');return data;
 }
 const document=await readBound(admission.compatibilityEvidencePath);
 if(document?.schema!==1||document.kind!=='plugin-compatibility-evidence'||!Array.isArray(document.records)||document.records.length>10000||!['currentBinding','targetBinding','currentGraphHash','targetGraphHash'].every(k=>digest.test(document[k]??''))||typeof document.targetVersion!=='string'||!Number.isFinite(Date.parse(document.testedAt))||Date.parse(document.testedAt)>Date.now()+30000||!document.environment||typeof document.environment.platform!=='string'||typeof document.environment.arch!=='string')throw Error('UPDATE_PLUGIN_EVIDENCE_INVALID');
 const identities=new Set();let checks=0;
 for(const record of document.records){
  if(!record.subject||typeof record.subject.instanceId!=='string'||typeof record.subject.name!=='string'||!states.has(record.status)||!strings(record.scope)||!Array.isArray(record.checks)||record.checks.length===0||record.checks.length>200)throw Error('UPDATE_PLUGIN_EVIDENCE_INVALID');
  const identity=hash(record.subject);if(identities.has(identity))throw Error('UPDATE_PLUGIN_EVIDENCE_DUPLICATE');identities.add(identity);
  for(const ref of record.checks){
   if(++checks>10000)throw Error('UPDATE_PLUGIN_EVIDENCE_LIMIT');
   const check=await readBound(ref.path);
   if(typeof ref.id!=='string'||check.schema!==1||check.kind!=='plugin-compatibility-check'||check.id!==ref.id||check.status!==record.status||!same(check.subject,record.subject)||!same(check.scope,record.scope)||check.targetBinding!==document.targetBinding||check.targetVersion!==document.targetVersion)throw Error('UPDATE_PLUGIN_EVIDENCE_CHECK_MISMATCH');
  }
 }
 // No mutable parsed records escape to callers after verification.
 const handle=Object.freeze({fingerprint:hash(document),recordCount:document.records.length});checkedDocuments.set(handle,structuredClone(document));return handle;
}

export function applyPluginEvidence(row,target,{evidence,current,candidate,release,allowPositive=true}){
 const document=checkedDocuments.get(evidence??{});if(!document)return row;
 const stale=document.currentBinding!==current.binding||document.targetBinding!==candidate.binding||document.currentGraphHash!==current.graphHash||document.targetGraphHash!==candidate.graphHash||document.targetVersion!==release.version||document.environment.platform!==process.platform||document.environment.arch!==process.arch||(document.environment.osRelease!==undefined&&document.environment.osRelease!==osRelease())||(document.validUntil!==undefined&&(!Number.isFinite(Date.parse(document.validUntil))||Date.parse(document.validUntil)<Date.now()));
 if(stale)return {...row,reasons:[...row.reasons,'兼容性证据不适用于当前版本、输入或环境，未复用']};
 const record=document.records.find(r=>same(r.subject,pluginSubject(target)));if(!record)return row;
 if(row.verdict==='incompatible')return row;
 if(record.status==='fail'&&record.failureClass==='compatibility')return {...row,verdict:'incompatible',reasons:['绑定的隔离验证确认此范围不兼容：'+record.scope.join('；')],verifiedScope:record.scope,evidenceStatus:record.status};
 if(record.status==='pass'&&allowPositive)return {...row,verdict:'compatible',reasons:['已通过与本候选绑定的隔离验证，仅适用于所列范围'],verifiedScope:record.scope,evidenceStatus:record.status,verifiedEnvironment:document.environment};
 return {...row,verdict:'unknown',reasons:[...row.reasons,'隔离证据状态：'+record.status+'；未据此认定兼容'],evidenceStatus:record.status};
}
