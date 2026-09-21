import { Worker } from 'node:worker_threads';
import { fail, checkAbort, SuiteError } from './errors.js';
export const PARSER_VERSION = 'suite-parser-2/fflate-0.8.3/fxp-5.11.1/pdfjs-6.2.108/canvas-1.0.8';
export const DOCUMENT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.pdf', '.docx']);

// Physical source lines are assigned before trimming; headings remain separate evidence.
export function chunkText(text) {
  const parts = []; let lines = []; let start = 0;
  const flush = () => { if (lines.length) { parts.push({ text: lines.join('\n'), locator: { lineStart: start, lineEnd: start + lines.length - 1 } }); lines = []; } };
  for (const [offset, raw] of text.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^#{1,6}\s/.test(line)) flush();
    if (line.length > 1200) {
      flush(); for (let i = 0; i < line.length; i += 1200) parts.push({ text: line.slice(i, i + 1200), locator: { lineStart: offset + 1, lineEnd: offset + 1 } });
      continue;
    }
    if (lines.join('\n').length + line.length + 1 > 1200) flush();
    if (!lines.length) start = offset + 1;
    lines.push(line);
    if (/^#{1,6}\s/.test(line)) flush();
  }
  flush(); return parts;
}

function inWorker(kind, bytes, options) {
  checkAbort(options.signal);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parser-worker.js', import.meta.url), { workerData: { kind, bytes, options: { extension: options.extension, maxChars: options.maxChars ?? 500000 } }, resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 4 }, stdout: true, stderr: true });
    // Library warnings are not a successful extraction result; structured warnings are returned below.
    worker.stdout.resume(); worker.stderr.resume();
    let settled = false;
    const finish = async (error, value) => {
      if (settled) return; settled = true;
      clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      await worker.terminate(); error ? reject(error) : resolve(value);
    };
    const abort = () => void finish(new SuiteError('ABORTED'));
    const timer = setTimeout(() => void finish(new SuiteError('TIMEOUT')), options.timeoutMs ?? 15000);
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.once('error', () => void finish(new SuiteError('PARSER_FAILED')));
    worker.once('exit', () => { if (!settled) void finish(new SuiteError('PARSER_FAILED')); });
    worker.once('message', message => void finish(message.error ? new SuiteError(message.error) : null, message.value));
    if (options.signal?.aborted) abort();
  });
}

export async function parseDocument(bytes, extension, options = {}) {
  checkAbort(options.signal);
  if (bytes.length > (options.maxBytes ?? 8 * 1024 * 1024)) fail('TOO_LARGE');
  if (!DOCUMENT_EXTENSIONS.has(extension)) fail('UNSUPPORTED');
  if (['.pdf', '.docx'].includes(extension)) return inWorker('document', bytes, { ...options, extension });
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('INVALID_UTF8'); }
  if (text.includes('\0')) fail('BINARY_TEXT');
  if (text.length > (options.maxChars ?? 500000)) fail('TOO_LARGE');
  if (!text.trim()) fail('NO_TEXT');
  return { parts: chunkText(text), parserVersion: PARSER_VERSION, warnings: [] };
}

export async function inspectImage(bytes, options = {}) {
  checkAbort(options.signal);
  if (bytes.length > (options.maxBytes ?? 4 * 1024 * 1024)) fail('TOO_LARGE');
  return inWorker('image', bytes, options);
}
