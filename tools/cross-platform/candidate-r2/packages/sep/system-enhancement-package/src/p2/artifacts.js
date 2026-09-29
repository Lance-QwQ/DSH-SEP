import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { readFile, realpath, stat, mkdir, open } from 'node:fs/promises';
import { resolve, join, dirname, basename, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

function failure(code, message, details) { return Object.assign(new Error(message), {code, ...details}); }
function hash(bytes, algorithm = 'sha256', encoding = 'hex') { return createHash(algorithm).update(bytes).digest(encoding); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function digest(value) { return hash(JSON.stringify(stable(value))); }
function samePath(a, b) { return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; }

export async function canonicalIdentity(path) {
  const absolute = resolve(path);
  let parent = absolute; const missing = [];
  for (;;) {
    try {
      const canonicalParent = await realpath(parent);
      const info = await stat(canonicalParent, {bigint:true});
      return { canonicalPath:join(canonicalParent, ...missing), exists:missing.length === 0,
        anchorPath:canonicalParent, device:info.dev.toString(), inode:info.ino.toString() };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const next = dirname(parent);
      if (next === parent) throw error;
      missing.unshift(basename(parent)); parent = next;
    }
  }
}

export async function fingerprintFiles(paths) {
  return Promise.all(paths.map(async input => {
    const path = resolve(input); const identity = await canonicalIdentity(path);
    if (!identity.exists) return {path, identity, exists:false, sha256:null, size:null};
    const handle = await open(path, 'r');
    try {
      const before = await handle.stat({bigint:true});
      if (!before.isFile()) throw failure('P2_INVALID_INPUT', 'Only regular files may be fingerprinted.');
      const bytes = await handle.readFile(); const after = await handle.stat({bigint:true});
      const currentIdentity = await canonicalIdentity(path);
      if (before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || digest(identity) !== digest(currentIdentity)) {
        throw failure('P2_INPUT_CHANGED', 'File changed while fingerprinting.');
      }
      return {path, identity, exists:true, sha256:hash(bytes), size:bytes.length};
    } finally { await handle.close(); }
  }));
}

function safeMember(name, isDirectory = false) {
  if (isDirectory && name.endsWith('/')) name = name.slice(0, -1);
  const parts = name.split('/');
  if (!name || name.includes('\\') || name.includes(':') || parts[0] !== 'package' ||
      parts.some(part => !part || part === '.' || part === '..' || /[\x00-\x1f<>"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw failure('P2_UNSAFE_ARCHIVE', `Unsafe package member: ${JSON.stringify(name)}`);
  }
  return parts.join('/');
}
function tarNumber(header, offset, length) {
  const text = header.subarray(offset, offset + length).toString('ascii').replace(/\0.*$/, '').trim();
  if (!/^[0-7]+$/.test(text)) throw failure('P2_UNSAFE_ARCHIVE', 'Unsupported tar numeric encoding.');
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) throw failure('P2_UNSAFE_ARCHIVE', 'Tar field exceeds safe range.');
  return value;
}
function tarString(header, offset, length) {
  const bytes = header.subarray(offset, offset + length); const nul = bytes.indexOf(0);
  return new TextDecoder('utf-8', {fatal:true}).decode(nul < 0 ? bytes : bytes.subarray(0, nul));
}
function parseArchive(bytes) {
  let tar;
  try { tar = gunzipSync(bytes, {maxOutputLength:128 * 1024 * 1024}); }
  catch { throw failure('P2_INVALID_ARTIFACT', 'Invalid or oversized gzip archive.'); }
  const members = []; const bodies = new Map(); const seen = new Set();
  let offset = 0; let ended = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (tar.length - offset < 1024 || !tar.subarray(offset).every(byte => byte === 0)) throw failure('P2_UNSAFE_ARCHIVE', 'Invalid tar terminator or trailing archive.');
      ended = true; break;
    }
    const checksum = tarNumber(header, 148, 8);
    let computed = 0;
    for (let i = 0; i < 512; i++) computed += i >= 148 && i < 156 ? 32 : header[i];
    if (computed !== checksum) throw failure('P2_UNSAFE_ARCHIVE', 'Tar header checksum mismatch.');
    const type = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    if (!['0', '5'].includes(type) || tarString(header, 157, 100)) throw failure('P2_UNSAFE_ARCHIVE', 'Links and extended/special tar members are not accepted.');
    const prefix = tarString(header, 345, 155); const raw = tarString(header, 0, 100);
    const path = safeMember(prefix ? `${prefix}/${raw}` : raw, type === '5');
    const key = path.toLowerCase();
    if (seen.has(key)) throw failure('P2_UNSAFE_ARCHIVE', 'Duplicate or case-aliased tar member.');
    seen.add(key);
    const size = tarNumber(header, 124, 12);
    if ((type === '5' && size !== 0) || size > 64 * 1024 * 1024 || offset + 512 + size > tar.length) throw failure('P2_UNSAFE_ARCHIVE', 'Invalid tar member length.');
    const body = tar.subarray(offset + 512, offset + 512 + size);
    members.push({path, type:type === '5' ? 'directory' : 'file', size, sha256:hash(body)});
    if (type === '0') bodies.set(path, body);
    if (members.length > 10000) throw failure('P2_UNSAFE_ARCHIVE', 'Too many tar members.');
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!ended) throw failure('P2_UNSAFE_ARCHIVE', 'Truncated tar archive.');
  return {members, bodies};
}

function inspectBytes(bytes, {expectedName, expectedSha256} = {}) {
  const sha256 = hash(bytes);
  if (expectedSha256 && sha256 !== expectedSha256) throw failure('P2_ARTIFACT_CHANGED', 'Package hash differs from the approved artifact.');
  const {members, bodies} = parseArchive(bytes);
  let manifest;
  try { manifest = JSON.parse(bodies.get('package/package.json').toString('utf8')); }
  catch { throw failure('P2_INVALID_ARTIFACT', 'Package manifest is missing or invalid JSON.'); }
  const allowedNames = expectedName === undefined ? ['dsh-system-enhancement-package', 'dsh-enhancement-suite'] : [expectedName];
  if (!allowedNames.includes(manifest.name)) throw failure('P2_PACKAGE_MISMATCH', 'Package name differs from the planned package.');
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version)) throw failure('P2_INVALID_ARTIFACT', 'An explicit semantic package version is required.');
  const entryPath = typeof manifest.main === 'string' ? manifest.main : typeof manifest.exports === 'string' ? manifest.exports : manifest.exports?.['.'];
  if (typeof entryPath !== 'string') throw failure('P2_INVALID_ARTIFACT', 'Package must declare an unambiguous module entry.');
  const entryName = safeMember('package/' + entryPath.replace(/^\.\//, ''));
  if (!bodies.has(entryName)) throw failure('P2_INVALID_ARTIFACT', 'Declared module entry is absent.');
  const patch = manifest.dsh?.bundle?.patch;
  if (typeof patch !== 'string' || !bodies.has(safeMember('package/' + patch.replace(/^\.\//, '')))) throw failure('P2_INVALID_ARTIFACT', 'Declared DSH bundle patch is missing.');
  const dependencyFields = ['dependencies','optionalDependencies','peerDependencies','peerDependenciesMeta','bundledDependencies','bundleDependencies','engines','os','cpu'];
  const declarations = Object.fromEntries(dependencyFields.map(field => [field, manifest[field] ?? null]));
  return {sha256, integrity:'sha512-' + hash(bytes,'sha512','base64'), manifest,
    reviewFingerprint:digest(manifest), dependencyFingerprint:digest(declarations),
    members, entry:{path:entryName, sha256:hash(bodies.get(entryName))}};
}

export async function inspectArtifact(path, options = {}) {
  const [fingerprint] = await fingerprintFiles([path]);
  if (!fingerprint.exists || fingerprint.size > 64 * 1024 * 1024) throw failure('P2_INVALID_ARTIFACT', 'Local package is missing or oversized.');
  const bytes = await readFile(path);
  if (hash(bytes) !== fingerprint.sha256) throw failure('P2_ARTIFACT_CHANGED', 'Package changed during inspection.');
  return {path:resolve(path), identity:fingerprint.identity, ...inspectBytes(bytes, options)};
}

export async function sealArtifact(path, sealDirectory, expectedSha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? '')) throw failure('P2_INVALID_INPUT', 'Sealing requires the approved SHA256.');
  const bytes = await readFile(path); const checked = inspectBytes(bytes, {expectedSha256});
  await mkdir(sealDirectory, {recursive:true});
  const sealed = join(resolve(sealDirectory), checked.sha256 + '.tgz');
  let handle;
  try { handle = await open(sealed, 'wx'); await handle.writeFile(bytes); await handle.sync(); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  finally { await handle?.close(); }
  return {...await inspectArtifact(sealed, {expectedSha256}), sourcePath:resolve(path)};
}

export async function checkArtifactCompatibility(current, candidate, rule) {
  const dimensions = ['units','enums','ids','scopes','withdrawals','deletions','archiveReferences','idempotency','migrationDirection'];
  if (!rule || rule.fromSha256 !== current.sha256 || rule.toSha256 !== candidate.sha256 ||
      rule.fromVersion !== current.manifest.version || rule.toVersion !== candidate.manifest.version ||
      rule.reviewedCandidateFingerprint !== candidate.reviewFingerprint ||
      !dimensions.every(field => rule.dataSemantics?.[field] === true) || typeof rule.restoreSupported !== 'boolean') {
    throw failure('P2_COMPATIBILITY_UNKNOWN', 'This exact version and artifact pair has no complete reviewed semantic compatibility rule.');
  }
  return {restoreSupported:rule.restoreSupported, dependencyChanged:current.dependencyFingerprint !== candidate.dependencyFingerprint, ruleFingerprint:digest(rule)};
}

export async function runCommand(command, args, {cwd, env = process.env, timeoutMs = 60000, logDirectory, label = 'command'} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 || !Array.isArray(args) || args.some(arg => typeof arg !== 'string') || !/^[\w.-]+$/.test(label)) {
    throw failure('P2_INVALID_INPUT', 'Invalid bounded command arguments.');
  }
  const logPaths = {}; const logs = {};
  if (logDirectory) {
    await mkdir(logDirectory, {recursive:true});
    for (const stream of ['stdout','stderr']) {
      logPaths[stream + 'Path'] = join(resolve(logDirectory), `${label}.${stream}.txt`);
      logs[stream] = openSync(logPaths[stream + 'Path'], 'wx');
    }
  }
  return new Promise((accept, reject) => {
    const buffers = {stdout:[], stderr:[]}; const sizes = {stdout:0, stderr:0};
    let timedOut = false; let spawnError; let finished = false; let timer;
    const child = spawn(command, args, {cwd, env, shell:false, windowsHide:true, stdio:['ignore','pipe','pipe']});
    child.once('error', error => { spawnError = error; });
    for (const stream of ['stdout','stderr']) child[stream].on('data', chunk => {
      if (logs[stream] !== undefined) writeSync(logs[stream], chunk);
      if (sizes[stream] < 8 * 1024 * 1024) buffers[stream].push(chunk.subarray(0, 8 * 1024 * 1024 - sizes[stream]));
      sizes[stream] += chunk.length;
    });
    const finish = (exitCode, signal) => {
      if (finished) return; finished = true; clearTimeout(timer);
      for (const fd of Object.values(logs)) { fsyncSync(fd); closeSync(fd); }
      const result = {exitCode, signal, timedOut, stdout:Buffer.concat(buffers.stdout).toString('utf8'), stderr:Buffer.concat(buffers.stderr).toString('utf8'), ...logPaths,
        outputTruncated:sizes.stdout > 8 * 1024 * 1024 || sizes.stderr > 8 * 1024 * 1024,
        ...(timedOut?{processTreeTerminated:false,spawnedPid:child.pid??null}: {})};
      if (timedOut) reject(failure('P2_PROCESS_TREE_UNKNOWN', 'Command deadline expired; descendant termination is unproven. Keep maintenance writes blocked and do not restore automatically.', {result}));
      else if (spawnError || exitCode !== 0) reject(failure('P2_COMMAND_FAILED', spawnError?.message ?? `Command exited ${exitCode}.`, {result}));
      else accept(result);
    };
    child.once('close', finish);
    timer = setTimeout(() => {
      timedOut = true;
      // Only this spawn's live direct child is signalled. A detached descendant
      // can outlive it, so never infer a safe restoration window from this kill.
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      for (const stream of ['stdout','stderr']) { child[stream].removeAllListeners('data'); child[stream].destroy(); }
      child.unref();
      finish(child.exitCode, child.signalCode);
    }, timeoutMs);
  });
}

function yamlScalar(value) {
  value = value.trim();
  if (value.startsWith('"')) { try { return JSON.parse(value); } catch {} }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  if (!value || /^[&*!|>\[{]/.test(value) || /\s#/.test(value)) throw failure('P2_INPUT_MISMATCH', 'Unsupported lockfile scalar.');
  return value;
}
function yamlBlock(lines, indent, key) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^( *)(.+):(?:\s*\{\})?\s*$/);
    if (match && match[1].length === indent && yamlScalar(match[2]) === key) {
      if (start !== -1) throw failure('P2_INPUT_MISMATCH', 'Duplicate relevant lockfile key.');
      start = i;
    }
  }
  if (start === -1) throw failure('P2_INPUT_MISMATCH', `Required lockfile key is missing: ${key}`);
  let end = start + 1;
  while (end < lines.length && (!lines[end].trim() || lines[end].trim().startsWith('#') || lines[end].match(/^ */)[0].length > indent)) end++;
  return lines.slice(start + 1, end);
}
function yamlField(lines, indent, key) {
  const prefix = ' '.repeat(indent) + key + ':';
  const matches = lines.filter(line => line.startsWith(prefix));
  if (matches.length !== 1) throw failure('P2_INPUT_MISMATCH', `Missing or duplicate lockfile field: ${key}`);
  return yamlScalar(matches[0].slice(prefix.length));
}
async function requireArtifactReference(ref, profileRoot, artifact) {
  if (typeof ref !== 'string' || !ref.startsWith('file:') || ref.startsWith('file://')) throw failure('P2_INPUT_MISMATCH', 'Candidate must use a local file package reference.');
  const identity = await canonicalIdentity(resolve(profileRoot, ref.slice(5)));
  if (!identity.exists || !samePath(identity.canonicalPath, artifact.identity.canonicalPath)) {
    throw failure('P2_INPUT_MISMATCH', 'Install inputs do not reference the inspected sealed package.');
  }
}
async function verifyInstallInputs(manifestBytes, lockBytes, profileRoot, artifact) {
  let profile;
  try { profile = JSON.parse(manifestBytes.toString('utf8')); }
  catch { throw failure('P2_INPUT_MISMATCH', 'Invalid Profile package manifest.'); }
  const name = artifact.manifest.name; const ref = profile.dependencies?.[name];
  await requireArtifactReference(ref, profileRoot, artifact);
  const lines = lockBytes.toString('utf8').split(/\r?\n/);
  if (yamlField(lines, 0, 'lockfileVersion') !== '9.0') throw failure('P2_INPUT_MISMATCH', 'Only the reviewed pnpm 9.0 lockfile format is supported.');
  const importer = yamlBlock(yamlBlock(lines, 0, 'importers'), 2, '.');
  const dep = yamlBlock(yamlBlock(importer, 4, 'dependencies'), 6, name);
  if (yamlField(dep, 8, 'specifier') !== ref) throw failure('P2_INPUT_MISMATCH', 'Lock specifier differs from the approved manifest.');
  const version = yamlField(dep, 8, 'version');
  await requireArtifactReference(version, profileRoot, artifact);
  const key = name + '@' + version;
  const packageRecord = yamlBlock(yamlBlock(lines, 0, 'packages'), 2, key);
  if (yamlField(packageRecord, 4, 'version') !== artifact.manifest.version) throw failure('P2_INPUT_MISMATCH', 'Lock package version differs from candidate.');
  const resolutions = packageRecord.filter(line => line.startsWith('    resolution:'));
  const resolution = resolutions.length === 1 && resolutions[0].match(/^    resolution:\s*\{integrity:\s*(.+?),\s*tarball:\s*(.+)\}\s*$/);
  if (!resolution || yamlScalar(resolution[1]) !== artifact.integrity) throw failure('P2_INPUT_MISMATCH', 'Candidate lock resolution does not bind the approved integrity.');
  await requireArtifactReference(yamlScalar(resolution[2]), profileRoot, artifact);
  yamlBlock(yamlBlock(lines, 0, 'snapshots'), 2, key);
  return profile;
}
async function writeSynced(path, bytes) {
  const handle = await open(path, 'w');
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

/** Package materialization only. Caller owns the storage barrier, snapshot and commit protocol. */
export async function installProfile({profileRoot, manifestPath, lockfilePath, pnpmPath, nodePath = process.execPath,
  storeDir, timeoutMs = 60000, env, artifact, expectedVersion, logDirectory, offline = true}) {
  if (!artifact?.path || !artifact.sha256 || !pnpmPath) throw failure('P2_INVALID_INPUT', 'Install requires an inspected package and explicit pnpm Node entry.');
  profileRoot = resolve(profileRoot);
  const checked = await inspectArtifact(artifact.path, {expectedSha256:artifact.sha256});
  if (expectedVersion && checked.manifest.version !== expectedVersion) throw failure('P2_PACKAGE_MISMATCH', 'Candidate version differs from plan.');
  const manifestBytes = await readFile(manifestPath); const lockBytes = await readFile(lockfilePath);
  await verifyInstallInputs(manifestBytes, lockBytes, profileRoot, checked);
  const profileIdentity = await canonicalIdentity(profileRoot);
  if (!profileIdentity.exists || !(await stat(profileRoot)).isDirectory()) throw failure('P2_INVALID_INPUT', 'An explicit existing Profile directory is required.');
  // Consume the checked buffers, not another read of the mutable input paths.
  await writeSynced(join(profileRoot, 'package.json'), manifestBytes);
  await writeSynced(join(profileRoot, 'pnpm-lock.yaml'), lockBytes);
  await inspectArtifact(artifact.path, {expectedSha256:artifact.sha256});
  const args = [resolve(pnpmPath), 'install', '--ignore-workspace', '--ignore-pnpmfile', '--frozen-lockfile', '--ignore-scripts', '--config.auto-install-peers=false',
    '--lockfile-dir', profileRoot, '--modules-dir', join(profileRoot,'node_modules'), '--virtual-store-dir', join(profileRoot,'node_modules','.pnpm')];
  if (offline) args.push('--offline');
  if (storeDir) args.push('--store-dir', resolve(storeDir));
  const safeEnv = env ?? Object.fromEntries(['SystemRoot','WINDIR','PATH','PATHEXT','USERPROFILE','TEMP','TMP','COMSPEC'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const commandEnv = {...safeEnv, CI:'1', DSH_TELEMETRY_DISABLED:'1', DSH_TELEMETRY_MODE:'DISABLED', OTEL_SDK_DISABLED:'true'};
  const installation = await runCommand(nodePath, args, {cwd:profileRoot, env:commandEnv, timeoutMs, logDirectory, label:'install'});
  // pnpm success alone is insufficient: bind every package file before executing its entry.
  const packageRoot = await realpath(join(profileRoot, 'node_modules', checked.manifest.name));
  for (const member of checked.members.filter(item => item.type === 'file')) {
    const path = join(packageRoot, ...member.path.split('/').slice(1));
    const actual = await realpath(path); const rel = relative(packageRoot, actual);
    if (rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel) || hash(await readFile(path)) !== member.sha256) {
      throw failure('P2_INSTALLED_MISMATCH', 'Installed package files differ from the inspected artifact.', {installation});
    }
  }
  const installedManifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  if (installedManifest.name !== checked.manifest.name || installedManifest.version !== checked.manifest.version) throw failure('P2_INSTALLED_MISMATCH', 'Installed package identity differs from plan.');
  const entryPath = join(packageRoot, ...checked.entry.path.split('/').slice(1));
  const importCode = 'const m=await import(process.argv[1]);console.log("P2_IMPORT_RESULT:"+JSON.stringify({name:m.name,apply:typeof m.apply}));';
  const imported = await runCommand(nodePath, ['--input-type=module', '-e', importCode, pathToFileURL(entryPath).href], {cwd:profileRoot, env:commandEnv, timeoutMs, logDirectory, label:'import'});
  const records = imported.stdout.split(/\r?\n/).filter(line => line.startsWith('P2_IMPORT_RESULT:'));
  let moduleImport;
  try { if (records.length !== 1) throw new Error(); moduleImport = JSON.parse(records[0].slice('P2_IMPORT_RESULT:'.length)); }
  catch { throw failure('P2_IMPORT_INVALID', 'Candidate entry did not produce a unique import result.', {result:imported}); }
  if (moduleImport.name !== checked.manifest.name || moduleImport.apply !== 'function') throw failure('P2_IMPORT_INVALID', 'Candidate entry lacks the expected plugin contract.', {result:imported});
  const [installedInputManifest, installedInputLock] = await fingerprintFiles([join(profileRoot, 'package.json'), join(profileRoot, 'pnpm-lock.yaml')]);
  if (installedInputManifest.sha256 !== hash(manifestBytes) || installedInputLock.sha256 !== hash(lockBytes)) throw failure('P2_INPUT_CHANGED', 'Package manager changed an approved install input.');
  return {installation, moduleImport, importProcess:imported,
    boundary:{profileRoot, canonicalProfileRoot:profileIdentity.canonicalPath, ignoreWorkspace:true, ignorePnpmfile:true},
    installed:{name:installedManifest.name, version:installedManifest.version,
    packageRoot, entrySha256:hash(await readFile(entryPath)), manifestSha256:installedInputManifest.sha256, lockSha256:installedInputLock.sha256}};
}
