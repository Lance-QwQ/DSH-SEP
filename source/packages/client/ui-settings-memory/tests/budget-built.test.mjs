import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import vm from 'node:vm';
const require=createRequire(import.meta.url);
function load(){let loaded;vm.runInNewContext(require('node:fs').readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:value=>loaded=value}},setTimeout,clearTimeout,AbortController,Promise,console});assert.equal(loaded.id,'@deepseek-ai/dsh-client-ui-settings-memory');return loaded.factory(name=>require(name));}
function context(){const sections=[],locales=[];return {sections,locales,get:key=>key==='connection'?{rpc:{call:()=>{}},generation:{getSnapshot:()=>0,subscribe:()=>()=>{}}}:undefined,effect:fn=>fn(),locale:{register:(name,value)=>{locales.push(name);return()=>{}},bind:()=>key=>key},slots:{inject:(_name,fn)=>fn(),register:(entry,component)=>{sections.push({entry,component});return()=>{}}}};}
test('built native closure registers parallel memory and budget sections',()=>{const plugin=load(),ctx=context();plugin.apply(ctx);assert.deepEqual(ctx.sections.map(value=>value.entry.id),['sep-memory','sep-assessment','sep-budget']);assert.deepEqual(ctx.locales,['settings.sepMemory','settings.sepAssessment','settings.sepBudget']);assert.equal(typeof ctx.sections[1].component,'function');assert.equal(typeof ctx.sections[2].entry.inject().api.updateDefault,'function');});
test('disabled existing plugin registers neither settings surface',()=>{const plugin=load(),ctx=context();plugin.apply(ctx,{enabled:false});assert.equal(ctx.sections.length,0);});

test('built Host transport and built native client preserve both accounting guard errors',async()=>{
 const {apply:hostApply}=await import('../lib/index.js');
 for(const code of ['BUDGET_LEDGER_MISSING','BUDGET_LEDGER_CHANGED']){
  const routes=new Map();
  hostApply({get:key=>({connection:{fetch:{register:route=>routes.set(route.path,route)}},suiteEnhancements:{budgetSettings:{list:async()=>{throw Object.assign(new Error('synthetic private details'),{code})}}},sepDesktopTransport:{kind:'electron-owned-pipe'}})[key]});
  const ctx=context();
  ctx.get=key=>key==='connection'?{generation:{getSnapshot:()=>0,subscribe:()=>()=>{}},rpc:{call:async(_base,method,payload)=>{
   const response=await routes.get('/api/'+method).fetch(new Request('dsh-app://app/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'guard-built',method,payload})}));
   const text=await response.text();assert.doesNotMatch(text,/synthetic private details/);return JSON.parse(text).result;
  }}}:undefined;
  load().apply(ctx);
  await assert.rejects(()=>ctx.sections.find(x=>x.entry.id==='sep-budget').entry.inject().api.list(),new RegExp('^Error: '+code+'$'));
 }
});
test('built locale registration includes explicit missing ledger and changed ledger messages',()=>{
 const ctx=context(),dictionaries=new Map();ctx.locale.register=(key,value)=>{dictionaries.set(key,value);return()=>{}};
 load().apply(ctx);const value=dictionaries.get('settings.sepBudget');assert.match(value.zh.ledgerMissing,/预算账本缺失/);assert.match(value.zh.ledgerChanged,/拒绝本次写入/);assert.match(value.en.ledgerMissing,/missing/);
});
