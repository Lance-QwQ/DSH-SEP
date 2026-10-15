import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdir, mkdtemp, realpath, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root=await realpath(resolve(process.env.SEP_BUNDLE_REPO));
const work=resolve(process.env.SEP_BUNDLE_TEST_ROOT);
const require=createRequire(join(root,'package.json'));
const loadPublic=async specifier=>{try{return await import(pathToFileURL(require.resolve(specifier)));}catch(error){return {loadError:error.code};}};
const api=await loadPublic('dsh-sep-bundle/configuration');
const ledgerApi=await loadPublic('dsh-sep-bundle/configuration-budget');
const normalize=input=>{assert.equal(typeof api.normalizeBundleConfig,'function','portable configuration API is missing');return api.normalizeBundleConfig(input);};
const review=(bytes,input)=>{assert.equal(typeof ledgerApi.reviewExistingBudget,'function','read-only budget reviewer is missing');return ledgerApi.reviewExistingBudget(bytes,input);};
const defaults={schema:1,enabled:false,modules:{rag:true,memory:true,media:false},memory:{recall:true,capture:false},budget:{sharedLimitCny:100,roundLimitCny:5,sessionDefaultLimitCny:100},compaction:{mode:'inherit-native'}};
const configError=error=>error.code==='SEP_BUNDLE_CONFIG_INVALID';
function ledger() {return {
 version:3,currency:'CNY',limit:80,initialSpent:1.25,
 entries:[
  {id:'paid',status:'settled',reservedCny:3,chargeCeilingCny:2.5,createdAt:'2026-10-01T00:00:00Z',finishedAt:'2026-10-01T00:01:00Z',taskId:'task-a',scope:{kind:'task',taskId:'task-a',rootSessionId:'session-a',rootTurn:1}},
  {id:'in-flight',status:'reserved',reservedCny:3,createdAt:'2026-10-01T01:00:00Z',phase:'unknown',dispatchedAt:'2026-10-01T01:00:01Z',taskId:'task-a',scope:{kind:'task',taskId:'task-a',rootSessionId:'session-a',rootTurn:2}},
  {id:'cancelled',status:'released',reservedCny:2,createdAt:'2026-10-01T02:00:00Z',finishedAt:'2026-10-01T02:01:00Z',phase:'prepared',releaseReason:'user-cancel'},
 ],
 taskLimits:{'task-a':4},childBindings:{},reconciliations:[{id:'receipt-a',entryId:'paid',chargeCny:1.5,evidence:{kind:'provider-receipt',reference:'synthetic-receipt'},createdAt:'2026-10-02T00:00:00Z'}],
 legacyInitialSpent:false,sessionDefault:{limitCny:42,revision:7},sessionLimits:{'session-a':{limitCny:12,revision:3}},
};}

test('portable defaults keep business disabled, paid capture off and native compaction inherited',()=>{
 assert.deepEqual(normalize(),defaults);
});

test('partial user settings are merged without modifying or retaining a mutable input',()=>{
 const input={enabled:true,modules:{media:true},budget:{roundLimitCny:2.5,sessionDefaultLimitCny:20}};
 const before=structuredClone(input);const config=normalize(input);
 assert.deepEqual(input,before);assert.equal(config.modules.rag,true);assert.equal(config.modules.media,true);
 input.budget.roundLimitCny=90;assert.equal(config.budget.roundLimitCny,2.5);
 assert.throws(()=>{config.budget.roundLimitCny=90;},TypeError);
});

test('private paths, project IDs, key literals and reset knobs cannot enter the generic configuration',()=>{
 for(const input of [{storageRoot:'X:/synthetic-private'},{projects:[{id:'synthetic'}]},{apiKey:'synthetic-secret'},{initialSpentCny:0},{budget:{reset:true}},{compaction:{thresholdRatio:0.08}}]) assert.throws(()=>normalize(input),configError);
});

test('invalid and excessive monetary limits are rejected without coercion',()=>{
 for(const input of [null,[],{enabled:'true'},{schema:2},{budget:{sharedLimitCny:101}},{budget:{sharedLimitCny:2,roundLimitCny:5}},{budget:{roundLimitCny:0}},{budget:{sessionDefaultLimitCny:0}},{budget:{sessionDefaultLimitCny:1.001}},{budget:{roundLimitCny:'5'}},{memory:{capture:1}}]) assert.throws(()=>normalize(input),configError);
});

