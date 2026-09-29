/** Offline maintenance entry. Preparing/reviewing never implies consent to apply.
 * The caller supplies an already verified candidate and its empty-profile health
 * receipt, exactly as for a normal offline plan. No downloads or model calls. */
import {readFile,lstat} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {hash} from './update-core.mjs';
import {sign,durableJson} from './update-admission.mjs';
import {fileHash,jsonFile} from './update-inventory.mjs';
const demand=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
async function record(path){const st=await lstat(path);demand(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size<16*1024*1024,'SEP_REPAIR_RECORD');return jsonFile(path);}
export async function readMaintenanceReview(directory){
 demand(isAbsolute(directory??''),'SEP_REPAIR_PATH');
 const plan=await record(join(directory,'plan.json')),opPath=join(directory,'operator.json'),op=await record(opPath);
 const {hash:checksum,...body}=plan;
 demand(plan.schema===1&&plan.kind==='reviewed-profile-graph'&&plan.successor&&hash(body)===checksum&&plan.planPath===join(directory,'plan.json')&&plan.directory===directory,'SEP_REPAIR_PLAN_CHANGED');
 demand(op.kind==='automatic-sep-only-plan'&&op.directory===directory&&op.reportPath===join(directory,'report.json')&&isAbsolute(op.updatesDirectory??'')&&/^[a-f0-9]{64}$/.test(op.graphHashes?.candidate??''),'SEP_REPAIR_OPERATOR');
 demand(Array.isArray(plan.inputs)&&[opPath,op.reportPath].every(p=>plan.inputs.some(b=>b.path===p)),'SEP_REPAIR_INPUT_UNBOUND');
 for(const b of plan.inputs){demand(isAbsolute(b.path??'')&&!b.absent&&/^[a-f0-9]{64}$/.test(b.sha256??''),'SEP_REPAIR_INPUT_UNBOUND');demand(await fileHash(b.path)===b.sha256,'SEP_REPAIR_INPUT_CHANGED');}
 demand(await fileHash(op.reportPath)===op.reportHash,'SEP_REPAIR_INPUT_CHANGED');const report=await record(op.reportPath);
 demand(Array.isArray(report.hardBlocks)&&report.hardBlocks.length===0,'SEP_REPAIR_HARD_BLOCK');
 return {plan,op,report,expected:{planHash:plan.hash,reportHash:op.reportHash,graphHash:op.graphHashes.candidate}};
}
export async function confirmMaintenancePlan(directory,planHash){
 const review=await readMaintenanceReview(directory);demand(planHash===review.expected.planHash,'SEP_PLAN_CONSENT');
 const key=await readFile(join(review.op.updatesDirectory,'control-key'));demand(key.length===32,'UPDATE_ADMISSION_KEY');
 const consent={accepted:true,...review.expected};await durableJson(directory,'consent.json',sign(consent,key));return consent;
}
export async function prepareMaintenancePlan(requestPath){
 demand(isAbsolute(requestPath??''),'SEP_REPAIR_PATH');const request=await record(requestPath);
 demand(request.schema===1&&request.kind==='sep-maintenance-preparation'&&isAbsolute(request.parentPlanPath??'')&&request.options&&Object.keys(request).every(k=>['schema','kind','parentPlanPath','options'].includes(k)),'SEP_REPAIR_REQUEST');
 demand(!request.options.successorOf,'SEP_REPAIR_REQUEST');const successorOf=await record(request.parentPlanPath);
 const {prepareOfflinePlan}=await import('./prepare-offline.mjs');
 const r=await prepareOfflinePlan({...request.options,successorOf});
 return {status:'prepared',planDirectory:r.op.directory,reportPath:r.op.reportPath,expected:r.expected,consentRequired:true};
}
export async function runMaintenanceCommand(args){
 const [mode,path,planHash,...extra]=args;demand(extra.length===0,'SEP_REPAIR_ARGUMENTS');
 if(mode==='prepare'){demand(!planHash,'SEP_REPAIR_ARGUMENTS');return prepareMaintenancePlan(path);}
 if(mode==='review'){demand(!planHash,'SEP_REPAIR_ARGUMENTS');const r=await readMaintenanceReview(path);return {status:'awaiting-review',...r.expected,reportPath:r.op.reportPath,parent:r.plan.successor,report:r.report};}
 if(mode==='confirm'){demand(/^[a-f0-9]{64}$/.test(planHash??''),'SEP_PLAN_CONSENT');return confirmMaintenancePlan(path,planHash);}
 demand(['apply','recover'].includes(mode)&&!planHash,'SEP_REPAIR_ARGUMENTS');await readMaintenanceReview(path);
 const {executePreparedPlan}=await import('./prepare-offline.mjs');const result=await executePreparedPlan(mode,join(path,'operator.json'));
 return {...result,runtimeReadiness:'not_run',instruction:'Program publication alone does not establish runtime readiness. Use the normal launcher and verify its result; retain maintenance diagnostics on failure.'};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))runMaintenanceCommand(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.code??e.message)?e.code??e.message:'SEP_REPAIR_FAILED');process.exitCode=1;});
