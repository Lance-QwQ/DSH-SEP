import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {prepareFirstInstall,executeFirstInstall,recoverFirstInstall} from '../installation/first-install.mjs';
import {platform,helperIdentity,verifyCandidate,error,fail,sha,exact,digest} from './candidate.mjs';
import {inspectAccount,openJournal,bounded} from './native-client.mjs';
import {createAdmission} from './boundaries.mjs';

const clone=v=>JSON.parse(JSON.stringify(v)),id=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const sealed=v=>{const p={...v};delete p.planHash;return sha(JSON.stringify(p));};
const phases=['confirmed','planned','executing','committed','blocked'];
const unknown=e=>/CLEANUP_UNCONFIRMED$/.test(e?.code??'');
function request(v,key){if(!exact(v,[key])||(key==='planHash'?!digest(v[key]):!id(v[key])))fail('SEP_INSTALLER_ARGUMENT');}
function fixed(snapshot){
 const h=snapshot?.account?.home;
 if(!h||snapshot.account.uid!==process.getuid()||!/^\d+:\d+$/.test(snapshot.account.identity)||snapshot.parent?.path!==join(h,'Applications')||snapshot.target!==join(h,'Applications','DSH SEP.app')||snapshot.dataRoot!==join(h,'Library','Application Support','DSH SEP','alpha2-mac-finder-preview')||snapshot.governanceRoot!==join(h,'Library','Application Support','DSH SEP Installer'))fail('SEP_INSTALLER_ACCOUNT');
 return snapshot;
}
function parse(text){try{return JSON.parse(text);}catch{fail('SEP_INSTALLER_JOURNAL');}}
function separate(source,parent){if(parent===source||parent.startsWith(source+'/'))fail('SEP_INSTALLER_PATH');}
function assertUpper(plan,config,snapshot){
 if(!exact(plan,['schema','kind','transactionId','sourceApp','sourceIdentity','candidate','account','nativeSnapshot','target','dataRoot','governanceRoot','actions','helpers','planHash'])||plan.schema!==1||plan.kind!=='installer-first-install'||!id(plan.transactionId)||!digest(plan.planHash)||sealed(plan)!==plan.planHash)fail('SEP_INSTALLER_JOURNAL');
 if(JSON.stringify(plan.account)!==JSON.stringify(snapshot.account)||plan.sourceApp!==config.sourceApp||plan.target!==snapshot.target||plan.dataRoot!==snapshot.dataRoot||plan.governanceRoot!==snapshot.governanceRoot||plan.candidate.inventorySha256!==sha(JSON.stringify(config.receipt.inventory))||plan.candidate.programSha256!==config.receipt.programSha256||plan.candidate.bootstrapSha256!==config.receipt.bootstrapSha256||plan.helpers.core!==config.coreHelper.sha256||plan.helpers.entry!==config.entryHelper.sha256)fail('SEP_INSTALLER_JOURNAL');
 separate(plan.sourceApp,snapshot.parent.path);fixed(plan.nativeSnapshot);
}
export async function createController(input,testMode=false){
 const allowed=['sourceApp','receipt','coreHelper','entryHelper','onProgress',...(testMode?['testHome']:[])];
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!allowed.includes(k))||['sourceApp','receipt','coreHelper','entryHelper'].some(k=>input[k]===undefined)||(testMode&&typeof input.testHome!=='string')||(input.onProgress!==undefined&&typeof input.onProgress!=='function'))fail('SEP_INSTALLER_ARGUMENT');
 await platform();const config=clone({sourceApp:input.sourceApp,receipt:input.receipt,coreHelper:input.coreHelper,entryHelper:input.entryHelper,...(testMode?{testHome:input.testHome}:{})});
 await helperIdentity(config.coreHelper);await helperIdentity(config.entryHelper);
 let finished=false,preview,cancelled;const admission=createAdmission(),retained=new Set();let resolveClosed;const closed=new Promise(r=>{resolveClosed=r;});
 const receipt=()=>({status:'pass',resourcesReleased:true});
 function uncertain(){admission.quarantine();}
 const admitted=work=>admission.run(work);
 async function snapshot(){try{return fixed(await inspectAccount(config.entryHelper,config.testHome));}catch(e){if(unknown(e))uncertain();throw e;}}
 async function notify(phase,transactionId){if(input.onProgress)await input.onProgress(Object.freeze({phase,transactionId}));}
 async function withJournal(transactionId,create,work){
  let journal;try{journal=await openJournal(config.entryHelper,config.testHome,transactionId,create);}catch(e){if(unknown(e))uncertain();throw e;}
  let result,primary;try{result=await work(journal);}catch(e){primary=e;}
  // A lower helper timeout is not proof it stopped. Retain the upper lease.
  if(unknown(primary)){uncertain();retained.add(journal);throw primary;}
  try{await journal.close();}catch(e){uncertain();retained.add(journal);throw e;}
  if(primary)throw primary;return result;
 }
 async function readBoundUnsafe(journal,transactionId,s){
  const confirmationText=await journal.read('confirmation');if(confirmationText===null)fail('SEP_INSTALLER_JOURNAL');
  const c=parse(confirmationText);if(!exact(c,['schema','approved','planHash','plan'])||c.schema!==1||c.approved!==true||c.planHash!==c.plan?.planHash||c.plan?.transactionId!==transactionId)fail('SEP_INSTALLER_JOURNAL');assertUpper(c.plan,config,s);
  const coreText=await journal.read('core-plan');if(coreText===null)fail('SEP_INSTALLER_PLAN_INCOMPLETE');
  const core=parse(coreText),confirmationSha256=sha(confirmationText);if(!exact(core,['schema','confirmationSha256','plan'])||core.schema!==1||core.confirmationSha256!==confirmationSha256)fail('SEP_INSTALLER_JOURNAL');
  const cp=core.plan;if(cp?.sourceApp!==c.plan.sourceApp||cp?.sourceIdentity!==c.plan.sourceIdentity||cp?.parent!==s.parent.path||cp?.dataRoot!==s.dataRoot||cp?.helperSha256!==config.coreHelper.sha256||sha(JSON.stringify(cp?.receipt))!==sha(JSON.stringify(config.receipt))||cp?.planHash!==sealed(cp))fail('SEP_INSTALLER_JOURNAL');
  const stateText=await journal.read('state');if(stateText===null)fail('SEP_INSTALLER_JOURNAL');const state=parse(stateText);
  if(!exact(state,['schema','transactionId','confirmationSha256','corePlanSha256','phase'])||state.schema!==1||state.transactionId!==transactionId||state.confirmationSha256!==confirmationSha256||state.corePlanSha256!==sha(coreText)||!phases.includes(state.phase))fail('SEP_INSTALLER_JOURNAL');
  return {upper:c.plan,core:cp,state};
 }
 async function readBound(journal,transactionId,s){try{return await readBoundUnsafe(journal,transactionId,s);}catch(e){if(unknown(e)||e.code==='SEP_INSTALLER_PLAN_INCOMPLETE')throw e;fail('SEP_INSTALLER_JOURNAL');}}
 async function execute(journal,upper,core,state,recover){
  const transactionId=upper.transactionId;
  if(!recover){state={...state,phase:'executing'};await journal.write('state',JSON.stringify(state));}
  const options={plan:core,helperPath:config.coreHelper.path,helperSha256:config.coreHelper.sha256,onProgress:event=>notify('core-'+event.phase,transactionId)};
  const r=await(recover?recoverFirstInstall(options):executeFirstInstall(options));
  state={...state,phase:'committed'};await journal.write('state',JSON.stringify(state));await notify('committed',transactionId);
  return {...r,transactionId,planHash:upper.planHash,coreTransactionId:core.transactionId,applicationStarted:false};
 }
 async function doPreview(){
  const s=await snapshot();if(s.dataExists)fail('SEP_INSTALLER_DATA_EXISTS');if(s.targetExists)fail('SEP_INSTALLER_TARGET_EXISTS');separate(config.sourceApp,s.parent.path);
  const sourceIdentity=await verifyCandidate(config.sourceApp,config.receipt);const after=await snapshot();if(JSON.stringify(s)!==JSON.stringify(after))fail('SEP_INSTALLER_PLAN_CHANGED');
  const plan={schema:1,kind:'installer-first-install',transactionId:randomBytes(16).toString('hex'),sourceApp:config.sourceApp,sourceIdentity,candidate:{inventorySha256:sha(JSON.stringify(config.receipt.inventory)),programSha256:config.receipt.programSha256,bootstrapSha256:config.receipt.bootstrapSha256},account:s.account,nativeSnapshot:s,target:s.target,dataRoot:s.dataRoot,governanceRoot:s.governanceRoot,actions:{createApplications:!s.parent.exists,createGovernance:!s.governanceExists},helpers:{core:config.coreHelper.sha256,entry:config.entryHelper.sha256}};
  plan.planHash=sealed(plan);preview=plan;cancelled=undefined;return {status:'pass',phase:'preview',plan:clone(plan),planHash:plan.planHash};
 }
 async function doConfirm(arg){
  request(arg,'planHash');if(cancelled===arg.planHash)fail('SEP_INSTALLER_CANCELLED');if(!preview||preview.planHash!==arg.planHash)fail('SEP_INSTALLER_CONFIRMATION_MISMATCH');const plan=preview;
  try{const s=await snapshot();if(JSON.stringify(s)!==JSON.stringify(plan.nativeSnapshot)||await verifyCandidate(config.sourceApp,config.receipt)!==plan.sourceIdentity)fail('SEP_INSTALLER_PLAN_CHANGED');await helperIdentity(config.coreHelper);}catch(e){if(unknown(e))throw e;fail('SEP_INSTALLER_PLAN_CHANGED');}
  preview=undefined;
  return withJournal(plan.transactionId,plan.nativeSnapshot,async journal=>{
   const confirmationText=JSON.stringify({schema:1,approved:true,planHash:plan.planHash,plan});await journal.write('confirmation',confirmationText);
   await notify('confirmed',plan.transactionId);
   const core=await prepareFirstInstall({sourceApp:config.sourceApp,parent:plan.nativeSnapshot.parent.path,dataRoot:plan.dataRoot,receipt:config.receipt,helperPath:config.coreHelper.path,helperSha256:config.coreHelper.sha256});
   const coreText=JSON.stringify({schema:1,confirmationSha256:sha(confirmationText),plan:core});await journal.write('core-plan',coreText);
   const state={schema:1,transactionId:plan.transactionId,confirmationSha256:sha(confirmationText),corePlanSha256:sha(coreText),phase:'planned'};await journal.write('state',JSON.stringify(state));await notify('planned',plan.transactionId);
   return execute(journal,plan,core,state,false);
  });
 }
 async function doResume(arg){
  request(arg,'transactionId');const s=await snapshot();
  return withJournal(arg.transactionId,undefined,async journal=>{const b=await readBound(journal,arg.transactionId,s);if(b.state.phase==='confirmed'||b.state.phase==='blocked')fail('SEP_INSTALLER_PLAN_INCOMPLETE');return execute(journal,b.upper,b.core,b.state,b.state.phase!=='planned');});
 }
 let cleanup;
 function beginClose(){if(!cleanup)cleanup=admission.closeAdmission().then(()=>{if(admission.isQuarantined()||retained.size)return {status:'blocked',code:'SEP_INSTALLER_CLEANUP_UNCONFIRMED',resourcesReleased:false};finished=true;const r=receipt();resolveClosed(r);return r;});return cleanup;}
 return Object.freeze({preview:()=>admitted(doPreview),listRecovery:()=>admitted(()=>fail('SEP_INSTALLER_RECOVERY_LIST_NOT_IMPLEMENTED')),cancel:arg=>admitted(async()=>{request(arg,'planHash');if(!preview||preview.planHash!==arg.planHash)fail('SEP_INSTALLER_CONFIRMATION_MISMATCH');cancelled=arg.planHash;preview=undefined;return {status:'pass',phase:'cancelled'};}),confirm:arg=>admitted(()=>doConfirm(arg)),resume:arg=>admitted(()=>doResume(arg)),close:async()=>{if(finished)return receipt();try{return await bounded(beginClose(),5000,'SEP_INSTALLER_CLOSE_DEADLINE');}catch{return {status:'blocked',code:'SEP_INSTALLER_CLOSE_DEADLINE',resourcesReleased:false};}},whenClosed:()=>closed});
}
