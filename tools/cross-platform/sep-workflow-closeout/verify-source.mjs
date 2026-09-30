import {readFile, lstat, readdir} from 'node:fs/promises';
import {join, resolve, isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Verify the exact selected source bytes, rejecting missing, extra and linked files. */
export async function verifySource({sourceRoot = join(import.meta.dirname, 'source'), manifestPath = join(import.meta.dirname, 'SOURCE-MANIFEST.json')} = {}) {
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes);
  const expected = new Set();
  for (const file of manifest.files) {
    if (isAbsolute(file.path) || file.path.includes('\\') || file.path.split('/').some(part => !part || part === '.' || part === '..') || expected.has(file.path)) throw Error('SOURCE_PATH');
    expected.add(file.path);
    const target = join(sourceRoot, file.path), info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw Error('SOURCE_TYPE ' + file.path);
    const bytes = await readFile(target);
    if (bytes.length !== file.size || hash(bytes) !== file.sha256) throw Error('SOURCE_CHANGED ' + file.path);
  }
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw Error('SOURCE_TYPE ' + name);
      if (entry.isDirectory()) await walk(join(directory, entry.name), name + '/');
      else if (!entry.isFile() || !expected.has(name)) throw Error('SOURCE_UNLISTED ' + name);
    }
  }
  await walk(sourceRoot);
  return {status: 'pass', files: expected.size, sourceBaseCommit: manifest.sourceBaseCommit, manifestSha256: hash(manifestBytes)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await verifySource()));
}
