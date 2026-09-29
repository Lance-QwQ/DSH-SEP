---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-25-sep-task-events

English | [中文](2026-09-25-sep-task-events.zh.md)

## Summary

Register the existing SEP task/checkpoint-change event and fold types in this local rc.1 build. Preserve its required-on-read status; recovery/continuation remains an explicitly validated ignorable extension.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-25-sep-task-events
baseline: false
changes:
  - root: "event:task/checkpoint-change"
    previous: null
    after: "c31b339df4a8078e03f9b4f97468d07c4d974deca364022abec160d103c65592"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Unmodified official readers must reject unknown required task events. The local V0–V4 catalog validates both SEP extensions before recoverable-tail handling, rebases same-log intent references and validates folded task state. Migration publishes a V4 successor without changing committed predecessors. Incomplete historical child-header coverage blocks materialization. This is a local SEP extension, not a claim of universal official compatibility or safe downgrade after new writes.

<a id="verification"></a>
## Verification

The later V4 producer port writes `plugin:dsh-system-enhancement-package/*` sources and native tool-role results. History expansion recognizes `compact-checkpoint`. Lifecycle restoration permits a content-only replacement of exactly one existing tool result after its turn closes, matching Session's surface-edit contract: message/call identity, turn, step, flags, metadata and current-surface provenance remain unchanged. A new tool execution outside an open turn is still rejected. `retirement-relations-green.log` covers 394 format/migration tests; the component suite separately covers cold reopen. These local source results do not by themselves admit an installed update.

The real JSONL service suite sep-v4-migration.spec.ts passed 11 tests in persistence-chain-green-2.log: V0–V3 chains, V4 cold reopen, source identity preservation, interrupted-turn reference remapping, requiredness and schema refusals, child discovery and cancellation. Whole installed-candidate admission has not yet run.

<a id="dev-note"></a>
## Dev Note

None.
