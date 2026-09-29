import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,stat,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {acquireBudgetLock} from '../src/budget-lock.js';
import {Budget} from '../src/budget-ledger.js';
const api=await import('../src/budget-legacy-reconcile.js').catch(error=>{if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;return {};});
const plan=input=>{assert.equal(typeof api.planLegacyBudgetReconciliation,'function','read-only plan implementation required');return api.planLegacyBudgetReconciliation(input);};
const apply=input=>{assert.equal(typeof api.applyLegacyBudgetReconciliation,'function','explicit apply implementation required');return api.applyLegacyBudgetReconciliation(input);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
function rehash(p){const {planHash,...body}=p;return {...body,planHash:hash(JSON.stringify(stable(body)))};}
const code=expected=>e=>e.code===expected&&e.message===expected;
const entry=(id='SYNTHETIC_PRIVATE_A',more={})=>({id,status:'settled',model:'deepseek-flash',reservedCny:.5,createdAt:'2026-09-12T00:00:00.000Z',finishedAt:'2026-09-12T00:01:00.000Z',chargeCeilingCny:.309,usage:{prompt_tokens:100000,completion_tokens:1000},inputSha256:'a'.repeat(64),...more});
const ledger=entries=>({version:1,currency:'CNY',limit:100,initialSpent:.25,entries});
const unknown=()=>({id:'SYNTHETIC_PRIVATE_UNKNOWN',status:'reserved',model:'deepseek-flash',reservedCny:.4,createdAt:'2026-09-12T01:00:00.000Z'});
async function fixture(value=ledger([entry()])){const root=await mkdtemp(join(tmpdir(),'sep-legacy-reconcile-')),budgetPath=join(root,'budget.json');await writeFile(budgetPath,JSON.stringify(value)+'\n');return {root,budgetPath};}
async function unchanged(f,fn){const before=await readFile(f.budgetPath);await fn();assert.deepEqual(await readFile(f.budgetPath),before);}
const cli=resolve('tools/budget-reconcile.mjs');
function runCli(args){return spawnSync(process.execPath,[cli,...args],{encoding:'utf8',windowsHide:true});}

test('plan is deterministic, read-only and preserves Pro, reservations and initial spending',async()=>{
 const f=await fixture(ledger([entry(),entry('SYNTHETIC_PRIVATE_B',{model:'deepseek-v4-pro'}),unknown()]));
 const before=await readFile(f.budgetPath),names=await readdir(f.root),mtime=(await stat(f.budgetPath)).mtimeMs;
 const p=await plan(f),again=await plan(f);
 assert.deepEqual(p,again);assert.equal(p.isInvoice,false);assert.equal(p.source.sha256,hash(before));assert.equal(p.source.entries,3);
 assert.equal(p.corrections.length,1);assert.equal(p.corrections[0].entryIndex,0);assert.equal(p.corrections[0].before.chargeCeilingCny,.309);assert.equal(p.corrections[0].newChargeCny,.208);
 assert.equal(p.summary.initialSpentCny,.25);assert.equal(p.summary.reservedCny,.4);assert.equal(p.summary.beforeAccountedCny,1.268);assert.equal(p.summary.afterAccountedUpperBoundCny,1.167);assert.equal(p.summary.reductionCny,.101);
 assert.equal(p.rule.officialImageSha256,'701177bc7d46edd0faf9a761123f89196ae0d2bbd70e69ba272028c641f1582c');
 assert.equal(p.rule.cacheAssumption,'all-input-cache-miss');assert.deepEqual(await readFile(f.budgetPath),before);assert.deepEqual(await readdir(f.root),names);assert.equal((await stat(f.budgetPath)).mtimeMs,mtime);
});

test('only exact Flash name is eligible; documented aliases still remain outside this one-time rule',async()=>{
 const f=await fixture(ledger([entry(),entry('alias-v4',{model:'deepseek-v4-flash'}),entry('alias-vision',{model:'deepseek-v4-flash-vision-exp'})]));
 const p=await plan(f);assert.equal(p.corrections.length,1);assert.equal(p.summary.retainedEntries,2);
});

test('time window is inclusive at effective and fixed cutoff, but excludes earlier, straddling and later requests',async()=>{
 const f=await fixture(ledger([
  entry('effective',{createdAt:'2026-09-10T04:00:00.000Z',finishedAt:'2026-09-10T04:00:00.001Z'}),
  entry('straddling',{createdAt:'2026-09-10T03:59:59.999Z',finishedAt:'2026-09-10T04:00:00.001Z'}),
  entry('before',{createdAt:'2026-09-10T03:58:00.000Z',finishedAt:'2026-09-10T03:59:00.000Z'}),
  entry('cutoff',{createdAt:'2026-09-27T05:08:24.578Z',finishedAt:'2026-09-27T05:08:24.579Z'}),
  entry('future',{createdAt:'2026-09-27T05:08:24.578Z',finishedAt:'2026-09-27T05:08:24.580Z'})
 ]));
 const p=await plan(f);assert.deepEqual(p.corrections.map(c=>c.before.id),['effective','cutoff']);assert.equal(p.summary.retainedEntries,3);
});

test('timezone offsets and rollover timestamps are not treated as verified UTC evidence',async()=>{
 const f=await fixture(ledger([entry(),entry('offset',{createdAt:'2026-09-12T08:00:00+08:00',finishedAt:'2026-09-12T08:01:00+08:00'}),entry('rollover',{createdAt:'2026-02-30T00:00:00.000Z',finishedAt:'2026-03-03T00:00:00.000Z'})]));
 const p=await plan(f);assert.equal(p.corrections.length,1);assert.equal(p.summary.retainedEntries,2);
});

test('a non-matching legacy amount or zero-cost entry never receives a fabricated discount',async()=>{
 const f=await fixture(ledger([entry(),entry('wrong-formula',{chargeCeilingCny:.308}),entry('zero',{chargeCeilingCny:0,usage:{prompt_tokens:0,completion_tokens:0}})]));
 const p=await plan(f);assert.equal(p.corrections.length,1);assert.equal(p.summary.retainedEntries,2);
});

for(const [label,mutate] of [
 ['v2',v=>{v.version=2;v.taskLimits={};v.childBindings={};v.reconciliations=[];}],
 ['v3',v=>{v.version=3;v.taskLimits={};v.childBindings={};v.reconciliations=[];v.sessionDefault={limitCny:100,revision:0};v.sessionLimits={};}],
 ['unknown version',v=>{v.version=7;}],
 ['invalid usage',v=>{v.entries[0].usage.prompt_tokens=.5;}],
 ['unsafe usage integer',v=>{v.entries[0].usage.prompt_tokens=Number.MAX_SAFE_INTEGER+1;}],
 ['negative charge',v=>{v.entries[0].chargeCeilingCny=-1;}],
 ['non-micro initial amount',v=>{v.initialSpent=.2500001;}],
 ['bad timestamp',v=>{v.entries[0].createdAt='private-invalid';}]
])test('plan refuses unsupported or corrupt original history: '+label,async()=>{
 const value=ledger([entry()]);mutate(value);const f=await fixture(value);await unchanged(f,()=>assert.rejects(plan(f),code(label==='v2'||label==='v3'||label==='unknown version'?'LEGACY_RECONCILE_VERSION':'LEGACY_RECONCILE_INVALID')));
});

test('explicit apply makes one v3 correction set and keeps exact v1 checkpoint and unmodified original charges',async()=>{
 const original=ledger([entry(),entry('SYNTHETIC_PRIVATE_B'),unknown()]),f=await fixture(original),bytes=await readFile(f.budgetPath),p=await plan(f);
 const result=await apply({...f,plan:p,expectedPlanHash:p.planHash});
 const current=JSON.parse(await readFile(f.budgetPath));
 assert.equal(result.status,'applied');assert.equal(result.appliedCorrections,2);assert.equal(current.version,3);assert.equal(current.limit,100);assert.equal(current.initialSpent,.25);
 assert.equal(current.reconciliations.length,2);assert.equal(current.reconciliations[0].chargeCny,.208);assert.equal(current.reconciliations[1].chargeCny,.208);
 assert.equal(current.entries[0].chargeCeilingCny,.309);assert.equal(current.entries[1].chargeCeilingCny,.309);assert.equal(current.entries[2].reservedCny,.4);assert.equal(current.entries[2].status,'reserved');assert.equal(current.entries[2].phase,'unknown');
 assert.deepEqual(current.taskLimits,{});assert.deepEqual(current.childBindings,{});assert.equal(current.migration.sourceSha256,hash(bytes));
 assert.deepEqual(await readFile(f.budgetPath+'.v1-'+hash(bytes)+'.checkpoint'),bytes);
 assert.equal(result.afterAccountedUpperBoundCny,1.066);assert.equal(result.isInvoice,false);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PRIVATE/);
});

