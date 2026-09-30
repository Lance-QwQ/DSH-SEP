import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile, readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const runner = await import('../run-unit.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const verifier = await import('../verify-source.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const outputRoot = process.env.SEP_RUNNER_TEST_ROOT;
assert.ok(outputRoot, 'Set SEP_RUNNER_TEST_ROOT to an explicit artifact directory');
await mkdir(outputRoot, {recursive: true});
const hash = value => createHash('sha256').update(value).digest('hex');

async function fixture() {
  const root = await mkdtemp(join(outputRoot, 'runner-fixture-'));
  const sourceRoot = join(root, 'source');
  await mkdir(sourceRoot);
  await writeFile(join(sourceRoot, 'sample.js'), 'export const value = 1;\n');
  const bytes = await readFile(join(sourceRoot, 'sample.js'));
  const manifestPath = join(root, 'SOURCE-MANIFEST.json');
  await writeFile(manifestPath, JSON.stringify({schema: 1, sourceBaseCommit: 'a'.repeat(40), files: [{path: 'sample.js', sourcePath: 'packages/sep/system-enhancement-package/src/sample.js', size: bytes.length, sha256: hash(bytes)}]}));
  return {root, sourceRoot, manifestPath};
}

test('source verification rejects changed bytes before test execution', async () => {
  assert.equal(typeof verifier.verifySource, 'function');
  const f = await fixture();
  assert.equal((await verifier.verifySource(f)).files, 1);
  await writeFile(join(f.sourceRoot, 'sample.js'), 'export const value = 2;\n');
  await assert.rejects(verifier.verifySource(f), /SOURCE_CHANGED/);
});

test('source verification refuses unlisted source files', async () => {
  assert.equal(typeof verifier.verifySource, 'function');
  const f = await fixture();
  await writeFile(join(f.sourceRoot, 'unlisted.js'), 'export const extra = true;\n');
  await assert.rejects(verifier.verifySource(f), /SOURCE_UNLISTED/);
});

test('three fixed rounds retain the first failure even when both reruns pass', async () => {
  assert.equal(typeof runner.runUnitRounds, 'function');
  const root = await mkdtemp(join(outputRoot, 'rounds-fixture-')), sourceRoot = join(root, 'source');
  await mkdir(join(sourceRoot, 'tests'), {recursive: true});
  for (const name of ['validation', 'confirmation', 'closeout', 'engine']) {
    const assertion = name === 'validation' ? "assert.notEqual(process.env.SEP_UNIT_ROUND, '1');" : "assert.ok(process.env.SEP_WORKFLOW_TEST_ROOT);";
    await writeFile(join(sourceRoot, 'tests', 'safe-change-' + name + '.test.mjs'), "import test from 'node:test'; import assert from 'node:assert/strict'; test('synthetic round fixture', () => {" + assertion + "});\n");
  }
  const result = await runner.runUnitRounds({sourceRoot, outputRoot: join(root, 'results'), sourceManifestSha256: 'b'.repeat(64)});
  assert.equal(result.status, 'fail');
  assert.deepEqual(result.rounds.map(round => [round.round, round.status]), [[1, 'fail'], [2, 'pass'], [3, 'pass']]);
  assert.equal(result.rounds.length, 3);
  const attempts = await readdir(join(root, 'results'));
  assert.equal(attempts.length, 1);
  const attempt = join(root, 'results', attempts[0]);
  for (const round of [1, 2, 3]) assert.ok((await readFile(join(attempt, 'round-' + round + '.log'), 'utf8')).length);
  const saved = JSON.parse(await readFile(join(attempt, 'RESULT.json'), 'utf8'));
  assert.equal(saved.status, 'fail');
  assert.equal(saved.sourceManifestSha256, 'b'.repeat(64));
});
