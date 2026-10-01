import {createHash} from 'node:crypto';
import {isAbsolute,resolve} from 'node:path';
import {Scope} from '../scope.js';
import {sameRecoveryRoot} from '../recovery-binding.js';
import {fail} from '../errors.js';

const sha=value=>createHash('sha256').update(value).digest('hex');
const namespace=root=>sha(process.platform==='win32'?resolve(root).toLowerCase():resolve(root));

/** Existing isolated child/JSON maintenance entry points have no live trusted
 * recovery authority. Refuse before owner acquisition or publication. */
export function rejectUnsupportedRecoveryMaintenance(config){
  if(config?.recovery?.enabled===true)fail('RECOVERY_MAINTENANCE_REQUIRED','Use the trusted runtime recovery preflight; this maintenance entry cannot validate recovery authority');
}

/** Read-only scope preflight inside a trusted running host. The caller owns the
 * storage exclusion/access lease. legacyRoots contains only owner-key -> stored
 * root metadata, never memory bodies. This is not a publication permit. */
export async function preflightRecoveryScope({config:input,fs,recoveryHost,legacyRoots={}}={}){
  const {validateSuiteConfig}=await import('../index.js');const config=validateSuiteConfig(input);
  if(config.recovery?.enabled!==true||!recoveryHost||typeof recoveryHost.projectById!=='function'||typeof recoveryHost.projectForPath!=='function')fail('RECOVERY_MAINTENANCE_REQUIRED');
  if(!legacyRoots||typeof legacyRoots!=='object'||Array.isArray(legacyRoots))fail('RECOVERY_MAINTENANCE_NAMESPACE');
  const scope=new Scope(fs,config.projects,{enabled:true,recoveryHost});
  await scope.init();
  const rows=[];
  for(const project of scope.projects){
    await scope.assertProject(project);
    const authority=await recoveryHost.projectById({id:project.recoveryProjectId});
    if(authority.id!==project.recoveryProjectId||authority.memoryKey!==project.key||authority.generation!==project.recoveryGeneration||!sameRecoveryRoot(authority.root,project.root))fail('RECOVERY_MAINTENANCE_CHANGED');
    const historical=legacyRoots[project.key];let historicalRootAccepted=false;
    if(historical!==undefined){
      if(typeof historical!=='string'||!isAbsolute(historical))fail('RECOVERY_MAINTENANCE_NAMESPACE');
      if(!sameRecoveryRoot(historical,project.root)){
        if(!isAbsolute(authority.originRoot??'')||!sameRecoveryRoot(historical,authority.originRoot)||namespace(authority.originRoot)!==project.key)fail('RECOVERY_MAINTENANCE_NAMESPACE');
        historicalRootAccepted=true;
      }
    }
    rows.push({projectId:project.recoveryProjectId,key:project.key,root:project.root,generation:project.recoveryGeneration,identity:structuredClone(authority.identity),historicalRootAccepted});
  }
  if(Object.keys(legacyRoots).some(key=>!rows.some(p=>p.key===key)))fail('RECOVERY_MAINTENANCE_NAMESPACE');
  const configHash=sha(JSON.stringify(config));
  const proof={version:1,status:'pass',mode:'read-only-runtime-scope',publicationPermitted:false,configHash,projects:rows};
  const selected=JSON.stringify(rows.map(({historicalRootAccepted,...p})=>p));
  return {scope,proof,async recheck(){
    try{
      if(sha(JSON.stringify(validateSuiteConfig(input)))!==configHash)fail('RECOVERY_MAINTENANCE_CHANGED');
      const current=[];
      for(const project of scope.projects){
        await scope.assertProject(project);const a=await recoveryHost.projectById({id:project.recoveryProjectId});
        current.push({projectId:a.id,key:a.memoryKey,root:a.root,generation:a.generation,identity:structuredClone(a.identity)});
      }
      if(JSON.stringify(current)!==selected)fail('RECOVERY_MAINTENANCE_CHANGED');
      return {status:'pass',publicationPermitted:false};
    }catch{fail('RECOVERY_MAINTENANCE_CHANGED');}
  }};
}
