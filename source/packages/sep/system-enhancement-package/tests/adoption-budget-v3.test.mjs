import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Budget} from '../src/budget-ledger.js';
import {inspectAdoptionBudget,acquireAdoptionBudgetLease} from '../src/p2/adoption-budget.js';
async function fixture(){const root=await mkdtemp(join(tmpdir(),'sep-adoption-budget-v3-')),budgetPath=join(root,'budget.json'),budget=new Budget(budgetPath,{limit:100,initialSpent:.25});await budget.init();const config={enabled:true,modules:{rag:true,memory:true,media:false},p1:{enabled:true,budgetPath,limitCny:100,initialSpentCny:.25,model:'deepseek-flash',maxTokens:1024}};return {root,budgetPath,budget,config};}
async function state(f){const bytes=await readFile(f.budgetPath),info=await stat(f.budgetPath);return {bytes:bytes.toString('base64'),mtimeMs:info.mtimeMs,files:(await readdir(f.root)).sort()};}
const scope={kind:'task',taskId:'SYNTHETIC_PRIVATE_TASK',rootSessionId:'SYNTHETIC_PRIVATE_SESSION',rootTurn:1};
const usage={prompt_tokens:100,completion_tokens:10};
test('v3 admission preserves session policies, reconcilations and exact bytes without leaking identities',async()=>{
 const f=await fixture();await f.budget.setSessionDefaultLimit(250,{expectedRevision:0});await f.budget.setSessionLimit(scope.rootSessionId,1,{expectedRevision:1});
 await f.budget.reserve('SYNTHETIC_PRIVATE_REQUEST',1,{scope,model:'deepseek-flash'});await f.budget.settle('SYNTHETIC_PRIVATE_REQUEST',.8,usage);await f.budget.reconcile('SYNTHETIC_PRIVATE_REQUEST',{chargeCny:.3,evidence:{kind:'verified-usage',reference:'SYNTHETIC_PRIVATE_RECEIPT'}});
 const before=await state(f),proof=await inspectAdoptionBudget(f);assert.equal(proof.status,'verified');assert.equal(proof.ledgerVersion,3);assert.equal(proof.accountedCny,.55);assert.equal(proof.remainingCny,99.45);assert.equal(proof.reconciliationCount,1);assert.doesNotMatch(JSON.stringify(proof),/SYNTHETIC_PRIVATE/);assert.deepEqual(await state(f),before);
 const reopened=new Budget(f.budgetPath,{limit:100,initialSpent:.25});assert.deepEqual(await reopened.sessionDefaultsSnapshot(),{limitCny:250,revision:1});assert.equal((await reopened.sessionSnapshot(scope.rootSessionId)).limitCny,1);assert.equal((await reopened.sessionSnapshot(scope.rootSessionId)).accountedUpperBoundCny,.3);
});
test('v3 unknown pending charges still block admission even when session default exceeds the shared cap',async()=>{const f=await fixture();await f.budget.setSessionDefaultLimit(1000,{expectedRevision:0});await f.budget.reserve('SYNTHETIC_PENDING',.4,{scope,model:'deepseek-flash'});await f.budget.markDispatched('SYNTHETIC_PENDING');await f.budget.markUnknown('SYNTHETIC_PENDING');const before=await state(f);await assert.rejects(inspectAdoptionBudget(f),{code:'P2_ADOPTION_BUDGET_UNRESOLVED'});assert.deepEqual(await state(f),before);});
test('v3 session exhaustion does not masquerade as shared exhaustion or silently reopen that session',async()=>{const f=await fixture();await f.budget.setSessionLimit(scope.rootSessionId,.5,{expectedRevision:0});await f.budget.reserve('SYNTHETIC_DONE',.5,{scope,model:'deepseek-flash'});await f.budget.settle('SYNTHETIC_DONE',.5,usage);const before=await state(f),proof=await inspectAdoptionBudget(f);assert.equal(proof.status,'verified');assert.equal(proof.accountedCny,.75);assert.equal(proof.remainingCny,99.25);assert.deepEqual(await state(f),before);await assert.rejects(f.budget.reserve('SYNTHETIC_REFUSED',.01,{scope:{...scope,rootTurn:2,taskId:'next-task'}}),{code:'SESSION_BUDGET_EXCEEDED'});});
for(const [label,mutate] of [
 ['missing session default',state=>{delete state.sessionDefault;}],
 ['negative default',state=>{state.sessionDefault.limitCny=-1;}],
 ['fractional revision',state=>{state.sessionDefault.revision=.5;}],
 ['corrupt session override',state=>{state.sessionLimits[scope.rootSessionId]={limitCny:0,revision:1};}],
 ['unknown migration version',state=>{state.sessionMigration={sourceVersion:7,sourceSha256:'a'.repeat(64),createdAt:'2026-09-28T00:00:00Z'};}],
])test('v3 admission rejects '+label+' without modifying the ledger',async()=>{const f=await fixture(),value=JSON.parse(await readFile(f.budgetPath));mutate(value);await writeFile(f.budgetPath,JSON.stringify(value));const before=await state(f);await assert.rejects(inspectAdoptionBudget(f),{code:'P2_ADOPTION_BUDGET_INVALID'});assert.deepEqual(await state(f),before);});
test('v3 admission still binds shared configuration regardless of higher per-session allowances',async()=>{const f=await fixture();await f.budget.setSessionDefaultLimit(1000000,{expectedRevision:0});const before=await state(f);f.config.p1.limitCny=99;await assert.rejects(inspectAdoptionBudget(f),{code:'P2_ADOPTION_BUDGET_CONFIG'});assert.deepEqual(await state(f),before);});
test('v3 admission lease reads under its own lock and leaves all policies and bytes unchanged',async()=>{const f=await fixture();await f.budget.setSessionDefaultLimit(200,{expectedRevision:0});const before=await state(f),lease=await acquireAdoptionBudgetLease({...f,transactionId:randomUUID()});try{assert.equal((await lease.inspect()).ledgerVersion,3);await assert.rejects(inspectAdoptionBudget(f),{code:'P2_ADOPTION_BUDGET_BUSY'});}finally{await lease.close();}assert.deepEqual(await state(f),before);});
