import { spawn } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConversionError } from './errors.js';
const packageRoot = dirname(fileURLToPath(import.meta.url));
function abortReason(signal) { return signal?.reason ?? new DOMException('Conversion cancelled.', 'AbortError'); }
function checkAbort(signal) { if(signal.aborted) throw abortReason(signal); }

export async function runBridge(requestPath, privatePdf, maxOutputBytes, signal) {
  checkAbort(signal);
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(packageRoot, 'bridge.ps1'), '-RequestPath', requestPath], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    // Keep the sole write end open for this owner's lifetime. EOF revokes the
    // bridge's lease even if this Node process crashes without calling dispose.
    child.stdin.on('error', () => {});
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), reason, fence, closed = false, checking = false, spawned = false;
    child.on('spawn', () => { spawned = true; });
    const add = (previous, value) => previous.length >= 32768 ? previous : Buffer.concat([previous, value.subarray(0, 32768 - previous.length)]);
    child.stdout.on('data', value => { stdout = add(stdout, value); }); child.stderr.on('data', value => { stderr = add(stderr, value); });
    const stop = error => {
      if (closed || reason) return; reason = error;
      fence = setTimeout(() => { const failure = new ConversionError('failed', 'Owned conversion process exit could not be confirmed.'); failure.cleanupIncomplete = true; finish(failure); }, 10000);
      try { child.kill(); } catch { /* A failed kill is not proof of exit; retain the close deadline. */ }
    };
    const abort = () => stop(abortReason(signal)); signal.addEventListener('abort', abort, { once: true });
    const monitor = setInterval(async () => { if (checking || closed) return; checking = true; try { const info = await lstat(privatePdf); if (info.size > maxOutputBytes) stop(new ConversionError('output-too-large', 'Generated PDF exceeds the byte limit.')); } catch (error) { if (error.code !== 'ENOENT') stop(new ConversionError('invalid-output', 'Generated PDF could not be inspected.', { cause: error })); } finally { checking = false; } }, 100);
    function finish(error) { if (closed) return; closed = true; clearInterval(monitor); clearTimeout(fence); signal.removeEventListener('abort', abort); const diagnostics = { stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') }; if (error) { if (error instanceof ConversionError) error.diagnostics = diagnostics; reject(error); } else resolve(diagnostics); }
    child.on('error', cause => {
      if (!spawned && !child.pid) finish(new ConversionError('unavailable', 'The Windows conversion bridge could not start.', { cause }));
      else stop(new ConversionError('failed', 'An owned process operation failed; waiting for confirmed exit.', { cause }));
    });
    child.on('close', (code) => { if (reason) return finish(reason); if (code !== 0) return finish(new ConversionError(code === 125 ? 'unavailable' : 'failed', `The Office process exited with status ${code}.`)); finish(); });
    if (signal.aborted) abort();
  });
}