test('the shipped template actually normalizes to safe defaults',async()=>{
 const template=JSON.parse(await readFile(join(root,'bundle/config/default.json'),'utf8'));
 assert.deepEqual(normalize(template),defaults);
 const schema=JSON.parse(await readFile(join(root,'bundle/config/schema.json'),'utf8'));
 assert.equal(schema.type,'object');assert.equal(schema.additionalProperties,false);
 assert.equal(schema.properties.budget.additionalProperties,false);
});

test('budget review uses persisted caps and includes unknown reservations and verified corrections',()=>{
 const state=ledger(),before=structuredClone(state),bytes=Buffer.from(JSON.stringify(state));
 const receipt=review(bytes,{enabled:true});
 assert.deepEqual(state,before);
 assert.equal(receipt.mode,'preserve-existing');assert.equal(receipt.businessEnabled,false);assert.equal(receipt.configurationApplied,false);
 assert.deepEqual(receipt.persistedPolicy,{sharedLimitCny:80,sessionDefault:{limitCny:42,revision:7},sessionOverrideCount:1,taskOverrideCount:1});
 assert.equal(receipt.accounting.accountedCny,5.75);assert.equal(receipt.accounting.remainingCny,74.25);
 assert.equal(receipt.accounting.settledCny,1.5);assert.equal(receipt.accounting.reservedCny,3);
 assert.equal(receipt.policyChangeRequested,true);
 const text=JSON.stringify(receipt);assert.equal(text.includes('session-a'),false);assert.equal(text.includes('synthetic-receipt'),false);
});

test('configuration review leaves existing ledger and memory bytes intact and creates no lock or sidecar',async()=>{
 const dir=await mkdtemp(join(work,'state-'));const ledgerPath=join(dir,'budget.json'),memoryPath=join(dir,'memory.json');
 const original=Buffer.from(JSON.stringify(ledger(),null,2)+'\n'),memory=Buffer.from('{"synthetic-record":"retain"}\n');
 await writeFile(ledgerPath,original);await writeFile(memoryPath,memory);
 review(await readFile(ledgerPath),{budget:{sharedLimitCny:20,roundLimitCny:2,sessionDefaultLimitCny:10}});
 assert.deepEqual(await readFile(ledgerPath),original);assert.deepEqual(await readFile(memoryPath),memory);
 await assert.rejects(access(ledgerPath+'.lock'),error=>error.code==='ENOENT');
 const {readdir}=await import('node:fs/promises');assert.deepEqual((await readdir(dir)).sort(),['budget.json','memory.json']);
});

test('missing, corrupt and duplicate-entry ledgers fail closed without returning a fresh balance',()=>{
 assert.throws(()=>review(undefined),error=>error.code==='SEP_BUNDLE_LEDGER_REQUIRED');
 for(const bytes of [Buffer.from('broken-json'),Buffer.from('{}'),Buffer.from(JSON.stringify({...ledger(),entries:[ledger().entries[0],ledger().entries[0]]})),Buffer.alloc(16*1024*1024+1)]) assert.throws(()=>review(bytes),error=>error.code==='SEP_BUNDLE_LEDGER_INVALID');
});

test('legacy ledgers are reviewed in their original generation without an implicit migration',()=>{
 const bytes=Buffer.from(JSON.stringify({version:1,currency:'CNY',limit:30,initialSpent:2,entries:[{id:'old-unknown',status:'reserved',reservedCny:4,createdAt:'2026-10-01T00:00:00Z'}]}));
 const receipt=review(bytes);
 assert.equal(receipt.ledgerVersion,1);assert.equal(receipt.migrationRequired,true);
 assert.equal(receipt.persistedPolicy.sessionDefault,null);assert.equal(receipt.accounting.accountedCny,6);
 assert.equal(receipt.accounting.legacyUnverifiedCny,6);assert.equal(JSON.parse(bytes).version,1);
});

test('pending admission records configuration intent without activating or touching native services',async()=>{
 const entry=await import(pathToFileURL(join(root,'bundle/lib/index.js')));let value;
 const ctx={provide(name,provided){assert.equal(name,'sepBundleInstallation');value=provided;},plugin(){assert.fail('business plugin activated before adaptation');}};
 await entry.apply(ctx,{enabled:true,budget:{sessionDefaultLimitCny:25}});
 assert.equal(value.businessEnabled,false);assert.equal(value.reason,'SEP_BUNDLE_ADAPTATION_PENDING');
 assert.equal(value.configuration.enabled,true);assert.equal(value.configuration.budget.sessionDefaultLimitCny,25);assert.equal(value.configurationApplied,false);
});
