import {quoteUsage} from './budget-pricing.js';
const fail=()=>{throw Object.assign(new Error('BUDGET_REQUEST_INVALID'),{code:'BUDGET_REQUEST_INVALID'});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
/**
 * Conservative request allowance for the reviewed DSH GenerateOptions contract.
 * This is not a tokenizer or an invoice. UTF-8 JSON bytes remain one allowance
 * unit each; no average chars/4 heuristic reduces the reservation.
 *
 * Optional tool projection must be the reviewed public projectToolUpdates export.
 * Matching route names alone does not bind an adapter generation: callers must
 * establish that binding before enabling this optimization. Without it, omit the
 * projection function and retain messages, current tools AND toolHistory.
 */
export function estimateRequest(options,{imageAllowance=0,projectToolUpdates,modelInfo}={}){
 if(!object(options)||!Array.isArray(options.messages)||!Number.isSafeInteger(options.maxTokens)||options.maxTokens<1||!Number.isSafeInteger(imageAllowance)||imageAllowance<0)fail();
 if(options.system!==undefined&&typeof options.system!=='string')fail();
 if(options.tools!==undefined&&!Array.isArray(options.tools))fail();
 if(options.toolHistory!==undefined&&!object(options.toolHistory))fail();
 let messages=options.messages,tools=options.tools,history=options.toolHistory;
 let projectionBasis='conservative-unprojected',projectionReason='not-provided';
 if(typeof projectToolUpdates==='function'){
  projectionReason='route-metadata-unverified';
  if(object(modelInfo)&&modelInfo.provider===options.provider&&modelInfo.id===options.model){
   try{
    const projected=projectToolUpdates(messages,tools,modelInfo.toolUpdate,history);
    if(!object(projected)||!Array.isArray(projected.messages)||(projected.tools!==undefined&&!Array.isArray(projected.tools)))throw new Error('invalid projection');
    messages=projected.messages;tools=projected.tools;history=undefined;projectionBasis='public-tool-updates';projectionReason='caller-supplied-reviewed-projection';
   }catch{projectionReason='projection-failed';}
  }
 }
 // system is a model-visible one-shot input. signal/sessionId/purpose and
 // arbitrary runtime metadata are not part of the token-bearing request.
 const selected={...(options.system===undefined?{}:{system:options.system}),messages,...(tools===undefined?{}:{tools}),...(history===undefined?{}:{toolHistory:history})};
 let requestBytes;try{requestBytes=Buffer.byteLength(JSON.stringify(selected),'utf8');}catch{fail();}
 const inputUpperBoundTokens=requestBytes+16384+imageAllowance;if(!Number.isSafeInteger(inputUpperBoundTokens))fail();
 const quote=quoteUsage({model:options.model,usage:{inputTokens:inputUpperBoundTokens,outputTokens:options.maxTokens},purpose:'reservation'});
 return Object.freeze({requestBytes,inputUpperBoundTokens,imageAllowance,framingAllowance:16384,outputTokens:options.maxTokens,outputAdjusted:false,reservationCny:quote.estimateCny,pricing:quote.pricing,estimateBasis:'utf8-json-bytes-plus-16384-plus-reviewed-image-allowance',projectionBasis,projectionReason,isActualTokenCount:false,scope:'Conservative local allowance for reviewed request fields and route; not measured provider tokens or a billing guarantee for arbitrary future adapters/extensions.'});
}
