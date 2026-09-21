import { AsyncLocalStorage } from 'node:async_hooks';

// Fixed diagnostic disclosure policy, not a deployment tuning parameter.
const codes = new Set([
  'EPERM','EACCES','EBUSY','EIO','ENOSPC','EROFS','ENOENT','EEXIST','EMFILE','ENFILE','ETIMEDOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND',
  'ABORTED','UNKNOWN','NO_ADAPTER','INVALID_ARGS','INVARIANT','RATE_LIMIT','RATE_LIMITED','TIMEOUT','NETWORK','AUTH','QUOTA',
  'CONTEXT_WINDOW_EXCEEDED','EMPTY_RESPONSE','INVALID_CREDENTIAL','MISSING_CREDENTIAL',
  'BUDGET_CONFIG','BUDGET_LOCKED','BUDGET_LOCK_LOST','BUDGET_CORRUPT','BUDGET_ESTIMATE','BUDGET_EXCEEDED','BUDGET_ESTIMATE_EXCEEDED','DUPLICATE_REQUEST','UNKNOWN_RESERVATION',
  'P1_MODEL_NOT_ALLOWED','P1_OUTPUT_LIMIT','P1_INPUT_LIMIT','P1_IMAGE_NOT_ALLOWED','P1_USAGE_INVALID','P1_HISTORY_LIMIT','P1_CHILD_FAILED',
  'P1_CHILD_INTERRUPTED','P1_CHILD_REFUSED','P1_CHILD_MAX_TOKENS','P1_DISPOSE_FAILED',
]);

/** Retain only reviewed codes and suite-owned phase names, never native prose. */
export function safeP1Failure(error, stage, source) {
  const code = codes.has(error?.code) ? error.code : 'P1_CHILD_FAILED';
  return { code, stage, source };
}

/** Capture first failure without allowing cleanup to replace its attribution. */
export function preserveP1Failure(record, error, stage, source) {
  if (!record.failure) {
    record.failure = safeP1Failure(error, stage, source);
    record.code = record.failure.code;
  }
  return record.failure;
}

/** Observe only native agents created by the current suite-owned start interval. */
export function createP1FailureTracker(ctx) {
  const starting = new AsyncLocalStorage(), children = new Map();
  const capture = (entry, error, source) => {
    if (entry && !entry.closed) preserveP1Failure(entry.record, error, 'child-run', source);
  };
  const bindAgent = (entry, agent) => {
    if (!entry || entry.closed || !agent || agent.session.header.origin !== 'subagent' || agent.session.header.parentSession !== entry.record.parentSessionId) return;
    if (entry.agent && entry.agent !== agent) return;
    entry.agent = agent; children.set(agent.id, entry);
  };
  ctx.on('agent/created', ({ agent }) => bindAgent(starting.getStore(), agent));
  ctx.on('agent/error', ({ agent, error }) => {
    const entry = children.get(agent.id);
    if (entry?.agent === agent) capture(entry, error, 'agent/error');
  });
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return;
    const entry = children.get(session.id);
    if (!entry || entry.closed) return;
    const reason = event.data.reason;
    if (reason?.kind === 'error') capture(entry, reason.error, 'session/turn-end');
    else if (reason?.kind === 'interrupted') capture(entry, { code: 'P1_CHILD_INTERRUPTED' }, 'session/turn-end');
  });
  const close = entry => {
    entry.closed = true;
    if (entry.agent && children.get(entry.agent.id) === entry) children.delete(entry.agent.id);
    entry.agent = undefined;
  };
  ctx.effect(() => () => { for (const entry of new Set(children.values())) close(entry); });
  return {
    open: record => ({ record, closed: false, agent: undefined }),
    start: (entry, fn) => starting.run(entry, fn),
    bind: (entry, run) => bindAgent(entry, ctx.agents.get(run.id)),
    result(entry, result) {
      if (result.stopReason === 'error') capture(entry, { code: 'P1_CHILD_FAILED' }, 'subagent/result');
      else if (result.stopReason === 'refusal') capture(entry, { code: 'P1_CHILD_REFUSED' }, 'subagent/result');
      else if (result.stopReason === 'max-tokens') capture(entry, { code: 'P1_CHILD_MAX_TOKENS' }, 'subagent/result');
    },
    close,
  };
}
