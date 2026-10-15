// Portable orchestration check: real runtime source, dependency seams only.
// Native macOS IO and official Loader are intentionally not certified here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule} from 'node:vm';
import {resolve,join} from 'node:path';
const schema=new Proxy(function(){return schema;},{get:(_t,k)=>k==='parse'?v=>v:schema});
async function fixture(){
 const hooks=new Map(),effects=[],cancelled=[];
 const source=resolve(process.env.SEP_MAC_LOW_TEST_ROOT,'nonexistent-project');
 const agent={id:'live',session:{header:{id:'live',cwd:source+'/nested/..'}},cancel:r=>cancelled.push(r)};
 const ctx={get:()=>undefined,on:(name,fn)=>hooks.set(name,fn),effect:fn=>effects.push(fn),agents:{list:()=>[agent],get:id=>id===agent.id?agent:undefined}};
 const deps={
  './bundle-modules.mjs':{owned:async()=>({openControl(){throw Error('not reached');},bindStorage(){},openStore(){},Budget:class{},installP1(){},p1Config:schema,p1Schemas:{}})},
  './host-modules.mjs':{load:async()=>({z:schema,delegationDepthOf:()=>0})},
  './snapshot-scope.mjs':{createSnapshotScope(){}},
  './documents.mjs':{macDocumentFactory(){},macDocumentAuthority(){},documentDescription:''},
  './consumers.mjs':{createSettingsConsumers(){},businessConfig:schema},
  '../apfs-tree/project-tree.mjs':{createProjectTree:()=>({})},
 };
 const module=new SourceTextModule(await readFile(new URL('./runtime.mjs',import.meta.url),'utf8'));
 await module.link(async name=>{const values=deps[name]??await import(name),keys=Object.keys(values);return new SyntheticModule(keys,function(){for(const key of keys)this.setExport(key,values[key]);});});
 await module.evaluate();const budgetPath=join(source,'budget.json');
 await assert.rejects(module.namespace.apply(ctx,{source,memory:join(source,'memory'),locks:join(source,'locks'),budgetPath,p1:{enabled:true,budgetPath,initialSpentCny:0},business:{},shutdownMs:100}),{code:'ENOENT'});
 return {hooks,agent,cancelled,source};
}
test('closed dedicated runtime refuses an unknown caller before the provider callback',async()=>{
 const f=await fixture();let dispatched=0;
 await assert.rejects(f.hooks.get('agent/request')({agent:{id:'unknown',session:{header:{cwd:f.source}}},signal:new AbortController().signal},async()=>{dispatched++;return {};}),{code:'SEP_MAC_AGENT_SCOPE'});
 assert.equal(dispatched,0);
});
test('non-exact cwd cannot skip dedicated runtime admission',async()=>{
 const f=await fixture();let dispatched=0;
 await assert.rejects(f.hooks.get('agent/request')({agent:f.agent,signal:new AbortController().signal},async()=>{dispatched++;return {};}),{code:'SEP_MAC_AGENT_SCOPE'});
 assert.equal(dispatched,0);
});
test('dedicated runtime close cancels registered work despite non-exact cwd',async()=>{
 const f=await fixture();assert.deepEqual(f.cancelled,[{kind:'disposed'}]);
});
test('matching caller still observes the closed runtime gate',async()=>{
 const f=await fixture();f.agent.session.header.cwd=f.source;let dispatched=0;
 await assert.rejects(f.hooks.get('agent/request')({agent:f.agent,signal:new AbortController().signal},async()=>{dispatched++;return {};}),{code:'SEP_MAC_CLOSED'});assert.equal(dispatched,0);
});
test('registered caller without a session is classified before dispatch',async()=>{
 const f=await fixture();delete f.agent.session;let dispatched=0;
 await assert.rejects(f.hooks.get('agent/request')({agent:f.agent,signal:new AbortController().signal},async()=>{dispatched++;return {};}),{code:'SEP_MAC_AGENT_SCOPE'});assert.equal(dispatched,0);
});
