const categories = new Set(['preference', 'personal', 'goal', 'task', 'project', 'temporary']);
const longTerm = new Set(['preference', 'personal', 'goal']);
const closed = state => state === 'completed' || state === 'cancelled';
const day = 86_400_000;

/** Classification is supplied by a trusted write path; it never infers personal facts from text. */
export function classifyMemory({category, kind} = {}, project) {
  category ??= kind === 'preference' ? 'preference' : kind === 'task' ? 'task' : 'project';
  if (!categories.has(category)) throw new Error('MEMORY_CATEGORY');
  const shared = (category === 'preference' || category === 'personal') && Boolean(project?.userProfile);
  return {layer: longTerm.has(category) ? 'L3' : 'L2', category, scope: shared ? 'user' : 'project'};
}

// Date.parse normalizes impossible dates such as February 30, so verify the calendar first.
function timestamp(value) {
  if (typeof value !== 'string') return NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return NaN;
  const [, year, month, date, hour, minute, second, zone] = match;
  const y = Number(year), m = Number(month), d = Number(date);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return NaN;
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return NaN;
  return Date.parse(value);
}

const identifiers = value => value === undefined || (Array.isArray(value) && value.every(id => typeof id === 'string' && id.length > 0));
const optionalBoolean = value => value === undefined || typeof value === 'boolean';

/**
 * Return archival eligibility only; the caller must durably archive before removing active data.
 * active must contain the complete active records in the same project/owner scope.
 * lastUsedAt is written only for effective user usage, never for scans or automatic injection.
 */
export function archiveReason(record, {now, active = []} = {}) {
  const clock = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : timestamp(now);
  if (!Number.isFinite(clock) || !record || !Array.isArray(active)) return null;
  if (!['candidate', 'confirmed'].includes(record.status) || !categories.has(record.category)) return null;
  if (record.layer !== (longTerm.has(record.category) ? 'L3' : 'L2')) return null;
  if (!identifiers(record.dependsOn) || !identifiers(record.conflictsWith) || !optionalBoolean(record.pinned) || !optionalBoolean(record.retained)) return null;
  if (record.pinned || record.retained || record.dependsOn?.length) return null;
  if (record.taskState !== undefined && !['active', 'open', 'completed', 'cancelled'].includes(record.taskState)) return null;
  if (record.dueAt !== undefined && !Number.isFinite(timestamp(record.dueAt))) return null;

  const times = {};
  for (const field of ['createdAt', 'updatedAt', 'lastUsedAt', 'closedAt']) {
    if (record[field] === undefined && field !== 'createdAt' && field !== 'updatedAt') continue;
    times[field] = timestamp(record[field]);
    if (!Number.isFinite(times[field]) || times[field] > clock) return null;
  }
  if (times.updatedAt < times.createdAt || (times.closedAt !== undefined && times.closedAt < times.createdAt)) return null;

  const ids = new Set(active.map(other => other?.id));
  if (record.conflictsWith?.some(id => ids.has(id))) return null;
  for (const other of active) {
    if (!other || !identifiers(other.dependsOn) || !identifiers(other.conflictsWith)) return null;
    if (other.id !== record.id && (other.dependsOn?.includes(record.id) || other.conflictsWith?.includes(record.id))) return null;
  }
  // Non-task records use active for current validity; only an explicit open marker means a pending item.
  if (record.taskState === 'open') return null;
  if ((record.category === 'task' || record.category === 'goal') && record.taskState === 'active') return null;
  if (record.category === 'task' && !closed(record.taskState)) return null;

  const idleSince = Math.max(times.createdAt, times.updatedAt, times.lastUsedAt ?? -Infinity);
  if (record.status === 'candidate') {
    if (record.dueAt !== undefined && !closed(record.taskState)) return null;
    return clock - idleSince >= 30 * day ? 'candidate_unconfirmed_30d' : null;
  }
  if (record.category === 'task') {
    return times.closedAt !== undefined && clock - times.closedAt >= 7 * day ? 'task_closed_7d' : null;
  }
  if (record.category === 'temporary') {
    if (record.dueAt !== undefined) return null;
    return clock - idleSince >= 30 * day ? 'temporary_unused_30d' : null;
  }
  if (record.category === 'goal') {
    if (!closed(record.taskState) || times.closedAt === undefined) return null;
    if (active.some(other => other.category === 'task' && !closed(other.taskState))) return null;
    return clock - times.closedAt >= 30 * day ? 'project_closed_30d' : null;
  }
  return null;
}
