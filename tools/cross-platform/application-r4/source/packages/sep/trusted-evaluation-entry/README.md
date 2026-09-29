# Trusted evaluation entry — isolated candidate

This package's default entry (`package.json` → `main: "./index.mjs"`) is a Cordis plugin. It exports the named Cordis members `name`, `inject`, and `apply`; it does not export the `Entry` class or an ES-module default export. The package also contains the lower-level launcher library and Linux backend. Installing the package alone does not enable evaluation or provision its external dependencies.

## Default entry: Cordis plugin

In a trusted native host with the required services, load the package namespace:

```javascript
import * as evaluationPlugin from 'dsh-sep-trusted-evaluation-entry';

const pluginHandle = await ctx.plugin(evaluationPlugin, { enabled: false });
const service = ctx.get('sepEvaluationEntry');
console.log(service.status()); // disabled: status is not_run
await pluginHandle.dispose(); // invokes the plugin's shutdown hook
```

`enabled` defaults to false. Disabled loading starts no backend and registers no evaluation tools. Enabled operation requires the native `tools` and `agents` services. The trusted `sepEvaluationEntry` service exposes only `status()` (a copied, token-free receipt) and idempotent `stop()`. It is not a model-callable control tool. Activation errors are reported as local `blocked` status rather than intentionally stopping the host; check `status()` after loading. Plugin disposal and host disposal await the registered stop hook. After stopping, reload the plugin for a new connection generation.

### Configuration entry

For a DSH composition, put the configuration in the plugin row's `config` object in the selected installation's `cordis.patch.yml` (the existing file uses a JSON array). Merge this row into the existing composition; do not replace unrelated plugin rows:

```json
{
  "insert": [{
    "id": "sep-evaluation-entry",
    "name": "dsh-sep-trusted-evaluation-entry",
    "config": { "enabled": false }
  }]
}
```

To enable it, a trusted administrator supplies the following configuration shape, either as that `config` object or as the second argument to `ctx.plugin`. Angle-bracket values below are placeholders, not usable identities:

```javascript
const config = {
  enabled: true,
  project: {
    root: 'C:/authorized-public-project',
    projectId: '<backend-project-id>',
    catalogSha256: '<64-lowercase-hex-catalog-digest>'
  },
  backend: {
    entry: '/opt/dsh-sep-eval/<provisioned-package>/lifecycle.py',
    configPath: '/opt/dsh-sep-eval/<private-state>/config.json',
    configSha256: '<64-lowercase-hex-backend-config-file-digest>',
    stateIdentity: '<64-lowercase-hex-canonical-state-identity>'
  },
  recover: false,
  shutdownMs: 30000
};
```

The backend `configPath` points to a separately provisioned Linux Official-evaluator configuration, not to `cordis.patch.yml`. It binds the approved catalog, artifacts, images and private state. Generate hashes and state identity during trusted provisioning; do not invent them or let a model choose paths. Set `recover:true` only for explicitly reviewed recovery of an uncertain prior lifecycle; it does not bypass leases or ownership checks. The enclosing host must allow time for the entry's maximum 30-second close plus host teardown; the reviewed isolated installation uses a 45-second host shutdown deadline.

## Lower-level library: explicit Entry import

For an integration that manages the lifecycle itself, import the subpath explicitly:

```javascript
import { Entry } from 'dsh-sep-trusted-evaluation-entry/entry.mjs';

// config has the trusted configuration shape documented above.
const entry = new Entry(ctx, config);
try {
  const ready = await entry.start();
  // Use the registered evaluation tools only after successful activation.
} finally {
  const closed = await entry.stop();
  // Inspect closed.status; blocked does not certify resource cleanup.
}
```

When importing directly from an unpacked package directory, the equivalent relative import is `import { Entry } from './entry.mjs'`. The library does not install the wrapper's `sepEvaluationEntry` service or its automatic host-disposal hook: the caller must own and await shutdown. Use one lifecycle owner for a backend state; do not simultaneously activate the wrapper and a separate `Entry` for the same state.

## Backend prerequisites and lifecycle guarantees

Configuration: `{enabled, project:{root,projectId,catalogSha256}, backend:{entry,configPath,configSha256,stateIdentity}, recover?:boolean}`. `root` is an authorized canonical Windows public-project directory. Backend paths are administrator-provisioned under `/opt/dsh-sep-eval/` in dedicated distro `DSH-SEP-Eval`; Python is the existing pinned SWE-bench venv. No model-selected paths or commands. `stateIdentity` binds canonical Linux state path, device and inode, computed during trusted provisioning. `configSha256` binds the complete backend configuration. Preserve that directory for reconnect; do not copy old active state onto a new identity.

Backend config extends the reviewed Official config with `expectedCatalogSha256`. Provision package source and its `lifecycle-manifest.json` before use, with private local state. No auto-download or installer is included. Manifest hashes are integrity checks within this trusted local installation, not signatures against an administrator rewriting the package and manifest. Ordinary users/workspaces are not auto-adopted as public inputs.

`await entry.start()` verifies a private challenge/connection generation, catalog, state identity and health, then registers native tools. Its result excludes tokens. Each generation has a fresh token; health and all operations require `X-SEP-Generation`. Only initial read-only health probes retry for up to five seconds for WSL forwarding; submissions never retry. Backend failure revokes the native plugin without shutting down the host. Shutdown/reconnect refuses concurrent starts. Create a new explicitly recovering entry only after a blocked/crashed lifecycle has been investigated; Linux independently rejects still-live/conflicting previous identities.

`await entry.stop()` immediately begins plugin revocation and closes the private backend stdin. Within the default 30-second budget the guardian fences new requests, allows at most 5 seconds for accepted HTTP work, allows known jobs natural completion until 10 seconds, requests cancellation, waits until 25 seconds, then terminates only its exact owned backend child if necessary and reports by the outer 30-second limit. `shutdownMs` can lower the Windows caller budget (100–30000 ms) for controlled checks; it cannot raise it. Synthetic Python tests shorten stage budgets separately and also test the default real 25/30-second boundary.

If HTTP dispatch, state persistence, worker/container retirement or ownership remains uncertain, shutdown returns blocked. Killing the backend does not prove container cleanup: the result stays blocked, the durable marker remains, and restart requires explicit recovery and resource verification. Independent container deadlines remain in place but are not counted as already completed cleanup. An unknown job remains blocked/null even after resources become quiescent. Receipts and stable job identities survive connection generations; no replay occurs.

Linux flock is acquired before backend construction and held through close-state persistence. Records include Linux PID start time and boot identity; Windows launcher owns an exact child-process handle and does not equate a dead WSL bridge with a dead backend. Child backend and grading worker use parent-death signals. A prior nonclosed lifecycle with live or mismatched process identity refuses takeover. A dead prior owner still requires `recover:true`, followed by existing backend service-lease and job recovery checks. This candidate does not implement a generic service manager or prove whole-machine restart recovery.

The deadline is an application-level contract. Nonreturning OS filesystem/kernel operations cannot be forcibly completed by Python; the independent Windows caller timeout reports blocked instead of certifying shutdown. No process-name kills, no private data retention claims, no daily stop-on-any-error policy. This package does not include the trial stop module.
