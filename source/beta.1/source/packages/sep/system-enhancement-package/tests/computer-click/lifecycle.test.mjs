import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as yieldToLoop,setTimeout as delay} from 'node:timers/promises';
import {host,call,load,plugin} from './host.mjs';
const key=Symbol.for('dsh-sep.computer-click.coordination.v1');
const args={requestId:'fault',windowHandle:'123456',target:{name:'Confirm'}};
const wrap=data=>({content:[{type:'text',text:JSON.stringify(data)}]});
async function rig(t,phase,config={}){
 const ctx=await host(),entered=Promise.withResolvers(),gate=Promise.withResolvers(),calls=[],all=[];
 const {createMcpToolDefinition}=await load('dsh-mcp-client');
 for(const n of ['ui_find','ui_click','ui_wait'])ctx.tools.register(createMcpToolDefinition(ctx,{name:'mcp__sep_windows__'+n,rawName:n,description:'Synthetic no-input provider',inputSchema:{type:'object'},async call(p,exec){
  calls.push(n);if(n===phase){entered.resolve();await gate.promise;}
  return wrap(n==='ui_find'?{success:true,action:'find',elementCount:1,items:[{id:'19',name:'Confirm',enabled:true}]}:{success:true,action:n==='ui_click'?'click':'wait'});
 }}));
 const fiber=await ctx.plugin(plugin,{enabled:true,...config});
 t.after(async()=>{gate.resolve();await Promise.allSettled(all);await ctx.fiber.dispose();
  // Each case owns only synthetic providers. Reset test state after all bodies settle;
  // this is never a production recovery operation or evidence of remote quiescence.
  globalThis[key].active=undefined;delete globalThis[key].quarantined;
 });
 return {ctx,fiber,entered,gate,calls,run(a=args,signal=new AbortController().signal){const p=call(ctx,a,{signal});all.push(p);return p;}};
}
test('cancelling a noncooperative preflight returns and prevents its late click',async t=>{
 const b=await rig(t,'ui_find'),controller=new AbortController();const work=b.run(args,controller.signal);await b.entered.promise;controller.abort();
 const r=await Promise.race([work,delay(150).then(()=>null)]);assert.ok(r,'cancelled caller still waits on provider');assert.equal(r.isError,true);
 assert.equal((await b.run({...args,requestId:'second'})).isError,true);b.gate.resolve();await yieldToLoop();await yieldToLoop();assert.equal(b.calls.includes('ui_click'),false);
});
for(const phase of ['ui_find','ui_click','ui_wait'])test(`deadline bounds caller while ${phase} ignores cancellation`,async t=>{
 const b=await rig(t,phase);t.mock.timers.enable({apis:['setTimeout']});
 let result;const work=b.run({...args,expected:{mode:'appear',name:'Done'}}).then(r=>{result=r;});await b.entered.promise;
 t.mock.timers.tick(180001);await yieldToLoop();await yieldToLoop();
 try{assert.ok(result,'local deadline never returned');assert.equal(result.isError,true);assert.match(result.error.message,phase==='ui_find'?/SEP_CLICK_PREFLIGHT_TIMEOUT/:phase==='ui_click'?/SEP_CLICK_DISPATCH_UNCERTAIN/:/SEP_CLICK_VERIFY_FAILED/);
  const blocked=await b.run({...args,requestId:'other'});assert.equal(blocked.isError,true);assert.equal(b.calls.filter(n=>n==='ui_click').length,phase==='ui_find'?0:1);
 }finally{t.mock.timers.reset();b.gate.resolve();await work;}
});
test('unload is bounded but retains exclusion when an input provider will not settle',async t=>{
 const b=await rig(t,'ui_click');t.mock.timers.enable({apis:['setTimeout']});b.run();await b.entered.promise;
 let closed=false;const closing=b.fiber.dispose().then(()=>{closed=true;},()=>{closed=true;});
 await yieldToLoop();t.mock.timers.tick(5001);await yieldToLoop();await yieldToLoop();
 try{assert.equal(closed,true,'unload waits indefinitely');assert.ok(globalThis[key].active,'unsafe unlock while provider is unresolved');assert.equal(b.ctx.tools.get('suite_computer_click'),undefined);}
 finally{t.mock.timers.reset();b.gate.resolve();await closing;}
});

test('late completion cannot unlock a quarantined click or permit replay after reload',async t=>{
 const b=await rig(t,'ui_click'),controller=new AbortController();const first=b.run(args,controller.signal);await b.entered.promise;controller.abort();
 const unknown=await first;assert.match(unknown.error.message,/SEP_CLICK_DISPATCH_UNCERTAIN/);
 b.gate.resolve();await yieldToLoop();await yieldToLoop();
 assert.equal((await b.run()).error.message,unknown.error.message);assert.equal(b.calls.filter(n=>n==='ui_click').length,1);
 await b.fiber.dispose();await b.ctx.plugin({...plugin},{enabled:true});
 const next=await b.run({...args,requestId:'after-reload'});assert.match(next.error.message,/SEP_CLICK_PROVIDER_QUARANTINED/);assert.equal(b.calls.filter(n=>n==='ui_click').length,1);
});

test('late preflight completion releases exclusion only after it can no longer dispatch',async t=>{
 const b=await rig(t,'ui_find'),controller=new AbortController();const work=b.run(args,controller.signal);await b.entered.promise;controller.abort();await work;
 assert.ok(globalThis[key].active);b.gate.resolve();await yieldToLoop();await yieldToLoop();assert.equal(b.calls.includes('ui_click'),false);
 const next=await b.run({...args,requestId:'fresh'});assert.equal(next.isError,false);assert.equal(b.calls.filter(n=>n==='ui_click').length,1);
});

test('configured local deadline works with real timers and never repeats input',async t=>{
 const b=await rig(t,'ui_click',{operationTimeoutMs:100,shutdownTimeoutMs:100});
 const work=b.run();await b.entered.promise;
 const result=await Promise.race([work,delay(2000).then(()=>null)]);assert.ok(result);assert.match(result.error.message,/SEP_CLICK_DISPATCH_UNCERTAIN/);
 assert.match((await b.run({...args,requestId:'other'})).error.message,/SEP_CLICK_PROVIDER_QUARANTINED/);assert.equal(b.calls.filter(n=>n==='ui_click').length,1);
});
