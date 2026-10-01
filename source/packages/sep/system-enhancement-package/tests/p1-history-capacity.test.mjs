import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {installP1,p1Config} from '../src/p1.js';
import {openStore} from '../src/store.js';
async function fixture(t,{config:patch={},start}={}){
 const root=await mkdtemp(join(tmpdir(),'sep-p1-history-'));const file=join(root,'synthetic-store.json'),project={key:'project',root};
 const facility={async open(spec){let body;try{body=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;body={projects:{},media:{}};}return {table(name){return {get:key=>structuredClone(body[name][key]),entries:()=>Object.entries(body[name])[Symbol.iterator](),async put(key,value){spec.tables[name].valueSchema.parse(value);const next=structuredClone(body);next[name][key]=structuredClone(value);await writeFile(file,JSON.stringify(next));body=next;},async delete(key){delete body[name][key];await writeFile(file,JSON.stringify(body));}};},close:async()=>{}};}};
 let store=await openStore(facility,join(root,'lock'));const effects=[],listeners=new Map(),agents=new Map(),lifetime=new AbortController();let turn=1;
 const events=[],agent={id:'parent',session:{id:'parent',header:{id:'parent',origin:'user',cwd:root},snapshotEvents:()=>[{type:'turn/start',data:{turn}},...events],append:(type,data)=>events.push({type,data})},steer(){throw Error('No checks configured');}};agents.set(agent.id,agent);
 const ctx={get:n=>n==='sessions'?{list:()=>[agent.session]}:{},agents:{get:id=>agents.get(id)},llm:{},subagents:{getProvider:()=>({}),start:start??(async()=>({id:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:'synthetic child result'}]}),dispose:async()=>{}}))},tools:{guard(){},get:()=>({})},effect:fn=>effects.push(fn()),on:(name,fn)=>{const rows=listeners.get(name)??[];rows.push(fn);listeners.set(name,rows);}};
 const config=Object.assign(p1Config.parse({enabled:true,budgetPath:join(root,'budget.json')}),patch);
 const api=await installP1(ctx,{config,scope:{projects:[project],caller:async()=>project},store,signal:lifetime.signal,track:p=>p});
 t.after(async()=>{lifetime.abort();for(const dispose of effects)await dispose();await store.close();});
 const exec={agent,signal:new AbortController().signal};
 return {api,project,exec,file,get store(){return store;},async reopen(){await store.close();store=await openStore(facility,join(root,'lock'));return store.read(project);},async stop(){for(const fn of listeners.get('agent/turn-stopping')??[])await fn({agent,turn:turn++,signal:exec.signal});}};
}
test('more than 200 explicit reviews remain intact after closing and reopening the project store',async t=>{
 const f=await fixture(t),ids=[];
 for(let i=0;i<205;i++)ids.push((await f.api.review(f.project,{},f.exec)).id);
 assert.equal(new Set(ids).size,205);const saved=await f.reopen();assert.deepEqual(saved.workflow.reviews.map(row=>row.id),ids);
});
test('automatic turn stop without configured criteria creates no permanent not_run history',async t=>{
 const f=await fixture(t);for(let i=0;i<205;i++)await f.stop();assert.equal(f.store.read(f.project).workflow?.reviews.length??0,0);
 const explicit=await f.api.review(f.project,{},f.exec);assert.equal(explicit.status,'not_run');assert.equal(f.store.read(f.project).workflow.reviews.length,1);
});
test('new managed runs retain prior 200 settled records and an existing active record',async t=>{
 const f=await fixture(t),prior=Array.from({length:199},(_,i)=>({id:'past-'+i,parentSessionId:'parent',status:'completed'}));prior.push({id:'still-active',parentSessionId:'parent',status:'running'});
 await f.store.transaction(f.project,state=>{state.workflow={runs:prior,reviews:[]};});
 const result=await f.api.delegate(f.project,{tasks:[{label:'new',prompt:'synthetic'}]},f.exec);assert.equal(result.runs[0].status,'completed');assert.equal(result.publicationPersisted,true);
 const rows=(await f.reopen()).workflow.runs;assert.equal(rows.length,201);assert.deepEqual(rows.slice(0,200),prior);
});
test('UTF-8 workflow byte limit refuses growth without altering stored history or publishing a row',async t=>{
 const cap=1024*1024,f=await fixture(t,{config:{historyMaxBytes:cap}});
 const history={runs:[{id:'retained',parentSessionId:'parent',status:'completed',output:'汉'.repeat(300000)}],reviews:[]};
 history.runs[0].output+='x'.repeat(cap-50-Buffer.byteLength(JSON.stringify(history)));
 assert.equal(Buffer.byteLength(JSON.stringify(history)),cap-50);
 await f.store.transaction(f.project,state=>{state.workflow=history;});const before=await readFile(f.file);
 await assert.rejects(f.api.review(f.project,{},f.exec),{code:'P1_HISTORY_BYTES_LIMIT'});
 assert.deepEqual(await readFile(f.file),before);assert.equal(f.store.read(f.project).workflow.reviews.length,0);
});
test('task pages retain parent-session isolation, exact IDs and bounded result bytes',async t=>{
 const f=await fixture(t),rows=Array.from({length:45},(_,i)=>({id:'r'+i,parentSessionId:'parent',status:'completed',output:'汉'.repeat(7000)}));rows.push({id:'foreign',parentSessionId:'other',status:'completed'});
 await f.store.transaction(f.project,state=>{state.workflow={runs:rows,reviews:[]};});
 const seen=[];let offset=0;
 do{const page=f.api.tasks(f.project,{offset,limit:20},f.exec);assert.ok(Buffer.byteLength(JSON.stringify(page))<=65536);seen.push(...page.runs.map(row=>row.id));offset=page.nextOffset;}while(offset!==null&&offset!==undefined);
 assert.equal(seen.length,45);assert.equal(new Set(seen).size,45);assert.ok(!seen.includes('foreign'));
 assert.deepEqual(f.api.tasks(f.project,{id:'r0'},f.exec).runs,[rows[0]]);assert.deepEqual(f.api.tasks(f.project,{id:'foreign'},f.exec).runs,[]);
});
test('concurrent explicit reviews leave reserved space for an admitted child final report',async t=>{
 let entered,complete;const ready=new Promise(r=>entered=r),result=new Promise(r=>complete=r),cap=1024*1024;
 const f=await fixture(t,{config:{historyMaxBytes:cap},start:async()=>{entered();return {id:'child',result,dispose:async()=>{}};}});
 const history={runs:[{id:'prior',parentSessionId:'parent',status:'completed',output:''}],reviews:[]};
 history.runs[0].output='x'.repeat(cap-65536-2000-Buffer.byteLength(JSON.stringify(history)));
 await f.store.transaction(f.project,state=>{state.workflow=history;});
 const delegated=f.api.delegate(f.project,{tasks:[{label:'bounded',prompt:'synthetic'}]},f.exec).catch(error=>error);await ready;
 let blocked=false;
 for(let i=0;i<400;i++){try{await f.api.review(f.project,{},f.exec);}catch(error){assert.equal(error.code,'P1_HISTORY_BYTES_LIMIT');blocked=true;break;}}
 assert.equal(blocked,true);complete({stopReason:'completed',output:[{type:'text',text:'汉'.repeat(10000)}]});
 const report=await delegated;assert.equal(report.publicationPersisted,true);assert.equal(report.runs[0].status,'completed');
 const saved=f.store.read(f.project).workflow;assert.equal(saved.runs[0].output,history.runs[0].output);assert.ok(Buffer.byteLength(JSON.stringify(saved))<=cap);
});
test('invalid configured history capacity is rejected instead of disabling the bound',()=>{
 for(const historyMaxBytes of [0,1024*1024-1,64*1024*1024+1,Infinity,1.5])assert.throws(()=>p1Config.parse({budgetPath:'synthetic',historyMaxBytes}));
});
