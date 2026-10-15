import {z} from 'zod';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fail} from './errors.js';

export const name='sep-computer-click';
export const inject=['tools'];
const label=z.string().trim().min(1).max(256);
const target=z.object({elementId:label.optional(),name:label.optional(),automationId:label.optional(),controlType:label.optional(),parentElementId:label.optional(),scope:z.enum(['window','active_dialog']).optional()}).strict().refine(v=>Boolean(v.elementId||v.name||v.automationId),'A previously observed element or exact selector is required');
const expected=z.object({mode:z.enum(['appear','disappear']),name:label.optional(),automationId:label.optional(),controlType:label.optional(),parentElementId:label.optional(),scope:z.enum(['window','active_dialog']).optional()}).strict().refine(v=>Boolean(v.name||v.automationId),'An observable condition is required');
const input=z.object({requestId:z.string().min(1).max(128),windowHandle:z.string().regex(/^[1-9]\d{0,19}$/),target,doubleClick:z.boolean().default(false),expected:expected.optional()}).strict();
const configSchema=z.object({enabled:z.boolean().default(false),serverName:z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).default('sep_windows'),verificationTimeoutMs:z.number().int().min(100).max(15000).default(5000),operationTimeoutMs:z.number().int().min(100).max(600000).default(180000),shutdownTimeoutMs:z.number().int().min(100).max(30000).default(5000),maxReceipts:z.number().int().min(1).max(10000).default(1024),maxObservationBytes:z.number().int().min(256).max(32768).default(8192)}).strict();
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uncertain=code=>{throw Object.assign(Error(code+': outcome unknown; do not retry automatically. Observe the target before a new action.'),{code});};
// Shared by copies of this plugin in one Node process, not by other DSH processes
// or direct native/MCP tools. No desktop-wide exclusion is claimed.
const coordinationKey=Symbol.for('dsh-sep.computer-click.coordination.v1');
const coordinator=globalThis[coordinationKey]??= {active:undefined};
const MAX_PROVIDER_BYTES=262144;
function providerError(result){
 let reason='provider-error';const message=result?.error?.message;
 if(typeof message==='string'&&Buffer.byteLength(message)<=MAX_PROVIDER_BYTES){
  try{const data=JSON.parse(message);if(typeof data?.errorType==='string'&&/^[a-zA-Z_]{1,64}$/.test(data.errorType))reason=data.errorType;}catch{}
 }
 return Object.assign(Error(reason),{code:reason});
}
function payload(result){
 if(!result||result.isError)throw providerError(result);
 const value=result.value;
 if(!value||value.isError||!Array.isArray(value.content)||value.content.length!==1)throw Error('invalid-envelope');
 const block=value.content[0];
 if(block?.type!=='text'||typeof block.text!=='string'||Buffer.byteLength(block.text)>MAX_PROVIDER_BYTES)throw Error('invalid-or-oversized-payload');
 const data=JSON.parse(block.text);
 if(!data||typeof data!=='object'||Array.isArray(data)||data.success!==true||data.error||data.errorType)throw Error('provider-rejected');
 if(value.structuredContent!==undefined&&!isDeepStrictEqual(value.structuredContent,data))throw Error('conflicting-payload');
 return data;
}
function exactId(item,windowHandle){
 // 1.3.24 returns server-local numeric IDs, despite the full-info model's
 // legacy composite-ID comment. Accept only a freshly window-scoped result.
 return typeof item?.id==='string'&&(/^[1-9]\d{0,19}$/.test(item.id)||item.id.startsWith(`window:${windowHandle}|`))&&item.enabled===true;
}
function checkItem(item,args){
 if(!exactId(item,args.windowHandle))fail('SEP_CLICK_TARGET_INVALID');
 if(args.target.elementId&&args.target.elementId!==item.id)fail('SEP_CLICK_TARGET_CHANGED');
 for(const [selector,field] of [['name','name'],['controlType','type']]){
  if(args.target[selector]&&String(item[field]??'').toLowerCase()!==args.target[selector].toLowerCase())fail('SEP_CLICK_TARGET_CHANGED');
 }
 return item.id;
}
function findSnapshotId(tree,id){
 if(!Array.isArray(tree))throw Error('invalid-tree');
 const stack=[...tree],matches=[];let count=0;
 while(stack.length){
  if(++count>10000)throw Error('tree-limit');
  const item=stack.pop();if(!item||typeof item!=='object')throw Error('invalid-node');
  if(item.id===id)matches.push(item);
  if(item.children!==undefined){if(!Array.isArray(item.children))throw Error('invalid-children');stack.push(...item.children);}
 }
 if(matches.length!==1)fail('SEP_CLICK_TARGET_CHANGED');return matches[0];
}

