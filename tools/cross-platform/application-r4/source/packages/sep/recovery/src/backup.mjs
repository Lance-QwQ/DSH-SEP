import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
async function resolveArtifact(ctx, artifactId) {
    const [kind, token, extra] = String(artifactId).split(':');
    if (!['capture', 'stage'].includes(kind) || extra) fail('ID', 'Unknown backup artifact');
    id(token);
    const suffix = kind === 'capture' ? 'capture-owned' : 'restore-owned';
    const owned = (await readJson(path.join(ctx.base, 'operations', `${token}-${suffix}.json`))).value;
    let root;
    if (kind === 'capture') {
        if (await exists(catalogFile(ctx, token))) fail('ARTIFACT', 'Use the backup deletion API for a published backup');
        root = backupRoot(ctx, token);
    } else {
        const plan = (await readJson(path.join(ctx.base, 'plans', `${token}.json`))).value;
        if (owned.confirmationHash !== planHash(plan)) fail('CONFIRMATION', 'Restore plan changed after stage creation');
        root = path.join(path.dirname(plan.targetRoot), `.dsh-recovery-stage-${token}`);
        disjoint(ctx.control, root);
        assertIdentity(owned.parentIdentity, await chain(path.dirname(root)));
    }
    if (!samePath(owned.bodyLocation, root)) fail('PATH', 'Owned artifact location changed');
    if (await exists(root)) assertIdentity(owned.rootIdentity, await chain(root));
    return { artifactId, kind: kind === 'capture' ? 'capture' : 'restore-stage', root, owned, token };
}
export async function listBackupArtifacts({ controlRoot } = {}) {
    return locked(controlRoot, async ctx => {
        const entries = [];
        for (const name of (await fs.readdir(path.join(ctx.base, 'operations'))).sort()) {
            const match = name.match(/^([0-9a-f-]{36})-(capture|restore)-owned\.json$/);
            if (!match) continue;
            const kind = match[2] === 'capture' ? 'capture' : 'stage';
            if (kind === 'capture' && await exists(catalogFile(ctx, match[1]))) continue;
            const artifact = await resolveArtifact(ctx, `${kind}:${match[1]}`);
            if (await exists(artifact.root)) entries.push({ artifactId: artifact.artifactId, kind: artifact.kind,
                status: 'failed-retained', bodyLocation: artifact.root, createdAt: artifact.owned.createdAt,
                deletable: true, retention: { expiresAt: null, automaticDeletion: false } });
        }
        return entries;
    });
}
async function artifactFingerprint(root) {
    const snapshot = await inventory(root, DEFAULT_LIMITS);
    const files = [];
    for (const file of snapshot.files) {
        const result = await streamFile(joinInside(root, file.path), null, file.stamp, { maxFileBytes: DEFAULT_LIMITS.maxFileBytes });
        files.push({ relative: file.path, identity: { realpath: file.stamp.realpath, dev: file.stamp.dev,
            ino: file.stamp.ino, birthtimeNs: file.stamp.birthtimeNs }, ...result });
    }
    const after = await inventory(root, DEFAULT_LIMITS);
    if (!stableInventory(snapshot, after)) fail('SOURCE_CHANGED', 'Retained artifact changed during review');
    return { files, directories: snapshot.directories.filter(d => d.path).map(d => ({ relative: d.path,
        identity: { realpath: d.stamp.realpath, dev: d.stamp.dev, ino: d.stamp.ino, birthtimeNs: d.stamp.birthtimeNs } })).reverse(),
        totalBytes: snapshot.totalBytes };
}
export async function planDeleteBackupArtifact({ controlRoot, artifactId } = {}) {
    return locked(controlRoot, async ctx => {
        const artifact = await resolveArtifact(ctx, artifactId);
        const fingerprint = await artifactFingerprint(artifact.root);
        return savePlan(ctx, 'delete-artifact', { artifactId, bodyLocation: artifact.root,
            rootIdentity: artifact.owned.rootIdentity, fingerprint, fileCount: fingerprint.files.length,
            totalBytes: fingerprint.totalBytes, notice: 'Delete this exact retained failure copy only; keep the source, published target, backups and metadata receipts.' });
    });
}
export async function commitDeleteBackupArtifact({ controlRoot, planId, confirmationHash } = {}) {
    return locked(controlRoot, async ctx => {
        const plan = await readPlan(ctx, planId, confirmationHash, 'delete-artifact');
        const artifact = await resolveArtifact(ctx, plan.artifactId);
        if (!samePath(artifact.root, plan.bodyLocation)) fail('PATH', 'Artifact path changed after preview');
        const intent = path.join(ctx.base, 'operations', `${plan.planId}-artifact-deletion-started.json`);
        if (!(await exists(intent))) {
            assertIdentity(plan.rootIdentity, await chain(artifact.root));
            const actual = await artifactFingerprint(artifact.root);
            if (planHash(actual) !== planHash(plan.fingerprint)) fail('INTEGRITY', 'Retained copy changed after confirmation');
            await writeNew(intent, { planId, confirmationHash, artifactId: plan.artifactId, createdAt: now(), status: 'deletion-pending' });
        } else {
            const previous = (await readJson(intent)).value;
            if (previous.confirmationHash !== confirmationHash) fail('CONFIRMATION', 'Deletion confirmation changed');
        }
        if (await exists(artifact.root)) {
            assertIdentity(plan.rootIdentity, await chain(artifact.root));
            for (const entry of plan.fingerprint.files) {
                const target = joinInside(artifact.root, entry.relative);
                if (await exists(target)) {
                    await chain(path.dirname(target));
                    assertIdentity(entry.identity, (await local(target, 'file')).identity);
                    await streamFile(target, null, null, { sha256: entry.sha256, maxFileBytes: DEFAULT_LIMITS.maxFileBytes });
                    await fs.unlink(target);
                }
            }
            for (const entry of plan.fingerprint.directories) {
                const target = joinInside(artifact.root, entry.relative);
                if (await exists(target)) { assertIdentity(entry.identity, await chain(target)); await fs.rmdir(target); }
            }
            await fs.rmdir(artifact.root);
        }
        const result = { status: 'deleted', artifactId: plan.artifactId, planId, deletedAt: now(), metadataOnly: true };
        const receipt = path.join(ctx.base, 'operations', `${planId}-artifact-deleted.json`);
        if (!(await exists(receipt))) await writeNew(receipt, result);
        return result;
    });
}
// Deliberate recovery copies: never edit a live project, restore SEP private domains,
// guess stale-lock ownership, or expire/delete a body automatically.
const DEFAULT_LIMITS = Object.freeze({ maxFiles: 10000, maxFileBytes: 64 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024 });
const MAX_METADATA = 16 * 1024 * 1024;
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.suite-memory', '.suite-control', '.suite-recovery', '.dsh-recovery', 'recovery-backups', 'credentials', 'secrets', '.ssh', '.gnupg']);
const EXCLUDED_FILES = new Set(['credentials.json', 'credentials.yml', 'credentials.yaml', 'secrets.json', 'secrets.yml', 'secrets.yaml', 'id_rsa', 'id_ed25519', 'dsh_four_layer_memory_v1.json', 'dsh_four_layer_archive_v1.json', 'dsh_enhancement_suite_v1.json', 'dsh-system-enhancement-package-v1.lock', 'dsh-enhancement-suite-v1.lock']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const now = () => new Date().toISOString();
const normalized = p => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
const samePath = (a, b) => normalized(a) === normalized(b);
const beneath = (parent, child) => { const rel = path.relative(normalized(parent), normalized(child)); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
function fail(suffix, message) { const e = new Error(message); e.code = `RECOVERY_BACKUP_${suffix}`; throw e; }
function absolute(p) { if (typeof p !== 'string' || !path.isAbsolute(p) || p.startsWith('\\\\') || p.startsWith('//'))
    fail('PATH', 'A local absolute path is required'); return path.resolve(p); }
function disjoint(a, b) { if (beneath(a, b) || beneath(b, a))
    fail('OVERLAP', 'Control, source and restore directories must be disjoint'); }
function id(value) { if (typeof value !== 'string' || !UUID.test(value))
    fail('ID', 'Invalid recovery artifact identifier'); return value; }
function relPath(value) { if (typeof value !== 'string' || value === '')
    fail('PATH', 'Invalid relative file name'); const pieces = value.split('/'); if (pieces.some(x => x === '' || x === '.' || x === '..' || x.includes('\\') || x.includes(':') || x.includes('\0')))
    fail('PATH', 'Unsafe relative path'); return pieces; }
const joinInside = (root, rel) => path.join(root, ...relPath(rel));
const digest = data => createHash('sha256').update(data).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const planHash = value => digest(encode(value));
function identity(stat, realpath) { if (stat.ino <= 0n || stat.dev <= 0n || stat.birthtimeNs <= 0n)
    fail('IDENTITY', 'Local filesystem identity is not verifiable'); return { realpath, dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) }; }
function equalIdentity(a, b) { return a && b && samePath(a.realpath, b.realpath) && a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs; }
function assertIdentity(a, b) { if (!equalIdentity(a, b))
    fail('IDENTITY', 'A previously verified local identity changed'); }
const stamp = (s, p) => ({ ...identity(s, p), size: String(s.size), mtimeNs: String(s.mtimeNs), ctimeNs: String(s.ctimeNs) });
const sameStamp = (a, b) => equalIdentity(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
async function local(p, type) { const st = await fs.lstat(p, { bigint: true }); if (st.isSymbolicLink())
    fail('LINK', 'Links and junctions are not accepted'); if (type === 'directory' && !st.isDirectory())
    fail('PATH', 'Expected a local directory'); if (type === 'file' && (!st.isFile() || st.nlink !== 1n))
    fail('LINK', 'Only regular single-link files are accepted'); const real = await fs.realpath(p); if (!samePath(real, p))
    fail('LINK', 'Resolved path differs from the verified local path'); return { stat: st, identity: identity(st, path.resolve(real)) }; }
async function chain(p, create = false) { p = absolute(p); const root = path.parse(p).root; await local(root, 'directory'); let current = root; for (const part of path.relative(root, p).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (create) {
        try {
            await fs.mkdir(current);
        }
        catch (e) {
            if (e.code !== 'EEXIST')
                throw e;
        }
    }
    await local(current, 'directory');
} return (await local(p, 'directory')).identity; }
async function absent(p) { try {
    await fs.lstat(p);
    fail('TARGET_EXISTS', 'Restore target already exists; merging and overwriting are forbidden');
}
catch (e) {
    if (e.code !== 'ENOENT')
        throw e;
} }
async function syncDirectory(p) { let h; try {
    h = await fs.open(p, 'r');
    await h.sync();
}
catch (e) {
    if (process.platform !== 'win32' || !['EPERM', 'EISDIR', 'EACCES', 'EINVAL', 'ENOTSUP'].includes(e.code))
        throw e;
}
finally {
    await h?.close();
} }
async function writeNew(p, value) { await chain(path.dirname(p)); const data = encode(value); if (data.length > MAX_METADATA)
    fail('LIMIT', 'Recovery metadata exceeds the fixed bound'); const h = await fs.open(p, 'wx', 0o600); try {
    await h.writeFile(data);
    await h.sync();
}
finally {
    await h.close();
} await syncDirectory(path.dirname(p)); }
async function readJson(p) { await chain(path.dirname(p)); const initial = await local(p, 'file'); if (initial.stat.size > BigInt(MAX_METADATA))
    fail('LIMIT', 'Recovery metadata exceeds the fixed bound'); const handle = await fs.open(p, 'r'); let data; try {
    const opened = await handle.stat({ bigint: true });
    if (!sameStamp(stamp(initial.stat, p), stamp(opened, p)) || opened.nlink !== 1n)
        fail('IDENTITY', 'Metadata changed while opening');
    data = await handle.readFile();
    if (!sameStamp(stamp(opened, p), stamp(await handle.stat({ bigint: true }), p)))
        fail('IDENTITY', 'Metadata changed while reading');
}
finally {
    await handle.close();
} if (!sameStamp(stamp(initial.stat, p), stamp((await local(p, 'file')).stat, p)))
    fail('IDENTITY', 'Metadata was replaced'); try {
    return { value: JSON.parse(data.toString('utf8')), hash: digest(data) };
}
catch {
    fail('INTEGRITY', 'Recovery metadata is invalid JSON');
} }
async function exists(p) { try {
    await fs.lstat(p);
    return true;
}
catch (e) {
    if (e.code === 'ENOENT')
        return false;
    throw e;
} }
async function context(controlRoot) { const control = absolute(controlRoot); await chain(control, true); const base = path.join(control, 'recovery-backups'); await chain(base, true); for (const name of ['backups', 'catalog', 'plans', 'operations', 'tombstones'])
    await chain(path.join(base, name), true); return { control, base }; }
async function locked(controlRoot, fn) { const ctx = await context(controlRoot); const lock = path.join(ctx.base, 'operation.lock'); try {
    await fs.mkdir(lock);
}
catch (e) {
    if (e.code === 'EEXIST')
        fail('LOCKED', 'A backup operation or unreviewed interrupted operation owns the lock');
    throw e;
} const lockIdentity = await chain(lock); try {
    await writeNew(path.join(lock, 'owner.json'), { pid: process.pid, createdAt: now(), nonce: randomUUID() });
    return await fn(ctx);
}
finally {
    assertIdentity(lockIdentity, await chain(lock));
    await local(path.join(lock, 'owner.json'), 'file');
    await fs.unlink(path.join(lock, 'owner.json'));
    await fs.rmdir(lock);
} }
function limitsOf(input = {}) { const limits = { ...DEFAULT_LIMITS, ...input }; for (const [key, max] of Object.entries(DEFAULT_LIMITS)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > max)
        fail('LIMIT', `${key} must be a positive integer no larger than ${max}`);
} return limits; }
function excluded(name, isDir) { const lower = name.toLowerCase(); if (isDir && EXCLUDED_DIRS.has(lower))
    return 'private-state-or-dependency-directory'; if (!isDir && (lower === '.env' || lower.startsWith('.env.') || EXCLUDED_FILES.has(lower) || /\.(pem|pfx|p12|key)$/i.test(lower)))
    return 'credential-file-policy'; return null; }
async function inventory(root, limits, { exclude = false } = {}) {
    await chain(root);
    const files = [], directories = [], exclusions = [];
    const maxEntries = limits.maxFiles * 4 + 128;
    let totalBytes = 0, seenEntries = 0;
    async function walk(current, relative, depth = 0) {
        if (depth > 64) fail('LIMIT', 'Workspace directory depth exceeds 64');
        const info = await local(current, 'directory');
        directories.push({ path: relative, stamp: stamp(info.stat, current) });
        const names = [];
        const directory = await fs.opendir(current);
        for await (const item of directory) {
            if (names.length + seenEntries >= maxEntries) fail('LIMIT', 'Workspace entry count bound exceeded');
            names.push(item.name);
        }
        for (const item of names.sort()) {
            if (++seenEntries > maxEntries) fail('LIMIT', 'Workspace entry count bound exceeded');
            const child = path.join(current, item);
            const rel = relative ? `${relative}/${item}` : item;
            relPath(rel);
            const st = await fs.lstat(child, { bigint: true });
            if (st.isSymbolicLink()) fail('LINK', 'Links and junctions are not accepted');
            if (!st.isDirectory() && !st.isFile()) fail('LINK', 'Special filesystem entries are not accepted');
            const why = exclude ? excluded(item, st.isDirectory()) : null;
            if (why) { exclusions.push({ path: rel, type: st.isDirectory() ? 'directory' : 'file', reason: why }); continue; }
            if (st.isDirectory()) await walk(child, rel, depth + 1);
            else {
                const info = await local(child, 'file');
                const size = Number(info.stat.size);
                totalBytes += size;
                if (size > limits.maxFileBytes || totalBytes > limits.maxTotalBytes || files.length >= limits.maxFiles)
                    fail('LIMIT', 'Workspace backup file or byte bound exceeded');
                files.push({ path: rel, size, stamp: stamp(info.stat, child) });
            }
        }
    }
    await walk(root, '');
    return { files, directories, exclusions, totalBytes };
}
function stableInventory(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
async function streamFile(source, destination, expected, { sha256, maxFileBytes }) { await chain(path.dirname(source)); const initial = await local(source, 'file'); if (expected && !sameStamp(expected, stamp(initial.stat, source)))
    fail('SOURCE_CHANGED', 'Source changed before capture'); const input = await fs.open(source, 'r'); let output; const hash = createHash('sha256'); let bytes = 0; try {
    const opened = await input.stat({ bigint: true });
    if (opened.nlink !== 1n || !sameStamp(stamp(initial.stat, source), stamp(opened, source)))
        fail('SOURCE_CHANGED', 'Source changed while opening');
    if (destination) {
        await chain(path.dirname(destination));
        output = await fs.open(destination, 'wx', 0o600);
    }
    const buffer = Buffer.alloc(64 * 1024);
    for (;;) {
        const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0)
            break;
        bytes += bytesRead;
        if (bytes > maxFileBytes)
            fail('LIMIT', 'Source exceeded the streaming copy bound');
        hash.update(buffer.subarray(0, bytesRead));
        if (output) {
            let written = 0;
            while (written < bytesRead) {
                const result = await output.write(buffer, written, bytesRead - written, null);
                if (result.bytesWritten === 0)
                    fail('IO', 'Zero-byte write during backup');
                written += result.bytesWritten;
            }
        }
    }
    if (!sameStamp(stamp(opened, source), stamp(await input.stat({ bigint: true }), source)))
        fail('SOURCE_CHANGED', 'Source changed during capture');
    await output?.sync();
}
finally {
    await input.close();
    await output?.close();
} await chain(path.dirname(source)); if (!sameStamp(stamp(initial.stat, source), stamp((await local(source, 'file')).stat, source)))
    fail('SOURCE_CHANGED', 'Source changed after capture'); const actual = hash.digest('hex'); if (bytes !== Number(initial.stat.size) || (sha256 && sha256 !== actual))
    fail('INTEGRITY', 'Backup payload size or SHA-256 does not match'); return { size: bytes, sha256: actual }; }
const backupRoot = (ctx, backupId) => path.join(ctx.base, 'backups', id(backupId));
const catalogFile = (ctx, backupId) => path.join(ctx.base, 'catalog', `${id(backupId)}.json`);
const tombstoneFile = (ctx, backupId) => path.join(ctx.base, 'tombstones', `${id(backupId)}.json`);
async function verifyStagedPayload(root, manifest) {
    const initial = await inventory(root, manifest.limits);
    if (JSON.stringify(initial.files.map(f => f.path)) !== JSON.stringify(manifest.files.map(f => f.path)) ||
        JSON.stringify(initial.directories.map(d => d.path)) !== JSON.stringify(manifest.directories) ||
        initial.totalBytes !== manifest.totalBytes)
        fail('INTEGRITY', 'Staged entry list differs from backup');
    for (const entry of manifest.files) {
        const result = await streamFile(joinInside(root, entry.path), null, null, { sha256: entry.sha256, maxFileBytes: manifest.limits.maxFileBytes });
        if (result.size !== entry.size)
            fail('INTEGRITY', 'Staged file size differs from backup');
    }
    const final = await inventory(root, manifest.limits);
    if (!stableInventory(initial, final))
        fail('INTEGRITY', 'Staged files changed during verification');
    return final;
}
function publicBackup(receipt, manifest) { return { backupId: receipt.backupId, projectId: manifest.project.id, createdAt: manifest.createdAt, status: 'retained', manifestHash: receipt.manifestHash, fileCount: manifest.files.length, totalBytes: manifest.totalBytes, coverage: 'included-files-only', exclusions: manifest.exclusions, retention: manifest.retention, limits: manifest.limits }; }
async function verifiedBackup(ctx, backupId) { if (await exists(tombstoneFile(ctx, backupId)))
    fail('DELETED', 'This backup is deleted or deletion is pending'); try {
    const receipt = (await readJson(catalogFile(ctx, backupId))).value;
    const root = backupRoot(ctx, backupId);
    const manifestRead = await readJson(path.join(root, 'manifest.json'));
    if (receipt.manifestHash !== manifestRead.hash)
        fail('INTEGRITY', 'Backup manifest differs from its original receipt');
    const m = manifestRead.value;
    if (m.version !== 1 || m.backupId !== backupId || !Array.isArray(m.files) || !Array.isArray(m.directories))
        fail('INTEGRITY', 'Backup manifest schema is invalid');
    const limits = limitsOf(m.limits);
    const payload = path.join(root, 'payload');
    const actual = await inventory(payload, limits);
    if (actual.files.length !== m.files.length || actual.totalBytes !== m.totalBytes || JSON.stringify(actual.files.map(f => f.path)) !== JSON.stringify(m.files.map(f => f.path)) || JSON.stringify(actual.directories.map(d => d.path)) !== JSON.stringify(m.directories))
        fail('INTEGRITY', 'Backup contains missing or unexpected entries');
    for (const entry of m.files) {
        if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256))
            fail('INTEGRITY', 'Malformed payload hash');
        const result = await streamFile(joinInside(payload, entry.path), null, null, { sha256: entry.sha256, maxFileBytes: limits.maxFileBytes });
        if (result.size !== entry.size)
            fail('INTEGRITY', 'Payload size differs from manifest');
    }
    assertIdentity(receipt.rootIdentity, await chain(root));
    return { receipt, manifest: m, root, payload, actual };
}
catch (e) {
    if (['ENOENT', 'ENOTDIR'].includes(e.code))
        fail('INTEGRITY', 'A backup component is missing');
    throw e;
} }
export async function createWorkspaceBackup({ controlRoot, project, limits: inputLimits } = {}) { const source = absolute(project?.root), control = absolute(controlRoot); disjoint(control, source); if (typeof project?.id !== 'string' || !project.id.trim() || project.id.length > 256)
    fail('PROJECT', 'A stable project identifier is required'); const limits = limitsOf(inputLimits); const rootIdentity = await chain(source); if (project.identity)
    assertIdentity(project.identity, rootIdentity); return locked(control, async (ctx) => { const captured = await inventory(source, limits, { exclude: true }); const backupId = randomUUID(), root = backupRoot(ctx, backupId), payload = path.join(root, 'payload'); const op = path.join(ctx.base, 'operations', `${backupId}-capture.json`); await writeNew(op, { version: 1, kind: 'capture', backupId, projectId: project.id, createdAt: now(), bodyLocation: root, status: 'capture-started', failureRetention: 'retained-until-explicit-review' }); await fs.mkdir(root); await fs.mkdir(payload); await writeNew(path.join(ctx.base, 'operations', `${backupId}-capture-owned.json`), {backupId, bodyLocation:root, rootIdentity:await chain(root), createdAt:now()}); try {
    for (const dir of captured.directories)
        if (dir.path)
            await chain(joinInside(payload, dir.path), true);
    const files = [];
    for (const file of captured.files) {
        const result = await streamFile(joinInside(source, file.path), joinInside(payload, file.path), file.stamp, { maxFileBytes: limits.maxFileBytes });
        files.push({ path: file.path, ...result, sourceIdentity: file.stamp });
    }
    const after = await inventory(source, limits, { exclude: true });
    if (!stableInventory(captured, after))
        fail('SOURCE_CHANGED', 'Workspace changed while the backup was captured');
    assertIdentity(rootIdentity, await chain(source));
    const manifest = { version: 1, backupId, createdAt: now(), project: { id: project.id, root: source, identity: rootIdentity }, capture: 'verified-file-copy-requires-writer-quiescence-for-cross-file-consistency', files, directories: captured.directories.map(d => d.path), totalBytes: captured.totalBytes, exclusions: captured.exclusions, coverage: 'included-files-only', retention: { expiresAt: null, automaticDeletion: false, policy: 'explicit-confirmed-deletion' }, limits };
    await writeNew(path.join(root, 'manifest.json'), manifest);
    const receipt = { version: 1, backupId, manifestHash: digest(encode(manifest)), rootIdentity: await chain(root), createdAt: manifest.createdAt };
    await writeNew(catalogFile(ctx, backupId), receipt);
    return publicBackup(receipt, manifest);
}
catch (e) {
    await writeNew(path.join(ctx.base, 'operations', `${backupId}-capture-failed.json`), { kind: 'capture-failed', backupId, failedAt: now(), errorCode: e.code || 'IO', bodyLocation: root, status: 'failed-retained' }).catch(() => { });
    throw e;
} }); }
async function savePlan(ctx, kind, value) { const plan = { version: 1, kind, planId: randomUUID(), createdAt: now(), ...value }; const confirmationHash = planHash(plan); await writeNew(path.join(ctx.base, 'plans', `${plan.planId}.json`), plan); return { ...plan, confirmationHash, requiresConfirmation: true }; }
async function readPlan(ctx, planId, confirmationHash, kind) { const { value } = await readJson(path.join(ctx.base, 'plans', `${id(planId)}.json`)); if (value.kind !== kind || value.planId !== planId || typeof confirmationHash !== 'string' || confirmationHash !== planHash(value))
    fail('CONFIRMATION', 'Exact unchanged plan confirmation is required'); return value; }