test('apply requires an explicit matching plan hash before any budget mutation',async()=>{
 const f=await fixture(),p=await plan(f);
 for(const expectedPlanHash of [undefined,'bad','0'.repeat(64)])await unchanged(f,()=>assert.rejects(apply({...f,plan:p,expectedPlanHash}),code('LEGACY_RECONCILE_CONFIRMATION')));
 assert.deepEqual(await readdir(f.root),['budget.json']);
});

for(const [label,mutate] of [
 ['lower charge',p=>{p.corrections[0].newChargeCny=0;}],
 ['different original charge',p=>{p.corrections[0].before.chargeCeilingCny=.4;}],
 ['changed rule price',p=>{p.rule.newRates.input=0;}],
 ['changed image evidence',p=>{p.rule.officialImageSha256='0'.repeat(64);}],
 ['omitted correction',p=>{p.corrections=[];}],
 ['injected unrecognized field',p=>{p.unrecognized=true;}]
])test('even a rehashed altered plan cannot override recomputation: '+label,async()=>{
 const f=await fixture(),p=await plan(f);mutate(p);const changed=rehash(p);
 await unchanged(f,()=>assert.rejects(apply({...f,plan:changed,expectedPlanHash:changed.planHash}),code('LEGACY_RECONCILE_PLAN_MISMATCH')));
});

