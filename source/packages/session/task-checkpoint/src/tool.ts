/** Task orchestration kept behind one current tool consumer. @module @deepseek-ai/dsh-task-checkpoint */
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { FsVersion } from '@deepseek-ai/dsh-fs'
import { ToolCallId, HarnessError } from '@deepseek-ai/dsh-llm'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { Config } from './index.ts'
import type { TaskArtifactEvidence, TaskChange, TaskOperation, TaskState, TaskStep } from './types.ts'
import { foldTasks, stepSchema } from './fold.ts'
import { TaskId, TaskStepId, TaskOperationId } from './ids.ts'

const poisonedSessions = new WeakSet<Session>()
const inputBase = { task_id: z.uuid() }
const inputSchema = z.discriminatedUnion('action', [
  z.strictObject({ ...inputBase, action: z.literal('create'), objective: z.string().trim().min(1).max(4096), plan_json: z.string() }),
  z.strictObject({ ...inputBase, action: z.literal('read') }),
  z.strictObject({ ...inputBase, action: z.literal('track') }),
  z.strictObject({ ...inputBase, action: z.literal('reconcile') }),
  z.strictObject({ ...inputBase, action: z.literal('cancel'), expected_revision: z.number().int().positive() }),
  z.strictObject({ ...inputBase, action: z.literal('execute'), expected_revision: z.number().int().positive(), step_id: z.string(), operation_id: z.uuid(), tool: z.string(), arguments_json: z.string() }),
])
type Input = z.infer<typeof inputSchema>
interface Scope { agent: Agent; session: Session; project: FsTarget; cwd: string }
interface Evidence { path: string; matched: boolean; evidence?: TaskArtifactEvidence; reason?: string }
interface OwnedOperation { controller: AbortController; done: PromiseWithResolvers<void> }
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')
function fail(code: string, message: string): never { throw new HarnessError(message, code) }
const taskEvents = (events: readonly SessionEvent[]): SessionEvent[] => events.filter(event => event.type === 'task/checkpoint-change')
function taskStep(task: TaskState, id: string): TaskStep {
  return task.steps.find(step => step.id === id) ?? fail('TASK_SCHEMA', 'operation step is absent')
}

/** Install the bounded explicit tool and its owned operation cleanup.
 * @param ctx - current execution and persistence services.
 * @param config - normalized configuration.
 */
