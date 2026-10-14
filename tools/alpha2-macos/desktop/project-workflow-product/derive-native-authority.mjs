// Exact test-only successor to the frozen 11-file probe. Product bytes unchanged.
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const pins={data:'29fd8c149d259d1fdd3a2b10a4bb5291b5d7cbd98a08cbb607069de5a716d2de',worker:'3bbbaf4adf5100d6d60c2a0437907e7f6f704c9d87e3b23b4d890159d62a611c',operator:'90c25e2b8d50d2d8c9bdc53fac72cf79686be5a38989907e53880e8096e01524'};
const fail=()=>{throw Object.assign(Error('SEP_PROJECT_NATIVE_AUTHORITY_ORIGIN'),{code:'SEP_PROJECT_NATIVE_AUTHORITY_ORIGIN'});};
export function deriveNativeAuthority(source){
 const outputs={},origin={};
 for(const name of Object.keys(pins)){
  if(typeof source[name]!=='string'||sha(source[name])!==pins[name])fail();let text=source[name];const changes=[];
  const once=(before,after)=>{if(text.split(before).length!==2)fail();text=text.replace(before,after);changes.push({before,after});};
  if(name==='data'){
   once("import {fixtureResourcesUnknown} from './native-contract.mjs';","import {fixtureResourcesUnknown} from './native-contract.mjs';\nimport {loadFixtureAuthority} from './native-p2-authority.mjs';");
   once('async function withExisting(input,config,work){','export async function withExisting(input,config,work){');
   once(' let project,profile,body,error,receipt;',' let project,profile,control,body,error,receipt;');
   once("  project=wrapManagedProject(await openWorkflowProject(","  const authority=await loadFixtureAuthority(config);control=await authority.openControl({storageRoot:join(config.businessRoot,'memory'),initialize:false,recoverDocumentDeletion:true});await control.recoverDocumentDeletions();\n  project=wrapManagedProject(await openWorkflowProject(");
   once('  const exec={signal:new AbortController().signal};','  await project.bindDocumentAuthority(authority.macDocumentAuthority(control,config.source));\n  const exec={signal:new AbortController().signal};');
   once("  if(fixtureResourcesUnknown(error))receipt={status:'blocked',resourcesConfirmedReleased:false,code:error.code};","  if(fixtureResourcesUnknown(error))receipt={status:'blocked',resourcesConfirmedReleased:false,code:error.code};\n  // P2 remains owned until every project operation has really drained.\n  if(receipt.status==='pass'&&receipt.resourcesConfirmedReleased===true)try{await control?.close();}catch{receipt={status:'blocked',resourcesConfirmedReleased:false,code:'SEP_PROJECT_NATIVE_P2_CLOSE_BLOCKED'};}\n  receipt={...receipt,p2ConfirmedReleased:!control||receipt.status==='pass'&&receipt.resourcesConfirmedReleased===true};");
  }else if(name==='worker'){
   once("from './native-data.mjs'","from './native-data-r2.mjs'");
   once("result.status='pass';result.stage='complete';","result.status='pass';result.stage='desktop-closed';");
   once("try{result.finalState=await finishProjectRound(input,result.preparation);if(result.finalState.status!=='pass')result.status='fail';}","try{result.stage='final-inspection';result.finalState=await finishProjectRound(input,result.preparation);if(result.finalState.status!=='pass')result.status='fail';else result.stage='complete';}");
  }else{
   once("['native-operator.mjs','native-worker.mjs','native-contract.mjs','NATIVE-ORIGIN.json','native-dom.mjs','native-data.mjs'","['native-operator-r2.mjs','native-worker-r2.mjs','native-contract.mjs','NATIVE-ORIGIN.json','NATIVE-AUTHORITY-ORIGIN.json','derive-native-authority.mjs','native-dom.mjs','native-data-r2.mjs','native-p2-authority.mjs'");
   once("new URL('./native-worker.mjs',import.meta.url)","new URL('./native-worker-r2.mjs',import.meta.url)");
  }
  outputs[name]=text;origin[name]={sourceSha256:pins[name],resultSha256:sha(text),changes};
 }
 return {schema:1,scope:'test-only same real P2 authority restored before project inspection; original product unchanged',outputs,origin};
}
