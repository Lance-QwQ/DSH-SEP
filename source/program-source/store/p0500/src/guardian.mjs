import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const MAX_JOURNAL_BYTES = 8 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const fault = (code, message = code) => Object.assign(new Error(message), { code });
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}
function bounded(work, milliseconds, code) {
  let timer;
  return Promise.race([Promise.resolve().then(work), new Promise((_, reject) => {
    timer = setTimeout(() => reject(fault(code)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
function sameFile(a, b) { return a.dev === b.dev && a.ino === b.ino; }
function checkedInteger(value, fallback, min, max) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < min || result > max) throw fault('GUARDIAN_OPTIONS_INVALID');
  return result;
}
async function regular(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw fault('GUARDIAN_STORAGE_INVALID');
  return stat;
}
async function directory(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw fault('GUARDIAN_CONTROL_INVALID');
  let current = path.parse(path.resolve(dir)).root;
  for (const segment of path.relative(current, path.resolve(dir)).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const entry = await fs.lstat(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw fault('GUARDIAN_CONTROL_INVALID');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.mkdir(current);
      const entry = await fs.lstat(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw fault('GUARDIAN_CONTROL_INVALID');
    }
  }
}
function validState(state) {
  return state?.schema === 1 && ['manual-stop', 'active'].includes(state.intent)
    && ['idle', 'starting', 'running', 'stopping', 'stopped', 'restarting', 'exhausted', 'blocked', 'faulted'].includes(state.phase)
    && Number.isSafeInteger(state.generation) && state.generation >= 0
    && Array.isArray(state.restarts) && state.restarts.every(value => Number.isSafeInteger(value) && value >= 0)
    && Number.isSafeInteger(state.stdoutBytes) && state.stdoutBytes >= 0
    && Number.isSafeInteger(state.stderrBytes) && state.stderrBytes >= 0;
}

/** Independent runtime supervisor. Callbacks receive handles only for children this object spawned. */
export async function openGuardian(options) {
  const command = options?.command;
  if (!command || typeof command.file !== 'string' || !path.isAbsolute(command.file)
    || typeof command.cwd !== 'string' || !path.isAbsolute(command.cwd)
    || !Array.isArray(command.args) || command.args.some(arg => typeof arg !== 'string')
    || (command.env !== undefined && (!command.env || typeof command.env !== 'object' || Array.isArray(command.env)))) {
    throw fault('GUARDIAN_COMMAND_INVALID');
  }
  const restartLimit = checkedInteger(options.restartLimit, 2, 0, 20);
  const transport = options.transport ?? 'recovery-ipc';
  if (!['recovery-ipc', 'desktop-v3', 'desktop-http'].includes(transport)) throw fault('GUARDIAN_OPTIONS_INVALID');
  const restartWindowMs = checkedInteger(options.restartWindowMs, 600000, 100, 86400000);
  const restartDelayMs = checkedInteger(options.restartDelayMs, 1000, 0, 600000);
  const shutdownTimeoutMs = checkedInteger(options.shutdownTimeoutMs, 10000, 10, 60000);
  const readinessTimeoutMs = checkedInteger(options.readinessTimeoutMs, 30000, 10, 120000);
  const prerequisiteTimeoutMs = checkedInteger(options.prerequisiteTimeoutMs, 10000, 10, 60000);
  const afterExitTimeoutMs = checkedInteger(options.afterExitTimeoutMs, 10000, 10, 60000);
  for (const key of ['beforeStart', 'readiness', 'gracefulStop', 'afterExit', 'onEvent']) {
    if (options[key] !== undefined && typeof options[key] !== 'function') throw fault('GUARDIAN_OPTIONS_INVALID');
  }
  // No prerequisite callback means no authority to launch a host.
  const beforeStart = options.beforeStart ?? (async () => false);
  await directory(options.controlRoot);
  const guardianRoot = path.join(options.controlRoot, 'guardian');
  await directory(guardianRoot);
  const ownerPath = path.join(guardianRoot, 'owner.json');
  const journalPath = path.join(guardianRoot, 'journal.jsonl');
  const token = randomUUID();
  const ownerBytes = Buffer.from(JSON.stringify({ schema: 1, token, pid: process.pid, createdAt: new Date().toISOString() }) + '\n');
  let owner, journal;
  try { owner = await fs.open(ownerPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw fault('GUARDIAN_OWNER_UNPROVEN'); throw error; }
  try {
    await owner.writeFile(ownerBytes); await owner.sync();
    try { await regular(journalPath); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    journal = await fs.open(journalPath, 'a+', 0o600);
    await regular(journalPath);
    const journalStat = await journal.stat();
    if (journalStat.size > MAX_JOURNAL_BYTES) throw fault('GUARDIAN_JOURNAL_INVALID');
    const bytes = await journal.readFile();
    let sequence = 0, previousHash = null;
    let state = { schema: 1, intent: 'manual-stop', phase: 'idle', generation: 0, restarts: [], pid: null, stdoutBytes: 0, stderrBytes: 0, lastExit: null, reason: null };
    if (bytes.length) {
      if (bytes.at(-1) !== 10) throw fault('GUARDIAN_JOURNAL_INVALID');
      try {
        for (const line of bytes.toString('utf8').trimEnd().split('\n')) {
          const record = JSON.parse(line);
          const { digest, ...payload } = record;
          if (record.sequence !== sequence + 1 || record.previousHash !== previousHash
            || hash(JSON.stringify(payload)) !== digest || !validState(record.state)) throw fault('GUARDIAN_JOURNAL_INVALID');
          sequence = record.sequence; previousHash = digest; state = record.state;
        }
      } catch { throw fault('GUARDIAN_JOURNAL_INVALID'); }
    }
    let current = null, restartTimer = null, closed = false, closing = null, tail = Promise.resolve();
    let intervention = 0, stopRequested = false;
    let fatalError = null;
    const enqueue = action => { const promise = tail.then(action); tail = promise.catch(() => {}); return promise; };
    const status = () => clone({ ...state, restartCount: state.restarts.filter(at => Date.now() - at <= restartWindowMs).length, ownerPid: process.pid, closed });
    function emit(type, details = {}) {
      try { Promise.resolve(options.onEvent?.({ type, at: new Date().toISOString(), generation: state.generation, ...details })).catch(() => {}); }
      catch { /* Observability cannot authorize or interrupt state transitions. */ }
    }
    async function persist(change, event) {
      if (fatalError) throw fatalError;
      if (!(await fs.readFile(ownerPath)).equals(ownerBytes)) throw fault('GUARDIAN_OWNER_CHANGED');
      const onDisk = await regular(journalPath);
      if (!sameFile(await journal.stat(), onDisk)) throw fault('GUARDIAN_STORAGE_CHANGED');
      const next = { ...state, ...change };
      const payload = { sequence: sequence + 1, previousHash, at: new Date().toISOString(), event, state: next };
      const digest = hash(JSON.stringify(payload));
      const row = JSON.stringify({ ...payload, digest }) + '\n';
      if (onDisk.size + Buffer.byteLength(row) > MAX_JOURNAL_BYTES) throw fault('GUARDIAN_JOURNAL_FULL');
      await journal.writeFile(row); await journal.sync();
      state = next; sequence++; previousHash = digest;
      emit(event, { phase: state.phase, pid: state.pid });
    }
    function failClosed(error) {
      fatalError = fault(error.code ?? 'GUARDIAN_STORAGE_FAILURE');
      clearTimeout(restartTimer); restartTimer = null;
      state = { ...state, phase: 'faulted', reason: fatalError.code };
      if (current) {
        current.forced = true;
        current.ready.reject(fault('GUARDIAN_NOT_READY'));
        current.abort.abort();
        // This is forced termination of an owned handle, never evidence of a natural drain.
        if (current.child.exitCode === null && current.child.signalCode === null) current.child.kill();
      }
      emit('storage-fault', { code: fatalError.code });
    }
    function background(action) { enqueue(action).catch(failClosed); }
    async function markReady(run) {
      if (closed || fatalError || current !== run || run.abort.signal.aborted || state.intent !== 'active' || state.phase !== 'starting') return;
      clearTimeout(run.readyTimer);
      await persist({ phase: 'running', stdoutBytes: run.stdoutBytes, stderrBytes: run.stderrBytes }, 'ready');
      run.ready.resolve(status());
    }
    function forceOwned(run) {
      if (current !== run || run.child.exitCode !== null || run.child.signalCode !== null) return;
      run.forced = true;
      run.child.kill();
    }
    async function afterClose(run, code, signal) {
      if (current !== run) { emit('stale-exit-ignored', { callbackGeneration: run.generation }); return; }
      clearTimeout(run.readyTimer); clearTimeout(run.stopTimer);
      run.abort.abort(); run.ready.reject(fault('GUARDIAN_NOT_READY'));
      current = null;
      const lastExit = { generation: run.generation, code, signal, forced: run.forced, ready: run.wasReady, errorCode: run.errorCode, at: new Date().toISOString() };
      if (fatalError) { run.done.resolve(status()); return; }
      const manual = state.intent === 'manual-stop';
      // A clean application exit is respected as user/application stop; it is never auto-restarted.
      const normal = code === 0 && !signal && !run.forced && !run.errorCode;
      await persist({ pid: null, lastExit, stdoutBytes: run.stdoutBytes, stderrBytes: run.stderrBytes,
        phase: manual || normal ? 'stopped' : 'restarting', intent: manual || normal ? 'manual-stop' : 'active' }, 'child-closed');
      try {
        await bounded(() => options.afterExit?.({ generation: run.generation, code, signal, forced: run.forced, errorCode: run.errorCode }), afterExitTimeoutMs, 'GUARDIAN_EXIT_FENCE_TIMEOUT');
      } catch {
        await persist({ phase: 'blocked', reason: 'exit-fence-failed' }, 'exit-fence-blocked');
        run.done.resolve(status()); return;
      }
      run.done.resolve(status());
      if (state.intent === 'active' && !closed && !closing && !stopRequested) {
        restartTimer = setTimeout(() => { restartTimer = null; background(() => launch(true)); }, restartDelayMs);
      }
    }
    async function launch(automatic, expectedIntervention = intervention) {
      if (closed) throw fault('GUARDIAN_CLOSED');
      if (fatalError) throw fatalError;
      if (closing || stopRequested || expectedIntervention !== intervention) return null;
      if (current) return current;
      clearTimeout(restartTimer); restartTimer = null;
      const restarts = state.restarts.filter(at => Date.now() - at <= restartWindowMs);
      if (automatic && restarts.length >= restartLimit) {
        await persist({ phase: 'exhausted', reason: 'restart-budget-exhausted' }, 'budget-exhausted');
        return null;
      }
      let permitted = false;
      try { permitted = await bounded(() => beforeStart({ generation: state.generation + 1, automatic }), prerequisiteTimeoutMs, 'GUARDIAN_PREREQUISITE_TIMEOUT') === true; }
      catch { /* A prerequisite error is an explicit launch refusal. */ }
      if (closing || stopRequested || expectedIntervention !== intervention) return null;
      if (!permitted) {
        await persist({ phase: 'blocked', reason: 'prerequisite-failed' }, 'prerequisite-blocked');
        return null;
      }
      if (automatic) restarts.push(Date.now());
      // Intent, generation and budget are synced before the operating system can create a child.
      await persist({ intent: 'active', phase: 'starting', generation: state.generation + 1, restarts,
        pid: null, reason: null, stdoutBytes: 0, stderrBytes: 0 }, 'launch-reserved');
      if (closing || stopRequested || expectedIntervention !== intervention) return null;
      const nonce = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
      const child = spawn(command.file, [...command.args], {
        cwd: command.cwd, env: { ...(command.env ?? process.env), ...(transport === 'desktop-http' ? { DSH_SEP_HOST_NONCE: nonce, DSH_SEP_HOST_GENERATION: String(state.generation) } : {}) },
        shell: false, windowsHide: true, stdio: transport === 'desktop-v3'
          ? ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'ipc']
          : ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      const run = current = { child, generation: state.generation, ready: deferred(), observedReady: deferred(), done: deferred(), abort: new AbortController(),
        stdoutBytes: 0, stderrBytes: 0, forced: false, wasReady: false, errorCode: null, readyTimer: null, stopTimer: null };
      run.abort.signal.addEventListener('abort', () => run.observedReady.reject(fault('GUARDIAN_NOT_READY')), { once: true });
      child.stdout.on('data', chunk => { run.stdoutBytes += chunk.length; });
      child.stderr.on('data', chunk => { run.stderrBytes += chunk.length; });
      child.stdout.on('error', () => { emit('output-stream-error', { stream: 'stdout', callbackGeneration: run.generation }); });
      child.stderr.on('error', () => { emit('output-stream-error', { stream: 'stderr', callbackGeneration: run.generation }); });
      child.on('error', error => { run.errorCode = typeof error.code === 'string' ? error.code : 'SPAWN_ERROR'; });
      child.once('close', (code, signal) => background(async () => {
        try { await afterClose(run, code, signal); }
        catch (error) { run.done.reject(error); throw error; }
      }));
      child.on('message', message => {
        const validHttp = (() => {
          if (transport !== 'desktop-http' || message?.type !== 'ready' || message.transport !== 'desktop-http'
            || message.pid !== child.pid || message.nonce !== nonce || message.generation !== run.generation
            || message.dshVersion !== '0.1.6-alpha.2' || !Array.isArray(message.injections)) return false;
            try { const url = new URL(message.url); return url.protocol === 'http:' && url.hostname === '127.0.0.1'
            && !!url.port && !url.username && !url.password && url.pathname === '/' && !url.hash
              && [...url.searchParams.keys()].length === 1 && url.searchParams.has('token') && /^[a-zA-Z0-9_-]{16,256}$/.test(url.searchParams.get('token') ?? '')
            && Buffer.byteLength(JSON.stringify(message.injections)) <= 4 * 1024 * 1024;
          } catch { return false; }
        })();
        const validReady = transport === 'desktop-http' ? validHttp : transport === 'desktop-v3'
          ? message?.type === 'ready' && message.protocolVersion === 3 && typeof message.dshVersion === 'string'
          : message?.type === 'dsh-guardian-ready';
        if (!validReady || current !== run || run.abort.signal.aborted) return;
        // Capture before asynchronous spawn persistence or a custom readiness hook can miss IPC.
        run.observedReady.resolve(Object.freeze(transport === 'desktop-http'
          ? { type: 'ready', transport, url: message.url, injections: message.injections, dshVersion: message.dshVersion, generation: run.generation, pid: child.pid }
          : transport === 'desktop-v3'
          ? { type: 'ready', protocolVersion: 3, dshVersion: message.dshVersion, generation: run.generation, pid: child.pid }
          : { type: 'dsh-guardian-ready', generation: run.generation, pid: child.pid }));
        if (!options.readiness) background(() => markReady(run));
      });
      child.once('spawn', () => background(async () => {
        if (current !== run || state.intent !== 'active') return;
        await persist({ pid: child.pid }, 'child-spawned');
        if (options.readiness) Promise.resolve().then(() => options.readiness({ child, generation: run.generation, signal: run.abort.signal, observedReady: run.observedReady.promise }))
          .then(ready => { if (ready === true) background(() => markReady(run)); })
          .catch(() => {
            // Cancellation and an old generation's callback cannot force-kill a graceful stop.
            if (current !== run || run.abort.signal.aborted || state.intent !== 'active') return;
            run.errorCode = 'READINESS_FAILED'; forceOwned(run);
          });
      }));
      run.ready.promise.then(() => { run.wasReady = true; }, () => {});
      run.readyTimer = setTimeout(() => {
        if (current !== run || state.phase !== 'starting') return;
        run.errorCode = 'READINESS_TIMEOUT'; run.ready.reject(fault('GUARDIAN_NOT_READY'));
        run.abort.abort(); forceOwned(run);
      }, readinessTimeoutMs);
      return run;
    }
    async function start() {
      stopRequested = false;
      const requestedIntervention = intervention;
      try {
        const run = await enqueue(() => launch(state.intent === 'active' && state.generation > 0, requestedIntervention));
        return run ? await run.ready.promise : status();
      } catch (error) {
        if (error.code !== 'GUARDIAN_NOT_READY' && error.code !== 'GUARDIAN_CLOSED') failClosed(error);
        throw error;
      }
    }
    async function stop() {
      if (closed) return status();
      intervention++; stopRequested = true;
      const run = await enqueue(async () => {
        clearTimeout(restartTimer); restartTimer = null;
        await persist({ intent: 'manual-stop', phase: current ? 'stopping' : 'stopped', reason: null }, 'manual-stop-recorded');
        if (!current) return null;
        const held = current;
        held.ready.reject(fault('GUARDIAN_NOT_READY')); held.abort.abort(); clearTimeout(held.readyTimer);
        held.stopTimer = setTimeout(() => forceOwned(held), shutdownTimeoutMs);
        Promise.resolve().then(() => options.gracefulStop ? options.gracefulStop({ child: held.child, generation: held.generation })
          : new Promise((resolve, reject) => {
            if (!held.child.connected) { reject(fault('GUARDIAN_IPC_UNAVAILABLE')); return; }
            held.child.send({ type: transport.startsWith('desktop-') ? 'shutdown' : 'dsh-daily-shutdown' }, error => {
              if (error) { reject(error); return; }
              if (transport === 'desktop-v3') held.child.stdio[3]?.destroy();
              resolve();
            });
          })).catch(() => { emit('graceful-stop-error', { callbackGeneration: held.generation }); });
        return held;
      }).catch(error => { failClosed(error); throw error; });
      return run ? run.done.promise : status();
    }
    async function close() {
      if (closing) return closing;
      closing = (async () => {
        clearTimeout(restartTimer); restartTimer = null;
        if (current && !fatalError) await stop();
        else if (current) await current.done.promise;
        await tail;
        closed = true;
        await journal.close(); journal = null;
        await owner.close(); owner = null;
        if (!fatalError && (await fs.readFile(ownerPath)).equals(ownerBytes)) await fs.unlink(ownerPath);
      })();
      return closing;
    }
    if (!sequence) await persist({}, 'initialized');
    return { start, stop, status, close };
  } catch (error) {
    await journal?.close().catch(() => {}); await owner?.close().catch(() => {});
    // This open attempt owns only the exact new token. Never remove a pre-existing or replaced owner.
    if ((await fs.readFile(ownerPath).catch(() => null))?.equals(ownerBytes)) await fs.unlink(ownerPath);
    throw error;
  }
}