test('unknown reservation cannot be inserted into the correction set',async()=>{
 const f=await fixture(ledger([entry(),unknown()])),p=await plan(f);p.corrections.push({entryIndex:1,before:unknown(),newChargeCny:0});const changed=rehash(p);
 await unchanged(f,()=>assert.rejects(apply({...f,plan:changed,expectedPlanHash:changed.planHash}),code('LEGACY_RECONCILE_PLAN_MISMATCH')));
});

test('a whitespace-only source change invalidates the exact reviewed original bytes',async()=>{
 const f=await fixture(),p=await plan(f);await writeFile(f.budgetPath,JSON.stringify(ledger([entry()]),null,2));
 await unchanged(f,()=>assert.rejects(apply({...f,plan:p,expectedPlanHash:p.planHash}),code('LEGACY_RECONCILE_SOURCE_CHANGED')));
});

test('source is checked again after acquiring the real shared Budget lock',async()=>{
 const f=await fixture(),p=await plan(f),held=await acquireBudgetLock(f.budgetPath);
 const pending=apply({...f,plan:p,expectedPlanHash:p.planHash});let rejected;
 try{
  await new Promise(resolve=>setTimeout(resolve,150));await writeFile(f.budgetPath,JSON.stringify(ledger([entry('changed-during-wait')])));
  await held.release();await assert.rejects(pending,e=>{rejected=e.code;return e.code==='LEGACY_RECONCILE_SOURCE_CHANGED';});
  assert.equal(JSON.parse(await readFile(f.budgetPath)).version,1);
 }finally{await held.release();await pending.catch(()=>{});}
 assert.equal(rejected,'LEGACY_RECONCILE_SOURCE_CHANGED');
});

test('replay refuses the already migrated v3 instead of appending discounts again',async()=>{
 const f=await fixture(),p=await plan(f);await apply({...f,plan:p,expectedPlanHash:p.planHash});
 await unchanged(f,()=>assert.rejects(apply({...f,plan:p,expectedPlanHash:p.planHash}),code('LEGACY_RECONCILE_VERSION')));
});

test('hard-linked ledger cannot be reconciled through an unverified write alias',async()=>{
 const f=await fixture();await link(f.budgetPath,join(f.root,'alias.json'));
 await unchanged(f,()=>assert.rejects(plan(f),code('LEGACY_RECONCILE_PATH')));
});

test('a plan with no eligible requests cannot migrate a ledger or clear unknown reservations',async()=>{
 const f=await fixture(ledger([unknown()])),p=await plan(f);assert.equal(p.corrections.length,0);
 await unchanged(f,()=>assert.rejects(apply({...f,plan:p,expectedPlanHash:p.planHash}),code('LEGACY_RECONCILE_NO_ELIGIBLE_ENTRIES')));
});

test('a conflicting existing checkpoint blocks atomic publication rather than overwriting history',async()=>{
 const f=await fixture(),p=await plan(f),checkpoint=f.budgetPath+'.v1-'+p.source.sha256+'.checkpoint';
 await writeFile(checkpoint,'SYNTHETIC_OTHER_HISTORY');
 await unchanged(f,()=>assert.rejects(apply({...f,plan:p,expectedPlanHash:p.planHash}),e=>e.code==='BUDGET_CHECKPOINT_MISMATCH'));
 assert.equal(await readFile(checkpoint,'utf8'),'SYNTHETIC_OTHER_HISTORY');
});

test('CLI defaults to plan and prints only a receipt; apply requires the explicit hash',async()=>{
 const f=await fixture(),out=join(f.root,'plan.json'),before=await readFile(f.budgetPath);
 const planned=runCli(['--budget',f.budgetPath,'--out',out]);assert.equal(planned.status,0,planned.stderr);
 const p=JSON.parse(await readFile(out));assert.equal(JSON.parse(planned.stdout).status,'planned');assert.doesNotMatch(planned.stdout,/SYNTHETIC_PRIVATE|aaaaaaaaaaaa/);assert.deepEqual(await readFile(f.budgetPath),before);
 const denied=runCli(['apply','--budget',f.budgetPath,'--plan',out]);assert.notEqual(denied.status,0);assert.deepEqual(await readFile(f.budgetPath),before);
 const applied=runCli(['apply','--budget',f.budgetPath,'--plan',out,'--expected-plan-hash',p.planHash]);assert.equal(applied.status,0,applied.stderr);assert.equal(JSON.parse(applied.stdout).status,'applied');assert.doesNotMatch(applied.stdout,/SYNTHETIC_PRIVATE|aaaaaaaaaaaa/);
});

