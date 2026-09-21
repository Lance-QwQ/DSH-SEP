import {realpath} from 'node:fs/promises';import {isAbsolute,relative,resolve} from 'node:path';import {createHash} from 'node:crypto';
export const name='dsh-sep-evaluation-tools';export const inject=['tools','agents'];
const fail=code=>{throw Error(code);};
const fields=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>keys.includes(k));
const identifier=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
const inside=(a,b)=>{const p=relative(a,b);return p===''||p!=='..'&&!p.startsWith('..\\')&&!p.startsWith('../')&&!isAbsolute(p);};
const canonical=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(canonical):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]))):x;
const hash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
async function request(p,route,body,signal){
 const limit=new AbortController(),combined=AbortSignal.any([signal,limit.signal]),timer=setTimeout(()=>limit.abort(),20000);let response;
 try{
  response=await fetch(p.endpoint+route,{method:body?'POST':'GET',headers:{'X-API-Key':p.token,...p.generationId?{'X-SEP-Generation':p.generationId}:{},...body?{'Content-Type':'application/json'}:{}},body:body?JSON.stringify(body):undefined,redirect:'error',signal:combined});
  const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>65536){limit.abort();fail('RESPONSE_LIMIT');}chunks.push(Buffer.from(chunk));}
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(response.status!==200)fail('BACKEND_'+(/^[A-Z_]+$/.test(value.error??'')?value.error:'REJECTED'));
  combined.throwIfAborted();return value;
 }finally{clearTimeout(timer);}
}
function validate(r,p,op,job){
 if(!r||r.projectId!==p.projectId||r.catalogSha256!==p.catalogSha256||r.jobId!==job||!p.assessments.includes(r.assessmentId)||!['prepared','creating','running','retiring','terminal'].includes(r.phase)||!/^sha256:[a-f0-9]{64}$/.test(r.image??''))fail('RESPONSE_BINDING');
 if(p.evaluator==='swebench-official-v1'){
  const a=p.artifacts.find(a=>a.artifactId===r.artifactId);
  if(!a||a.patchSha256!==r.patchSha256||a.instanceId!==r.instanceId||a.baseCommit!==r.baseCommit)fail('RESPONSE_ARTIFACT');
  if(op==='result'){
   if(r.evaluator!==p.evaluator)fail('RESPONSE_SCOPE');
   if(r.phase==='terminal'){
    const completed=r.outcome==='completed';
    if(completed?(typeof r.resolved!=='boolean'||r.exitCode!==0||!/^[a-f0-9]{64}$/.test(r.officialReportSha256??'')):(r.resolved!==null||r.officialReportSha256!==null))fail('RESPONSE_OFFICIAL_PROOF');
    const expected=completed?(r.resolved?'pass':'fail'):'blocked';
    if(r.status!==expected||r.scope!=='bound_public_artifact_official_grading')fail('RESPONSE_OUTCOME');
    const {receiptSha256,...payload}=r;if(receiptSha256!==hash(payload))fail('RECEIPT_HASH');
   }else if(r.status!=='not_run'||r.resolved!==null||Object.hasOwn(r,'receiptSha256'))fail('RESPONSE_PENDING');
  }
 }else if(op==='result'){
  if(r.resolved!==null||r.evaluator!=='fixed-command-v1')fail('RESPONSE_SCOPE');
  if(r.phase==='terminal'){
   if(r.outcome==='completed'&&!Number.isInteger(r.exitCode))fail('RESPONSE_EXIT');
   const expected=r.outcome==='completed'?(r.exitCode===0?'pass':'fail'):'blocked';
   if(r.status!==expected||r.scope!=='configured_command_exit_only')fail('RESPONSE_OUTCOME');
   const {receiptSha256,...payload}=r;if(receiptSha256!==hash(payload))fail('RECEIPT_HASH');
  }else if(r.status!=='not_run'||Object.hasOwn(r,'receiptSha256'))fail('RESPONSE_PENDING');
 }
 return r;
}
async function refresh(p,signal){
 const h=await request(p,'/health',null,signal);
 if(p.generationId&&(h.generationId!==p.generationId||h.protocol!=='sep-eval-lifecycle-v1'))fail('EVAL_GENERATION');
 if(h.projectId!==p.projectId||h.catalogSha256!==p.catalogSha256||h.evaluator!==p.evaluator||JSON.stringify(h.assessments)!==JSON.stringify(p.assessments)||h.admission!=='exact-edits-v1'||!/^[a-f0-9]{64}$/.test(h.snapshotSha256??'')||p.snapshotSha256&&h.snapshotSha256!==p.snapshotSha256)fail('BACKEND_CATALOG_BINDING');
 if(!Array.isArray(h.artifacts)||h.artifacts.length<1||h.artifacts.length>32||new Set(h.artifacts.map(a=>a?.artifactId)).size!==h.artifacts.length)fail('BACKEND_ARTIFACTS');
 for(const a of h.artifacts)if(!fields(a,['artifactId','patchSha256','instanceId','baseCommit'])||Object.keys(a).length!==4||!identifier(a.artifactId)||!/^[a-f0-9]{64}$/.test(a.patchSha256??'')||!/^[a-f0-9]{40}$/.test(a.baseCommit??'')||typeof a.instanceId!=='string')fail('BACKEND_ARTIFACTS');
 p.artifacts=h.artifacts;p.snapshotSha256=h.snapshotSha256;
}
export async function apply(ctx,config={}){
 if(!fields(config,['enabled','projects'])||typeof config.enabled!=='boolean')fail('EVAL_CONFIG');if(!config.enabled)return;
 if(!Array.isArray(config.projects)||!config.projects.length||config.projects.length>16)fail('EVAL_CONFIG');
 const lifetime=new AbortController(),active=new Set(),projects=[];
 ctx.effect(()=>async()=>{lifetime.abort();await Promise.allSettled([...active]);});
 for(const row of config.projects){
  if(!fields(row,['projectId','root','endpoint','token','catalogSha256','generationId'])||!isAbsolute(row.root??'')||!identifier(row.projectId)||!/^[a-f0-9]{64}$/.test(row.token??'')||!/^[a-f0-9]{64}$/.test(row.catalogSha256??''))fail('EVAL_CONFIG');
  if(row.generationId!==undefined&&!/^[a-f0-9]{32}$/.test(row.generationId))fail('EVAL_GENERATION');
  const url=new URL(row.endpoint);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/')fail('EVAL_ENDPOINT');
  const root=await realpath(row.root);if(resolve(root).toLowerCase()!==resolve(row.root).toLowerCase()||projects.some(p=>p.projectId===row.projectId||inside(p.root,root)||inside(root,p.root)))fail('EVAL_PROJECT_SCOPE');
  const p={...row,root,endpoint:url.origin},health=await request(p,'/health',null,lifetime.signal);
  if(p.generationId&&(health.generationId!==p.generationId||health.protocol!=='sep-eval-lifecycle-v1'))fail('EVAL_GENERATION');
  if(health.projectId!==p.projectId||health.catalogSha256!==p.catalogSha256||!Array.isArray(health.assessments)||!health.assessments.length||health.assessments.length>32||!health.assessments.every(identifier))fail('EVAL_BACKEND_BINDING');
  const evaluator=health.evaluator??'fixed-command-v1';if(!['fixed-command-v1','swebench-official-v1'].includes(evaluator))fail('EVAL_PROTOCOL');
  let artifacts=[];if(evaluator==='swebench-official-v1'){
   if(!Array.isArray(health.artifacts)||!health.artifacts.length||health.artifacts.length>32)fail('EVAL_ARTIFACTS');
   for(const a of health.artifacts){if(!fields(a,['artifactId','patchSha256','instanceId','baseCommit'])||Object.keys(a).length!==4||!identifier(a.artifactId)||!/^[a-f0-9]{64}$/.test(a.patchSha256??'')||!/^[a-f0-9]{40}$/.test(a.baseCommit??'')||typeof a.instanceId!=='string')fail('EVAL_ARTIFACTS');artifacts.push(a);}
  }
  const project={...p,assessments:health.assessments,evaluator,artifacts};if(evaluator==='swebench-official-v1')await refresh(project,lifetime.signal);projects.push(project);
 }
 for(const operation of ['submit','status','cancel','result','artifact_register']){
  const registering=operation==='artifact_register';
  const keys=registering?['snapshotSha256','edits']:operation==='submit'?['jobId','assessmentId','artifactId']:['jobId'],required=operation==='submit'?['jobId','assessmentId']:keys;
  ctx.tools.register({name:'suite_eval_'+operation,description:registering?'Register exact edits against the current project public snapshot. Obtain snapshotSha256 through suite_eval_status {}. Only authorized source files are accepted, at most 16 edits and 48000 serialized bytes. The returned artifactId can be submitted for official grading; registration is not a safety approval or a repair success. Identical edits return the same ID. No automatic retry.':`${operation} a project-bound evaluation job. Call suite_eval_status with {} to discover evaluator, assessment IDs and authorized artifact IDs. Submit uses a stable jobId and assessmentId; official SWE-bench additionally requires an advertised artifactId. No raw patch, path or command is accepted. Query uncertain operations by the same ID, never blindly retry with a new ID. Only swebench-official-v1 completed receipts establish resolved true/false.`,
   parameters:{type:'object',properties:registering?{snapshotSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},edits:{type:'array',minItems:1,maxItems:16,items:{type:'object',properties:{path:{type:'string'},old:{type:'string'},new:{type:'string'}},required:['path','old','new'],additionalProperties:false}}}:Object.fromEntries(keys.map(k=>[k,{type:'string'}])),required:operation==='status'?[]:required,additionalProperties:false},output:{schema:{type:'object'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},timeoutMs:25000,
   async execute(args,exec){
    if(active.size>=4)fail('EVAL_TRANSPORT_BUSY');
    const run=async()=>{
     const signal=AbortSignal.any([lifetime.signal,...exec.signal?[exec.signal]:[]]);signal.throwIfAborted();
     if(!fields(args,keys))fail('EVAL_ARGS');
     const catalogRequest=operation==='status'&&Object.keys(args).length===0;
     if(registering&&(!/^[a-f0-9]{64}$/.test(args.snapshotSha256??'')||!Array.isArray(args.edits)||!args.edits.length||args.edits.length>16||!args.edits.every(e=>fields(e,['path','old','new'])&&['path','old','new'].every(k=>typeof e[k]==='string'))||Buffer.byteLength(JSON.stringify({edits:args.edits}))>48000))fail('EVAL_ARGS');
     if(!catalogRequest&&!registering&&(!required.every(k=>identifier(args[k]))||Object.hasOwn(args,'artifactId')&&!identifier(args.artifactId)))fail('EVAL_ARGS');
     const session=exec.agent?.session;if(!session||ctx.agents.get(session.header.id)?.session!==session||session.header.origin==='subagent'||!isAbsolute(session.header.cwd??''))fail('EVAL_PROJECT_SCOPE');
     const cwd=await realpath(session.header.cwd),p=projects.find(p=>inside(p.root,cwd));if(!p||await realpath(p.root)!==p.root)fail('EVAL_PROJECT_SCOPE');
     if(p.evaluator==='swebench-official-v1')await refresh(p,signal);
     if(registering&&p.evaluator!=='swebench-official-v1')fail('EVAL_REGISTRATION_UNSUPPORTED');
     if(catalogRequest){signal.throwIfAborted();return {projectId:p.projectId,catalogSha256:p.catalogSha256,assessments:p.assessments,evaluator:p.evaluator,artifacts:p.artifacts,...p.evaluator==='swebench-official-v1'?{snapshotSha256:p.snapshotSha256,admission:'exact-edits-v1'}:{},status:'pass',scope:'catalogue_only'};}
     if(operation==='submit'&&!p.assessments.includes(args.assessmentId))fail('EVAL_ASSESSMENT');
     if(operation==='submit'&&(p.evaluator==='swebench-official-v1'?!p.artifacts.some(a=>a.artifactId===args.artifactId):Object.hasOwn(args,'artifactId')))fail('EVAL_ARTIFACT');
     signal.throwIfAborted();
     try{
      let result;
      if(registering){
       result=await request(p,'/register',{snapshotSha256:args.snapshotSha256,answer:{edits:args.edits}},signal);
       await refresh(p,signal);const a=p.artifacts.find(a=>a.artifactId===result.artifactId);
       if(!a||result.projectId!==p.projectId||result.catalogSha256!==p.catalogSha256||result.snapshotSha256!==p.snapshotSha256||result.artifactId!==result.patchSha256||result.patchSha256!==a.patchSha256||result.instanceId!==a.instanceId||result.baseCommit!==a.baseCommit||result.status!=='pass'||result.scope!=='public_patch_registered_not_graded')fail('RESPONSE_ADMISSION');
      }else result=validate(await request(p,'/'+operation,args,signal),p,operation,args.jobId);
      signal.throwIfAborted();
      if(ctx.agents.get(session.header.id)?.session!==session||!inside(p.root,await realpath(session.header.cwd))||await realpath(p.root)!==p.root)fail('EVAL_SCOPE_CHANGED');
      return result;
     }catch(error){
      // Cancellation/timeout/invalid responses cannot prove whether an operation ran.
      // Never retry automatically, never expose token or raw remote diagnostic text.
      const code=/^BACKEND_[A-Z_]+$/.test(error.message??'')?error.message:'UNCERTAIN';
      if(code==='BACKEND_JOB_NOT_FOUND')fail(`EVAL_JOB_NOT_FOUND jobId=${args.jobId}; No retained task record. Check project, jobId and task history. Absence does not prove an earlier external operation never ran. Do not automatically resubmit.`);
      if(code==='BACKEND_STATE_CORRUPT')fail(`EVAL_STATE_CORRUPT jobId=${args.jobId}; State is invalid or unreadable. Stop automated actions and inspect the controller state; do not retry blindly.`);
      if(registering)fail(`EVAL_${code}; registration outcome uncertain, query suite_eval_status before resubmission`);
      fail(`EVAL_${code} jobId=${args.jobId}; query suite_eval_status/result with this same jobId`);
     }
    };
    const work=Promise.resolve().then(run);active.add(work);try{return await work;}finally{active.delete(work);}
   }
  });
 }
}
