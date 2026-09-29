import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,readdir,link,unlink,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Budget} from '../src/deepseek.js';
import {inspectAdoptionBudget,acquireAdoptionBudgetLease} from '../src/p2/adoption-budget.js';

const sha=value=>createHash('sha256').update(value).digest('hex');
const code=expected=>error=>error.code===expected&&error.message===expected;
const stamp='2026-09-27T00:00:00.000Z';
const later='2026-09-27T00:01:00.000Z';
function settled(id='synthetic-settled'){return {id,status:'settled',reservedCny:1,createdAt:stamp,finishedAt:later,chargeCeilingCny:.8,model:'deepseek-flash',inputSha256:'a'.repeat(64),usage:{prompt_tokens:100,completion_tokens:10}};}
function ledger(version=2){return {version,currency:'CNY',limit:100,initialSpent:.25,entries:[],...(version===2?{taskLimits:{},childBindings:{},reconciliations:[],legacyInitialSpent:false}:{})};}
async function fixture(value=ledger()){
  const root=await mkdtemp(join(tmpdir(),'sep-adoption-budget-v2-')),budgetPath=join(root,'budget.json');
  if(value!==null)await writeFile(budgetPath,JSON.stringify(value));
  const config={enabled:true,modules:{rag:true,memory:true,media:false},p1:{enabled:true,budgetPath,limitCny:100,initialSpentCny:.25,model:'deepseek-flash',maxTokens:1024}};
  return {root,budgetPath,config};
}
async function state(f){const bytes=await readFile(f.budgetPath),s=await stat(f.budgetPath);return {bytes:bytes.toString('base64'),sha256:sha(bytes),mtimeMs:s.mtimeMs,size:s.size,files:(await readdir(f.root)).sort()};}
async function refused(f,expected){const before=await state(f);await assert.rejects(inspectAdoptionBudget(f),code(expected));assert.deepEqual(await state(f),before);}

test('v1 admission remains read-only and does not migrate or expose request identities',async()=>{
  const old=ledger(1);old.entries=[settled('SYNTHETIC_PRIVATE_ID')];const f=await fixture(old),before=await state(f),proof=await inspectAdoptionBudget(f);
  assert.equal(proof.version,1);assert.equal(proof.ledgerVersion,1);assert.equal(proof.accountedCny,1.05);assert.equal(proof.remainingCny,98.95);
  assert.deepEqual(proof.counts,{entries:1,reserved:0,settled:1});assert.equal(proof.fingerprint.sha256,before.sha256);assert.equal(proof.metadataOnly,true);assert.equal(proof.modelCalls,0);
  assert.doesNotMatch(JSON.stringify(proof),/SYNTHETIC_PRIVATE_ID|aaaaaaaaaaaaaaaa/);assert.deepEqual(await state(f),before);
});

test('v3 admission counts append-only reconciliation and prepared release without changing original ledger',async()=>{
  const f=await fixture(null),b=new Budget(f.budgetPath,{limit:100,initialSpent:.25,taskLimitCny:5});
  await b.init();await b.reserve('SYNTHETIC_ACCOUNTED',1,{model:'deepseek-flash',taskId:'root-task'});
  await b.settle('SYNTHETIC_ACCOUNTED',.8,{prompt_tokens:100,completion_tokens:10});
  await b.reconcile('SYNTHETIC_ACCOUNTED',{chargeCny:.1,evidence:{kind:'verified-usage',reference:'SYNTHETIC_EVIDENCE'}});
  await b.reserve('SYNTHETIC_NOT_SENT',.5,{model:'deepseek-flash',taskId:'root-task'});
  await b.releasePrepared('SYNTHETIC_NOT_SENT','cancelled-before-dispatch');
  const before=await state(f),proof=await inspectAdoptionBudget(f);
  assert.equal(proof.ledgerVersion,3);assert.equal(proof.settledCny,.1);assert.equal(proof.reservedCny,0);assert.equal(proof.accountedCny,.35);assert.equal(proof.remainingCny,99.65);
  assert.deepEqual(proof.counts,{entries:2,reserved:0,settled:1});assert.equal(proof.releasedCount,1);assert.equal(proof.reconciliationCount,1);
  assert.doesNotMatch(JSON.stringify(proof),/SYNTHETIC_ACCOUNTED|SYNTHETIC_NOT_SENT|SYNTHETIC_EVIDENCE|root-task/);assert.deepEqual(await state(f),before);
});

