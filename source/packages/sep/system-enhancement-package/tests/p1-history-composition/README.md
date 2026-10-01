# Native history and prework regression

This keyless Windows fixture mounts the actual DSH 0.2.0-rc.2 Cordis Loader, AgentLoop, native subagent provider, tool schema pipeline, storage-domain/JSON and session JSONL persistence. It stages the current suite and SEP group source over dependency links from the explicitly supplied, hash-pinned host. No daily program is discovered or started.

```powershell
$env:SEP_HISTORY_HOST = 'D:\path\to\the\pinned\program'
$env:SEP_HISTORY_EVIDENCE_ROOT = 'D:\test-output\p1-history'
$env:TEMP = 'D:\test-output\temp'
$env:TMP = $env:TEMP
node --test .\tests\p1-history-composition\composition.test.mjs
```

The host must match `host-lock.json`; the test verifies the selected transitive file hashes and dependency targets before importing modules. `SEP_HISTORY_SOURCE`, if provided, must name the suite `src` directory, with the sibling `plugin-group` package present. Source hashes are recorded in each run's `source-binding.json`.

- 205 real parent turns stop without writing empty-criteria reviews. An explicit review persists, then `suite_tasks` accepts the optional pagination schema through a real tool call. The test reopens the native session log after disposal.
- A real `Agent.cancel` interrupts the actual SEP group's prework call. A later request with the same binding performs three fresh samples, admits a native child, and retains its successful run and prework receipt.

The LLM adapter is a deterministic in-process replay. These checks validate local execution, accounting hooks and cancellation composition; they do not establish online model accuracy, paid service reliability, Electron rendering or the unmounted vendored OpenClaw expansion orchestrator.