export function installTaskTool(ctx: Context, config: Config): void {
  const caps = config as Required<Config>
  if (caps.allowedTools.length === 0 || caps.allowedTools.length > 64 || new Set(caps.allowedTools).size !== caps.allowedTools.length
    || caps.allowedTools.some(tool => !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(tool) || tool === 'task_checkpoint')) {
    throw new Error('allowedTools must contain 1–64 distinct registered tool names and cannot include task_checkpoint')
  }
  const queues = new WeakMap<Session, Promise<unknown>>()
  const owned = new Map<Session, Map<string, OwnedOperation>>()
  let disposed = false
  const serial = <T>(session: Session, body: () => Promise<T>): Promise<T> => {
    const next = (queues.get(session) ?? Promise.resolve()).catch(() => {}).then(body)
    queues.set(session, next)
    return next
  }

  function assertLive(current: Scope): void {
    if (ctx.agents.get(current.agent.id) !== current.agent || ctx.sessions.get(current.session.id) !== current.session) {
      fail('TASK_AUTHORITY', 'task owner is no longer the current live Agent and Session')
    }
  }

  async function scope(exec: ToolRunContext): Promise<Scope> {
    const agent = ctx.agents.currentInitiator()
    if (agent === undefined || agent !== exec.agent || ctx.agents.get(agent.id) !== agent || ctx.sessions.get(agent.id) !== agent.session) {
      return fail('TASK_AUTHORITY', 'task actions require the current live Agent and its exact Session')
    }
    const cwd = agent.session.header.cwd
    if (cwd === undefined || cwd.trim() !== cwd || cwd.length === 0 || !isAbsolute(cwd)) return fail('TASK_SCOPE', 'task actions require an explicit current project')
    const project = await ctx.fs.resolve(cwd, { signal: exec.signal })
    if ((await ctx.fs.stat(project, exec.signal))?.type !== 'directory') return fail('TASK_SCOPE', 'current project is missing or is not a directory')
    return { agent, session: agent.session, project, cwd }
  }

  async function flush(session: Session): Promise<void> {
    try {
      if (!await ctx.sessions.flush(session)) fail('TASK_DURABILITY', 'task changes require a configured durable Session writer')
    } catch (error) { poisonedSessions.add(session); throw error }
  }

  async function state(current: Scope, signal: AbortSignal): Promise<Map<string, TaskState>> {
    assertLive(current)
    if (disposed) return fail('TASK_DISPOSED', 'task checkpoint component is disposed')
    if (poisonedSessions.has(current.session)) return fail('TASK_DURABILITY', 'a durability failure requires reloading this Session before task actions')
    const events = current.session.snapshotEvents()
    const tasks = foldTasks(events, caps.maxStateBytes)
    if (tasks.size > caps.maxTasks
      || [...tasks.values()].some(task => task.steps.length > caps.maxSteps || task.operations.length > caps.maxOperations)) {
      return fail('TASK_LIMIT', 'current task history exceeds configured task, step or operation limits')
    }
    // A separate read handle observes storage without stealing the Agent's single
    // write ownership. Always close it, including malformed or divergent history.
    const reader = await ctx.sessionPersistence.open(current.session.id, 'read', { signal })
    try {
      const durable = await reader.read(0, undefined, { signal })
      foldTasks(durable.events, caps.maxStateBytes)
      if (JSON.stringify(taskEvents(durable.events)) !== JSON.stringify(taskEvents(events))) {
        return fail('TASK_DURABILITY', 'task memory differs from durable storage; reload before continuing')
      }
    } finally { await reader.close() }
    return tasks
  }

  function boundTask(task: TaskState | undefined, current: Scope): TaskState {
    if (task === undefined) return fail('TASK_NOT_FOUND', 'task is absent from this Session')
    if (task.sessionId !== current.session.id || task.agentId !== current.agent.id || task.project !== current.project.targetKey) {
      return fail('TASK_SCOPE', 'task belongs to a different Session, Agent or project')
    }
    return task
  }

  async function commit(current: Scope, change: TaskChange): Promise<TaskState> {
    assertLive(current)
    const candidate: SessionEvent = { type: 'task/checkpoint-change', seq: SessionSeq(current.session.seq), time: Date.now(), data: change }
    const tasks = foldTasks([...current.session.snapshotEvents(), candidate], caps.maxStateBytes)
    if (tasks.size > caps.maxTasks) return fail('TASK_LIMIT', 'task count limit reached')
    const task = tasks.get(change.taskId) ?? fail('TASK_SCHEMA', 'committed task is absent')
    if (task.operations.length > caps.maxOperations) return fail('TASK_LIMIT', 'task operation limit reached')
    let reserved = 0
    const reservedBytes = (data: TaskChange): number => Buffer.byteLength(JSON.stringify({ type: 'task/checkpoint-change', seq: Number.MAX_SAFE_INTEGER, time: Number.MAX_SAFE_INTEGER, data }))
    for (const retained of tasks.values()) {
      if (retained.cancelled) continue
      const envelope = {
        schema: 1 as const, taskId: retained.id, revision: Number.MAX_SAFE_INTEGER,
        sessionId: retained.sessionId, agentId: retained.agentId, project: retained.project,
      }
      reserved += reservedBytes({ ...envelope, action: 'cancel' })
      for (const pending of retained.operations.filter(op => op.state === 'prepared')) {
        const step = taskStep(retained, pending.stepId)
        // A JSON string can require six encoded bytes per UTF-16 unit. Reserve
        // the schema maximum, not the usual short local-provider version.
        const artifacts = step.artifacts.map(file => ({ ...file, version: FsVersion('\u0000'.repeat(4096)), bytes: caps.maxArtifactBytes }))
        const complete = reservedBytes({ ...envelope, action: 'settle', operation: { ...pending, state: 'completed', resultCode: 'OK', artifacts } })
        const uncertain = reservedBytes({ ...envelope, action: 'settle', operation: { ...pending, state: 'uncertain', resultCode: '\u0000'.repeat(256), artifacts: [] } })
        reserved += Math.max(complete, uncertain)
      }
    }
    const retainedBytes = taskEvents([...current.session.snapshotEvents(), candidate])
      .reduce((total, event) => total + Buffer.byteLength(JSON.stringify(event)), 0)
    if (retainedBytes + reserved > caps.maxStateBytes) return fail('TASK_LIMIT', 'task history lacks reserved settlement and cancellation capacity')
    current.session.append('task/checkpoint-change', change)
    await flush(current.session)
    assertLive(current)
    return task
  }

  function base(current: Scope, id: string, revision: number) {
    return {
      schema: 1 as const, taskId: TaskId(id), revision, sessionId: current.session.id,
      agentId: current.agent.id, project: current.project.targetKey,
    }
  }

  async function verify(current: Scope, step: TaskStep, signal: AbortSignal, prior?: TaskOperation): Promise<Evidence[]> {
    const facts: Evidence[] = []
    for (const file of step.artifacts) {
      assertLive(current)
      signal.throwIfAborted()
      try {
        const target = await ctx.fs.resolve(file.path, { cwd: current.cwd, signal })
        if (!ctx.fs.contains(current.project, target)) fail('TASK_SCOPE', 'artifact resolves outside the current project')
        const before = await ctx.fs.stat(target, signal)
        if (before?.type !== 'file' || before.size === undefined || before.size > caps.maxArtifactBytes) fail('TASK_ARTIFACT', 'artifact is absent, not regular, or exceeds the byte limit')
        const bytes = await ctx.fs.readBytes(target, signal, caps.maxArtifactBytes)
        const fresh = await ctx.fs.resolve(file.path, { cwd: current.cwd, signal })
        const after = await ctx.fs.stat(fresh, signal)
        if (fresh.targetKey !== target.targetKey || after?.version !== before.version || after.size !== bytes.length) fail('TASK_ARTIFACT', 'artifact changed during verification')
        const evidence = { path: file.path, sha256: hash(bytes), version: after.version, bytes: bytes.length }
        const recorded = prior?.artifacts.find(item => item.path === file.path)
        const matched = evidence.sha256 === file.sha256 && (prior === undefined || recorded?.version === evidence.version)
        facts.push({ path: file.path, matched, evidence, ...matched ? {} : { reason: 'artifact hash or recorded version differs' } })
      } catch (error) {
        signal.throwIfAborted()
        facts.push({ path: file.path, matched: false, reason: String(error).slice(0, 256) })
      }
    }
    return facts
  }

  async function view(current: Scope, task: TaskState, signal: AbortSignal, inspect: boolean): Promise<string> {
    assertLive(current)
    const evidence: { stepId: string; files: Evidence[] }[] = []
    if (inspect) for (const step of task.steps) {
      const done = task.operations.find(op => op.stepId === step.id && op.state === 'completed')
      if (done !== undefined || task.operations.some(op => op.stepId === step.id)) {
        evidence.push({ stepId: step.id, files: await verify(current, step, signal, done) })
      }
    }
    const next = task.steps.find(step => !task.operations.some(op => op.stepId === step.id && op.state === 'completed'))
    const pending = task.operations.find(op => op.state !== 'completed')
    const unknown = pending !== undefined && !owned.get(current.session)?.has(pending.id)
    const mismatch = evidence.some(step => step.files.some(file => !file.matched))
    const status = task.cancelled ? 'cancelled' : unknown || mismatch ? 'needs_reconciliation' : pending !== undefined ? 'executing' : next === undefined ? inspect ? 'complete' : 'complete_unverified' : 'ready'
    const output = JSON.stringify({ task, status, nextStep: next?.id ?? null, evidence, guidance: status === 'needs_reconciliation' ? 'Do not retry this operation. Reconcile facts, then explicitly cancel and replan if its effects remain unknown.' : '' })
    if (Buffer.byteLength(JSON.stringify(output)) > caps.maxOutputBytes) return fail('TASK_LIMIT', 'complete task output exceeds configured byte limit')
    return output
  }

  async function run(input: Input, exec: ToolRunContext): Promise<string> {
    const current = await scope(exec)
    let active: { task: TaskState; op: TaskOperation; owner: OwnedOperation; args: unknown } | undefined
    const ready = await serial(current.session, async () => {
      exec.signal.throwIfAborted()
      if (input.action === 'create') await flush(current.session)
      const tasks = await state(current, exec.signal)
      if (input.action === 'create') {
        const steps = z.array(stepSchema).min(1).max(caps.maxSteps).parse(JSON.parse(input.plan_json))
        const existing = tasks.get(input.task_id)
        if (existing !== undefined) {
          const task = boundTask(existing, current)
          if (task.objective !== input.objective || JSON.stringify(task.steps) !== JSON.stringify(steps)) return fail('TASK_CONFLICT', 'task identity already has a different immutable plan')
          return view(current, task, exec.signal, false)
        }
        const task = await commit(current, { ...base(current, input.task_id, 1), action: 'create', objective: input.objective, steps })
        return view(current, task, exec.signal, false)
      }
      const task = boundTask(tasks.get(input.task_id), current)
      if (input.action === 'read' || input.action === 'track' || input.action === 'reconcile') return view(current, task, exec.signal, input.action !== 'read')
      if (input.action === 'cancel' && task.cancelled) return view(current, task, exec.signal, false)
      if (task.cancelled) return fail('TASK_CANCELLED', 'task was permanently cancelled; create a new plan explicitly')
      if (input.action === 'execute') {
        const args: unknown = JSON.parse(input.arguments_json)
        const argumentsHash = hash(JSON.stringify(args))
        const prior = task.operations.find(op => op.id === input.operation_id)
        if (prior !== undefined) {
          if (prior.tool !== input.tool || prior.stepId !== input.step_id || prior.argumentsHash !== argumentsHash) return fail('TASK_CONFLICT', 'operation identity has different arguments')
          if (prior.state !== 'completed') return fail('TASK_RECONCILIATION', 'this operation may already have effects and cannot be retried')
          const step = taskStep(task, prior.stepId)
          if ((await verify(current, step, exec.signal, prior)).some(file => !file.matched)) return fail('TASK_RECONCILIATION', 'completed artifacts changed; do not repeat the prior operation')
          return view(current, task, exec.signal, true)
        }
        if (!caps.allowedTools.includes(input.tool)) return fail('TASK_TOOL_DENIED', 'tool is not enabled for task execution')
        if (task.operations.some(op => op.state !== 'completed')) return fail('TASK_RECONCILIATION', 'an unresolved operation requires reconciliation before replanning')
        for (const completed of task.operations) {
          if ((await verify(current, taskStep(task, completed.stepId), exec.signal, completed)).some(file => !file.matched)) return fail('TASK_RECONCILIATION', 'a previously completed artifact changed')
        }
        if (input.expected_revision !== task.revision) return fail('TASK_CONFLICT', 'task revision changed; read the current task')
        const op: TaskOperation = { id: TaskOperationId(input.operation_id), stepId: TaskStepId(input.step_id), tool: input.tool, argumentsHash, outerCallId: exec.callId, innerCallId: ToolCallId(randomUUID()), intentSeq: current.session.seq, state: 'prepared', resultCode: '', artifacts: [] }
        const next = await commit(current, { ...base(current, task.id, task.revision + 1), action: 'prepare', operation: op })
        if (disposed || exec.signal.aborted) return fail('TASK_RECONCILIATION', 'execution stopped after intent was durable; do not retry the operation')
        const owner: OwnedOperation = { controller: new AbortController(), done: Promise.withResolvers<void>() }
        const entries = owned.get(current.session) ?? new Map<string, OwnedOperation>()
        entries.set(op.id, owner)
        owned.set(current.session, entries)
        active = { task: next, op, owner, args }
        return undefined
      }
      if (input.expected_revision !== task.revision) return fail('TASK_CONFLICT', 'task revision changed; read the current task')
      const next = await commit(current, { ...base(current, task.id, task.revision + 1), action: 'cancel' })
      for (const operation of task.operations) owned.get(current.session)?.get(operation.id)?.controller.abort(new Error('task cancelled'))
      return view(current, next, exec.signal, false)
    })
    if (ready !== undefined) return ready
    const running = active ?? fail('TASK_SCHEMA', 'accepted execution has no live owner')
    try {
      assertLive(current)
      const result = await ctx.tools.execute({
        name: running.op.tool, arguments: running.args, callId: running.op.innerCallId,
        rootCallId: exec.rootCallId, parent: exec.token, agent: current.agent,
        signal: AbortSignal.any([exec.signal, running.owner.controller.signal]),
      })
      for (const context of result.additionalContexts ?? []) exec.deferContext(context)
      if (!result.isError && result.concludesTurn === true) exec.concludeTurn()
      return await serial(current.session, async () => {
        const task = boundTask((await state(current, exec.signal)).get(running.task.id), current)
        if (task.cancelled) return view(current, task, exec.signal, false)
        const step = taskStep(task, running.op.stepId)
        const facts = result.isError ? [] : await verify(current, step, exec.signal)
        const completed = !result.isError && facts.length === step.artifacts.length && facts.every(file => file.matched)
        const failureCode = result.isError ? result.error.info?.code.slice(0, 256) ?? 'TOOL_ERROR' : 'ARTIFACT_MISMATCH'
        const op: TaskOperation = {
          ...running.op, state: completed ? 'completed' : 'uncertain', resultCode: completed ? 'OK' : failureCode,
          artifacts: completed ? facts.map(file => file.evidence ?? fail('TASK_SCHEMA', 'verified artifact evidence is absent')) : [],
        }
        const next = await commit(current, { ...base(current, task.id, task.revision + 1), action: 'settle', operation: op })
        owned.get(current.session)?.delete(op.id)
        return view(current, next, exec.signal, true)
      })
    } finally {
      owned.get(current.session)?.delete(running.op.id)
      if (owned.get(current.session)?.size === 0) owned.delete(current.session)
      running.owner.done.resolve()
    }
  }

  ctx.tools.register(defineTool({
    name: 'task_checkpoint',
    description: 'Create or inspect an ordered task with explicit file-hash acceptance. Read, track and reconcile do not execute work. Execute one named step explicitly; uncertain operations are never retried. Cancel permanently before replanning unknown effects. Stop does not cancel a task.',
    parameters: {
      action: { type: 'string', required: true, enum: ['create', 'read', 'track', 'execute', 'reconcile', 'cancel'] },
      task_id: { type: 'string', required: true, description: 'Stable task UUID; reuse only for the exact same plan.' },
      expected_revision: { type: 'integer', description: 'Current revision from read; required for execute and cancel.' },
      objective: { type: 'string', description: 'Task objective, required for create.' },
      plan_json: { type: 'string', description: 'For create: JSON array of ordered {id,description,acceptance,artifacts:[{path,sha256}]} steps. Paths are relative to the current project, hashes are lowercase SHA-256.' },
      step_id: { type: 'string', description: 'Next step key for execute.' },
      operation_id: { type: 'string', description: 'Stable attempt UUID for execute. Never replace an unknown attempt with a new UUID to retry it.' },
      tool: { type: 'string', description: 'Enabled registered tool to execute under current permissions.' },
      arguments_json: { type: 'string', description: 'Complete JSON arguments for the inner tool.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      if (Buffer.byteLength(JSON.stringify(args)) > caps.maxInputBytes) return fail('TASK_LIMIT', 'complete task input exceeds configured byte limit')
      return run(inputSchema.parse(args), exec)
    },
  }))
  ctx.effect(() => async () => {
    disposed = true
    const pending = [...owned.values()].flatMap(entries => [...entries.values()])
    for (const operation of pending) operation.controller.abort(new Error('task checkpoint component disposed'))
    await Promise.all(pending.map(operation => operation.done.promise))
  }, 'taskCheckpoint.ownedExecutions')
  ctx.on('agent/disposed', ({ agent }) => {
    for (const operation of owned.get(agent.session)?.values() ?? []) {
      operation.controller.abort(new Error('task Agent disposed'))
    }
  }, { global: true })
}