test('v2 verified corrections do not erase legacy uncertainty outside the corrected entry',async()=>{
  const value=ledger();value.legacyInitialSpent=true;value.entries=[{...settled('corrected'),legacy:true},{...settled('uncorrected'),legacy:true}];
  value.reconciliations=[{id:'correction',entryId:'corrected',chargeCny:.1,evidence:{kind:'provider-receipt',reference:'synthetic-receipt'},createdAt:later}];
  const f=await fixture(value),proof=await inspectAdoptionBudget(f);
  assert.equal(proof.accountedCny,1.15);assert.equal(proof.legacyUnverifiedCny,1.05);assert.equal(proof.settledCny,.9);
});

test('v2 corrections cannot reduce a reserved request before its final settlement',async()=>{
  const value=ledger();value.entries=[{id:'unresolved',status:'reserved',reservedCny:1,createdAt:stamp,phase:'unknown',legacy:true}];
  value.reconciliations=[{id:'correction',entryId:'unresolved',chargeCny:0,evidence:{kind:'provider-receipt',reference:'synthetic-receipt'},createdAt:later}];
  await refused(await fixture(value),'P2_ADOPTION_BUDGET_INVALID');
});

test('effective Profile output cap and task allowance are described instead of historical hard-coded output limits',async()=>{
  const f=await fixture();f.config.p1.profileLimits={maxOutputTokens:32768,maxInputBytes:250000};f.config.p1.taskLimitCny=5;
  const proof=await inspectAdoptionBudget(f);
  assert.equal(proof.profileInterception.maxTokens,32768);assert.equal(proof.profileInterception.taskLimitCny,5);
  assert.equal(proof.profileInterception.implementationScope,'current-p1-profile-hook');
});

test('valid task cap is accepted while an absent cap defaults to five yuan and invalid caps stay rejected',async()=>{
  const f=await fixture();assert.equal((await inspectAdoptionBudget(f)).profileInterception.taskLimitCny,5);
  for(const taskLimitCny of [1,100]){const config=structuredClone(f.config);config.p1.taskLimitCny=taskLimitCny;assert.equal((await inspectAdoptionBudget({...f,config})).profileInterception.taskLimitCny,taskLimitCny);}
  for(const taskLimitCny of [0,-1,100.01,'5']){const config=structuredClone(f.config);config.p1.taskLimitCny=taskLimitCny;await assert.rejects(inspectAdoptionBudget({...f,config}),code('P2_ADOPTION_BUDGET_CONFIG'));}
});

for(const [name,mutate]of [
  ['unsupported ledger version',v=>{v.version=3;}],
  ['unknown ledger field',v=>{v.unrecognized='SYNTHETIC_PRIVATE_BODY';}],
  ['duplicate request identity',v=>{v.entries.push(structuredClone(v.entries[0]));}],
  ['invalid timestamp',v=>{v.entries[0].createdAt='SYNTHETIC_PRIVATE_BODY';}],
  ['finish before creation',v=>{v.entries[0].finishedAt='2026-09-26T23:59:00.000Z';}],
  ['malformed input hash',v=>{v.entries[0].inputSha256='SYNTHETIC_NOT_A_HASH';}],
  ['unsupported charged model',v=>{v.entries[0].model='unapproved-model';}],
  ['zero reservation',v=>{v.entries[0].reservedCny=0;v.entries[0].chargeCeilingCny=0;}],
  ['charge above reservation',v=>{v.entries[0].chargeCeilingCny=1.1;}],
  ['fractional token count',v=>{v.entries[0].usage.prompt_tokens=.5;}],
  ['settlement without completion time',v=>{delete v.entries[0].finishedAt;}],
  ['release with settlement usage',v=>{v.entries[0]={...v.entries[0],status:'released',phase:'prepared',releaseReason:'cancelled'};}],
  ['correction references no entry',v=>{v.reconciliations=[{id:'r',entryId:'missing',chargeCny:0,evidence:{kind:'verified-usage',reference:'synthetic'},createdAt:later}];}],
  ['correction inflates old charge',v=>{v.reconciliations=[{id:'r',entryId:v.entries[0].id,chargeCny:.9,evidence:{kind:'verified-usage',reference:'synthetic'},createdAt:later}];}]
])test('invalid v2 history is refused without leaking fields: '+name,async()=>{
  const value=ledger();value.entries=[settled()];mutate(value);
  await refused(await fixture(value),'P2_ADOPTION_BUDGET_INVALID');
});

