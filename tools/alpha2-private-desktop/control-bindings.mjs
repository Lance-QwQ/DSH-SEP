// Local deployment preparation only. This does not acquire or change a lease.
import assert from 'node:assert/strict';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const identity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
async function bindFile(path) {
  const before = await lstat(path, { bigint: true });
  assert(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n, 'PLAN_CONTROL_FILE_IDENTITY');
  assert.equal(resolve(await realpath(path)).toLowerCase(), resolve(path).toLowerCase());
  const bytes = await readFile(path), after = await lstat(path, { bigint: true });
  assert.equal(identity(before), identity(after), 'PLAN_CONTROL_FILE_CHANGED');
  return { path: resolve(path), identity: identity(before), sha256: createHash('sha256').update(bytes).digest('hex'), role: 'retained-control' };
}
async function bindTree(path) {
  const before = await lstat(path, { bigint: true });
  assert(before.isDirectory() && !before.isSymbolicLink(), 'PLAN_CONTROL_DIRECTORY_IDENTITY');
  assert.equal(resolve(await realpath(path)).toLowerCase(), resolve(path).toLowerCase());
  const files = [], directories = [{ path: resolve(path), identity: [before.dev, before.ino, before.birthtimeNs].map(String).join(':') }];
  for (const name of (await readdir(path)).sort()) {
    const child = join(path, name), stat = await lstat(child);
    assert(!stat.isSymbolicLink(), 'PLAN_CONTROL_ALIAS');
    if (stat.isDirectory()) {
      const nested = await bindTree(child); files.push(...nested.files); directories.push(...nested.directories);
    } else files.push(await bindFile(child));
  }
  const after = await lstat(path, { bigint: true });
  assert.equal(identity(before), identity(after), 'PLAN_CONTROL_DIRECTORY_CHANGED');
  return { path: resolve(path), files, directories };
}
async function assertAbsent(path) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw Object.assign(new Error('PLAN_CONTROL_ACTIVE'), { code: 'PLAN_CONTROL_ACTIVE' });
}
export async function bindStoppedControl(root) {
  const absent = ['owner.lock.json', 'guardian/guardian/owner.json'].map(name => resolve(root, name));
  for (const path of absent) await assertAbsent(path);
  const files = await Promise.all(['journal.jsonl', 'guardian/guardian/journal.jsonl'].map(name => bindFile(join(root, name))));
  const trees = [];
  for (const name of ['owner.lock.json.sep-owner', 'guardian/guardian/owner.json.sep-owner']) {
    const tree = await bindTree(join(root, name)); files.push(...tree.files);
    trees.push({ path: tree.path, files: tree.files.map(row => row.path), directories: tree.directories });
  }
  for (const path of absent) await assertAbsent(path);
  return { files, absent, trees };
}
