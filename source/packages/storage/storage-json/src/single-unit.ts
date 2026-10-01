/**
 * One opened JSON unit. Reads expose the last committed state; every write
 * primitive prepares a candidate and commits after whole-file publication. Writes are
 * queued inside this handle so overlapping accepted calls cannot publish
 * failed candidates or lose an earlier committed update. Domain transactions
 * and cross-process coordination still belong to the caller.
 * @module @deepseek-ai/dsh-storage-json/src/unit
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { StorageError } from '@deepseek-ai/dsh-storage'
import type { KvUnit, KvUnitDescriptor } from '@deepseek-ai/dsh-storage'
import { writeAtomic } from './atomic.ts'
import type { RenameRetryOptions } from './atomic.ts'
import { parse, serialize } from './format.ts'
import type { UnitState } from './format.ts'

/**
 * Open (load or lazily create) one unit backed by `path`.
 * @param descriptor - Static identity and shape of the unit.
 * @param root - Absolute backend root.
 * @param onClose - Backend callback releasing the unit's open-slot.
 * @param retry - Validated Windows rename retry policy.
 * @returns the opened unit.
 */
export async function openSingleUnit(
  descriptor: KvUnitDescriptor,
  root: string,
  onClose: () => void,
  retry: RenameRetryOptions,
): Promise<KvUnit> {
  const path = join(root, `${descriptor.name}.json`)
  let text: string | undefined
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    // Missing file = empty unit; materialization defers to the first write.
  }
  const state: UnitState =
    text === undefined
      ? {
        version: descriptor.version,
        global: null,
        tables: new Map(descriptor.tables.map(table => [table, new Map<string, unknown>()])),
      }
      : parse(text, descriptor)
  return new JsonKvUnit(descriptor, path, state, onClose, retry)
}

class JsonKvUnit implements KvUnit {
  private closed = false
  private writeTail: Promise<void> = Promise.resolve()
  private publicationFailure: unknown
  /** In-flight publishes; close() drains them before releasing the unit. */
  private readonly inFlight = new Set<Promise<void>>()

  constructor(
    private readonly descriptor: KvUnitDescriptor,
    private readonly path: string,
    private state: UnitState,
    private readonly onClose: () => void,
    private readonly retry: RenameRetryOptions,
  ) {}

  // oxlint-disable-next-line typescript/require-await -- async keeps the closed guard a rejection, not a synchronous throw
  async loadAll(): Promise<{ tables: Record<string, Record<string, unknown>>; global: unknown }> {
    this.assertOpen()
    const tables: Record<string, Record<string, unknown>> = {}
    for (const [table, records] of this.state.tables) {
      tables[table] = Object.fromEntries(records)
    }
    return { tables, global: this.state.global }
  }

  async putRecord(table: string, key: string, value: unknown): Promise<void> {
    this.assertOpen()
    await this.enqueue(async () => {
      const records = new Map(this.records(table))
      records.set(key, value)
      const tables = new Map(this.state.tables)
      tables.set(table, records)
      await this.publish({ ...this.state, tables })
    })
  }

  async deleteRecord(table: string, key: string): Promise<void> {
    this.assertOpen()
    await this.enqueue(async () => {
      const records = new Map(this.records(table))
      if (!records.has(key)) return
      records.delete(key)
      const tables = new Map(this.state.tables)
      tables.set(table, records)
      await this.publish({ ...this.state, tables })
    })
  }

  async setGlobal(value: unknown): Promise<void> {
    this.assertOpen()
    if (!this.descriptor.hasGlobal) {
      throw new Error(`unit '${this.descriptor.name}' does not declare a global slot`)
    }
    await this.enqueue(() => this.publish({ ...this.state, global: value }))
  }

  async close(): Promise<void> {
    if (this.closed) {
      await Promise.allSettled(this.inFlight)
      return
    }
    this.closed = true
    await Promise.allSettled(this.inFlight)
    this.onClose()
  }

  private assertOpen(): void {
    if (this.publicationFailure) throw this.publicationFailure
    if (this.closed) {
      throw new StorageError('closed', `unit '${this.descriptor.name}' is closed`)
    }
  }

  private records(table: string): Map<string, unknown> {
    const records = this.state.tables.get(table)
    if (!records) {
      throw new Error(`unit '${this.descriptor.name}' does not declare table '${table}'`)
    }
    return records
  }

  /** Reserve ordering before the first await; close drains accepted queued writes. */
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const write = this.writeTail.then(() => {
      if (this.publicationFailure) throw this.publicationFailure
      return operation()
    })
    this.writeTail = write.catch(() => {})
    this.inFlight.add(write)
    write.catch(() => {}).finally(() => this.inFlight.delete(write))
    return write
  }

  private async publish(candidate: UnitState): Promise<void> {
    try {
      await writeAtomic(this.path, serialize(this.descriptor.name, candidate), this.retry)
      this.state = candidate
    } catch (error) {
      // A post-rename durability failure cannot be described as a rollback.
      // Block this handle until close/reopen reconciles authoritative disk bytes.
      if ((error as { storagePublish?: { published?: boolean } }).storagePublish?.published) {
        this.state = candidate
        this.publicationFailure = error
      }
      throw error
    }
  }
}
