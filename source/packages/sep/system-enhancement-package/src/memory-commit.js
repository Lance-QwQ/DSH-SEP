import {setTimeout as delay} from 'node:timers/promises';
import {checkAbort} from './errors.js';

/**
 * Retry one prepared native storage write after a transient Windows file lock.
 * The caller supplies only the durable write, never the transaction callback:
 * failed native JSON writes roll back their in-memory state before rejecting.
 */
export async function commitMemoryWrite(write, signal) {
  const waits = [25, 50, 75];
  for (let attempt = 0; ; attempt++) {
    checkAbort(signal);
    try {
      return await write();
    } catch (error) {
      if (!['EPERM', 'EBUSY'].includes(error?.code) || attempt >= waits.length) throw error;
      try {
        await delay(waits[attempt], undefined, {signal});
      } catch (waitError) {
        checkAbort(signal);
        throw waitError;
      }
    }
  }
}
