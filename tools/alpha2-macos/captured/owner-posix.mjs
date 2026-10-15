// Local POSIX ownership evidence. Unknown filesystems or process identities fail closed.
import { readFile, readlink, lstat, statfs } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const options = { timeout: 8000, maxBuffer: 65536, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' } };
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(x);
const validScope = x => uuid(x?.bootId) && (x.platform === 'linux' ? /^pid:\[\d+\]$/.test(x.namespace) : x.platform === 'darwin' && x.namespace === 'host');
export function validPosixIdentity(x, pid) {
  return x?.schema === 2 && x.pid === pid && Number.isInteger(pid) && pid > 0 && pid <= 0xffffffff && validScope(x) &&
    (x.platform === 'linux' ? /^\d{1,30}$/.test(x.birth) : /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/.test(x.birth));
}
export function classifyPosixOwner(owner, observed) {
  const prior = owner?.sepOwner;
  if (!validPosixIdentity(prior, owner?.pid) || !validScope(observed) || prior.platform !== observed.platform || !['alive', 'absent'].includes(observed.state)) return 'unknown';
  if (observed.state === 'alive' && !validPosixIdentity(observed, owner.pid)) return 'unknown';
  if (prior.bootId !== observed.bootId) return 'stale';
  if (prior.namespace !== observed.namespace) return 'unknown';
  if (observed.state === 'absent') return 'stale';
  return prior.birth === observed.birth ? 'alive' : 'stale';
}
function zero(pid) {
  try { process.kill(pid, 0); return 'alive'; } catch (e) { return e.code === 'ESRCH' ? 'absent' : 'unknown'; }
}
async function scope() {
  if (process.platform === 'linux') return { platform: 'linux', bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim().toLowerCase(), namespace: await readlink('/proc/self/ns/pid') };
  if (process.platform === 'darwin') return { platform: 'darwin', bootId: (await execute('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'], options)).stdout.trim().toLowerCase(), namespace: 'host' };
  throw new Error('unsupported platform');
}
async function birth(pid) {
  if (process.platform === 'linux') {
    try {
      const raw = await readFile(`/proc/${pid}/stat`, 'utf8');
      const end = raw.lastIndexOf(')');
      if (!raw.startsWith(`${pid} (`) || end < 0) return { state: 'unknown' };
      const fields = raw.slice(end + 2).trim().split(/\s+/);
      if (!/^\d+$/.test(fields[19] || '') || ['Z', 'X', 'x'].includes(fields[0])) return { state: 'unknown' };
      return { state: 'alive', birth: fields[19] };
    } catch (e) { if (e.code === 'ENOENT') return { state: 'absent' }; throw e; }
  }
  try {
    const { stdout } = await execute('/bin/ps', ['-p', String(pid), '-o', 'pid=', '-o', 'lstart='], options);
    const match = stdout.trim().match(/^(\d+)\s+(.+)$/);
    if (!match || Number(match[1]) !== pid) return { state: 'unknown' };
    return { state: 'alive', birth: match[2] };
  } catch (e) { if (e.code === 1 && !e.stdout?.trim() && !e.stderr?.trim()) return { state: 'absent' }; throw e; }
}
export async function inspectPosixProcess(pid) {
  if (!Number.isInteger(pid) || pid < 1 || pid > 0xffffffff) return { state: 'unknown' };
  try {
    const before = await scope(); if (!validScope(before)) return { state: 'unknown' };
    const first = await birth(pid), live = zero(pid), second = await birth(pid), after = await scope();
    if (JSON.stringify(before) !== JSON.stringify(after) || first.state !== second.state || first.birth !== second.birth || first.state !== live) return { state: 'unknown' };
    const result = { ...before, ...second, schema: 2, pid };
    if (result.state === 'absent' || validPosixIdentity(result, pid)) return result;
  } catch { /* Permission failures, timeouts and missing OS evidence are not absence. */ }
  return { state: 'unknown' };
}
export async function assertPosixLocalDirectory(path) {
  const before = await lstat(path, { bigint: true });
  if (process.platform === 'linux') {
    // First supported Linux storage is native ext4, not WSL host mounts or network filesystems.
    if ((await statfs(path, { bigint: true })).type !== 0xef53n) throw new Error('unsupported filesystem');
    // ext2/ext3 share this magic; confirm the actual mounted filesystem is ext4.
    const mounts = (await readFile('/proc/self/mountinfo', 'utf8')).trim().split('\n').map(line => {
      const [left, right] = line.split(' - ');
      const mount = left.split(' ')[4]?.replace(/\\([0-7]{3})/g, (_, n) => String.fromCharCode(parseInt(n, 8)));
      return { mount, type: right?.split(' ')[0] };
    }).filter(x => x.mount && (x.mount === '/' || path === x.mount || path.startsWith(x.mount + '/'))).sort((a, b) => b.mount.length - a.mount.length);
    if (mounts[0]?.type !== 'ext4') throw new Error('unsupported filesystem');
  } else if (process.platform === 'darwin') {
    // diskutil accepts devices/mount points, not arbitrary descendant directories.
    const listing = (await execute('/bin/df', ['-P', path], options)).stdout.trim().split('\n');
    const device = listing.length === 2 ? listing[1].trim().split(/\s+/)[0] : '';
    if (!/^\/dev\/disk\d+(?:s\d+)*$/.test(device)) throw new Error('unsupported filesystem');
    const { stdout } = await execute('/usr/sbin/diskutil', ['info', '-plist', device], options);
    const convert = execute('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], options);
    convert.child.stdin.on('error', () => {}); convert.child.stdin.end(stdout);
    const info = JSON.parse((await convert).stdout);
    const node = await lstat(device, { bigint: true });
    if (info.FilesystemType !== 'apfs' || info.DeviceNode !== device || !node.isBlockDevice() || node.rdev !== before.dev) throw new Error('unsupported filesystem');
  } else throw new Error('unsupported platform');
  const after = await lstat(path, { bigint: true });
  if (!after.isDirectory() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino) throw new Error('directory changed');
}