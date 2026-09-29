import test from 'node:test';
import assert from 'node:assert/strict';
import {createBudgetScopes} from '../src/budget-scope.js';
function fixture() {
 const agents=new Map(),bindings=new Map();const ctx={agents:{get:id=>agents.get(id)},sessions:{get:id=>agents.get(id)?.session}};
 const agent=(id,parent)=>{const a={id,status:'running',session:{id,header:{id,...(parent?{origin:'subagent',parentSession:parent}:{origin:'user'})}}};agents.set(id,a);return a;};
 const scopes=createBudgetScopes(ctx,{loadChildBinding:async id=>bindings.get(id)});
 return {agent,scopes,bindings};
}
test('title and compaction spend belongs to known root session without borrowing a turn',async()=>{
 const f=fixture(),a=f.agent('root');
 for(const purpose of ['session-title','compaction']){const s=await f.scopes.resolve({sessionId:a.id,purpose,signal:new AbortController().signal});assert.equal(s.kind,'background');assert.equal(s.rootSessionId,'root');assert.equal(s.rootTurn,undefined);}
});
test('late tool fallback retains known root session even with no active turn',()=>{
 const f=fixture(),a=f.agent('root');assert.equal(f.scopes.resolveTurn({agent:a}).rootSessionId,'root');
});
test('foreign unknown session metadata cannot assign budget ownership',async()=>{
 const f=fixture();f.agent('root');const s=await f.scopes.resolve({sessionId:'not-registered',purpose:'compaction'});assert.equal(s.rootSessionId,undefined);
});
test('restored child auxiliary costs follow its durable parent session',async()=>{
 const f=fixture(),root=f.agent('root'),child=f.agent('child','root');const signal=new AbortController().signal;
 const scope=f.scopes.captureTurn({agent:root,turn:2,signal});f.bindings.set('child',scope);
 await f.scopes.captureChild({agent:child,source:'resume'});
 const s=await f.scopes.resolve({sessionId:'child',purpose:'session-title'});assert.equal(s.kind,'background');assert.equal(s.rootSessionId,'root');assert.equal(s.rootTurn,undefined);
});
test('unbound child does not guess parent attribution from a mutable header',async()=>{
 const f=fixture();f.agent('root');f.agent('child','root');assert.equal((await f.scopes.resolve({sessionId:'child'})).rootSessionId,undefined);
});
