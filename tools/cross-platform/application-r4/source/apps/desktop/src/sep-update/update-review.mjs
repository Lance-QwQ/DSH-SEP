import semver from 'semver';
import {inventory,makeReport,jsonFile,fileHash} from './update-inventory.mjs';
import {sepPreservationBlocks} from './update-sep.mjs';
import {loadAdmission,readPluginEvidence,readMigrationPolicy} from './update-admission.mjs';
import {hash,decide} from './update-core.mjs';
import {profileContextIdentity} from './update-profile.mjs';
import {verifyPreparedPolicy} from './prepare-preservation.mjs';

/** Shared by desktop review and the post-exit worker. No plugin execution. */
export async function reviewCandidate({directory,projectDir,release,currentVersion,profileContext,signal}){
 const context=profileContextIdentity(profileContext);
 const current=await inventory(projectDir,{signal,profileContext:context});
 let admission=null,candidate=null,pluginEvidence=null,migrationPolicy=null,sepPolicy=null,preservationProof,block;
 try{
  admission=await loadAdmission(directory,release,current.binding);
  if(admission){
   candidate=await inventory(admission.targetRoot,{signal,profileContext:admission.targetProfileContext});
   if(candidate.binding!==admission.targetBinding||candidate.graphHash!==admission.targetGraphHash||candidate.rootVersions['@deepseek-ai/dsh']!==release.version)throw Error('UPDATE_CANDIDATE_CHANGED');
   pluginEvidence=await readPluginEvidence(admission);
   migrationPolicy=await readMigrationPolicy(admission);
   if(release.source==='sep'){
    if(currentVersion!==release.version||candidate.rootVersions['dsh-system-enhancement-package']!==release.sepVersion)throw Error('SEP_UPDATE_VERSION_CHANGED');
    const binding=admission.bindings.find(b=>b.path===admission.sep.policyPath);sepPolicy=await jsonFile(binding.path);
    if(await fileHash(binding.path)!==binding.sha256)throw Error('SEP_UPDATE_POLICY_CHANGED');
    if(sepPolicy.schema===2)preservationProof=await verifyPreparedPolicy({policy:sepPolicy,current,candidate,currentRoot:projectDir,targetRoot:admission.targetRoot,currentContext:context,targetContext:admission.targetProfileContext,release});
    else sepPreservationBlocks(current,candidate,sepPolicy);
   }
  }
 }catch(e){block=e.message;admission=null;candidate=null;pluginEvidence=null;migrationPolicy=null;sepPolicy=null;}
 const report=makeReport(current,candidate,release,currentVersion,(v,r)=>semver.satisfies(v,r,{includePrerelease:true}),{pluginEvidence,migrationPolicy,sepPolicy,preservationProof});
 if(release.source==='sep'){
  report.current='DSH '+currentVersion+' / SEP '+(current.rootVersions['dsh-system-enhancement-package']??'unknown');
  report.target='SEP '+release.sepVersion+' / DSH '+release.version+'（保持）';
  report.scope='SEP 本体及明确列出的宿主适配文件更新；保留 DSH 版本、用户数据及其他插件。'+report.scope;
 }
 if(block){report.hardBlocks.push(block);report.readiness='blocked';}
 if(admission){report.binding=hash({report:report.binding,admission});report.admission=hash(admission);}
 return {report,admission,profileContext:context};
}

export function validateQueuedReview({report,admission},request){
 if(!admission||hash(admission)!==request.admissionHash)throw Error('UPDATE_ADMISSION_CHANGED');
 const decision=decide(report,request.consent);
 if(report.binding!==request.reportBinding||!decision.allowed||decision.decision!==request.decision)throw Error('UPDATE_PLAN_CHANGED_REVIEW_AGAIN');
}
