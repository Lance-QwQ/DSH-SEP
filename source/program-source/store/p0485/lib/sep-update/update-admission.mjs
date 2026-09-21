import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {readFile,open,mkdir,rename} from 'node:fs/promises';
import {join,isAbsolute,resolve} from 'node:path';
import {CRITICAL_SERVICES} from './update-transaction.mjs';
import {jsonFile,fileHash} from './update-inventory.mjs';
export function sign(body,key){return {body,signature:createHmac('sha256',key).update(JSON.stringify(body)).digest('hex')};}
export function verify(signed,key){if(!signed||!/^[a-f0-9]{64}$/.test(signed.signature??''))throw Error('UPDATE_ADMISSION_SIGNATURE');const wanted=sign(signed.body,key).signature;if(!timingSafeEqual(Buffer.from(wanted,'hex'),Buffer.from(signed.signature,'hex')))throw Error('UPDATE_ADMISSION_SIGNATURE');return signed.body;}
export function checkAdmission(a,release,currentBinding){if(a?.schema!==2||a.kind!=='reviewed-local-p2-candidate'||a.targetVersion!==release.version||a.currentBinding!==currentBinding||!['preservation','criticalHealth','checkpoint','writerCoverage'].every(k=>a.proofs?.[k]===true)||!Array.isArray(a.bindings)||a.bindings.length<4)throw Error('UPDATE_ADMISSION_SCOPE');
 for(const f of a.bindings)if(!isAbsolute(f.path??'')||!/^[a-f0-9]{64}$/.test(f.sha256??''))throw Error('UPDATE_ADMISSION_BINDING');
 for(const k of ['publisherPath','operatorPath','planPath','healthEvidencePath','launcherPath'])if(!a.bindings.some(f=>f.path===a[k]))throw Error('UPDATE_ADMISSION_BINDING');
 if(!isAbsolute(a.targetRoot??'')||!/^[a-f0-9]{64}$/.test(a.targetBinding??'')||!/^[a-f0-9]{64}$/.test(a.targetGraphHash??'')||!/^[a-f0-9]{64}$/.test(a.planHash??'')||typeof a.planId!=='string')throw Error('UPDATE_ADMISSION_SCOPE');return a;
}
export function checkHealthEvidence(a,h){
 if(h?.schema!==2||h.kind!=='isolated-runtime-health'||h.status!=='pass'||h.targetVersion!==a.targetVersion||h.targetRoot!==a.targetRoot||h.targetBinding!==a.targetBinding||h.targetGraphHash!==a.targetGraphHash||!CRITICAL_SERVICES.every(k=>h.services?.[k]===true)||!Number.isFinite(Date.parse(h.testedAt))||Date.parse(h.testedAt)>Date.now()+30000||!Array.isArray(h.checks)||!CRITICAL_SERVICES.every(k=>h.checks.some(c=>c.name===k&&c.status==='pass'&&typeof c.evidencePath==='string'&&a.bindings.some(b=>b.path===c.evidencePath))))throw Error('UPDATE_HEALTH_EVIDENCE_SCOPE');
 return h;
}
export async function loadAdmission(directory,release,currentBinding){let signed;try{signed=await jsonFile(join(directory,'approved-candidate.json'));}catch(e){if(e.code==='ENOENT')return null;throw e;}const key=await readFile(join(directory,'control-key'));if(key.length!==32)throw Error('UPDATE_ADMISSION_KEY');const a=checkAdmission(verify(signed,key),release,currentBinding);for(const b of a.bindings)if(await fileHash(b.path)!==b.sha256)throw Error('UPDATE_ADMISSION_CHANGED');
 const health=checkHealthEvidence(a,await jsonFile(a.healthEvidencePath));
 for(const name of CRITICAL_SERVICES){const evidence=await jsonFile(health.checks.find(c=>c.name===name).evidencePath);if(evidence.schema!==1||evidence.status!=='pass'||evidence.targetGraphHash!==a.targetGraphHash||evidence.targetVersion!==a.targetVersion||evidence.targetRoot!==a.targetRoot||!evidence.checks?.some(c=>c.name===name&&c.status==='pass'))throw Error('UPDATE_HEALTH_RECORD_INVALID');}
 const operator=await jsonFile(a.operatorPath),plan=await jsonFile(a.planPath);const deployment=operator.publicFiles?.find(f=>f.path.endsWith('deployment-rc2.json'));if(!deployment||resolve(a.launcherPath)!==resolve(deployment.path,'../launch.mjs'))throw Error('UPDATE_LAUNCHER_BINDING');
 if(typeof operator.directory!=='string'||resolve(join(operator.directory,'plan.json'))!==resolve(a.planPath)||plan.id!==a.planId||plan.hash!==a.planHash||plan.storageRoot!==operator.storageRoot||plan.deployment?.graphHash!==a.targetGraphHash||operator.releaseRoot!==a.targetRoot)throw Error('UPDATE_PLAN_EVIDENCE_SCOPE');
 if(await fileHash(join(a.targetRoot,'graph.json'))!==a.targetGraphHash)throw Error('UPDATE_CANDIDATE_CHANGED');return a;}
export async function durableJson(directory,name,body){await mkdir(directory,{recursive:true});const path=join(directory,name),temporary=path+'.'+randomUUID()+'.tmp';const f=await open(temporary,'wx',0o600);try{await f.writeFile(JSON.stringify(body,null,2)+'\n');await f.sync();}finally{await f.close();}await rename(temporary,path);return path;}

