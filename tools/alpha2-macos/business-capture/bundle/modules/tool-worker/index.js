import { MessageChannel, Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';
import z from '@deepseek-ai/schemastery';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { assertObjectJsonSchema, assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { encodeJson } from './json.js';

export const name = 'tool-worker';
export const inject = ['tools'];
export const Config = z.object({ modules: z.array(z.any()).default([]) });

const ranges = {
  timeoutMs: [5000, 10, 300000], cancelGraceMs: [100, 0, 2000], maxConcurrency: [2, 1, 8],
  maxInputBytes: [65536, 256, 1048576], maxConfigBytes: [16384, 2, 65536],
  maxOutputBytes: [65536, 256, 1048576], maxLogBytes: [1048576, 0, 16777216],
  maxJsonDepth: [32, 1, 64], maxJsonNodes: [10000, 1, 100000],
  maxOldGenerationSizeMb: [64, 16, 512], maxYoungGenerationSizeMb: [16, 1, 64], stackSizeMb: [4, 1, 16],
};
const allowedOptions = new Set(['name', 'description', 'parameters', 'output', 'module', ...Object.keys(ranges)]);
class ToolWorkerError extends HarnessError {
  constructor(code, message) { super(`${code}: ${message}`, code); }
}
const failure = (suffix, message) => new ToolWorkerError(`TOOL_WORKER_${suffix}`, message);
function ownObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('Expected a plain object');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !keys.has(key) || !descriptor?.enumerable || !('value' in descriptor)) throw new Error('Unknown or accessor field');
  }
}
function normalize(options) {
  try {
    ownObject(options, allowedOptions);
    if (typeof options.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(options.name)) throw new Error('Invalid tool name');
    if (typeof options.description !== 'string' || !options.description.trim() || options.description.length > 4096) throw new Error('Invalid description');
    const resolved = { name: options.name, description: options.description };
    for (const [key, [fallback, min, max]] of Object.entries(ranges)) {
      const value = options[key] === undefined ? fallback : options[key];
      if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}; expected integer ${min}..${max}`);
      resolved[key] = value;
    }
    ownObject(options.module, new Set(['url', 'exportName', 'config']));
    if (!(typeof options.module.url === 'string' || options.module.url instanceof URL)) throw new Error('Expected absolute module file URL');
    const url = new URL(options.module.url);
    if (url.protocol !== 'file:' || url.hostname || url.search || url.hash || !isAbsolute(fileURLToPath(url))) throw new Error('Expected local absolute file URL');
    const exportName = options.module.exportName ?? 'execute';
    if (typeof exportName !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(exportName)) throw new Error('Invalid exportName');
    const limits = { maxBytes: resolved.maxConfigBytes, maxDepth: resolved.maxJsonDepth, maxNodes: resolved.maxJsonNodes };
    const config = JSON.parse(encodeJson(options.module.config === undefined ? {} : options.module.config, limits));
    ownObject(options.output, new Set(['schema', 'render']));
    if (options.output.render !== undefined && typeof options.output.render !== 'function') throw new Error('Invalid output renderer');
    const schemaLimits = { maxBytes: 65536, maxDepth: 64, maxNodes: 10000 };
    const parameters = JSON.parse(encodeJson(options.parameters, schemaLimits));
    const schema = JSON.parse(encodeJson(options.output.schema, schemaLimits));
    assertObjectJsonSchema(parameters); assertSupportedJsonSchema(schema);
    return { ...resolved, parameters, output: { schema, render: options.output.render ?? ((_args, value) => [{ type: 'text', text: JSON.stringify(value) }]) },
      module: { url: url.href, exportName, config } };
  } catch (error) {
    throw failure('CONFIG', error instanceof Error ? error.message : 'Invalid module registration');
  }
}
function environment() {
  const result = {};
  for (const key of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS', 'TZ']) {
    if (typeof process.env[key] === 'string') result[key] = process.env[key];
  }
  return result;
}

/** Register one reviewed module; concurrency and ownership are per registration. */
export function registerModuleTool(ctx, options) {
  const config = normalize(options);
  return registerResolved(ctx, config);
}
function registerResolved(ctx, config) {
  return createResolvedExecutor(ctx, config, true).dispose;
}

/**
 * Create owned computation for a host plugin without publishing a helper tool.
 * @param ctx - Plugin context owning the executor and its active Workers.
 * @param options - The same bounded module registration fields; output accepts schema only.
 * @returns Execute, async dispose, and metadata-only inspect methods. Results settle after Worker exit.
 */
export function createModuleExecutor(ctx, options) {
  const config = normalize(options);
  if (options.output.render !== undefined) throw failure('CONFIG', 'Internal executors accept output.schema only');
  return createResolvedExecutor(ctx, config, false);
}

function createResolvedExecutor(ctx, config, publish) {
  const active = new Set();
  const totals = { started: 0, exited: 0, settled: 0 };
  let closed = false; let lastOutcome = null; let cleanupTask; let disposalTask;
  const execute = (args, exec = {}) => {
    if (closed) throw failure('DISPOSED', 'The module tool has been unloaded');
    if (exec.signal?.aborted) throw failure('ABORTED', 'Cancelled before worker creation');
    if (active.size >= config.maxConcurrency) throw failure('BUSY', 'This module registration has no free worker slot');
    let inputJson;
    try {
      const callId = exec.callId ?? ''; const rootCallId = exec.rootCallId ?? callId;
      if (typeof callId !== 'string' || callId.length > 256 || typeof rootCallId !== 'string' || rootCallId.length > 256) throw new Error('Invalid call identifiers');
      inputJson = encodeJson({ args, config: config.module.config, callId, rootCallId },
        { maxBytes: config.maxInputBytes, maxDepth: config.maxJsonDepth, maxNodes: config.maxJsonNodes });
      // Validate the bounded JSON snapshot so getters and live references never reach validation.
      if (validateJsonSchemaValue(config.parameters, JSON.parse(inputJson).args).length) throw new Error('Arguments do not match their schema');
    } catch { throw failure('ARGUMENTS', 'Arguments and call envelope exceed the plain JSON boundary'); }
    const run = createRun(config, inputJson, exec.signal, totals, (outcome) => { active.delete(run); lastOutcome = outcome; }, !publish);
    active.add(run);
    return run.done;
  };
  const disposeEffect = ctx.effect(() => {
    const unregister = publish
      ? ctx.tools.register({ name: config.name, description: config.description, parameters: config.parameters, output: config.output, execute })
      : () => {};
    return () => {
      cleanupTask ??= (async () => {
        closed = true; unregister();
        const owned = [...active];
        for (const run of owned) run.cancel();
        await Promise.allSettled(owned.map((run) => run.done));
      })();
      return cleanupTask;
    };
  }, `tool-worker:${config.name}`);
  const dispose = () => {
    disposalTask ??= (async () => { await disposeEffect(); await cleanupTask; })();
    return disposalTask;
  };
  dispose.inspect = () => Object.freeze({ ...totals, closed, activeWorkers: active.size,
    activeTimers: [...active].reduce((count, run) => count + run.timers.size, 0), lastOutcome });
  return Object.freeze({ execute, dispose, inspect: dispose.inspect });
}

function createRun(config, inputJson, signal, totals, onSettled, validateOutput = false) {
  const timers = new Set(); const began = performance.now();
  let reason = null; let value; let hasResult = false; let phase = 'loading';
  let exited = false; let terminationRequested = false; let forced = false; let exitCode = null;
  let stdoutBytes = 0; let stderrBytes = 0; let worker; let threadId = null;
  let resolveDone; let rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  const channel = new MessageChannel();
  const addTimer = (callback, ms) => {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, ms); timers.add(timer); return timer;
  };
  const clearTimers = () => { for (const timer of timers) clearTimeout(timer); timers.clear(); };
  const terminate = () => {
    if (exited || terminationRequested) return;
    terminationRequested = true;
    worker.terminate().catch(() => { reason ??= failure('CRASH', 'Worker termination failed; awaiting actual exit'); });
  };
  const fail = (suffix, message, grace = false) => {
    if (reason) return;
    reason = failure(suffix, message); phase = 'stopping'; clearTimers();
    if (exited) return;
    if (grace && config.cancelGraceMs > 0 && !terminationRequested) {
      channel.port1.postMessage('abort');
      addTimer(() => { forced = true; terminate(); }, config.cancelGraceMs);
    } else { forced = grace; terminate(); }
  };
  const abort = () => fail('ABORTED', 'Caller cancelled the module tool; external side effects may already exist', true);
  const run = { done, timers, cancel: () => fail('DISPOSED', 'Module tool unloaded; external side effects may already exist', true) };
  const finish = async () => {
    clearTimers(); signal?.removeEventListener('abort', abort);
    channel.port1.close(); channel.port2.close();
    totals.settled++;
    const outcome = Object.freeze({ code: reason?.code ?? 'OK', threadId, exitCode,
      timedOut: reason?.code === 'TOOL_WORKER_TIMEOUT', cancelled: reason?.code === 'TOOL_WORKER_ABORTED',
      forced, terminationRequested, stdoutBytes, stderrBytes, elapsedMs: performance.now() - began });
    onSettled(outcome);
    if (reason) rejectDone(reason); else resolveDone(value);
  };
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { workerData: {
      moduleUrl: config.module.url, exportName: config.module.exportName, inputJson, protocolPort: channel.port2,
      outputLimits: { maxBytes: config.maxOutputBytes, maxDepth: config.maxJsonDepth, maxNodes: config.maxJsonNodes },
    }, transferList: [channel.port2], env: environment(), execArgv: [], stdout: true, stderr: true, trackUnmanagedFds: true,
    resourceLimits: { maxOldGenerationSizeMb: config.maxOldGenerationSizeMb, maxYoungGenerationSizeMb: config.maxYoungGenerationSizeMb, stackSizeMb: config.stackSizeMb } });
    threadId = worker.threadId; totals.started++;
  } catch {
    reason = failure('CRASH', 'Worker creation failed');
    queueMicrotask(finish);
    return run;
  }
  const drains = ['stdout', 'stderr'].map((name) => new Promise((resolve) => {
    const stream = worker[name];
    const onData = (chunk) => {
      const bytes = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength;
      if (name === 'stdout') stdoutBytes += bytes; else stderrBytes += bytes;
      if (stdoutBytes + stderrBytes > config.maxLogBytes) fail('LOG_LIMIT', 'Combined module output exceeded its byte budget');
    };
    const onError = () => { fail('CRASH', 'Worker output stream failed'); resolve(); };
    stream.on('data', onData); stream.once('end', resolve); stream.once('close', resolve); stream.once('error', onError);
  }));
  channel.port1.on('message', (packet) => {
    if (phase === 'stopping' || exited) return;
    try {
      const wireLimit = 2 * config.maxOutputBytes + 2048;
      if (typeof packet !== 'string' || packet.length > wireLimit || Buffer.byteLength(packet) > wireLimit) throw new Error('Invalid packet');
      const message = JSON.parse(packet);
      if (!message || message.version !== 1) throw new Error('Invalid version');
      const keys = Object.keys(message).sort().join(',');
      if (message.kind === 'ready' && keys === 'kind,version' && phase === 'loading') {
        if (signal?.aborted) return abort();
        phase = 'executing'; channel.port1.postMessage('execute'); return;
      }
      if (message.kind === 'error' && keys === 'code,kind,version' && ['TOOL_WORKER_MODULE', 'TOOL_WORKER_EXECUTION', 'TOOL_WORKER_OUTPUT'].includes(message.code)) {
        fail(message.code.slice('TOOL_WORKER_'.length), 'Module failed at its declared execution boundary'); return;
      }
      if (message.kind !== 'result' || keys !== 'json,kind,version' || phase !== 'executing' || typeof message.json !== 'string' || Buffer.byteLength(message.json) > config.maxOutputBytes) throw new Error('Invalid result');
      const parsed = JSON.parse(message.json);
      encodeJson(parsed, { maxBytes: config.maxOutputBytes, maxDepth: config.maxJsonDepth, maxNodes: config.maxJsonNodes });
      // Registered tools are validated by ToolRuntime; internal consumers need the same check here.
      if (validateOutput && validateJsonSchemaValue(config.output.schema, parsed).length) {
        fail('OUTPUT', 'Module result does not match its declared schema'); return;
      }
      value = parsed; hasResult = true; phase = 'stopping'; terminate();
    } catch { fail('PROTOCOL', 'Malformed or out-of-order worker protocol'); }
  });
  channel.port1.on('messageerror', () => fail('PROTOCOL', 'Worker protocol could not be decoded'));
  worker.on('message', () => fail('PROTOCOL', 'Unsolicited message outside the owned worker protocol'));
  worker.on('messageerror', () => fail('PROTOCOL', 'Unsolicited message could not be decoded'));
  worker.on('error', () => fail('CRASH', 'Worker crashed; external side effects may already exist'));
  worker.once('exit', async (code) => {
    exited = true; exitCode = code; totals.exited++;
    if (!reason && !hasResult) reason = failure('EXIT', 'Worker exited before returning a result');
    clearTimers();
    await Promise.all(drains);
    // Worker ownership lasts through actual exit and final stream consumption.
    worker.removeAllListeners(); worker.stdout.removeAllListeners(); worker.stderr.removeAllListeners();
    await finish();
  });
  addTimer(() => fail('TIMEOUT', 'Module deadline exceeded; external side effects may already exist', true), config.timeoutMs);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  return run;
}

export function apply(ctx, config = {}) {
  ownObject(config, new Set(['modules']));
  const modules = config.modules ?? [];
  if (!Array.isArray(modules) || modules.length > 32) throw failure('CONFIG', 'modules must be an array of at most 32 entries');
  const normalized = modules.map(normalize);
  for (const module of normalized) registerResolved(ctx, module);
}
