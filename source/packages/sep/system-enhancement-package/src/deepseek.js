import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {dirname,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {z} from 'zod';
import {SuiteError,fail,checkAbort,digest} from './errors.js';
import {getPricing,quoteUsage} from './budget-pricing.js';

// Peak CNY guards and cache-aware estimates share the reviewed price snapshot.
export const RATES=Object.fromEntries(['deepseek-flash','deepseek-v4-flash','deepseek-v4-pro','deepseek-v4-flash-vision-exp'].map(model=>[model,getPricing(model,{purpose:'reservation'}).rates]));
export const TEXT_MODELS=Object.freeze(['deepseek-flash','deepseek-v4-flash','deepseek-v4-pro']);
export const VISION_MODELS=Object.freeze(['deepseek-flash','deepseek-v4-flash-vision-exp']);
// Officially documented, one-way response aliases only. A planned future
// Pro routing change does not authorize a Pro substitution in this release.
const responseAliases=new Map([['deepseek-v4-flash','deepseek-flash'],['deepseek-v4-flash-vision-exp','deepseek-flash']]);
const acceptedResponseModel=(requested,returned)=>typeof returned==='string'&&(returned===requested||responseAliases.get(requested)===returned);
const money=v=>Math.ceil(v*1000000-1e-9)/1000000;
export {Budget,replaceLedgerFile} from './budget-ledger.js';

export async function callDeepSeek(request,{budget,resolveKey,signal,transport=fetch,scope,beforeDispatch}) {
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
  await budget.reserve(id,reserved,{model:request.model,inputSha256:digest(body),...(scope?{scope}:{})});
  let dispatched=false,settled=false;
  try {
  checkAbort(signal);beforeDispatch?.();await budget.markDispatched(id);dispatched=true;checkAbort(signal);beforeDispatch?.();
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
  const ceiling=quoteUsage({model:request.model,usage,format:'chat-completions',purpose:'reservation'});
  const estimate=quoteUsage({model:request.model,usage,format:'chat-completions',at:new Date()});
  const u=ceiling.usage;
  await budget.settle(id,ceiling.estimateCny,{prompt_tokens:u.promptTokens,completion_tokens:u.outputTokens},{usageDetail:{inputTokens:u.inputTokens,cacheReadTokens:u.cacheReadTokens,cacheWriteTokens:u.cacheWriteTokens,outputTokens:u.outputTokens},priceVersion:ceiling.pricing.version,basis:'usage-peak-upper-bound',estimateCny:estimate.estimateCny});settled=true;
  return {text,model:parsed.model,requestedModel:request.model,pricing:ceiling.pricing,requestId:id,usage:{prompt_tokens:u.promptTokens,completion_tokens:u.outputTokens},chargeCeilingCny:ceiling.estimateCny,estimatedChargeCny:estimate.estimateCny,isInvoice:false,truncated:parsed.choices[0].finish_reason==='length'};
  } finally {
    if(!settled){try{if(dispatched)await budget.markUnknown(id);else await budget.releasePrepared(id,'cancelled-before-dispatch');}catch{/* The durable reservation remains conservative if cleanup cannot be persisted. */}}
  }
}
