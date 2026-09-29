/** Reviewed CNY price estimates. Never represents an invoice or a tokenizer. */
const SOURCE='https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
const VERSION='deepseek-cny-2026-09-10-verified-2026-09-27';
const VERIFIED_AT='2026-09-27';
const EFFECTIVE_AT='2026-09-10T04:00:00.000Z';
const ALIASES=new Map([['deepseek-v4-flash','deepseek-flash'],['deepseek-v4-flash-vision-exp','deepseek-flash']]);
const PEAK=Object.freeze({'deepseek-flash':Object.freeze({input:2,cacheRead:0.04,cacheWrite:2,output:8}),'deepseek-v4-pro':Object.freeze({input:9,cacheRead:0.3,cacheWrite:9,output:27})});
const fail=code=>{throw Object.assign(new Error(code),{code});};
const own=(value,key)=>Object.hasOwn(value,key);
const count=value=>{if(!Number.isSafeInteger(value)||value<0)fail('BUDGET_USAGE_INVALID');return value;};
const sum=(...values)=>count(values.reduce((a,b)=>a+count(b),0));
function instant(at){
 if(at===undefined)return undefined;
 if(!(at instanceof Date)&&typeof at!=='number'&&!(typeof at==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/i.test(at)))fail('BUDGET_PRICING_TIME');
 const time=at instanceof Date?at.getTime():typeof at==='number'?at:Date.parse(at);
 if(!Number.isFinite(time)||!Number.isFinite(new Date(time).getTime()))fail('BUDGET_PRICING_TIME');return new Date(time);
}
/** Prices use the frozen reviewed snapshot. Pro is never inferred to be a Flash alias. */
export function getPricing(requestedModel,{at,purpose='estimate',historical=false}={}){
 const model=ALIASES.get(requestedModel)??requestedModel;if(!own(PEAK,model))fail('BUDGET_PRICING_MODEL');
 if(!['estimate','reservation'].includes(purpose)||typeof historical!=='boolean')fail('BUDGET_PRICING_MODE');
 const time=instant(at),upper=purpose==='reservation'||historical||time===undefined||time.getTime()<Date.parse(EFFECTIVE_AT);
 const day=time?.getUTCDay(),hour=time?.getUTCHours();
 const peak=upper||(day>=1&&day<=5&&((hour>=1&&hour<4)||(hour>=6&&hour<10)));
 const rates=Object.fromEntries(Object.entries(PEAK[model]).map(([key,value])=>[key,peak?value:value/2]));
 return Object.freeze({requestedModel,model,currency:'CNY',unit:'per-million-tokens',rates:Object.freeze(rates),period:peak?'peak':'off-peak',basis:upper?'peak-upper-bound':'published-price-estimate',version:VERSION,verifiedAt:VERIFIED_AT,effectiveAt:EFFECTIVE_AT,source:SOURCE,scheduleSource:'https://api-docs.deepseek.com/quick_start/pricing/',time:time?.toISOString()??null,historicalPriceVerified:false,isInvoice:false,scope:'Current reviewed price snapshot; peak is an upper bound within this snapshot, not verification of a historical bill. Cache writes, if present, are conservatively priced as cache miss.'});
}
/** Native counters are disjoint; Chat Completions prompt_tokens includes cache hits. */
export function normalizeUsage(usage,{format='native'}={}){
 if(!usage||typeof usage!=='object'||Array.isArray(usage))fail('BUDGET_USAGE_INVALID');
 const required=key=>{if(!own(usage,key))fail('BUDGET_USAGE_INVALID');return count(usage[key]);};
 const optional=key=>own(usage,key)?count(usage[key]):0;
 let inputTokens,cacheReadTokens,cacheWriteTokens,outputTokens,totalTokens,cacheCoverage;
 if(format==='native'){
  inputTokens=required('inputTokens');outputTokens=required('outputTokens');cacheReadTokens=optional('cacheReadTokens');cacheWriteTokens=optional('cacheWriteTokens');
  cacheCoverage=own(usage,'cacheReadTokens')?'reported':'missing-assumed-miss';
  totalTokens=sum(inputTokens,cacheReadTokens,cacheWriteTokens,outputTokens);
  if(own(usage,'totalTokens')&&count(usage.totalTokens)!==totalTokens)fail('BUDGET_USAGE_INVALID');
  if(own(usage,'reasoningTokens')&&count(usage.reasoningTokens)>outputTokens)fail('BUDGET_USAGE_INVALID');
 }else if(format==='chat-completions'){
  const prompt=required('prompt_tokens');outputTokens=required('completion_tokens');
  const hasHit=own(usage,'prompt_cache_hit_tokens'),hasMiss=own(usage,'prompt_cache_miss_tokens');
  cacheReadTokens=hasHit?required('prompt_cache_hit_tokens'):hasMiss?count(prompt-required('prompt_cache_miss_tokens')):0;
  inputTokens=count(prompt-cacheReadTokens);cacheWriteTokens=0;
  if(hasMiss&&required('prompt_cache_miss_tokens')!==inputTokens)fail('BUDGET_USAGE_INVALID');
  totalTokens=sum(prompt,outputTokens);if(own(usage,'total_tokens')&&required('total_tokens')!==totalTokens)fail('BUDGET_USAGE_INVALID');
  cacheCoverage=hasHit||hasMiss?'reported':'missing-assumed-miss';
 }else fail('BUDGET_USAGE_FORMAT');
 return Object.freeze({inputTokens,cacheReadTokens,cacheWriteTokens,outputTokens,promptTokens:sum(inputTokens,cacheReadTokens,cacheWriteTokens),totalTokens,cacheCoverage});
}
/** Round only the combined estimate upwards to one micro-CNY, without floating point under-rounding. */
export function quoteUsage({model,usage,at,format='native',historical=false,purpose='estimate'}){
 const normalized=normalizeUsage(usage,{format}),pricing=getPricing(model,{at,purpose,historical});
 const counters={input:normalized.inputTokens,cacheRead:normalized.cacheReadTokens,cacheWrite:normalized.cacheWriteTokens,output:normalized.outputTokens};
 let hundredthsOfMicro=0n;const breakdownCny={};
 for(const [key,tokens] of Object.entries(counters)){
  const units=BigInt(tokens)*BigInt(Math.round(pricing.rates[key]*100));hundredthsOfMicro+=units;breakdownCny[key]=Number(units)/100000000;
 }
 const micro=(hundredthsOfMicro+99n)/100n;if(micro>BigInt(Number.MAX_SAFE_INTEGER))fail('BUDGET_PRICE_OVERFLOW');
 const assumptions=[];if(normalized.cacheCoverage!=='reported')assumptions.push('missing-cache-treated-as-miss');if(normalized.cacheWriteTokens>0)assumptions.push('cache-write-priced-as-miss');
 const basis=pricing.basis==='peak-upper-bound'?'peak-upper-bound':normalized.cacheWriteTokens>0?'cache-write-upper-bound':normalized.cacheCoverage!=='reported'?'cache-miss-upper-bound':'published-price-estimate';
 return Object.freeze({estimateCny:Number(micro)/1000000,currency:'CNY',basis,isInvoice:false,usage:normalized,pricing,breakdownCny:Object.freeze(breakdownCny),assumptions:Object.freeze(assumptions)});
}