export async function previewWorkspaceRestore({ controlRoot, backupId, targetRoot } = {}) { const target = absolute(targetRoot), control = absolute(controlRoot); disjoint(control, target); return locked(control, async (ctx) => { const b = await verifiedBackup(ctx, backupId); disjoint(b.manifest.project.root, target); const parentIdentity = await chain(path.dirname(target)); await absent(target); return savePlan(ctx, 'restore', { backupId, targetRoot: target, parentIdentity, manifestHash: b.receipt.manifestHash, backupIdentity: b.receipt.rootIdentity, fileCount: b.manifest.files.length, totalBytes: b.manifest.totalBytes, exclusions: b.manifest.exclusions, coverage: 'included-files-only', restoresIntentionalDeletions: true, files:b.manifest.files.map(({path,size,sha256})=>({path,size,sha256})), notice: 'This new-directory copy can reintroduce intentionally deleted source content. Confirmation authorizes these listed backup files; it does not restore SEP private memory or P2 data.' }); }); }
export async function restoreWorkspaceBackup({ controlRoot, planId, confirmationHash } = {}) { return locked(controlRoot, async (ctx) => { const p = await readPlan(ctx, planId, confirmationHash, 'restore'); const b = await verifiedBackup(ctx, p.backupId); if (b.receipt.manifestHash !== p.manifestHash)
    fail('INTEGRITY', 'The backup changed after preview'); assertIdentity(p.backupIdentity, await chain(b.root)); const target = absolute(p.targetRoot); disjoint(ctx.control, target); assertIdentity(p.parentIdentity, await chain(path.dirname(target))); await absent(target); const stage = path.join(path.dirname(target), `.dsh-recovery-stage-${p.planId}`); await absent(stage); await writeNew(path.join(ctx.base, 'operations', `${p.planId}-restore-started.json`), { version: 1, kind: 'restore-started', planId: p.planId, backupId: p.backupId, targetRoot: target, stageRoot: stage, parentIdentity: p.parentIdentity, createdAt: now(), status: 'started', failureRetention: 'retained-until-explicit-review' }); await fs.mkdir(stage); const stageIdentity = await chain(stage); await writeNew(path.join(ctx.base, 'operations', `${p.planId}-restore-owned.json`), {planId:p.planId, confirmationHash, bodyLocation:stage, rootIdentity:stageIdentity, parentIdentity:p.parentIdentity, createdAt:now()}); try {
    for (const rel of b.manifest.directories)
        if (rel)
            await chain(joinInside(stage, rel), true);
    for (const entry of b.manifest.files)
        await streamFile(joinInside(b.payload, entry.path), joinInside(stage, entry.path), null, { sha256: entry.sha256, maxFileBytes: b.manifest.limits.maxFileBytes });
    await verifiedBackup(ctx, p.backupId);
    const staged = await verifyStagedPayload(stage, b.manifest);
    if (staged.files.length !== p.fileCount || staged.totalBytes !== p.totalBytes)
        fail('INTEGRITY', 'Staged copy differs from the confirmed backup');
    const fresh = await readPlan(ctx, planId, confirmationHash, 'restore');
    if (planHash(fresh) !== planHash(p))
        fail('CONFIRMATION', 'Plan changed during restore');
    assertIdentity(stageIdentity, await chain(stage));
    assertIdentity(p.parentIdentity, await chain(path.dirname(target)));
    await absent(target);
    await fs.rename(stage, target);
    await syncDirectory(path.dirname(target));
    const result = { version: 1, status: 'restored', planId: p.planId, backupId: p.backupId, targetRoot: target, targetIdentity: await chain(target), fileCount: p.fileCount, totalBytes: p.totalBytes, completedAt: now(), coverage: 'included-files-only', exclusions: p.exclusions };
    await writeNew(path.join(ctx.base, 'operations', `${p.planId}-restored.json`), result);
    return result;
}
catch (e) {
    await writeNew(path.join(ctx.base, 'operations', `${p.planId}-restore-failed.json`), { version: 1, status: 'failed-retained', planId: p.planId, stageRoot: stage, targetRoot: target, failedAt: now(), errorCode: e.code || 'IO', notice: 'Inspect the operation receipt before retry; a target may have been published before receipt persistence failed.' }).catch(() => { });
    throw e;
} }); }
export async function listWorkspaceBackups({ controlRoot } = {}) { return locked(controlRoot, async (ctx) => { const result = []; for (const file of (await fs.readdir(path.join(ctx.base, 'catalog'))).sort()) {
    if (!file.endsWith('.json'))
        fail('INTEGRITY', 'Unknown entry in backup catalog');
    const backupId = file.slice(0, -5);
    if (await exists(tombstoneFile(ctx, backupId)))
        continue;
    const b = await verifiedBackup(ctx, backupId);
    result.push(publicBackup(b.receipt, b.manifest));
} return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.backupId.localeCompare(b.backupId)); }); }
export async function planDeleteBackup({ controlRoot, backupId } = {}) { return locked(controlRoot, async (ctx) => { const b = await verifiedBackup(ctx, backupId); const rootEntries = (await fs.readdir(b.root)).sort(); if (JSON.stringify(rootEntries) !== JSON.stringify(['manifest.json', 'payload']))
    fail('INTEGRITY', 'Unknown files in backup root'); const entries = []; for (const f of b.actual.files) {
    const p = joinInside(b.payload, f.path);
    entries.push({ relative: `payload/${f.path}`, identity: (await local(p, 'file')).identity, sha256:b.manifest.files.find(entry=>entry.path===f.path).sha256 });
} entries.push({ relative: 'manifest.json', identity: (await local(path.join(b.root, 'manifest.json'), 'file')).identity, sha256:b.receipt.manifestHash }); return savePlan(ctx, 'delete', { backupId, manifestHash: b.receipt.manifestHash, backupIdentity: await chain(b.root), fileCount: b.manifest.files.length, totalBytes: b.manifest.totalBytes, entries, directories: b.actual.directories.map(d => ({ relative: d.path ? `payload/${d.path}` : 'payload', identity: { realpath: d.stamp.realpath, dev: d.stamp.dev, ino: d.stamp.ino, birthtimeNs: d.stamp.birthtimeNs } })).reverse(), notice: 'Permanently remove only this backup body. Source files and other backups remain; metadata-only deletion evidence is retained.' }); }); }
export async function commitDeleteBackup({ controlRoot, planId, confirmationHash } = {}) { return locked(controlRoot, async (ctx) => { const p = await readPlan(ctx, planId, confirmationHash, 'delete'); const root = backupRoot(ctx, p.backupId), tomb = tombstoneFile(ctx, p.backupId); const prior = await exists(tomb); if (prior) {
    const intent = (await readJson(tomb)).value;
    if (intent.planId !== p.planId || intent.confirmationHash !== confirmationHash)
        fail('CONFIRMATION', 'A different deletion operation owns this backup');
}
else {
    const b = await verifiedBackup(ctx, p.backupId);
    if (b.receipt.manifestHash !== p.manifestHash)
        fail('INTEGRITY', 'Backup changed after deletion preview');
    assertIdentity(p.backupIdentity, await chain(root));
    await writeNew(tomb, { version: 1, backupId: p.backupId, planId: p.planId, confirmationHash, createdAt: now(), status: 'deletion-pending', metadataOnly: true });
} if (await exists(root)) {
    assertIdentity(p.backupIdentity, await chain(root));
    for (const entry of p.entries) {
        const target = joinInside(root, entry.relative);
        if (!beneath(root, target))
            fail('PATH', 'Deletion escaped its exact backup directory');
        if (await exists(target)) {
            await chain(path.dirname(target));
            assertIdentity(entry.identity, (await local(target, 'file')).identity);
            await streamFile(target, null, null, {sha256:entry.sha256,maxFileBytes:DEFAULT_LIMITS.maxFileBytes});
            await fs.unlink(target);
        }
    }
    for (const entry of p.directories) {
        const target = joinInside(root, entry.relative);
        if (await exists(target)) {
            assertIdentity(entry.identity, await chain(target));
            await fs.rmdir(target);
        }
    }
    await fs.rmdir(root);
} const result = { version: 1, status: 'deleted', backupId: p.backupId, planId: p.planId, deletedAt: now(), metadataOnly: true }; const finished = path.join(ctx.base, 'operations', `${p.planId}-deleted.json`); if (!(await exists(finished)))
    await writeNew(finished, result); return result; }); }
