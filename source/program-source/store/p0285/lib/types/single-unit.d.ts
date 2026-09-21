/**
 * One opened JSON unit. Reads expose the last committed state; every write
 * primitive prepares a candidate and commits after whole-file publication. Writes are
 * queued inside this handle so overlapping accepted calls cannot publish
 * failed candidates or lose an earlier committed update. Domain transactions
 * and cross-process coordination still belong to the caller.
 * @module @deepseek-ai/dsh-storage-json/src/unit
 */
import type { KvUnit, KvUnitDescriptor } from '@deepseek-ai/dsh-storage';
import type { RenameRetryOptions } from './atomic.ts';
/**
 * Open (load or lazily create) one unit backed by `path`.
 * @param descriptor - Static identity and shape of the unit.
 * @param root - Absolute backend root.
 * @param onClose - Backend callback releasing the unit's open-slot.
 * @param retry - Validated Windows rename retry policy.
 * @returns the opened unit.
 */
export declare function openSingleUnit(descriptor: KvUnitDescriptor, root: string, onClose: () => void, retry: RenameRetryOptions): Promise<KvUnit>;
