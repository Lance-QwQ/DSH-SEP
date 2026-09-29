# Computer-click regression tests

These artifact tests use an explicitly supplied DSH rc.2 installed graph and Node 24. They do not install dependencies into this checkout, search personal directories, start a model, or send desktop input. The source files under `../../src` are staged in a unique temporary directory; the declared Host dependencies are read from the supplied installation.

## Run

Set `SEP_CLICK_HOST` to an installation or exported test fixture whose `graph.json` matches `host-lock.json`, then run from any directory:

```powershell
$env:SEP_CLICK_HOST = 'D:\fixtures\pinned-rc2-host'
node --test --test-isolation=none 'D:\checkout\packages\sep\system-enhancement-package\tests\computer-click\click.test.mjs' 'D:\checkout\packages\sep\system-enhancement-package\tests\computer-click\lifecycle.test.mjs' 'D:\checkout\packages\sep\system-enhancement-package\tests\computer-click\composition.test.mjs'
```

The test harness checks the complete graph digest, all files in the selected dependency closure, and their dependency links before importing code. Missing configuration and a changed Host fail explicitly. A version string alone is insufficient. Update the committed lock only as a reviewed Host adaptation. It currently binds the local.6 program graph; that is a fixed test dependency, not a lookup of whichever daily installation is current.

`click.test.mjs` uses the real ToolRuntime and MCP result adapter with synthetic provider results. `lifecycle.test.mjs` holds synthetic provider promises across cancellation/deadlines and checks late completion and quarantine. Each case explicitly drains its synthetic bodies before resetting test-only global state; this is not a supported production reset mechanism.

`composition.test.mjs` loads test-only Cordis configuration through the real Loader, runs the production Agent loop against recorded model blocks, and compares the next model request with `expected-result.json`. It captures the committed Session events, writes and reads a local JSONL transcript and validates replay through the Session reader. The file writer is test-owned; this does not test the production JSONL persistence provider or claim coverage of the repository-wide snapshot lane.

The original `sep-review/computer-click` directory remains historical evidence. Its personal-layout-dependent runner is superseded by this package-local suite; its sealed manifests and old results are not rewritten.

## Recovery limits

The tests verify bounded caller and disposal waiting, not termination of an unresponsive native driver. A quarantined input keeps subsequent enhanced actions blocked, including after plugin reload. Restoring service requires confirming that the old provider can no longer send input and restarting the Host. No automatic unlock, input retry, broad process termination or private-environment test is part of this suite.
