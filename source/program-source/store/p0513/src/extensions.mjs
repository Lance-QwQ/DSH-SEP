import { z } from 'zod';
import { foldTasks } from '@deepseek-ai/dsh-task-checkpoint/fold';

const taskFields = ['schema', 'taskId', 'revision', 'sessionId', 'agentId', 'project', 'action'];
const recoveryFields = ['recoveryFromTaskId', 'recoveryPlanHash', 'recoveryRequestId', 'recoveryProjectId', 'recoveryProjectGeneration'];
const text = z.string().min(1).max(4096);
const recovery = z.strictObject({ recoveryFromTaskId: text, recoveryPlanHash: z.string().regex(/^[a-f0-9]{64}$/), recoveryRequestId: text, recoveryProjectId: z.uuid(), recoveryProjectGeneration: z.number().int().positive() });
/** Explicit local inventory. Unknown historical events remain outside this list. */
export function localDispositions(disposition) {
  return { 'task/checkpoint-change': disposition(taskFields, ['objective', 'steps', 'operation']), 'recovery/continuation': disposition(recoveryFields) };
}
/** Validate local durable envelopes without reclassifying requiredness. Full task replay is validated at artifact boundaries. */
export function assertLocalEvent(event) {
  if (!['task/checkpoint-change', 'recovery/continuation'].includes(event.type)) return false;
  if (Object.keys(event).some(key => !['type', 'seq', 'time', 'data', 'ignorable'].includes(key))) throw new Error('LOCAL_SCHEMA: local extension must be log-only');
  if (!Number.isSafeInteger(event.seq) || event.seq < 0 || !Number.isSafeInteger(event.time)) throw new Error('LOCAL_SCHEMA: invalid event coordinates');
  if (event.type === 'recovery/continuation') {
    if (event.ignorable !== true) throw new Error('LOCAL_SCHEMA: recovery linkage must retain its existing ignorable marker');
    recovery.parse(event.data);
  } else {
    if (Object.hasOwn(event, 'ignorable')) throw new Error('TASK_SCHEMA: task changes must remain required');
    const data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('TASK_SCHEMA: missing change');
    const extra = data.action === 'create' ? ['objective', 'steps'] : ['prepare', 'settle'].includes(data.action) ? ['operation'] : data.action === 'cancel' ? [] : undefined;
    if (!extra || [...taskFields, ...extra].some(key => !Object.hasOwn(data, key)) || Object.keys(data).some(key => ![...taskFields, ...extra].includes(key))) throw new Error('TASK_SCHEMA: exact action fields required');
  }
  return true;
}
/** Validate full task transitions in source and target coordinates; no action is dispatched. */
export function validateLocalArtifact(artifact) {
  for (const event of artifact.events) assertLocalEvent(event);
  return foldTasks(artifact.events, Number.MAX_SAFE_INTEGER);
}
/** Rebase only the audited same-log operation intent; identities and effect state remain untouched. */
export function remapLocalEvent(event, earlier, targetSeq) {
  if (event.type !== 'task/checkpoint-change' || !event.data.operation) return event;
  const operation = event.data.operation;
  const prepare = event.data.action === 'prepare';
  if (operation.intentSeq > event.seq || (!prepare && operation.intentSeq === event.seq)) throw new Error('TASK_SCHEMA: invalid operation intent reference');
  // Full source replay has already established whether this is the first prepare or an identical revision redelivery.
  return { ...event, data: { ...event.data, operation: { ...operation, intentSeq: prepare && operation.intentSeq === event.seq ? targetSeq : earlier(operation.intentSeq) } } };
}
