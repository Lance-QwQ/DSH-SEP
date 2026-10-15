import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { bindStoppedControl } from './control-bindings.mjs';

async function fixture(work) {
  const root = await mkdtemp(join(process.env.SEP_BUNDLE_TEST_ROOT, 'control-binding-'));
  const within = relative(resolve(process.env.SEP_BUNDLE_TEST_ROOT), resolve(root));
  assert(within && !within.startsWith('..') && !within.includes(':'));
  try {
    await mkdir(join(root, 'guardian/guardian'), { recursive: true });
    await writeFile(join(root, 'journal.jsonl'), 'root\n');
    await writeFile(join(root, 'guardian/guardian/journal.jsonl'), 'guardian\n');
    for (const name of ['owner.lock.json.sep-owner', 'guardian/guardian/owner.json.sep-owner']) {
      await mkdir(join(root, name));
      await writeFile(join(root, name, 'lease.sqlite'), 'lease');
      await writeFile(join(root, name, 'publication.sqlite'), 'publication');
      await writeFile(join(root, name, 'retired-test.json'), '{}');
    }
    await work(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('stopped owner records may be absent while durable ownership files remain bound', () => fixture(async root => {
  const result = await bindStoppedControl(root);
  assert.equal(result.files.length, 8);
  assert.equal(result.absent.length, 2);
  assert.equal(result.trees.length, 2);
  assert(result.files.every(row => /^[a-f0-9]{64}$/.test(row.sha256)));
  const before = result.files.find(row => row.path.endsWith('lease.sqlite'));
  await writeFile(before.path, 'changed');
  const after = (await bindStoppedControl(root)).files.find(row => row.path === before.path);
  assert.notEqual(after.sha256, before.sha256);
}));

for (const name of ['owner.lock.json', 'guardian/guardian/owner.json']) {
  test(`active owner ${name} rejects preparation`, () => fixture(async root => {
    await writeFile(join(root, name), '{}');
    await assert.rejects(bindStoppedControl(root), { code: 'PLAN_CONTROL_ACTIVE' });
  }));
}

test('missing durable ownership directory rejects rather than omitting authority', () => fixture(async root => {
  await rm(join(root, 'owner.lock.json.sep-owner'), { recursive: true });
  await assert.rejects(bindStoppedControl(root), { code: 'ENOENT' });
}));
