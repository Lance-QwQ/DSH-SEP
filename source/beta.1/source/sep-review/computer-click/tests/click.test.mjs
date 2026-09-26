import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as yieldToLoop} from 'node:timers/promises';
import {host,call,load} from './host.mjs';
import * as plugin from '../src/computer-click.js';
const id='window:123456|runtime:42|path:0.1';
const item={id,name:'Confirm',type:'Button',click:[100,100,0],enabled:true};
const goodFind={success:true,action:'find',elementCount:1,items:[item]};
const goodClick={success:true,action:'click',postActionTree:[]};
const args={requestId:'once',windowHandle:'123456',target:{name:'Confirm',controlType:'Button'}};
const wrap=payload=>({content:[{type:'text',text:JSON.stringify(payload)}]});
async function setup(t,options={}){
 const ctx=await host(),calls=[];const {createMcpToolDefinition}=await load('dsh-mcp-client');
 for(const n of ['ui_find','ui_snapshot','ui_click','ui_wait']){
  if(options.missing===n)continue;
  ctx.tools.register(createMcpToolDefinition(ctx,{name:`mcp__sep_windows__${n}`,rawName:n,description:'Synthetic MCP boundary; no desktop',inputSchema:{type:'object'},async call(parameters,exec){
   calls.push({name:n,args:parameters});await options.onCall?.(n,exec);
   if(n==='ui_find')return options.rawFind??wrap(options.find??goodFind);
   if(n==='ui_snapshot')return wrap(options.snapshot??{success:true,action:'get_tree',tree:[item]});
   if(n==='ui_click')return options.rawClick??wrap(options.click??goodClick);
   return options.rawWait??wrap(options.wait??{success:true,action:'wait'});
  }}));
 }
 const fiber=await ctx.plugin(plugin,{enabled:true,...options.config});
 t.after(()=>ctx.fiber.dispose());
 return {ctx,calls,fiber,invoke:(a=args,o)=>call(ctx,a,o),clicks:()=>calls.filter(x=>x.name==='ui_click')};
}
test('fresh unique query precedes one exact-ID dispatch',async t=>{
 const f=await setup(t),r=await f.invoke();assert.equal(r.isError,false);
 assert.deepEqual(f.calls.map(x=>x.name),['ui_find','ui_click']);
 assert.equal(f.calls[0].args.requireUnique,true);assert.equal(f.calls[0].args.enabledOnly,true);
 assert.equal(f.clicks()[0].args.elementId,id);assert.equal(r.value.outcome,'not_verified');
});
for(const [label,find] of [['ambiguous',{...goodFind,elementCount:2,items:[item,{...item,id:id+'2'}]}],['disabled',{...goodFind,items:[{...item,enabled:false}]}],['wrong window',{...goodFind,items:[{...item,id:'window:999|runtime:42|path:0.1'}]}],['not found',{success:false,action:'find',errorType:'ElementNotFound'}],['name mismatch',{...goodFind,items:[{...item,name:'Delete'}]}]]){
 test(`${label} preflight sends no click`,async t=>{const f=await setup(t,{find}),r=await f.invoke();assert.equal(r.isError,true);assert.equal(f.clicks().length,0);});
}
test('stale caller element ID cannot override a fresh different target',async t=>{const f=await setup(t);const r=await f.invoke({...args,target:{...args.target,elementId:id+'old'}});assert.equal(r.isError,true);assert.equal(f.clicks().length,0);});
test('element-ID-only path requires fresh scoped snapshot membership',async t=>{const f=await setup(t,{snapshot:{success:true,action:'get_tree',tree:[]}});const r=await f.invoke({...args,target:{elementId:id}});assert.equal(r.isError,true);assert.equal(f.clicks().length,0);});
test('fresh element-ID-only path remains supported',async t=>{const f=await setup(t),r=await f.invoke({...args,target:{elementId:id}});assert.equal(r.isError,false);assert.deepEqual(f.calls.map(x=>x.name),['ui_snapshot','ui_click']);});
test('actual Windows MCP numeric IDs are accepted after a fresh window-scoped query',async t=>{const f=await setup(t,{find:{...goodFind,items:[{...item,id:'19'}]}});const r=await f.invoke();assert.equal(r.isError,false);assert.equal(f.clicks()[0].args.elementId,'19');});
for(const [label,rawClick] of [['false success',wrap({success:false,action:'click'})],['missing success',wrap({action:'click'})],['illegal JSON',{content:[{type:'text',text:'broken'}]}],['empty content',{content:[]}],['conflicting structured', {...wrap(goodClick),structuredContent:{success:false,action:'click'}}]]){
 test(`${label} click cannot be reported successful or retried`,async t=>{const f=await setup(t,{rawClick});const r=await f.invoke();assert.equal(r.isError,true);assert.match(JSON.stringify(r),/SEP_CLICK_DISPATCH_UNCERTAIN/);await f.invoke();assert.equal(f.clicks().length,1);});
}
test('failed condition is never reported as observed',async t=>{const f=await setup(t,{wait:{success:false,action:'wait'}});const r=await f.invoke({...args,expected:{mode:'appear',name:'Done'}});assert.equal(r.isError,true);assert.match(JSON.stringify(r),/SEP_CLICK_VERIFY_FAILED/);assert.equal(f.clicks().length,1);});
test('successful condition retains limited observation claim',async t=>{const f=await setup(t),r=await f.invoke({...args,expected:{mode:'appear',name:'Done'}});assert.equal(r.isError,false);assert.equal(r.value.outcome,'expected_condition_observed');});
test('missing preflight tool refuses before any input',async t=>{const f=await setup(t,{missing:'ui_find'});assert.equal((await f.invoke()).isError,true);assert.equal(f.clicks().length,0);});
test('same request replays once and conflicting target is refused',async t=>{const f=await setup(t);const r=await f.invoke();assert.deepEqual((await f.invoke()).value,r.value);assert.equal((await f.invoke({...args,target:{name:'Other'}})).isError,true);assert.equal(f.clicks().length,1);});
test('cancel during preflight prevents dispatch',async t=>{const c=new AbortController();const f=await setup(t,{onCall(n){if(n==='ui_find')c.abort();}});assert.equal((await f.invoke(args,{signal:c.signal})).isError,true);assert.equal(f.clicks().length,0);});
test('two plugin instances in one process cannot overlap workflows',async t=>{
 let release;const gate=new Promise(r=>release=r);const f=await setup(t,{onCall:n=>n==='ui_click'?gate:undefined}),g=await setup(t);
 const pending=f.invoke();while(!f.clicks().length)await yieldToLoop();
 try{assert.equal((await g.invoke({...args,requestId:'other'})).isError,true);assert.equal(g.clicks().length,0);}finally{release();await pending;}
});
test('oversized JSON result is rejected before parsing and not retried',async t=>{const f=await setup(t,{rawClick:wrap({...goodClick,huge:'x'.repeat(300000)})});assert.equal((await f.invoke()).isError,true);await f.invoke();assert.equal(f.clicks().length,1);});
test('valid large snapshot is omitted from model result',async t=>{const f=await setup(t,{click:{...goodClick,postActionTree:[{...item,name:'x'.repeat(12000)}]}});const r=await f.invoke();assert.equal(r.isError,false);assert.equal(r.value.providerObservation,null);assert.ok(JSON.stringify(r.value).length<1024);});
test('pre-aborted call performs no provider operation',async t=>{const f=await setup(t);assert.equal((await f.invoke(args,{signal:AbortSignal.abort()})).isError,true);assert.equal(f.calls.length,0);});
test('coordinate targets cannot bypass semantic validation',async t=>{const f=await setup(t);assert.equal((await f.invoke({...args,target:{x:10,y:20}})).isError,true);assert.equal(f.calls.length,0);});
test('preflight preserves safe upstream failure classification without forwarding UI text',async t=>{
 const f=await setup(t,{rawFind:{...wrap({success:false,action:'find',errorType:'multiple_matches',error:'private window title'}),isError:true}});
 const r=await f.invoke();assert.equal(r.isError,true);assert.match(JSON.stringify(r),/multiple_matches/);assert.doesNotMatch(JSON.stringify(r),/private window title/);assert.equal(f.clicks().length,0);
});
test('cancel during click drains work and never starts verification',async t=>{
 const controller=new AbortController();let release;const gate=new Promise(r=>release=r);
 const f=await setup(t,{onCall:n=>n==='ui_click'?gate:undefined});
 const first=f.invoke({...args,expected:{mode:'appear',name:'Done'}},{signal:controller.signal});
 while(!f.clicks().length)await yieldToLoop();controller.abort();
 try{assert.equal((await f.invoke({...args,requestId:'second'})).isError,true);}finally{release();}
 assert.equal((await first).isError,true);assert.equal(f.calls.filter(c=>c.name==='ui_wait').length,0);assert.equal(f.clicks().length,1);
});
test('concurrent same request coalesces to a single click',async t=>{
 let release;const gate=new Promise(r=>release=r);const f=await setup(t,{onCall:n=>n==='ui_click'?gate:undefined});
 const a=f.invoke();while(!f.clicks().length)await yieldToLoop();const b=f.invoke();release();assert.deepEqual((await a).value,(await b).value);assert.equal(f.clicks().length,1);
});
test('unload removes the enhancement entry',async t=>{const f=await setup(t);await f.fiber.dispose();assert.equal(f.ctx.tools.get('suite_computer_click'),undefined);});
test('receipt capacity refuses new actions without evicting duplicate protection',async t=>{const f=await setup(t,{config:{maxReceipts:1}});await f.invoke();const r=await f.invoke({...args,requestId:'two'});assert.equal(r.isError,true);assert.match(JSON.stringify(r),/SEP_CLICK_RECEIPT_LIMIT/);await f.invoke();assert.equal(f.clicks().length,1);});
