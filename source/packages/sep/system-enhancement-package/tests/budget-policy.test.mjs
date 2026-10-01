import test from 'node:test';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {Budget}=await import(pathToFileURL(join(root,'src/deepseek.js')));
const {summarizeBudget}=await import(pathToFileURL(join(root,'src/budget-ledger.js')));
async function setup(options={}){const dir=await mkdtemp(join(tmpdir(),'sep-budget-policy-'));const path=join(dir,'budget.json');const b=new Budget(path,{limit:100,taskLimitCny:5,...options});await b.init();return {b,dir,path};}
const meta=taskId=>({taskId,model:'deepseek-flash'});
test('one task exhaustion leaves another task allowance while preserving cumulative cap',async()=>{
 const {b}=await setup();await b.reserve('first',4.8,meta('task-a'));await b.settle('first',4.8,{prompt_tokens:100,completion_tokens:10});
 await assert.rejects(b.reserve('second',.3,meta('task-a')),e=>e.code==='TASK_BUDGET_EXCEEDED'&&e.message.includes('task'));
 await b.reserve('other',.3,meta('task-b'));const s=await b.snapshot('task-b');assert.equal(s.taskAccountedCny,.3);assert.equal(s.accountedCny,5.1);assert.equal(s.limit,100);
});
test('parallel tasks still share one atomic cumulative cap',async()=>{const {b}=await setup({limit:1});const outcomes=await Promise.allSettled([b.reserve('a',.6,meta('a')),b.reserve('b',.6,meta('b'))]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.match(outcomes.find(x=>x.status==='rejected').reason.message,/cumulative/);});
test('read-only snapshot does not rewrite or create ledger',async()=>{const dir=await mkdtemp(join(tmpdir(),'sep-budget-read-'));const path=join(dir,'ledger.json');const b=new Budget(path,{limit:100});await b.snapshot();assert.deepEqual(await readdir(dir),[]);await b.init();const before=await stat(path);await b.snapshot();assert.equal((await stat(path)).mtimeMs,before.mtimeMs);});
test('v1 migration preserves exact original bytes and does not forgive unknown reservations',async()=>{const {path,dir}=await setup();const old={version:1,currency:'CNY',limit:100,initialSpent:3.910074,entries:[{id:'old',status:'reserved',reservedCny:4.290402,createdAt:'2026-09-20T00:00:00Z'}]};const bytes=JSON.stringify(old);await writeFile(path,bytes);const b=new Budget(path,{limit:100});await b.init();const s=await b.snapshot();assert.equal(s.version,3);assert.equal(s.accountedCny,8.200476);assert.equal(s.legacyUnverifiedCny,8.200476);const backup=(await readdir(dir)).find(n=>/\.v1-[a-f0-9]{64}\.checkpoint$/.test(n));assert.ok(backup);assert.equal(await readFile(join(dir,backup),'utf8'),bytes);await b.init();assert.equal((await readdir(dir)).filter(n=>n.endsWith('.checkpoint')).length,1);});
test('cancelling before dispatch releases only that reservation and preserves its audit',async()=>{const {b}=await setup();await b.reserve('cancelled',.8,meta('task'));await b.releasePrepared('cancelled','cancelled-before-dispatch');const s=await b.snapshot('task');assert.equal(s.accountedCny,0);assert.equal(s.entries[0].status,'released');assert.equal(s.entries[0].reservedCny,.8);});
test('dispatched or unknown requests cannot be released as never sent',async()=>{const {b}=await setup();await b.reserve('sent',.8,meta('task'));await b.markDispatched('sent');await b.markUnknown('sent');await assert.rejects(b.releasePrepared('sent','cancelled'),e=>e.code==='BUDGET_OUTCOME_UNKNOWN');assert.equal((await b.snapshot()).accountedCny,.8);});
test('settlement preserves price and cache evidence and is not double counted',async()=>{const {b}=await setup();await b.reserve('cached',1,meta('task'));await b.markDispatched('cached');await b.settle('cached',.02,{prompt_tokens:10000,completion_tokens:100},{usageDetail:{inputTokens:100,cacheReadTokens:9900,cacheWriteTokens:0,outputTokens:100},priceVersion:'test-rate',basis:'usage-peak-upper-bound',estimateCny:.01});const s=await b.snapshot();assert.equal(s.accountedCny,.02);assert.equal(s.entries[0].accounting.usageDetail.cacheReadTokens,9900);assert.equal(s.entries[0].accounting.estimateCny,.01);await assert.rejects(b.settle('cached',.02,{prompt_tokens:10000,completion_tokens:100}),e=>e.code==='UNKNOWN_RESERVATION');});
test('invalid or underestimated settlements retain reservation for reconciliation',async()=>{const {b}=await setup();await b.reserve('x',.1,meta('task'));for(const cost of [-1,NaN,Infinity,.2])await assert.rejects(b.settle('x',cost,{prompt_tokens:1,completion_tokens:1}));assert.equal((await b.snapshot()).accountedCny,.1);});
test('reload cannot reset cumulative or existing task caps',async()=>{const {path,b}=await setup({limit:10,taskLimitCny:1});await b.reserve('x',.8,meta('task'));const reopened=new Budget(path,{limit:100,taskLimitCny:5});await reopened.init();await assert.rejects(reopened.reserve('y',.3,meta('task')),e=>e.code==='TASK_BUDGET_EXCEEDED');assert.equal((await reopened.snapshot()).limit,10);});
test('child scope persists across reload and rejects reparenting',async()=>{const {b,path}=await setup();const scope={kind:'task',taskId:'parent',rootSessionId:'session-a',rootTurn:3};await b.bindChild('child',scope);assert.deepEqual(await new Budget(path,{limit:100}).getChildBinding('child'),scope);await assert.rejects(b.bindChild('child',{...scope,rootTurn:4}),e=>e.code==='BUDGET_SCOPE_CONFLICT');});
test('owner reconciliation appends a bounded correction and never increases spending authority',async()=>{const {b}=await setup();await b.reserve('old',1,meta('task'));await b.settle('old',.8,{prompt_tokens:100,completion_tokens:10});await b.reconcile('old',{chargeCny:.1,evidence:{kind:'provider-receipt',reference:'receipt-sha256'}});const s=await b.snapshot();assert.equal(s.accountedCny,.1);assert.equal(s.entries[0].chargeCeilingCny,.8);assert.equal(s.reconciliations.length,1);assert.equal(s.limit,100);await assert.rejects(b.reconcile('old',{chargeCny:0,evidence:{kind:'age-only',reference:'old'}}));});
test('pending outcome cannot be discounted before a late settlement',async()=>{const {b}=await setup();await b.reserve('pending',1,meta('task'));await b.markDispatched('pending');await b.markUnknown('pending');await assert.rejects(b.reconcile('pending',{chargeCny:.1,evidence:{kind:'provider-receipt',reference:'candidate-only'}}),{code:'BUDGET_RECONCILIATION_INVALID'});await b.settle('pending',.8,{prompt_tokens:100,completion_tokens:10});assert.equal((await b.snapshot()).accountedCny,.8);});
test('unattributed background requests retain cumulative protection without a lifetime task cap',async()=>{const {b}=await setup();await b.reserve('background',6,{scope:{kind:'background',taskId:'background',category:'compaction'}});assert.equal((await b.snapshot()).accountedCny,6);});

test('displayed remaining balance never rounds above the configured total cap',async()=>{const {b}=await setup({initialSpent:99.113406});const s=await b.snapshot();assert.equal(s.remainingCny,.886594);assert.equal(s.accountedCny+s.remainingCny,100);});

for(const [label,primary] of [
 ['ordinary Error',Object.assign(new Error('synthetic first transaction error'),{code:'FIRST_TRANSACTION_FAILURE'})],
 ['frozen Error',Object.freeze(Object.assign(new Error('synthetic frozen failure'),{code:'FIRST_FROZEN_FAILURE'}))],
 ['null',null],['undefined',undefined],['string','synthetic first primitive failure'],['zero',0],
])test(`cleanup preserves the original ${label} rejection and records its own failure separately`,async()=>{
 const {b,path}=await setup(),before=await readFile(path,'utf8');
 await b.change(async()=>{await writeFile(path+'.lock','synthetic changed ownership');throw primary;}).then(
  ()=>assert.fail('the failed transaction must reject'),error=>assert.strictEqual(error,primary));
 assert.equal(await readFile(path,'utf8'),before);
 assert.equal(b.lastCleanupFailure.primaryFailure,true);
 assert.equal(b.lastCleanupFailure.published,false);
 assert.equal(b.lastCleanupFailure.errors.length,1);
 assert.equal(b.lastCleanupFailure.errors[0].code,'BUDGET_LOCK_LOST');
});

test('successful ledger publication followed by cleanup failure still rejects and records publication',async()=>{
 const {b,path}=await setup();
 // change() clones its result after atomic publication. Inject only the release
 // fault at that boundary, without replacing the filesystem or budget code.
 const result={get publicationReceipt(){writeFileSync(path+'.lock','synthetic changed ownership after publication');return 'synthetic';}};
 await assert.rejects(b.change(state=>{state.initialSpent=.25;return result;}),{code:'BUDGET_LOCK_LOST'});
 assert.equal(JSON.parse(await readFile(path,'utf8')).initialSpent,.25);
 assert.equal(b.lastCleanupFailure.primaryFailure,false);
 assert.equal(b.lastCleanupFailure.published,true);
 assert.equal(b.lastCleanupFailure.errors[0].code,'BUDGET_LOCK_LOST');
});

test('shared totals add original amounts in integer micro-CNY without an extra floating-point micro',()=>{
 const state={version:2,limit:100,initialSpent:.25,legacyInitialSpent:true,reconciliations:[],entries:[
  {id:'reserved',status:'reserved',reservedCny:98.863403,legacy:true},
  {id:'settled',status:'settled',chargeCeilingCny:.000003,legacy:true},
 ]};
 const result=summarizeBudget(state);
 assert.equal(result.accountedCny,99.113406);
 assert.equal(result.remainingCny,.886594);
 assert.equal(result.legacyUnverifiedCny,99.113406);
});

test('summary decimal conversion handles scientific sub-micro amounts conservatively',()=>{
 const state={version:2,limit:1e-5,initialSpent:1e-7,reconciliations:[],entries:[{id:'tiny',status:'reserved',reservedCny:2e-7}]};
 assert.equal(summarizeBudget(state).accountedCny,.000002);
 assert.equal(summarizeBudget(state).remainingCny,.000008);
});

test('unsafe micro-CNY accumulation is rejected rather than silently losing units',()=>{
 const state={version:2,limit:100,initialSpent:Number.MAX_SAFE_INTEGER,reconciliations:[],entries:[]};
 assert.throws(()=>summarizeBudget(state),{code:'BUDGET_AMOUNT_OVERFLOW'});
});

test('reservation at the exact remaining cumulative cap is not refused by floating-point addition',async()=>{
 const {b}=await setup({limit:99.113406,initialSpent:99.113403});
 await b.reserve('exact',.000003);
 assert.equal((await b.snapshot()).accountedCny,99.113406);
 assert.equal((await b.snapshot()).remainingCny,0);
});
