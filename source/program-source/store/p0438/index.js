import { lstat, realpath, open, mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { isAbsolute, join, dirname, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { runBridge } from './native-process.js';
import { ConversionError } from './errors.js';
import { validateArchive } from './archive.js';
import { removeOwnedOutput } from './owned-files.js';
export { ConversionError } from './errors.js';

const supported = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']);
const cfbMagic = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const securityProfile = `<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item><item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item><item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>1</value></prop></item></oor:items>`;


const defaults = Object.freeze({ timeoutMs: 120000, maxInputBytes: 64 * 1024 * 1024, maxOutputBytes: 128 * 1024 * 1024, maxImageResolution: 144, maxArchiveEntries: 20000, maxUncompressedBytes: 512 * 1024 * 1024, maxFontFiles: 20000, maxFontFileBytes: 256 * 1024 * 1024, maxLoadedFontBytes: 512 * 1024 * 1024 });

export async function createConverter(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Options must be an object.');
  for (const key of Object.keys(options)) if (!Object.hasOwn(defaults, key) && !['fontDirectories', 'fontFallbacks', 'initialFontFamilies', 'executablePath', 'workRoot'].includes(key)) throw new TypeError(`Unknown converter option: ${key}`);
  const limits = { ...defaults, ...options };
  for (const key of Object.keys(defaults)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0 || (['timeoutMs', 'maxImageResolution'].includes(key) && limits[key] > 2147483647)) throw new TypeError(`${key} must be a positive supported integer.`);
  }
  for (const key of ['fontDirectories', 'fontFallbacks', 'initialFontFamilies']) {
    if (options[key] !== undefined) throw new TypeError(`${key} is not supported by the CLI converter; use Windows installed fonts.`);
  }
  for (const key of ['maxFontFiles', 'maxFontFileBytes', 'maxLoadedFontBytes']) {
    if (options[key] !== undefined && options[key] !== defaults[key]) throw new TypeError(`${key} customization is not supported; font loading is OS-managed.`);
  }
  let executablePath = options.executablePath;
  if (executablePath !== undefined && (typeof executablePath !== 'string' || !isAbsolute(executablePath))) throw new TypeError('executablePath must be absolute.');
  if (executablePath === undefined) {
    try { executablePath = join(dirname(createRequire(import.meta.url).resolve('@dsh-sep/libreoffice-runtime/package.json')), 'program', 'soffice.com'); }
    catch (cause) { throw new ConversionError('unavailable', 'The bundled LibreOffice runtime is unavailable.', { cause }); }
  }
  try {
    const stat = await lstat(executablePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Engine is not a unique regular file.');
    executablePath = await realpath(executablePath);
  } catch (cause) { throw new ConversionError('unavailable', 'The configured LibreOffice executable is unavailable.', { cause }); }
  if (process.platform !== 'win32') throw new ConversionError('unavailable', 'This converter supports Windows only.');
  const workRoot = options.workRoot === undefined ? await realpath(tmpdir()) : options.workRoot;
  if (typeof workRoot !== 'string' || !isAbsolute(workRoot)) throw new TypeError('workRoot must be absolute.');
  await safeDirectory(workRoot, 'unavailable');
  let disposed = false, tail = Promise.resolve(), disposing;
  const requests = new Set(), cleanupFailures = [];
  return {
    backend: 'native',
    render(request, signal) {
      if (disposed) return Promise.reject(new ConversionError('unavailable', 'The converter has been disposed.'));
      if (signal?.aborted) return Promise.reject(abortReason(signal));
      const controller = new AbortController(); let begun = false, rejectQueued;
      const queuedAbort = new Promise((_resolve, reject) => { rejectQueued = reject; });
      const relay = () => controller.abort(abortReason(signal));
      signal?.addEventListener('abort', relay, { once: true });
      const item = { controller, promise: null };
      const rejectIfQueued = () => { if (!begun) rejectQueued(abortReason(controller.signal)); };
      controller.signal.addEventListener('abort', rejectIfQueued, { once: true });
      const job = tail.then(() => { begun = true; return convert({ request, executablePath, workRoot, limits, signal: controller.signal }); });
      item.promise = Promise.race([job, queuedAbort]).finally(() => { requests.delete(item); signal?.removeEventListener('abort', relay); controller.signal.removeEventListener('abort', rejectIfQueued); });
      requests.add(item);
      tail = job.catch(error => { if (error.cleanupIncomplete) cleanupFailures.push(error); });
      return item.promise;
    },
    dispose() {
      if (disposing) return disposing;
      disposed = true;
      for (const item of requests) item.controller.abort(new DOMException('Converter disposed.', 'AbortError'));
      disposing = Promise.allSettled([...requests].map(item => item.promise)).then(() => tail).then(() => {
        if (cleanupFailures.length) throw new AggregateError(cleanupFailures, 'Conversion cleanup could not be confirmed.');
      });
      return disposing;
    }
  };
}

function abortReason(signal) { return signal?.reason ?? new DOMException('Conversion cancelled.', 'AbortError'); }
function checkAbort(signal) { if (signal.aborted) throw abortReason(signal); }
function identity(a, b) { return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && b.nlink === 1n; }

async function safeDirectory(path, code) {
  let cursor = resolve(path);
  for (;;) {
    const info = await lstat(cursor).catch(cause => { throw new ConversionError(code, 'A required directory is unavailable.', { cause }); });
    if (!info.isDirectory() || info.isSymbolicLink()) throw new ConversionError(code, 'Directory links and non-directories are not accepted.');
    const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
}
async function regularFile(path, code) {
  const info = await lstat(path, { bigint: true }).catch(cause => { throw new ConversionError(code, 'A regular file is required.', { cause }); });
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) throw new ConversionError(code, 'File links and non-regular files are not accepted.');
  return info;
}

async function copySource(inputPath, destination, info, maxBytes, signal) {
  const source = await open(inputPath, 'r'); let target;
  try {
    if (!identity(info, await source.stat({ bigint: true }))) throw new ConversionError('invalid-document', 'The input identity changed.');
    target = await open(destination, 'wx');
    const buffer = Buffer.alloc(1024 * 1024); let offset = 0;
    for (;;) {
      checkAbort(signal);
      const { bytesRead } = await source.read(buffer, 0, buffer.length, offset);
      if (!bytesRead) break;
      offset += bytesRead;
      if (offset > maxBytes) throw new ConversionError('input-too-large', 'Input exceeds the byte limit.');
      let written = 0; while (written < bytesRead) { const result = await target.write(buffer, written, bytesRead - written); if (!result.bytesWritten) throw new ConversionError('failed', 'Input staging write stalled.'); written += result.bytesWritten; }
    }
    if (!identity(info, await source.stat({ bigint: true })) || !identity(info, await regularFile(inputPath, 'invalid-document'))) throw new ConversionError('invalid-document', 'The input changed while being read.');
  } finally { await source.close(); await target?.close(); }
}

async function convert({ request, executablePath, workRoot, limits, signal }) {
  checkAbort(signal);
  const controller = new AbortController();
  const relay = () => controller.abort(abortReason(signal)); signal.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(() => controller.abort(new ConversionError('timeout', 'Office conversion exceeded its deadline.')), limits.timeoutMs);
  const combined = controller.signal;
  let jobDirectory, published = false, outputIdentity, failure, diagnostics;
  try {
    if (!request || typeof request.inputPath !== 'string' || !isAbsolute(request.inputPath) || typeof request.outputPath !== 'string' || !isAbsolute(request.outputPath)) throw new TypeError('inputPath and outputPath must be absolute.');
    const { inputPath, outputPath } = request;
    const suffix = extname(inputPath).toLowerCase();
    if (!supported.has(suffix)) throw new ConversionError('unsupported-format', 'Only doc/docx/xls/xlsx/ppt/pptx documents are supported.');
    if (extname(outputPath).toLowerCase() !== '.pdf') throw new ConversionError('invalid-output', 'outputPath must have a PDF suffix.');
    await safeDirectory(dirname(inputPath), 'invalid-document'); await safeDirectory(dirname(outputPath), 'invalid-output');
    try { await lstat(outputPath); throw new ConversionError('invalid-output', 'The output already exists.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const inputInfo = await regularFile(inputPath, 'invalid-document');
    if (inputInfo.size > BigInt(limits.maxInputBytes)) throw new ConversionError('input-too-large', 'Input exceeds the byte limit.');
    checkAbort(combined);
    jobDirectory = await mkdtemp(join(workRoot, 'dsh-sep-office-'));
    const stagedInput = join(jobDirectory, 'input' + suffix), generated = join(jobDirectory, 'output'), profile = join(jobDirectory, 'profile');
    await mkdir(generated); await mkdir(join(profile, 'user'), { recursive: true });
    await copySource(inputPath, stagedInput, inputInfo, limits.maxInputBytes, combined);
    const staged = await readFile(stagedInput);
    if (!suffix.endsWith('x') && !staged.subarray(0, 8).equals(cfbMagic)) throw new ConversionError('invalid-document', 'The binary Office signature is invalid.');
    if (suffix.endsWith('x')) await validateArchive(staged, suffix, limits, combined);
    checkAbort(combined);
    await writeFile(join(profile, 'user', 'registrymodifications.xcu'), securityProfile, { flag: 'wx' });
    const filter = suffix.startsWith('.doc') ? 'writer_pdf_Export' : suffix.startsWith('.xls') ? 'calc_pdf_Export' : 'impress_pdf_Export';
    const pdfOptions = JSON.stringify({ ReduceImageResolution: { type: 'boolean', value: 'true' }, MaxImageResolution: { type: 'long', value: String(limits.maxImageResolution) }, ExportBookmarks: { type: 'boolean', value: 'true' } });
    const argumentsList = [`-env:UserInstallation=${pathToFileURL(profile).href}`, '-env:CrashDumpEnable=false', '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore', '--convert-to', `pdf:${filter}:${pdfOptions}`, '--outdir', generated, stagedInput];
    const requestPath = join(jobDirectory, 'bridge-request.json');
    await writeFile(requestPath, JSON.stringify({ executablePath, arguments: argumentsList, workingDirectory: jobDirectory }), { flag: 'wx' });
    const privatePdf = join(generated, 'input.pdf');
    diagnostics = await runBridge(requestPath, privatePdf, limits.maxOutputBytes, combined);
    checkAbort(combined);
    const pdfInfo = await regularFile(privatePdf, 'invalid-output');
    if (pdfInfo.size > BigInt(limits.maxOutputBytes)) throw new ConversionError('output-too-large', 'Generated PDF exceeds the byte limit.');
    const pdf = await open(privatePdf, 'r'); let output;
    try {
      const first = Buffer.alloc(8), end = Buffer.alloc(Math.min(1024, Number(pdfInfo.size)));
      await pdf.read(first, 0, first.length, 0); await pdf.read(end, 0, end.length, Math.max(0, Number(pdfInfo.size) - end.length));
      if (!/^%PDF-\d\.\d/u.test(first.toString('ascii')) || !end.toString('ascii').trimEnd().endsWith('%%EOF')) throw new ConversionError('invalid-output', 'The engine did not produce a complete PDF.');
      await safeDirectory(dirname(outputPath), 'invalid-output'); checkAbort(combined);
      try { output = await open(outputPath, 'wx'); published = true; outputIdentity = await output.stat({ bigint: true }); } catch (cause) { throw new ConversionError('invalid-output', 'The output cannot be created exclusively.', { cause }); }
      const buffer = Buffer.alloc(1024 * 1024); let offset = 0;
      for (;;) { checkAbort(combined); const { bytesRead } = await pdf.read(buffer, 0, buffer.length, offset); if (!bytesRead) break; offset += bytesRead; if (offset > limits.maxOutputBytes) throw new ConversionError('output-too-large', 'Generated PDF exceeds the byte limit.'); let written = 0; while (written < bytesRead) { const result = await output.write(buffer, written, bytesRead - written); if (!result.bytesWritten) throw new ConversionError('failed', 'Output write stalled.'); written += result.bytesWritten; } }
      await output.sync(); checkAbort(combined);
    } finally { await pdf.close(); await output?.close(); }
    return { backend: 'native', missingFonts: [], fontDiagnostics: 'unavailable' };
  } catch (error) { failure = error; if (diagnostics && error instanceof ConversionError && !error.diagnostics) error.diagnostics = diagnostics; throw error; }
  finally {
    clearTimeout(timer); signal.removeEventListener('abort', relay);
    try {
      if (failure && published) await removeOwnedOutput(request.outputPath, outputIdentity);
      if (jobDirectory && !failure?.cleanupIncomplete) await rm(jobDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch (cause) { const error = new ConversionError('failed', 'Conversion ended, but owned temporary-file cleanup failed.', { cause }); error.cleanupIncomplete = true; throw error; }
  }
}