test('integer micro-CNY differences do not add a phantom micro-yuan to remaining allowance',async()=>{
 const tiny=entry('SYNTHETIC_TINY',{chargeCeilingCny:.000003,usage:{prompt_tokens:1,completion_tokens:0}});
 const held={...unknown(),reservedCny:98.863403};
 const f=await fixture(ledger([tiny,held])),p=await plan(f);
 assert.equal(p.summary.beforeAccountedCny,99.113406);assert.equal(p.summary.afterAccountedUpperBoundCny,99.113405);assert.equal(p.summary.remainingAfterCny,.886595);
});

test('a 591-entry synthetic correction batch preserves totals and unknown entries in one completed state',async()=>{
 const entries=Array.from({length:591},(_,i)=>entry('SYNTHETIC_BATCH_'+i,{reservedCny:.02,usage:{prompt_tokens:1000+i,completion_tokens:10+i%17},chargeCeilingCny:((1000+i)*3+(10+i%17)*9)/1000000}));
 const f=await fixture(ledger([...entries,unknown()])),p=await plan(f);
 assert.equal(p.corrections.length,591);assert.equal(p.summary.beforeAccountedCny,3.041543);assert.equal(p.summary.afterAccountedUpperBoundCny,2.265586);
 const result=await apply({...f,plan:p,expectedPlanHash:p.planHash}),value=JSON.parse(await readFile(f.budgetPath));
 assert.equal(result.appliedCorrections,591);assert.equal(value.reconciliations.length,591);assert.equal(value.entries.length,592);
 assert.equal(value.entries[591].status,'reserved');assert.equal(value.entries[591].reservedCny,.4);assert.equal(result.afterAccountedUpperBoundCny,2.265586);
});

test('CLI help exits successfully without planning or applying even when a ledger path is supplied',async()=>{
 const f=await fixture(),before=await readFile(f.budgetPath),names=await readdir(f.root);
 const result=runCli(['apply','--budget',f.budgetPath,'--help']);
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/--expected-plan-hash/);assert.match(result.stdout,/v1-only/);assert.match(result.stdout,/read-only/);
 assert.deepEqual(await readFile(f.budgetPath),before);assert.deepEqual(await readdir(f.root),names);
});


test('legacy correction publishes only the exact v3 session-policy migration and cannot invent ownership',async()=>{
 const f=await fixture(ledger([entry(),unknown()])),bytes=await readFile(f.budgetPath),p=await plan(f);
 await apply({...f,plan:p,expectedPlanHash:p.planHash});const value=JSON.parse(await readFile(f.budgetPath));
 assert.deepEqual(value.sessionDefault,{limitCny:100,revision:0});assert.deepEqual(value.sessionLimits,{});
 assert.equal(value.sessionMigration.sourceVersion,1);assert.equal(value.sessionMigration.sourceSha256,hash(bytes));assert.ok(Number.isFinite(Date.parse(value.sessionMigration.createdAt)));
 const view=await new Budget(f.budgetPath,{limit:100}).sessionSnapshot('never-attributed-session');
 assert.equal(view.accountedUpperBoundCny,0);assert.equal(view.unattributedSharedCny,.858);assert.equal(view.limitCny,100);
 assert.deepEqual(await readFile(f.budgetPath+'.v1-'+hash(bytes)+'.checkpoint'),bytes);
});

for(const [label,mutate] of [
 ['session default',state=>{state.sessionDefault={limitCny:200,revision:0};}],
 ['session override',state=>{state.sessionLimits={unexpected:{limitCny:200,revision:1}};}],
 ['migration fingerprint',state=>{state.sessionMigration={...state.sessionMigration,sourceSha256:'0'.repeat(64)};}],
])test('unexpected in-memory migration '+label+' prevents historical correction publication',async()=>{
 const f=await fixture(),p=await plan(f),original=Budget.prototype.change;
 Budget.prototype.change=function(fn,options){return original.call(this,async state=>{mutate(state);return fn(state);},options);};
 try{await unchanged(f,()=>assert.rejects(apply({...f,plan:p,expectedPlanHash:p.planHash}),code('LEGACY_RECONCILE_STATE_CHANGED')));}
 finally{Budget.prototype.change=original;}
});