test('matching active paid paths retain exact shared path and original cumulative configuration checks',async()=>{
  const f=await fixture();f.config.modules.media=true;
  f.config.memoryAutomation={capture:true,budgetPath:f.budgetPath,limitCny:100,initialSpentCny:.25,model:'deepseek-v4-pro'};
  f.config.vision={budgetPath:f.budgetPath,limitCny:100,initialSpentCny:.25,model:'deepseek-flash'};
  assert.equal((await inspectAdoptionBudget(f)).status,'verified');
  for(const [section,field,value]of [['p1','limitCny',99],['p1','initialSpentCny',0],['memoryAutomation','budgetPath',join(f.root,'other.json')],['vision','budgetPath',join(f.root,'other.json')],['vision','limitCny',50]]){
    const config=structuredClone(f.config);config[section][field]=value;await assert.rejects(inspectAdoptionBudget({...f,config}),code('P2_ADOPTION_BUDGET_CONFIG'));
  }
});

test('v2 exhausted ledgers cannot admit paid opening',async()=>{
  for(const amount of [100,100.000001]){const value=ledger();value.initialSpent=amount;const f=await fixture(value);f.config.p1.initialSpentCny=amount;await refused(f,'P2_ADOPTION_BUDGET_EXHAUSTED');}
});

test('missing ledger is refused without creating budget, lock or checkpoint files',async()=>{
  const f=await fixture(null),before=await readdir(f.root);await assert.rejects(inspectAdoptionBudget(f),code('P2_ADOPTION_BUDGET_MISSING'));assert.deepEqual(await readdir(f.root),before);
});

test('v2 lock and temporary replacement still prevent inspection without cleanup',async()=>{
  for(const suffix of ['.lock','.lock.recovery','.synthetic.tmp']){const f=await fixture();await writeFile(f.budgetPath+suffix,'SYNTHETIC_PENDING_STATE');await refused(f,'P2_ADOPTION_BUDGET_BUSY');}
});

test('a hard-linked v2 ledger is still rejected as an ambiguous storage identity',async()=>{
  const f=await fixture();await link(f.budgetPath,join(f.root,'alias.json'));await refused(f,'P2_ADOPTION_BUDGET_PATH');
});

test('lease can inspect v2 under its own exact lock without rewriting ledger or allowing unowned inspection',async()=>{
  const f=await fixture(),before=await readFile(f.budgetPath),held=await acquireAdoptionBudgetLease({...f,transactionId:randomUUID()});
  try{assert.equal((await held.inspect()).status,'verified');await assert.rejects(inspectAdoptionBudget(f),code('P2_ADOPTION_BUDGET_BUSY'));assert.deepEqual(await readFile(f.budgetPath),before);}
  finally{await held.close();}
  assert.deepEqual(await readdir(f.root),['budget.json']);assert.deepEqual(await readFile(f.budgetPath),before);
});

test('lease refuses an atomic v2 ledger replacement and does not remove a foreign lock',async()=>{
  const f=await fixture(),held=await acquireAdoptionBudgetLease({...f,transactionId:randomUUID()});
  try{
    await rename(f.budgetPath,f.budgetPath+'.original');await writeFile(f.budgetPath,JSON.stringify(ledger()));
    await assert.rejects(held.inspect(),code('P2_ADOPTION_BUDGET_FENCE_LOST'));
    await unlink(f.budgetPath+'.lock');await writeFile(f.budgetPath+'.lock','SYNTHETIC_FOREIGN_OWNER');await held.close();
    assert.equal(await readFile(f.budgetPath+'.lock','utf8'),'SYNTHETIC_FOREIGN_OWNER');
  }finally{await held.close();}
});
