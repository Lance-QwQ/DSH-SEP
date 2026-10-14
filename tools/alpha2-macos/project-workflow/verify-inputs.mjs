// Operator-only byte binding; success is not native or workflow acceptance.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const sha = value => createHash('sha256').update(value).digest('hex');
const directory = dirname(fileURLToPath(import.meta.url));
const manifestBytes = await readFile(join(directory, 'SOURCE_INPUTS.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.schema, 1);
const root = resolve(directory, '..');
const results = [];
for (const input of manifest.inputs) {
  assert.match(input.path, /^(?:apfs-tree|transactions|lifecycle|profile)\/[a-z-]+\.(?:c|mjs)$/);
  const bytes = await readFile(join(root, input.path));
  assert.equal(bytes.length, input.bytes, input.path);
  const digest = sha(bytes); assert.equal(digest, input.sha256, input.path);
  results.push({path:input.path, bytes:bytes.length, sha256:digest});
}
const frozenBytes = await readFile(join(directory, 'FREEZE.json'));
const frozen = JSON.parse(frozenBytes);
assert.equal(frozen.schema, 1);
const required = ['CONTRACT.json', 'README.md', 'REPRODUCTION.md', 'SOURCE_INPUTS.json', 'native-ci-job.yml', 'native-fixture.mjs', 'native-workflow.test.mjs', 'verify-inputs.mjs', 'workflow-adapter.mjs'].sort();
assert.deepEqual(frozen.inputs.map(input => input.path).sort(), required);
const skeleton = [];
for (const input of frozen.inputs) {
  assert.ok(required.includes(input.path));
  const bytes = await readFile(join(directory, input.path));
  assert.equal(bytes.length, input.bytes, input.path);
  const digest = sha(bytes); assert.equal(digest, input.sha256, input.path);
  skeleton.push({path:input.path, bytes:bytes.length, sha256:digest});
}
process.stdout.write(JSON.stringify({status:'pass', scope:'baseline-and-skeleton-source-byte-binding-only', sourceInputsSha256:sha(manifestBytes), freezeSha256:sha(frozenBytes), inputs:results, skeleton, workflowAcceptance:'not_run'}, null, 2) + '\n');
