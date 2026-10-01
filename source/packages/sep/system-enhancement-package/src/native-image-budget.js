import {fail,checkAbort} from './errors.js';

// DeepSeek v4.1's published per-image input ceiling; actual usage settles the ledger.
const MAX_IMAGE_TOKENS=1024;

/**
 * Reserve every native image occurrence without changing its logged content.
 * Offloaded images remain text; retained images require the current route's
 * positive capability and pricing. The adapter still validates attachments and
 * enforces its encoded-byte/image-count limits before sending anything.
 * @param {object} ctx - P1's Host context with the resolved LLM service.
 * @param {object} options - The immutable native model request.
 * @param {AbortSignal} shutdownSignal - Plugin lifetime cancellation.
 * @returns {Promise<number>} Additional conservative input-token allowance.
 */
export async function nativeImageBudget(ctx,options,shutdownSignal){
  const images=options.messages.flatMap(message=>message.content.filter(block=>block.type==='image'));
  if(!images.length)return 0;
  const signal=AbortSignal.any([shutdownSignal,...options.signal?[options.signal]:[]]);
  checkAbort(signal);
  if(images.some(block=>block.offloaded!==true)){
    let model;
    try{model=await ctx.llm.resolveModelInfo(options.provider,options.model,signal);}
    catch(error){/* Provider diagnostics may contain private request data. */checkAbort(signal);fail('P1_IMAGE_NOT_ALLOWED','The current model image capability could not be verified. Select a verified image-capable model before continuing.');}
    checkAbort(signal);
    if(!model.inputModalities?.includes('image'))fail('P1_IMAGE_NOT_ALLOWED','The current model does not declare image input. Select an image-capable model; retained images have not been removed.');
    if(!ctx.get('attachments'))fail('P1_IMAGE_NOT_ALLOWED','Native image input requires the Host attachment service. Restore that service before continuing.');
  }
  let prices;
  try{prices=ctx.llm.imageRequestPricing(options.provider,options.model)?.priceImages(images);}
  catch(error){/* Provider diagnostics may contain private request data. */checkAbort(signal);fail('BUDGET_ESTIMATE','Native image pricing failed; no model request was sent.');}
  if(!Array.isArray(prices)||prices.length!==images.length)fail('BUDGET_ESTIMATE','Native image pricing is unavailable or incomplete; no model request was sent.');
  let allowance=0;
  for(let index=0;index<images.length;index++){
    const price=prices[index],offloaded=images[index].offloaded===true;
    if(!price||!Number.isSafeInteger(price.visualTokens)||typeof price.text!=='string'||(offloaded?price.visualTokens!==0:price.visualTokens<1||price.visualTokens>MAX_IMAGE_TOKENS))fail('BUDGET_ESTIMATE','Native image pricing exceeds the reviewed accounting rules; no model request was sent.');
    allowance+=Buffer.byteLength(price.text)+(offloaded?0:MAX_IMAGE_TOKENS);
    if(!Number.isSafeInteger(allowance))fail('BUDGET_ESTIMATE','Native image allowance is not a safe integer; no model request was sent.');
  }
  checkAbort(signal);
  return allowance;
}
