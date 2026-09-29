import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

const module = await import('../src/budget-scope.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const create = (...args) => {
  assert.equal(typeof module.createBudgetScopes, 'function', 'the budget scope implementation is required');
  return module.createBudgetScopes(...args);
};
function fixture() {
  const agents = new Map(), ambient = new AsyncLocalStorage(), bindings = new Map();
  const ctx = { agents: { get: id => agents.get(id), currentInitiator: () => ambient.getStore() } };
  const agent = (id, parentSession) => {
    const value = { id, status: 'running', session: { id, header: { id, version: 4, createdAt: 1, isSeeded: false, ...(parentSession ? { parentSession, origin: 'subagent' } : {}) } } };
    agents.set(id, value);
    return value;
  };
  const callbacks = { loadChildBinding: async id => bindings.get(id), saveChildBinding: async (id, scope) => { bindings.set(id, structuredClone(scope)); } };
  const request = (owner, signal, purpose) => ({ sessionId: owner.id, signal, ...(purpose ? { purpose } : {}) });
  return { ctx, agent, bindings, callbacks, ambient, request };
}
function capture(scopes, agent, turn) {
  const signal = new AbortController().signal;
  scopes.captureTurn({ agent, turn, signal });
  return signal;
}

// A retry or next tool step must not mint another five-yuan allowance.
test('all requests within one root turn share one durable task identity', async () => {
  const f = fixture(), a = f.agent('root-a'), scopes = create(f.ctx);
  const signal = capture(scopes, a, 3);
  const first = await scopes.resolve(f.request(a, signal));
  scopes.captureTurn({ agent: a, turn: 3, signal });
  assert.deepEqual(await scopes.resolve(f.request(a, signal)), first);
  assert.equal(first.kind, 'task'); assert.equal(first.rootSessionId, 'root-a'); assert.equal(first.rootTurn, 3);
  assert.match(first.taskId, /^task:[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(first), true);
});

test('root session and turn both separate task identity', async () => {
  const f = fixture(), a = f.agent('root-a'), b = f.agent('root-b'), scopes = create(f.ctx);
  const a1 = await scopes.resolve(f.request(a, capture(scopes, a, 1)));
  const b1 = await scopes.resolve(f.request(b, capture(scopes, b, 1)));
  const a2 = await scopes.resolve(f.request(a, capture(scopes, a, 2)));
  assert.equal(new Set([a1.taskId, b1.taskId, a2.taskId]).size, 3);
});

test('a root task identity survives resolver reload', async () => {
  const f = fixture(), a = f.agent('root-a'), first = create(f.ctx), second = create(f.ctx);
  assert.deepEqual(await first.resolve(f.request(a, capture(first, a, 7))), await second.resolve(f.request(a, capture(second, a, 7))));
});

test('parallel root calls preserve their frozen identities after later captures', async () => {
  const f = fixture(), a = f.agent('root-a'), b = f.agent('root-b'), scopes = create(f.ctx);
  const a1 = capture(scopes, a, 1), b4 = capture(scopes, b, 4);
  capture(scopes, a, 2);
  const [one, four] = await Promise.all([scopes.resolve(f.request(a, a1)), scopes.resolve(f.request(b, b4))]);
  assert.equal(one.rootTurn, 1); assert.equal(four.rootTurn, 4);
  assert.equal(one.rootSessionId, 'root-a'); assert.equal(four.rootSessionId, 'root-b');
});

test('a foreign session cannot borrow another session turn signal', async () => {
  const f = fixture(), a = f.agent('root-a'), b = f.agent('root-b'), scopes = create(f.ctx);
  const signal = capture(scopes, a, 1);
  assert.equal((await scopes.resolve(f.request(b, signal))).kind, 'background');
  assert.equal((await scopes.resolve(f.request(a, new AbortController().signal))).kind, 'background');
});

test('unbound auxiliary requests do not inherit the latest turn from ambient Agent', async () => {
  const f = fixture(), a = f.agent('root-a'), scopes = create(f.ctx);
  capture(scopes, a, 5);
  for (const purpose of ['session-title', 'compaction']) {
    const scope = await f.ambient.run(a, () => scopes.resolve(f.request(a, new AbortController().signal, purpose)));
    assert.equal(scope.kind, 'background'); assert.equal(scope.category, purpose);
    assert.equal(Object.hasOwn(scope, 'rootTurn'), false);
  }
});

test('automatic compaction with an exact captured signal shares the owning task', async () => {
  const f = fixture(), a = f.agent('root-a'), scopes = create(f.ctx), signal = capture(scopes, a, 5);
  assert.deepEqual(await scopes.resolve(f.request(a, signal, 'compaction')), await scopes.resolve(f.request(a, signal)));
});

test('fresh child binds to its causal parent task before the child runs', async () => {
  const f = fixture(), a = f.agent('root-a'), child = f.agent('child', 'root-a'), scopes = create(f.ctx, f.callbacks);
  const parentSignal = capture(scopes, a, 2), parent = await scopes.resolve(f.request(a, parentSignal));
  await f.ambient.run(a, () => scopes.captureChild({ agent: child, source: 'startup' }));
  const childSignal = capture(scopes, child, 1);
  assert.deepEqual(await scopes.resolve(f.request(child, childSignal)), parent);
  assert.deepEqual(f.bindings.get(child.id), parent);
});

test('child attribution stays on the originating turn while persistence is pending', async () => {
  const f = fixture(), a = f.agent('root-a'), child = f.agent('child', 'root-a');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const scopes = create(f.ctx, { ...f.callbacks, saveChildBinding: async (id, scope) => { await gate; await f.callbacks.saveChildBinding(id, scope); } });
  const parent = await scopes.resolve(f.request(a, capture(scopes, a, 2)));
  const saving = f.ambient.run(a, () => scopes.captureChild({ agent: child, source: 'startup' }));
  capture(scopes, a, 3); release(); await saving;
  assert.deepEqual(await scopes.resolve(f.request(child, capture(scopes, child, 1))), parent);
});

test('resumed child restores the original durable task rather than parent current turn', async () => {
  const f = fixture(), a = f.agent('root-a'), child = f.agent('child', 'root-a'), first = create(f.ctx, f.callbacks);
  const original = await first.resolve(f.request(a, capture(first, a, 2)));
  await f.ambient.run(a, () => first.captureChild({ agent: child, source: 'startup' }));
  const reloaded = create(f.ctx, f.callbacks); capture(reloaded, a, 9);
  await f.ambient.run(a, () => reloaded.captureChild({ agent: child, source: 'resume' }));
  assert.deepEqual(await reloaded.resolve(f.request(child, capture(reloaded, child, 3))), original);
});

test('resumed child without persisted attribution remains background even with a live parent', async () => {
  const f = fixture(), a = f.agent('root-a'), child = f.agent('child', 'root-a'), scopes = create(f.ctx);
  capture(scopes, a, 9);
  await f.ambient.run(a, () => scopes.captureChild({ agent: child, source: 'resume' }));
  assert.equal((await scopes.resolve(f.request(child, capture(scopes, child, 3)))).kind, 'background');
});

test('parent header alone does not prove causality for a new child', async () => {
  const f = fixture(), a = f.agent('root-a'), other = f.agent('other'), child = f.agent('child', 'root-a'), scopes = create(f.ctx, f.callbacks);
  capture(scopes, a, 2); capture(scopes, other, 8);
  await f.ambient.run(other, () => scopes.captureChild({ agent: child, source: 'startup' }));
  assert.equal((await scopes.resolve(f.request(child, capture(scopes, child, 1)))).kind, 'background');
  assert.equal(f.bindings.size, 0);
});

test('failed durable child binding cannot authorize an in-memory task association', async () => {
  const f = fixture(), a = f.agent('root-a'), child = f.agent('child', 'root-a');
  const scopes = create(f.ctx, { ...f.callbacks, saveChildBinding: async () => { throw new Error('storage-failed'); } });
  capture(scopes, a, 2);
  await assert.rejects(f.ambient.run(a, () => scopes.captureChild({ agent: child, source: 'startup' })), /storage-failed/);
  assert.equal((await scopes.resolve(f.request(child, capture(scopes, child, 1)))).kind, 'background');
});

test('unknown and agentless requests have a stable background bucket across reload', async () => {
  const f = fixture(), first = create(f.ctx), second = create(f.ctx);
  for (const options of [{}, { sessionId: 'absent' }, { purpose: 'session-title' }]) {
    const scope = await first.resolve(options);
    assert.equal(scope.kind, 'background');
    assert.deepEqual(await second.resolve(options), scope);
  }
});

test('a malformed persisted task binding is rejected rather than accepted as a fresh allowance', async () => {
  const f = fixture(), child = f.agent('child', 'root-a');
  f.bindings.set(child.id, { kind: 'task', taskId: 'task:forged', rootSessionId: 'root-a', rootTurn: 2 });
  await assert.rejects(create(f.ctx, f.callbacks).captureChild({ agent: child, source: 'resume' }), { code: 'BUDGET_SCOPE_INVALID' });
});

test('a detached ambient chain cannot assign a fresh child to an already idle parent turn', async () => {
  const f = fixture(), a = f.agent('root-a'), child = f.agent('child', 'root-a'), scopes = create(f.ctx, f.callbacks);
  capture(scopes, a, 2);
  a.status = 'idle';
  await f.ambient.run(a, () => scopes.captureChild({ agent: child, source: 'startup' }));
  assert.equal((await scopes.resolve(f.request(child, capture(scopes, child, 1)))).kind, 'background');
  assert.equal(f.bindings.size, 0);
});

test('resolveTurn freezes a registered active turn without awaiting mutable task state', async () => {
  const f = fixture(), a = f.agent('root-a'), scopes = create(f.ctx);
  const signal = capture(scopes, a, 4);
  assert.equal(typeof scopes.resolveTurn, 'function');
  const result = scopes.resolveTurn({ agent: a, turn: 4 });
  assert.equal(result instanceof Promise, false);
  assert.deepEqual(result, await scopes.resolve(f.request(a, signal)));
});

test('a late request for an old turn cannot attach itself to the newly active turn', async () => {
  const f = fixture(), a = f.agent('root-a'), scopes = create(f.ctx);
  capture(scopes, a, 4); capture(scopes, a, 5);
  assert.equal(typeof scopes.resolveTurn, 'function');
  assert.equal(scopes.resolveTurn({ agent: a, turn: 4 }).kind, 'background');
  assert.equal(scopes.resolveTurn({ agent: a, turn: 5 }).rootTurn, 5);
  assert.equal(scopes.resolveTurn({ agent: { ...a }, turn: 5 }).kind, 'background');
  assert.equal(scopes.resolveTurn({ agent: a }).kind, 'background');
  assert.equal(scopes.resolveTurn({}).kind, 'background');
});

test('resolveTurn of a child preserves its parent task identity instead of minting a child allowance', async () => {
  const f = fixture(), a = f.agent('root-a'), child = f.agent('child', 'root-a'), scopes = create(f.ctx, f.callbacks);
  const parent = await scopes.resolve(f.request(a, capture(scopes, a, 4)));
  await f.ambient.run(a, () => scopes.captureChild({ agent: child, source: 'startup' }));
  capture(scopes, child, 2);
  assert.equal(typeof scopes.resolveTurn, 'function');
  assert.deepEqual(scopes.resolveTurn({ agent: child, turn: 2 }), parent);
  assert.equal(scopes.resolveTurn({ agent: child, turn: 4 }).kind, 'background');
});
