import {hash} from './update-core.mjs';
/** Public release notes and minimum plugin metadata only; fingerprints bind local configurations without uploading them. */
export function assessmentFromReport(release,report){
 if(typeof release.id!=='string')throw Error('ASSESSMENT_RELEASE_ID_REQUIRED');
 return {release:{id:release.id,version:release.version,notes:release.notes??''},currentBinding:report.currentBinding,reportBinding:report.binding,plugins:report.plugins.filter(p=>p.kind!=='configuration-group').map(p=>({
  name:/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(p.name)?p.name:'unresolved-plugin-'+hash(p.name).slice(0,12),version:p.version??'unknown',fingerprint:p.fingerprint??hash([p.name,p.instanceId]),verdict:p.verdict,
  reasonCodes:[...(report.readiness==='candidate-missing'?['NO_CANDIDATE']:[]),p.verdict==='incompatible'?'STATIC_INCOMPATIBLE':p.verdict==='compatible'?'BOUND_RUNTIME_EVIDENCE':'RUNTIME_UNVERIFIED'],
 }))};
}

/** Optional assessment failure must not suppress official release discovery or its existing review dialog. */
export async function notifyAssessment(release,report,onAssessment){
 try{await onAssessment(assessmentFromReport(release,report));return {status:'pass'};}
 catch{return {status:'blocked',reason:'ASSESSMENT_UNAVAILABLE'};}
}
