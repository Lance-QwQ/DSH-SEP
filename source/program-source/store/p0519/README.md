# dsh-tool-worker

Explicit module tools for DSH. This independent local candidate registers ordinary DSH tools whose reviewed module is loaded and executed in a fresh Node Worker thread. It does not modify the host or install itself into a daily profile. Version: `0.1.0-local.stability2` (private package).

```js
import { registerModuleTool } from 'dsh-tool-worker'

const dispose = registerModuleTool(ctx, {
  name: 'double_number',
  description: 'Double a finite number in a Worker thread',
  parameters: {
    type: 'object', properties: { value: { type: 'number' } },
    required: ['value'], additionalProperties: false,
  },
  output: { schema: { type: 'number' } },
  module: { url: new URL('./double.mjs', import.meta.url), exportName: 'execute', config: {} },
  timeoutMs: 5000, cancelGraceMs: 100,
})

// double.mjs; this module receives JSON and a local AbortSignal, never ctx or Agent.
export function execute(args, { signal, callId, rootCallId, config }) {
  signal.throwIfAborted()
  return args.value * 2
}

// The disposer unregisters the tool and waits for its owned workers to exit.
await dispose()
```

The module URL is an absolute local `file:` URL supplied by reviewed plugin configuration, never selected from model arguments. File URLs with a host, query, or fragment are rejected. The host does not import the target module, reconstruct closures, or send functions and services into it. `output.render`, when supplied programmatically, retains DSH's host-side `(args, value, ...)` signature. The default renders the actual returned value as JSON text.

## Loader composition

Host plugins can use `createModuleExecutor(ctx, options)` for internal computation. It accepts the same module, parameters and limits, with `output: { schema }` only, and returns `{ execute(args, { signal, callId, rootCallId } = {}), dispose(), inspect() }`. It publishes no helper tool and runs no tool approvals on its own. The calling tool keeps its host services, authorization and result publication. The executor validates arguments and its declared output schema, and shares the existing Worker lifecycle. Each executor owns its own concurrency limit. Context disposal cancels and awaits its Workers; an explicitly disposed executor refuses new calls. Type parameters describe the supplied runtime schemas, not automatic schema inference.

The package exports `name = 'tool-worker'`, `inject = ['tools']`, `Config`, and `apply`. Load it through the normal DSH Loader after the `tools` service is available. The plugin configuration is `{ modules: [registrationOptions, ...] }`; each entry has the same fields as the example above, with the URL represented as a string and `output` containing only its schema. At most 32 entries are accepted. All entries are normalized before registration. Registrations and cleanup belong to `ctx.effect`, so unloading the plugin removes the tools and awaits owned worker cleanup. No additional host package is required beyond the declared DSH peer dependencies.

Resolve the plugin's DSH peer dependencies from the same installation as its host. Mixing development junctions to an older host with a newer host was observed to lose structured error codes because the two `HarnessError` classes had different identities. The actual candidate installation must verify a shared dependency tree; compatibility with arbitrary host versions is not implied.

## Validated limits

All numbers must be safe integers within the inclusive range. Omitted values use these defaults; invalid values fail registration. **Concurrency applies to one `registerModuleTool` registration.** Several registrations each have their own limit; this is not a global host, profile, or suite limit. A full registration rejects a call immediately; there is no queue and no retry.

| Option | Default | Inclusive range / meaning |
|---|---:|---|
| `timeoutMs` | 5000 | 10–300000; module loading and execution deadline |
| `cancelGraceMs` | 100 | 0–2000; cooperative cancellation before terminating the worker |
| `maxConcurrency` | 2 | 1–8; workers owned by this registration |
| `maxInputBytes` | 65536 | 256–1048576; UTF-8 JSON envelope including args, config and call IDs |
| `maxConfigBytes` | 16384 | 2–65536; module config JSON |
| `maxOutputBytes` | 65536 | 256–1048576; returned JSON, checked inside the worker before transfer and again by the host |
| `maxLogBytes` | 1048576 | 0–16777216; combined cumulative stdout/stderr bytes per call |
| `maxJsonDepth` | 32 | 1–64; JSON depth, root is zero |
| `maxJsonNodes` | 10000 | 1–100000; JSON values visited |
| `maxOldGenerationSizeMb` | 64 | 16–512; Node Worker V8 old-generation limit |
| `maxYoungGenerationSizeMb` | 16 | 1–64; Node Worker V8 young-generation limit |
| `stackSizeMb` | 4 | 1–16; Node Worker stack limit |

