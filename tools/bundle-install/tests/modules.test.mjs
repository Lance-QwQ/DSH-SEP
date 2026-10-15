import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = resolve(process.env.SEP_BUNDLE_REPO);
let contract;
try { contract = JSON.parse(await readFile(join(root, 'bundle/contracts/modules.json'), 'utf8')); } catch {}
const wanted = ['system-enhancement-package','plugin-group','recovery','context-preparation','tool-worker','session-migration','trusted-evaluation-entry','ui-settings-memory','task-checkpoint','sep-brand'];

test('packed bundle carries the complete ten-component runtime instead of relying on a source checkout', async () => {
  assert.ok(contract, 'prebuilt runtime inventory is missing');
  assert.deepEqual(contract.modules.map(row => row.folder).sort(), wanted.slice().sort());
  for (const row of contract.modules) {
    await access(join(root, row.entry));
    await access(join(root, row.manifest));
    assert.ok(row.files.length > 0);
  }
});

test('Worker and Python companion files remain reachable relative to their prebuilt callers', async () => {
  for (const relative of ['bundle/modules/tool-worker/worker.js', 'bundle/modules/tool-worker/json.js', 'bundle/modules/context-preparation/context_resolver.py', 'bundle/modules/trusted-evaluation-entry/evaluation/lifecycle.py']) {
    await assert.doesNotReject(access(join(root, relative)), `runtime companion missing: ${relative}`);
  }
});

test('trusted evaluation keeps every Python integrity hash after bundling', async () => {
  const base = join(root, 'bundle/modules/trusted-evaluation-entry/evaluation');
  const manifest = JSON.parse(await readFile(join(base, 'lifecycle-manifest.json'), 'utf8'));
  for (const [file, expected] of Object.entries(manifest)) {
    const actual = createHash('sha256').update(await readFile(join(base, file))).digest('hex');
    assert.equal(actual, expected, file);
  }
  assert.equal(Object.keys(manifest).length, 9);
});

test('bundled context parser executes without the development checkout', async () => {
  const payload = {files:{'sample.py':'class Root:\n    pass\n\nclass Child(Root):\n    pass\n'}, seeds:['sample.py'], roots:[{path:'sample.py',symbol:'Child'}]};
  const run = spawnSync(process.env.SEP_TEST_PYTHON, ['-I','-B',join(root,'bundle/modules/context-preparation/context_resolver.py')], {
    input:JSON.stringify(payload), encoding:'utf8', windowsHide:true, timeout:15000,
  });
  assert.equal(run.status, 0, run.stderr);
  const value=JSON.parse(run.stdout);
  assert.ok(JSON.stringify(value).includes('Root'));
  assert.ok(JSON.stringify(value).includes('Child'));
});

test('root admission remains pending when runtime files are present', async () => {
  const entry = await import(pathToFileURL(join(root, 'bundle/lib/index.js')));
  const provided = new Map();
  entry.apply({provide:(key,value)=>provided.set(key,value)});
  assert.equal(provided.get('sepBundleInstallation').businessEnabled,false);
  assert.equal(provided.get('sepBundleInstallation').state,'pending');
  assert.equal(provided.has('suiteEnhancements'),false);
});
