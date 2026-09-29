import { spawn } from 'node:child_process';
import { join, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, SuiteError } from './errors.js';

const script = fileURLToPath(new URL('./document-source-win32.ps1', import.meta.url));

function localPath(value) {
  if (process.platform !== 'win32' || typeof value !== 'string' || value.length > 2048 ||
      !/^[a-z]:[\\/]/i.test(value) || /[:\0]/.test(value.slice(2))) {
    fail('DOCUMENT_SOURCE_UNSUPPORTED', 'A canonical local Windows file path is required');
  }
  const path = value.replaceAll('/', '\\');
  if (path.slice(3).split('\\').some(piece => !piece || piece === '.' || piece === '..' || /[. ]$/.test(piece)) ||
      win32.normalize(path).toLowerCase() !== path.toLowerCase()) {
    fail('DOCUMENT_SOURCE_UNSUPPORTED', 'Aliases and noncanonical source names are not supported');
  }
  return path;
}

function reviewedIdentity(identity, sha256) {
  if (!identity || !/^[0-9]{1,10}$/.test(identity.volumeSerialNumber) ||
      !/^[0-9]{1,20}$/.test(identity.fileId) || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) {
    fail('DOCUMENT_SOURCE_REVIEW_REQUIRED', 'Review must bind the local file identity and SHA256');
  }
  return { volumeSerialNumber: String(identity.volumeSerialNumber), fileId: String(identity.fileId) };
}

function native(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const uncertain = () => new SuiteError('DOCUMENT_SOURCE_UNCERTAIN', 'Native operation did not return a verifiable result; inspect before retrying');
    const timer = setTimeout(() => { child.kill(); finish(uncertain()); }, 30000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 16384) { child.kill(); finish(uncertain()); }
    });
    child.stderr.resume();
    child.stdin.on('error', () => finish(uncertain()));
    child.on('error', () => finish(uncertain()));
    child.on('close', code => {
      if (finished) return;
      let result;
      try { result = JSON.parse(output.replace(/^\uFEFF/, '').trim()); } catch { return finish(uncertain()); }
      if (result.error && /^DOCUMENT_SOURCE_[A-Z_]+$/.test(result.error)) return finish(new SuiteError(result.error));
      if (code !== 0 || !['present', 'missing', 'deleted'].includes(result.status)) return finish(uncertain());
      if (result.path?.toLowerCase() !== request.path.toLowerCase()) return finish(uncertain());
      if (result.status !== 'missing') {
        try { reviewedIdentity(result.identity, result.sha256); } catch { return finish(uncertain()); }
        if (request.action === 'delete' && (result.status !== 'deleted' || result.sha256 !== request.sha256 ||
          result.identity.volumeSerialNumber !== request.identity.volumeSerialNumber || result.identity.fileId !== request.identity.fileId)) return finish(uncertain());
      }
      finish(null, result);
    });
    // Structured stdin keeps source paths and review values out of shell code.
    child.stdin.end(JSON.stringify(request));
  });
}

export async function inspectSource(path) {
  return native({ action: 'inspect', path: localPath(path) });
}

export async function deleteReviewedSource({ path, identity, sha256 } = {}) {
  const reviewed = reviewedIdentity(identity, sha256);
  return native({ action: 'delete', path: localPath(path), identity: reviewed, sha256 });
}
