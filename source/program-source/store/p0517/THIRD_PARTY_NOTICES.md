# Third-party components

This is a DSH SEP isolated adapter candidate, not an official OpenClaw, Mem0, PinchBench or SWE-bench release.

- lossless-claw, Martian-Engineering, commit c84dd8cff727eff3bb6c9a26f3cf4c0510fbc343. MIT, included at vendor/lossless-claw/LICENSE. TypeScript transpiled to JavaScript, original business logic retained. Only the SQLite migration/conversation/summary/token modules are exercised; no OpenClaw plugin registration or automatic compactor is installed.
- Mem0, mem0ai, commit c7ee362aff94a369af70f13f2b4f853f6793ff4c. Repository Apache-2.0 license included at vendor/mem0/LICENSE. Reused fact-extraction prompt and output schemas, transpiled from mem0-ts/src/oss/src/prompts. Not the Mem0 cloud SDK or full vector-store engine. The upstream nested OSS package lists MIT; the root Apache license is also retained conservatively. No upstream telemetry or external database is invoked.
- PinchBench skill, commit 819384ae830492365b8363fc26bc2602e73f216d. MIT license at vendor/pinchbench/LICENSE. vendor/pinchbench/selected-sources.json binds three included task references. source/prework.mjs uses an explicitly synthetic local adaptation with a new deterministic grader; upstream graders and external-action tasks are not executed. No leaderboard upload or claim of official scores.
- SWE-ReX and SWE-bench: pinned source archives are research inputs, not packaged runtimes. The adapter implements read-only authenticated HTTP liveness and prediction-record formatting. Execution remains pending a Linux/container environment.

See upstream/sources.json and evidence index for source archive identities. Native Node.js SQLite is used only in a bounded temporary Worker with an in-memory database. This build does not create private persistent memory files.