The V8 limits are **not** RSS, external Buffer, native allocation, or whole-process memory limits. Parameter/output schemas use a fixed declaration envelope of 65536 bytes, depth 64 and 10000 nodes. Call IDs are strings of at most 256 characters. The plain JSON codec rejects cycles, accessors, `toJSON` functions, sparse/decorated arrays, exotic objects, unsupported values, nonfinite numbers and negative zero; it never invokes accessor hooks. Tool arguments are validated against their declared schema before worker creation. JSON limits do not make arbitrary hostile JavaScript objects or Proxy traps safe.

## Lifecycle and diagnostics

The deadline covers module import, initial synchronous computation and synchronous computation after an `await`. A call cancelled before worker creation starts no worker. A readiness handshake also prevents the function body from starting when cancellation has already won during module loading. Caller cancellation, deadline expiry and unload close result acceptance, forward a local abort signal, then terminate this call's worker after the configured grace period. Other failures, including module, protocol and log-limit errors, request termination immediately. Cancellation and failure cannot be replaced by a late successful result. A received normal result remains provisional until the worker has exited; cancellation or a detected failure before that point can still reject the call.

Even on normal return, the host terminates the worker to stop its remaining timers. Calls settle only after actual exit and final stdout/stderr consumption. Both streams are continuously consumed and discarded; only byte counts are retained. Exceeding the combined log budget produces a tool error. Concurrent calls to the disposer share cleanup and all await the same owned workers. A module exception, missing export, early exit, malformed protocol, or V8 worker failure becomes a stable DSH tool error; no operation is automatically replayed.

`dispose.inspect()` returns read-only metadata: `activeWorkers`, `activeTimers`, `started`, `exited`, `settled`, `closed`, and `lastOutcome`. The last worker outcome contains only code, thread ID, exit code, cancellation/timeout/termination flags, stdout/stderr byte counts and elapsed milliseconds. It contains no args, results, logs, environment, or Worker handle. Registration/input failures that start no worker do not replace this last worker outcome. After a completed call, owned workers/timers are zero and started equals exited. Normal termination can have exit code 1; that alone is not a module failure.

Errors use the `TOOL_WORKER_` prefix: `CONFIG`, `ARGUMENTS`, `BUSY`, `ABORTED`, `TIMEOUT`, `DISPOSED`, `MODULE`, `EXECUTION`, `OUTPUT`, `PROTOCOL`, `EXIT`, `CRASH`, and `LOG_LIMIT`. In the tested DSH runtime, cancellation before dispatch returns `ABORTED_BEFORE_DISPATCH`; cancellation after this plugin starts returns `TOOL_WORKER_ABORTED`. Module exception details are not copied into tool errors.

## Scope

Only explicitly registered modules run in workers. Input encoding/validation, result validation/rendering, ordinary tools, plugin loading hooks, host callbacks and UI renderers still run in the host. Existing closure tools are unchanged; the original H06 same-thread case is not fixed by this package.

The worker gets an explicit environment whitelist: `SystemRoot`, `WINDIR`, `ComSpec`, `PATHEXT`, `OS`, `PROCESSOR_ARCHITECTURE`, `NUMBER_OF_PROCESSORS`, `TZ`. It does not inherit API keys, `NODE_OPTIONS`, debugger or preload arguments. Module config is explicitly provided JSON and can contain whatever the operator chooses to provide; the plugin does not infer credentials.

A Worker is not an operating-system permission sandbox. Reviewed modules retain Node capabilities and the process user's permissions. A private protocol channel and rejection of unsolicited `parentPort` messages prevent accidental protocol mixing, not arbitrary malicious-code attacks. Same-process native addon fatal errors can still crash the host. Subprocesses independently spawned by a module are not automatically owned or killed by this plugin. It owns its Worker, host timers and output streams; it does not promise that every external resource or module side effect is reversible. Use this initial interface for computation modules. File commits, external requests and host-service access need a separately reviewed protocol; after cancellation or timeout their possible effects require reconciliation, not blind retry.

## Local verification

This rc.2 candidate pins Cordis 4.0.2 and DSH tools/LLM 0.1.5-rc.2. The enclosing project's `tests/dsh-rc2-runtime-20260913/workers/run.mjs` runs the focused real ToolRuntime and file-backed Loader tests without model API calls. Tests and dependency junctions are excluded from the package payload. Evidence also records build and fixture failures; fixed acceptance rounds are separate from development checks. No performance-overhead estimate or private daily deployment acceptance is implied.
