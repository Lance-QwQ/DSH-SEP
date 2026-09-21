import { lstat, rm } from 'node:fs/promises';
import { ConversionError } from './errors.js';
export async function removeOwnedOutput(path, identity) {
  let current;
  try { current = await lstat(path, { bigint: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!identity || !current.isFile() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino || current.birthtimeNs !== identity.birthtimeNs) {
    const error = new ConversionError('invalid-output', 'The output identity changed; the replacement file was retained.'); error.cleanupIncomplete = true; throw error;
  }
  // Caller contract: the caller owns the parent directory and prevents concurrent
  // path mutation. This identity check also prevents deleting an observed replacement.
  await rm(path);
}
