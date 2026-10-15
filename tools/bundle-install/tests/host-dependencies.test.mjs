import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=resolve(process.env.SEP_BUNDLE_REPO);
const source=resolve(process.env.SEP_SOURCE_REPO);
const host=resolve(process.env.SEP_OFFICIAL_HARNESS);
const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const observed={};
for(const name of Object.keys(manifest.peerDependencies))observed[name]=JSON.parse(await readFile(join(host,'node_modules',name,'package.json'),'utf8')).version;
const adapter=()=>import(pathToFileURL(join(source,'tools/bundle-install/adapt-host-dependencies.mjs')));

test('fixed host peers match exact versions with the reviewed official-gate invariants bridge',()=>{
  const exact={...manifest.peerDependencies};delete exact['@deepseek-ai/dsh-invariants'];const resolved={...observed};delete resolved['@deepseek-ai/dsh-invariants'];assert.deepEqual(exact,resolved);
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-invariants'],'0.2.0-rc.2 || 0.2.1-alpha.1');
  assert.equal(observed['@deepseek-ai/dsh-invariants'],'0.2.0-rc.2');
  assert.equal(observed['@deepseek-ai/cordis'],'4.0.5-alpha.1');
  assert.equal(observed['@deepseek-ai/schemastery'],'3.18.5-alpha.1');
});

test('a fresh packed consumer passes the actual package manager peers check',()=>{
  const run=spawnSync(process.execPath,[process.env.SEP_TEST_PNPM,'peers','check'],{cwd:host,env:{...process.env,XDG_STATE_HOME:join(process.env.SEP_BUNDLE_TEST_ROOT,'npm-state')},encoding:'utf8',windowsHide:true,timeout:60000});
  assert.equal(run.error,undefined);
  assert.equal(run.status,0,run.stdout+run.stderr);
});

test('dependency-resolution contract declares its limits and does not enable the default bundle',async()=>{
  const contract=JSON.parse(await readFile(join(root,'bundle/contracts/host-dependencies.json'),'utf8'));
  assert.equal(contract.targetHostVersion,'0.2.1-alpha.1');
  assert.equal(contract.scope,'dependency-resolution');
  assert.equal(contract.runtimeCompatibility,'not_run');
  assert.equal(contract.defaultBundleAdmission,'pending');
  assert.equal(contract.businessActivationAllowed,false);
  assert.deepEqual(contract.targetPeerDependencies,manifest.peerDependencies);
  assert.equal(Object.keys(contract.sourcePeerDependencies).length,33);
  const entry=await import(pathToFileURL(join(root,'bundle/lib/index.js')));
  const provided=new Map();entry.apply({provide:(k,v)=>provided.set(k,v)});
  assert.equal(provided.get('sepBundleInstallation').state,'pending');
  assert.equal(provided.has('suiteEnhancements'),false);
});

test('adaptation is reproducible from legacy declarations and idempotent on the target manifest',async()=>{
  const {adaptHostDependencies,SOURCE_PEERS}=await adapter();
  const legacy=structuredClone(manifest);legacy.peerDependencies=structuredClone(SOURCE_PEERS);
  const old=structuredClone(legacy);
  const first=adaptHostDependencies(legacy),second=adaptHostDependencies(first.manifest);
  assert.deepEqual(legacy,old,'caller input was mutated');
  assert.deepEqual(first,second);
  assert.deepEqual(first.manifest,manifest);
  assert.deepEqual(first.contract,JSON.parse(await readFile(join(root,'bundle/contracts/host-dependencies.json'),'utf8')));
});

test('unreviewed additional peer is rejected rather than silently broadening the target',async()=>{
  const {adaptHostDependencies}=await adapter();const input=structuredClone(manifest);
  input.peerDependencies['@deepseek-ai/unreviewed']='*';
  assert.throws(()=>adaptHostDependencies(input),/BUNDLE_HOST_PEERS_CHANGED/);
});

test('a missing peer cannot shrink the declared compatibility surface',async()=>{
  const {adaptHostDependencies}=await adapter();const input=structuredClone(manifest);
  delete input.peerDependencies['@deepseek-ai/dsh-tools'];
  assert.throws(()=>adaptHostDependencies(input),/BUNDLE_HOST_PEERS_CHANGED/);
});

test('unknown peer range is rejected instead of claiming every future release works',async()=>{
  const {adaptHostDependencies}=await adapter();const input=structuredClone(manifest);
  input.peerDependencies['@deepseek-ai/dsh-session']='*';
  assert.throws(()=>adaptHostDependencies(input),/BUNDLE_HOST_PEER_RANGE/);
});

test('peer optionality and unrelated dependency bytes are preserved',async()=>{
  const {adaptHostDependencies}=await adapter();const result=adaptHostDependencies(manifest).manifest;
  for(const name of Object.keys(result.peerDependencies))assert.deepEqual(result.peerDependenciesMeta[name],{optional:true});
  assert.deepEqual(result.dependencies,manifest.dependencies);
  assert.deepEqual(result.exports,manifest.exports);
  assert.deepEqual(result.dsh,manifest.dsh);
  assert.deepEqual(result.files,manifest.files);
  assert.equal(result.scripts,undefined);
});

test('a changed optionality contract is rejected without modifying installation semantics',async()=>{
  const {adaptHostDependencies}=await adapter();const input=structuredClone(manifest);
  input.peerDependenciesMeta['@deepseek-ai/dsh-agent'].optional=false;
  assert.throws(()=>adaptHostDependencies(input),/BUNDLE_HOST_PEER_META/);
});
