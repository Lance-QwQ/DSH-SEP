import { createHash } from 'node:crypto';
import { fail } from './errors.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = value => typeof value === 'string' && value.length > 0 && value.length <= 1000;
const auxiliary = new Set(['session-title', 'compaction', 'sep-prework']);

function taskScope(rootSessionId, rootTurn) {
  if (!identity(rootSessionId) || !Number.isSafeInteger(rootTurn) || rootTurn < 1) fail('BUDGET_SCOPE_INVALID');
  return Object.freeze({ kind: 'task', taskId: `task:${hash(['sep-budget-task-v1', rootSessionId, rootTurn])}`, rootSessionId, rootTurn });
}

function restoredScope(value) {
  if (!value || value.kind !== 'task') fail('BUDGET_SCOPE_INVALID');
  const expected = taskScope(value.rootSessionId, value.rootTurn);
  if (value.taskId !== expected.taskId) fail('BUDGET_SCOPE_INVALID');
  return expected;
}

function background(options = {}) {
  const category = auxiliary.has(options.purpose) ? options.purpose : 'unattributed';
  const sessionId = identity(options.sessionId) ? options.sessionId : null;
  return Object.freeze({ kind: 'background', taskId: `background:${hash(['sep-budget-background-v1', sessionId, category])}`, category, ...(identity(options.rootSessionId) ? {rootSessionId:options.rootSessionId} : {}) });
}

/**
 * Attribute the Host's explicit turn signals without changing sessions or budgets.
 * The caller captures pre-step/request payloads and awaits captureChild from the
 * serial agent/created hook. Bindings are persisted by the budget ledger callbacks.
 * A background result is still charged to the cumulative ledger; it is not an exemption.
 */
export function createBudgetScopes(ctx, { loadChildBinding, saveChildBinding } = {}) {
  const signals = new WeakMap(), active = new WeakMap(), children = new WeakMap();
  const registered = agent => agent && identity(agent.id) && agent.session?.id === agent.id && ctx.agents.get(agent.id) === agent;

  function rootFor(sessionId) {
    if (!identity(sessionId)) return undefined;
    const agent=ctx.agents.get(sessionId);
    const session=registered(agent)?agent.session:ctx.sessions?.get?.(sessionId);
    if (!session || session.id!==sessionId) return undefined;
    if (session.header.origin==='subagent') return registered(agent)?children.get(agent)?.rootSessionId:undefined;
    return sessionId;
  }
  const sessionBackground=options=>background({...options,rootSessionId:rootFor(options.sessionId)});

  function captureTurn({ agent, turn, signal }) {
    if (!registered(agent) || !Number.isSafeInteger(turn) || turn < 1 || !(signal instanceof AbortSignal)) fail('BUDGET_SCOPE_INVALID');
    const prior = signals.get(signal);
    if (prior && (prior.agent !== agent || prior.turn !== turn)) fail('BUDGET_SCOPE_CONFLICT');
    const scope = agent.session.header.origin === 'subagent'
      ? children.get(agent) ?? background({ sessionId: agent.id })
      : taskScope(agent.id, turn);
    const binding = Object.freeze({ agent, turn, signal, scope });
    signals.set(signal, binding);
    active.set(agent, binding);
    return scope;
  }

  async function captureChild({ agent, source }) {
    if (!registered(agent) || agent.session.header.origin !== 'subagent') return;
    const childId = agent.id;
    const parentId = agent.session.header.parentSession;
    const parent = identity(parentId) ? ctx.agents.get(parentId) : undefined;
    // Freeze before any persistence await. Looking up the parent after that
    // boundary could assign a late child to a later, unrelated parent turn.
    const parentBinding = registered(parent) && parent.status === 'running' && ctx.agents.currentInitiator?.() === parent ? active.get(parent) : undefined;
    const proposed = source === 'startup' && parentBinding && !parentBinding.signal.aborted && parentBinding.scope.kind === 'task'
      ? parentBinding.scope : undefined;
    const stored = loadChildBinding ? await loadChildBinding(childId) : undefined;
    const restored = stored === undefined || stored === null ? undefined : restoredScope(stored);
    const known = children.get(agent);
    if (restored && known && restored.taskId !== known.taskId) fail('BUDGET_SCOPE_CONFLICT');
    if (restored) { children.set(agent, restored); return; }
    if (known) return;
    // A resumed child without a durable binding cannot borrow today's parent
    // allowance. Do not guess from its header or from ambient Agent identity.
    if (!proposed) return;
    if (saveChildBinding) await saveChildBinding(childId, proposed);
    children.set(agent, proposed);
  }

  async function resolve(options = {}) {
    const binding = options.signal instanceof AbortSignal ? signals.get(options.signal) : undefined;
    if (binding && options.sessionId === binding.agent.id && registered(binding.agent)) return binding.scope;
    return sessionBackground(options);
  }

  // Execution payloads carry an exact turn even when their cancellation signal
  // is combined with deadlines. Resolve it synchronously before any await.
  function resolveTurn({ agent, turn } = {}) {
    const binding = registered(agent) ? active.get(agent) : undefined;
    if (binding && binding.turn === turn) return binding.scope;
    return sessionBackground({ sessionId: registered(agent)?agent.id:undefined });
  }

  return Object.freeze({ captureTurn, captureChild, resolve, resolveTurn });
}


