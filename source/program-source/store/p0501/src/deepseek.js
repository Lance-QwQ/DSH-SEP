import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {dirname,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {z} from 'zod';
import {SuiteError,fail,checkAbort,digest} from './errors.js';
import {acquireBudgetLock} from './budget-lock.js';

// Reviewed 2026-09-10: official Flash peak rates are CNY 2/8 per million.
// Retain the existing 3/9 ceiling for current and retired Flash names. These
// are conservative budget ceilings, not invoice prices. Pro remains 9/27.
export const RATES={ 'deepseek-flash':{input:3,output:9}, 'deepseek-v4-flash':{input:3,output:9}, 'deepseek-v4-pro':{input:9,output:27}, 'deepseek-v4-flash-vision-exp':{input:3,output:9} };
export const TEXT_MODELS=Object.freeze(['deepseek-flash','deepseek-v4-flash','deepseek-v4-pro']);
export const VISION_MODELS=Object.freeze(['deepseek-flash','deepseek-v4-flash-vision-exp']);
// Officially documented, one-way response aliases only. A planned future
// Pro routing change does not authorize a Pro substitution in this release.
const responseAliases=new Map([['deepseek-v4-flash','deepseek-flash'],['deepseek-v4-flash-vision-exp','deepseek-flash']]);
const acceptedResponseModel=(requested,returned)=>typeof returned==='string'&&(returned===requested||responseAliases.get(requested)===returned);
function pricing(model,rate){return {model:responseAliases.get(model)??model,currency:'CNY',basis:'conservative-peak-ceiling',inputCnyPerMillion:rate.input,outputCnyPerMillion:rate.output,verifiedAt:'2026-09-10',source:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'};}
const money=v=>Math.ceil(v*1000000-1e-9)/1000000;
export async function replaceLedgerFile(from,to,replace=rename){
  for(let attempt=0;;attempt++){
    try{return await replace(from,to);}catch(error){
      if(attempt>=3||!['EPERM','EBUSY'].includes(error.code))throw error;
      await pause(25*(attempt+1));
    }
  }
}
const entrySchema=z.object({id:z.string(),reservedCny:z.number().nonnegative(),status:z.enum(['reserved','settled']),createdAt:z.string(),chargeCeilingCny:z.number().nonnegative().optional(),finishedAt:z.string().optional(),model:z.string().optional(),inputSha256:z.string().optional(),usage:z.object({prompt_tokens:z.number().int().nonnegative(),completion_tokens:z.number().int().nonnegative()}).optional()}).strict();
const ledgerSchema=z.object({version:z.literal(1),currency:z.literal('CNY'),limit:z.number().positive().max(100),initialSpent:z.number().nonnegative(),entries:z.array(entrySchema)}).strict();
export class Budget {
  constructor(path,{limit,initialSpent=0}) {if(!isAbsolute(path)||!(limit>0&&limit<=100)||initialSpent<0)fail('BUDGET_CONFIG');this.path=path;this.limit=limit;this.initialSpent=initialSpent;}
  async change(fn) {
    await mkdir(dirname(this.path),{recursive:true});const lock=await acquireBudgetLock(this.path);
    const temp=`${this.path}.${randomUUID()}.tmp`;
    try{
      await lock.assertOwned();
      let state;
      try{state=ledgerSchema.parse(JSON.parse(await readFile(this.path,'utf8')));}catch(e){if(e.code!=='ENOENT')fail('BUDGET_CORRUPT');state={version:1,currency:'CNY',limit:this.limit,initialSpent:this.initialSpent,entries:[]};}
      state.limit=Math.min(state.limit,this.limit);state.initialSpent=Math.max(state.initialSpent,this.initialSpent);
      const result=await fn(state);ledgerSchema.parse(state);await lock.assertOwned();
      const file=await open(temp,'wx');try{await file.writeFile(JSON.stringify(state,null,2)+'\n');await file.sync();}finally{await file.close();}
      await lock.assertOwned();await replaceLedgerFile(temp,this.path);return structuredClone(result);
    } finally {try{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}finally{await lock.release();}}
  }
  async init(){await this.change(()=>null);}
  async snapshot(){return this.change(state=>({...state,accountedCny:money(state.initialSpent+state.entries.reduce((n,e)=>n+(e.status==='settled'?e.chargeCeilingCny:e.reservedCny),0))}));}
  async reserve(id,amount,meta={}){return this.change(state=>{
    if(!(amount>0&&Number.isFinite(amount)))fail('BUDGET_ESTIMATE');
    if(state.entries.some(e=>e.id===id))fail('DUPLICATE_REQUEST');
    const accounted=money(state.initialSpent+state.entries.reduce((n,e)=>n+(e.status==='settled'?e.chargeCeilingCny:e.reservedCny),0));
    if(money(accounted+amount)>state.limit)fail('BUDGET_EXCEEDED');
    const entry={id,reservedCny:money(amount),status:'reserved',createdAt:new Date().toISOString(),...meta};state.entries.push(entry);return entry;
  });}
  async settle(id,amount,usage){return this.change(state=>{
    const entry=state.entries.find(e=>e.id===id);if(!entry||entry.status!=='reserved')fail('UNKNOWN_RESERVATION');
    if(amount>entry.reservedCny)fail('BUDGET_ESTIMATE_EXCEEDED');
    Object.assign(entry,{status:'settled',chargeCeilingCny:money(amount),usage,finishedAt:new Date().toISOString()});return entry;
  });}
}

export async function callDeepSeek(request,{budget,resolveKey,signal,transport=fetch}) {
  checkAbort(signal);
  if(!Object.hasOwn(RATES,request.model))fail('MODEL_NOT_ALLOWED');const rate=RATES[request.model];
  if(!Number.isInteger(request.max_tokens)||request.max_tokens<1||request.max_tokens>2048)fail('OUTPUT_TOO_LARGE');
  const payload={...request,stream:false,thinking:{type:'disabled'}};
  let images=0;
  const textJSON=JSON.stringify(payload,(_key,value)=>{
    if(value&&typeof value==='object'&&value.type==='image_url'){
      const url=value.image_url?.url;
      if(typeof url!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(url)||url.length>6*1024*1024)fail('IMAGE_INPUT');
      images++;return {type:'image_url',image_url:'inline-image'};
    }return value;
  });
  const textBytes=Buffer.byteLength(textJSON);
  if(textBytes>100000||images>1)fail('INPUT_TOO_LARGE');
  if(images&&!VISION_MODELS.includes(request.model))fail('MODEL_NOT_VISION');
  const credential=await resolveKey();if(!credential?.value)fail('CREDENTIAL_UNCONFIGURED');
  checkAbort(signal);
  // Current Flash vision caps each image at 1024 tokens (official vision
  // guide, 2026-09-10). Preserve the separate text/framing safety allowance.
  const maxInput=textBytes+8192+images*1024;
  const reserved=money((maxInput*rate.input+request.max_tokens*rate.output)/1000000);
  const id=randomUUID();const body=JSON.stringify(payload);
  await budget.reserve(id,reserved,{model:request.model,inputSha256:digest(body)});
  let response;
  try{response=await transport('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${credential.value}`},body,signal:AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(45000)])});}
  catch{if(signal?.aborted)fail('ABORTED');fail('PROVIDER_FAILED','Unknown request outcome; reservation retained, no automatic retry');}
  if(!response.ok){
    // Do not parse provider error bodies: they may echo private input or credentials.
    // The generic code remains compatible with existing callers; memory can display
    // a bounded classification derived solely from the HTTP status.
    const status=Number.isInteger(response.status)&&response.status>=300&&response.status<=599?response.status:null;
    const error=new SuiteError('PROVIDER_HTTP',status===null?'HTTP failure; reservation retained':`HTTP ${status}; reservation retained`);
    error.httpStatus=status;
    try{await response.body?.cancel();}catch{/* Cleanup cannot replace the original provider failure. */}
    throw error;
  }
  let parsed;
  try{
    const reader=response.body.getReader();let count=0;const chunks=[];
    try{while(true){const {value,done}=await reader.read();if(done)break;count+=value.length;if(count>256000){await reader.cancel();fail('INVALID_PROVIDER_RESPONSE');}chunks.push(value);}}
    finally{reader.releaseLock();}
    parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{fail('INVALID_PROVIDER_RESPONSE');}
  const text=parsed.choices?.[0]?.message?.content;
  const usage=parsed.usage;
  if(typeof text!=='string'||!text.trim()||!acceptedResponseModel(request.model,parsed.model)||!Number.isInteger(usage?.prompt_tokens)||usage.prompt_tokens<0||usage.prompt_tokens>maxInput||!Number.isInteger(usage?.completion_tokens)||usage.completion_tokens<0||usage.completion_tokens>request.max_tokens)fail('INVALID_PROVIDER_RESPONSE');
  const cost=money((usage.prompt_tokens*rate.input+usage.completion_tokens*rate.output)/1000000);
  await budget.settle(id,cost,{prompt_tokens:usage.prompt_tokens,completion_tokens:usage.completion_tokens});
  return {text,model:parsed.model,requestedModel:request.model,pricing:pricing(request.model,rate),requestId:id,usage:{prompt_tokens:usage.prompt_tokens,completion_tokens:usage.completion_tokens},chargeCeilingCny:cost,truncated:parsed.choices[0].finish_reason==='length'};
}