/** Add one semantic click entry over the configured MCP tool bridge.
 * Receipts prevent duplicate dispatch only within this loaded plugin lifetime;
 * after restart, an unknown prior operation requires observation before a new action. */
export function apply(ctx,raw={}){
 const config=configSchema.parse(raw);if(!config.enabled)return;
 const names={click:`mcp__${config.serverName}__ui_click`,wait:`mcp__${config.serverName}__ui_wait`,find:`mcp__${config.serverName}__ui_find`,snapshot:`mcp__${config.serverName}__ui_snapshot`};
 const lifetime=new AbortController(),receipts=new Map();let active;
 // Nested tools may redact content without changing their canonical value.
 // Never re-render that raw value, including UI trees and provider messages.
 const observation=action=>({providerObservation:{success:true,action},observationOmitted:'window-content; use a separate scoped read'});
 ctx.tools.register({name:'suite_computer_click',description:'Click one previously observed Windows UI control using the SEP Windows MCP semantic UIA path. Supply the observed windowHandle and elementId, or an exact name/automationId. Rechecks a fresh window-scoped UIA query or snapshot before dispatch and refuses stale, ambiguous or disabled targets. Name/automationId selectors are preferred. ID-only calls with parentElementId or active_dialog scope require a selector. Serializes only SEP enhanced clicks within this Node process, not raw tools or other processes. Never guesses coordinates or falls back to a second click. Use a stable requestId for the same intended action. An optional expected condition is observed after the single click; observation is not proof of business completion. Results contain only a minimal status summary, never raw window text. A timed-out or cancelled input may still execute: further enhanced clicks remain blocked until the old provider is stopped and the Host is restarted. If outcome is unknown, inspect the UI before any further action. Replays are deduplicated only during this loaded plugin lifetime, not across restarts.',parameters:JSON.parse(JSON.stringify({type:'object',...z.toJSONSchema(input)})),output:{schema:{type:'object'},render:(_a,value)=>[{type:'text',text:JSON.stringify(value)}]},async execute(rawArgs,exec){
  const args=input.parse(rawArgs);lifetime.signal.throwIfAborted();exec.signal.throwIfAborted();
  const session=exec.agent?.session?.header;if(typeof session?.id!=='string'||typeof session.cwd!=='string')fail('SEP_CLICK_SESSION_REQUIRED');
  const key=sha([session.id,session.cwd,args.requestId]),fingerprint=sha(args),prior=receipts.get(key);
  if(prior){if(prior.fingerprint!==fingerprint)fail('SEP_CLICK_REQUEST_CONFLICT');return prior.work;}
  if(coordinator.active){
   if(coordinator.quarantined)fail('SEP_CLICK_PROVIDER_QUARANTINED','A previous input may still execute. Do not retry input; stop the owned provider and restart the Host before observing the target again.');
   fail('SEP_CLICK_BUSY','The previous provider call is still settling. Wait before another enhanced click.');
  }
  if(receipts.size>=config.maxReceipts)fail('SEP_CLICK_RECEIPT_LIMIT');
  const hasSelector=Boolean(args.target.name||args.target.automationId);
  if(!hasSelector&&(args.target.scope==='active_dialog'||args.target.parentElementId))fail('SEP_CLICK_SELECTOR_REQUIRED');
  if(!ctx.tools.get(names.click,exec.agent)||!ctx.tools.get(hasSelector?names.find:names.snapshot,exec.agent)||args.expected&&!ctx.tools.get(names.wait,exec.agent))fail('SEP_CLICK_PROVIDER_UNAVAILABLE');
  const upstream=AbortSignal.any([exec.signal,lifetime.signal]),controller=new AbortController();
  const signal=AbortSignal.any([upstream,controller.signal]);
  const operation={phase:'preflight',settled:false,quarantined:false,work:undefined};
  const quarantine=()=>{operation.quarantined=true;coordinator.quarantined=true;};
  const stopped=Promise.withResolvers();
  const stop=timedOut=>{
   if(operation.settled)return;
   if(operation.phase==='click')quarantine();
   controller.abort();
   const code=operation.phase==='preflight'?(timedOut?'SEP_CLICK_PREFLIGHT_TIMEOUT':'SEP_CLICK_CANCELLED'):operation.phase==='click'?'SEP_CLICK_DISPATCH_UNCERTAIN':'SEP_CLICK_VERIFY_FAILED';
   stopped.reject(Object.assign(Error(code+(operation.phase==='preflight'?': no click dispatched; wait for the previous provider call to settle.':': outcome unknown; do not retry input. Observe only after the prior execution is safely cleared.')),{code}));
  };
  // The deadline bounds the caller, not the remote action. Exclusion belongs to
  // the underlying work; an uncertain dispatch remains quarantined after return.
  const onAbort=()=>stop(false),timer=setTimeout(()=>stop(true),config.operationTimeoutMs);
  upstream.addEventListener('abort',onAbort,{once:true});
  const invoke=(name,parameters,suffix)=>{signal.throwIfAborted();return ctx.tools.execute({name,arguments:parameters,callId:exec.callId+suffix,agent:exec.agent,signal});};
  const work=Promise.resolve().then(async()=>{
   signal.throwIfAborted();let clicked,elementId;
   try{
    if(hasSelector){
     const {elementId:oldId,...selector}=args.target;
     const found=payload(await invoke(names.find,{windowHandle:args.windowHandle,...selector,requireUnique:true,enabledOnly:true,visibleOnly:true,timeoutMs:config.verificationTimeoutMs},'-sep-preflight'));
     if(found.elementCount!==1||!Array.isArray(found.items)||found.items.length!==1)fail('SEP_CLICK_TARGET_AMBIGUOUS');
     elementId=checkItem(found.items[0],args);
    }else{
     const snapshot=payload(await invoke(names.snapshot,{windowHandle:args.windowHandle,mode:'full'},'-sep-preflight'));
     elementId=checkItem(findSnapshotId(snapshot.tree,args.target.elementId),args);
    }
   }catch(error){
    throw Object.assign(Error('SEP_CLICK_PREFLIGHT_FAILED: no click dispatched; inspect the target and use a new requestId. '+(error.code??'invalid or failed provider observation')),{code:'SEP_CLICK_PREFLIGHT_FAILED'});
   }
   signal.throwIfAborted();
   operation.phase='click';
   try{clicked=await invoke(names.click,{windowHandle:args.windowHandle,elementId,doubleClick:args.doubleClick,requireUnique:true,withSnapshot:true,snapshotMode:'full'},'-sep-click');payload(clicked);}
   catch{quarantine();return uncertain('SEP_CLICK_DISPATCH_UNCERTAIN');}
   if(clicked.isError||signal.aborted){quarantine();return uncertain('SEP_CLICK_DISPATCH_UNCERTAIN');}
   operation.phase='verify';
   if(!args.expected)return {requestId:args.requestId,outcome:'not_verified',automaticRetry:false,...observation('click')};
   let verified;try{verified=await invoke(names.wait,{windowHandle:args.windowHandle,...args.expected,requireUnique:true,timeoutMs:config.verificationTimeoutMs},'-sep-verify');payload(verified);}
   catch{return uncertain('SEP_CLICK_VERIFY_FAILED');}
   if(verified.isError||signal.aborted)return uncertain('SEP_CLICK_VERIFY_FAILED');
   return {requestId:args.requestId,outcome:'expected_condition_observed',automaticRetry:false,...observation('wait')};
  });
  operation.work=work;active=operation;coordinator.active=work;
  const settled=()=>{operation.settled=true;if(active===operation)active=undefined;if(coordinator.active===work&&!operation.quarantined){coordinator.active=undefined;coordinator.quarantined=false;}};
  work.then(settled,settled);
  const response=Promise.race([work,stopped.promise]);receipts.set(key,{fingerprint,work:response});
  if(upstream.aborted)onAbort();
  try{return await response;}finally{clearTimeout(timer);upstream.removeEventListener('abort',onAbort);}
 }});
 ctx.effect(()=>async()=>{
  lifetime.abort();const pending=active;
  if(pending){
   let timer;try{await Promise.race([Promise.allSettled([pending.work]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('SEP_CLICK_SHUTDOWN_BLOCKED: provider call is unresolved; exclusion retained, cleanup is not confirmed.'),{code:'SEP_CLICK_SHUTDOWN_BLOCKED'})),config.shutdownTimeoutMs);})]);}
   finally{clearTimeout(timer);}
  }
  receipts.clear();
 });
}
