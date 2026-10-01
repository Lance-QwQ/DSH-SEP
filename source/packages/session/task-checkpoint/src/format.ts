/** SEP durable extension validation and audited same-log coordinate remapping. */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionFormatArtifact, SessionFormatEvent } from '@deepseek-ai/dsh-session-format'
import { changeSchema, foldTasks } from './fold.ts'

const text = z.string().min(1).max(4096)
const recovery = z.strictObject({ recoveryFromTaskId: text, recoveryPlanHash: z.string().regex(/^[a-f0-9]{64}$/), recoveryRequestId: text, recoveryProjectId: z.uuid(), recoveryProjectGeneration: z.number().int().positive() })
/** Admit identified SEP rows before general recoverable-tail handling.
 * @param value - untrusted parsed physical row.
 */
export function assertLocalRow(value: unknown): void {
  if (typeof value === 'object' && value !== null && 'type' in value
    && (value.type === 'task/checkpoint-change' || value.type === 'recovery/continuation')) {
    assertLocalEvent(value as SessionFormatEvent)
  }
}
/** Validate only the two declared SEP events; requiredness is never downgraded.
 * @param event - decoded durable event.
 * @returns whether the event belongs to the SEP inventory.
 */
export function assertLocalEvent(event: SessionFormatEvent): boolean {
  if (event.type !== 'task/checkpoint-change' && event.type !== 'recovery/continuation') return false
  if (Object.keys(event).some(key => !['type', 'seq', 'time', 'data', 'ignorable'].includes(key))) throw Error('LOCAL_SCHEMA: local extension must be log-only')
  if (!Number.isSafeInteger(event.seq) || event.seq < 0 || !Number.isSafeInteger(event.time)) throw Error('LOCAL_SCHEMA: invalid event coordinates')
  if (event.type === 'recovery/continuation') {
    if (event['ignorable'] !== true) throw Error('LOCAL_SCHEMA: recovery linkage must remain ignorable')
    recovery.parse(event.data)
  } else {
    if (Object.hasOwn(event, 'ignorable')) throw Error('TASK_SCHEMA: task changes must remain required')
    changeSchema.parse(event.data)
  }
  return true
}
/** Validate task transitions at the durable artifact boundary without dispatching operations.
 * @param artifact - detached decoded source or target.
 */
export function validateLocalArtifact(artifact: SessionFormatArtifact): void {
  for (const event of artifact.events) assertLocalEvent(event)
  // Each task payload is parsed above and by foldTasks; other event kinds are not consumed by this fold.
  foldTasks(artifact.events as SessionEvent[], Number.MAX_SAFE_INTEGER)
}
/** Rebase the classified operation intent while preserving scope and effect state.
 * @param event - validated source event.
 * @param earlier - lookup that refuses absent or forward source references.
 * @param targetSeq - new event position.
 * @returns a detached rebased event, or the unchanged event when no task coordinate exists.
 */
export function remapLocalEvent(event: SessionFormatEvent, earlier: (seq: number) => number, targetSeq: number): SessionFormatEvent {
  if (event.type !== 'task/checkpoint-change') return event
  const change = changeSchema.parse(event.data)
  if (change.action !== 'prepare' && change.action !== 'settle') return event
  const operation = change.operation, prepare = change.action === 'prepare'
  if (operation.intentSeq > event.seq || (!prepare && operation.intentSeq === event.seq)) throw Error('TASK_SCHEMA: invalid operation intent reference')
  return { ...event, data: { ...change, operation: { ...operation, intentSeq: prepare && operation.intentSeq === event.seq ? targetSeq : earlier(operation.intentSeq) } } }
}
