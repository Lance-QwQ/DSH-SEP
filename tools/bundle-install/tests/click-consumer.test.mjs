import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {setup,close,agent,call,deferred,owned,exec} from './native-settings-fixture.mjs';
const args={requestId:'owned-click',windowHandle:'123',target:{name:'Synthetic confirm'}};
const envelope=data=>({content:[{type:'text',text:JSON.stringify({success:true,...data})}]});
async function host({behavior,missing=false}={}){
 const {businessConfig}=await owned('lib/settings-consumers.js');assert.doesNotThrow(()=>businessConfig.parse({sources:['资料'],click:{enabled:true}}));
 const f=await setup({mountRoot:false,business:{click:{enabled:true,operationTimeoutMs:1000,shutdownTimeoutMs:100}},shutdownMs:100});f.dispatched=0;
 try{if(!missing)await f.ctx.plugin({name:'owned-synthetic-mcp',inject:['tools'],apply(child){for(const op of ['find','snapshot','click','wait'])child.tools.register({name:'mcp__sep_windows__ui_'+op,description:'synthetic scoped provider',parameters:{type:'object'},output:{schema:{type:'object'},render:()=>[]},async execute(){await behavior?.(op);if(op==='click')f.dispatched++;return envelope(op==='find'?{elementCount:1,items:[{id:'1',enabled:true,name:'Synthetic confirm',type:'Button',text:'private-window-text'}]}:{});}});}});await f.mount();return f;}catch(error){await close(f);throw error;}
}
test('owned click composition dispatches once, deduplicates and omits window text',async()=>{
 const f=await host();try{const a=await agent(f),first=await call(f,a,'computer_click',args),second=await call(f,a,'computer_click',args);assert.equal(first.outcome,'not_verified');assert.deepEqual(second,first);assert.equal(f.dispatched,1);assert(!JSON.stringify(first).includes('private-window-text'));assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await close(f);}
});
test('owned click refuses an absent MCP provider with its specific code',async()=>{
 const f=await host({missing:true});try{const a=await agent(f);await assert.rejects(call(f,a,'computer_click',args),/SEP_CLICK_PROVIDER_UNAVAILABLE/);assert.equal(f.dispatched,0);}finally{await close(f);}
});
test('root close retains the lease for unresolved preflight and prevents a late click',async()=>{
 const entered=deferred(),release=deferred(),f=await host({behavior:async op=>{if(op==='find'){entered.resolve();await release.promise;}}});let running;
 try{const a=await agent(f);running=call(f,a,'computer_click',args).catch(e=>e);await entered.promise;assert.equal((await f.api.close()).status,'blocked');await assert.rejects(f.openControl({storageRoot:f.dirs.memory}),{code:'P2_LOCKED'});release.resolve();const error=await running;assert(error instanceof Error);await f.api.whenClosed();assert.equal(f.dispatched,0);assert.equal((await f.api.close()).status,'pass');}finally{release.resolve();await running;await close(f);}
});
test('retained click reference refuses work after root close',async()=>{
 const f=await host();try{const a=await agent(f),retained=f.ctx.tools.get('suite_computer_click',a);await f.api.close();await assert.rejects(retained.execute(args,exec(a)),/SEP_P1_CLOSED/);assert.equal(f.dispatched,0);}finally{await close(f);}
});
