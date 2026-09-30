# SEP workflow closeout regressions

This private test snapshot binds thirteen selected source and test files to SHA-256 digests in SOURCE-MANIFEST.json. It covers SEP validation evidence, confirmation authority, closeout summaries and the safe-change engine. It does not build DSH, run application code, provide real Loader composition evidence or publish a Release.

The macOS workflow is named **SEP workflow closeout regressions**, uses macos-15 and Node 24.19.0, and only watches this directory and its own workflow file on codex/sep-dsh-020rc2-20260929. It does not touch or trigger the separate DSH 0.2.0-rc.2 build workflow. The only installed dependency is zod 4.4.3; its integrity is copied from the source checkout's pnpm lock and install scripts are disabled.

Run verify-source.mjs before executing the snapshot. The runner verifies it again, then executes exactly the same four unit test files in three independent processes. Every invocation gets a new attempt directory; every round has a separate log and JSON result. A first-round failure keeps the overall result failed even if later rounds pass. Zero executed tests, skipped tests, cancellation, process failure and timeouts cannot produce a passing round. Test-runner context and credential-like environment variables are removed from child environments.

Use an isolated copy of this directory with its locked dependency installed. For example, run node run-unit.mjs --output with an absolute output directory under the task's artifact root. Windows outputs must be on D:. The runner directs temporary fixtures to the corresponding attempt directory. CI uses runner.temp for the isolated dependency installation, test fixtures and evidence.

Only round logs and result JSON are uploaded. No user logs, sessions, local settings or private data are included in this snapshot. Real Loader composition is a separate Windows/WSL check and is always recorded as not_run by this unit-only runner. Later source edits require a refreshed manifest and a new complete three-round run; earlier evidence remains preserved.
