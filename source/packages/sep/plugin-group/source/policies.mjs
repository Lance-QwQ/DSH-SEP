import {createHash} from 'node:crypto';
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const identity=value=>typeof value==='string'&&value.length>0&&value.length<=256;
export function selectProjectMessages(projectId,records){
 if(!identity(projectId))fail('GROUP_PROJECT_SCOPE');if(!Array.isArray(records)||records.length>1000)fail('GROUP_INPUT_LIMIT');let bytes=0;const ids=new Set(),out=[];
 for(const row of records){if(row?.projectId!==projectId||row.role!=='user'||row.source?.kind!=='user'||row.revoked||row.layer==='L4')continue;
  if(!identity(row.id)||ids.has(row.id))fail('GROUP_MESSAGE_IDENTITY');ids.add(row.id);
  const text=row.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n');if(typeof text!=='string')fail('GROUP_MESSAGE_INVALID');bytes+=Buffer.byteLength(text);if(bytes>65536)fail('GROUP_INPUT_LIMIT');
  if(/不要记住|不要保存|别记住|don['’]t (?:remember|store)|do not (?:remember|store)|api[ _-]?key|password|secret[ _-]?key|access[ _-]?token|密码|密钥|sk-[a-z0-9_-]{16,}/i.test(text))continue;
  out.push({id:row.id,projectId,text,createdAt:row.createdAt??null});
 }return out;
}
export function configurationHash(binding){const fields=['projectId','model','reasoning','runtimeHash','toolsHash','tasksHash','promptHash'];if(!fields.every(k=>identity(binding?.[k])))fail('GROUP_ASSESSMENT_BINDING');return digest(Object.fromEntries(fields.map(k=>[k,binding[k]])));}
export function assessment(binding,runs,now=Date.now()){
 const bindingHash=configurationHash(binding);if(!Array.isArray(runs)||runs.length>3||new Set(runs.map(r=>r.round)).size!==runs.length||runs.some(r=>![1,2,3].includes(r.round)||!['pass','fail','blocked','not_run'].includes(r.status)||r.status==='pass'&&(!Number.isFinite(r.score)||r.score<0||r.score>1)))fail('GROUP_ASSESSMENT_SAMPLES');
 const samples=runs.map(r=>({...r,score:r.status==='pass'?r.score:0})),scores=samples.map(r=>r.score).sort((a,b)=>a-b),complete=samples.length===3&&!samples.some(r=>['blocked','not_run'].includes(r.status));
 const mean=samples.length?samples.reduce((s,r)=>s+r.score,0)/samples.length:null;
 return {schema:1,kind:'sep-local-pinchbench-adaptation',bindingHash,createdAt:now,expiresAt:now+86400000,status:!complete?'blocked':samples.every(r=>r.status==='pass'&&r.score>=0.8)?'pass':'fail',samples,mean,median:scores.length===3?scores[1]:null,upload:false};
}
/** Receipt authenticity is established by the trusted host registry, not model arguments. */
export function admit(binding,receipt,now=Date.now()){const valid=receipt?.kind==='sep-local-pinchbench-adaptation'&&receipt.status==='pass'&&receipt.bindingHash===configurationHash(binding)&&receipt.createdAt<=now&&receipt.expiresAt>now&&receipt.samples?.length===3&&receipt.samples.every(r=>r.status==='pass'&&r.score>=0.8);return {allowed:!!valid,status:valid?'pass':'blocked',reason:valid?'matching-pre-work-assessment':'assessment-required'};}
export function runtimeRequirements({platform,linux,docker}){const usable=platform==='linux'||linux===true;return {status:usable&&docker?'pass':'blocked',sweRex:usable?'available-prerequisite':'blocked',sweBench:usable&&docker?'available-prerequisite':'blocked',missing:[...(!usable?['linux-runtime']:[]),...(!docker?['docker-runtime']:[])],executed:false};}
export function predictions(rows,model){if(!identity(model)||!Array.isArray(rows)||rows.length>500)fail('GROUP_PREDICTION_LIMIT');const seen=new Set();return rows.map(r=>{if(!identity(r.instance_id)||typeof r.model_patch!=='string'||Buffer.byteLength(r.model_patch)>1048576)fail('GROUP_PREDICTION_INVALID');if(seen.has(r.instance_id))fail('GROUP_PREDICTION_DUPLICATE');seen.add(r.instance_id);return {instance_id:r.instance_id,model_patch:r.model_patch,model_name_or_path:model};});}
