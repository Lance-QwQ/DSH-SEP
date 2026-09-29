export class SuiteError extends Error {
  constructor(code, detail = code) { super(`${code}: ${detail}`); this.name = 'SuiteError'; this.code = code; }
}
export const fail = (code, detail) => { throw new SuiteError(code, detail); };
export function checkAbort(signal) { if (signal?.aborted) fail('ABORTED'); }
export function digest(value) { return createHash('sha256').update(value).digest('hex'); }
import { createHash } from 'node:crypto';
