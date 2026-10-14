import test from 'node:test';
import assert from 'node:assert/strict';
import {instrumentAtAppEntry} from './inspector-entry.mjs';

function fixture(events){
 const calls=[];let listener;
 return {calls,client:{
  onEvent(fn){listener=fn;return()=>{listener=undefined;};},
  async call(method,params){calls.push([method,params]);if(method==='Debugger.setBreakpointByUrl')return{breakpointId:'app-entry'};
   if(method==='Runtime.runIfWaitingForDebugger'||method==='Debugger.resume'){const e=events.shift();if(e)queueMicrotask(()=>listener?.(e));}return{};},
 }};
}
test('does not run CJS instrumentation at the early Electron bootstrap pause',async()=>{
 const f=fixture([{method:'Debugger.paused',params:{hitBreakpoints:[],reason:'Break on start'}},{method:'Debugger.paused',params:{hitBreakpoints:['app-entry']}}]);
 let runs=0;await instrumentAtAppEntry(f.client,async()=>{runs++;assert.deepEqual(f.calls.map(x=>x[0]),['Debugger.enable','Debugger.setBreakpointByUrl','Runtime.runIfWaitingForDebugger','Debugger.resume']);},{timeoutMs:1000});
 assert.equal(runs,1);assert.deepEqual(f.calls.slice(-2).map(x=>x[0]),['Debugger.removeBreakpoint','Debugger.resume']);
});
test('entry breakpoint can be the first pause',async()=>{
 const f=fixture([{method:'Debugger.paused',params:{hitBreakpoints:['app-entry']}}]);let called=false;await instrumentAtAppEntry(f.client,()=>{called=true;},{timeoutMs:1000});assert(called);
});
test('missing entry has a bounded deadline and never instruments',async()=>{
 const f=fixture([]);await assert.rejects(instrumentAtAppEntry(f.client,()=>assert.fail(),{timeoutMs:10}),{message:'INSPECTOR_APP_ENTRY_DEADLINE'});
});
test('instrumentation failure removes breakpoint without resuming product code',async()=>{
 const f=fixture([{method:'Debugger.paused',params:{hitBreakpoints:['app-entry']}}]);await assert.rejects(instrumentAtAppEntry(f.client,()=>{throw Error('fixture');},{timeoutMs:1000}),{message:'fixture'});
 assert.equal(f.calls.at(-1)[0],'Debugger.removeBreakpoint');assert.equal(f.calls.filter(x=>x[0]==='Debugger.resume').length,0);
});
