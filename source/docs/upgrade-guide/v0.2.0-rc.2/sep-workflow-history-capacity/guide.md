---
kind: upgrade-guide
description: "SEP workflow history may exceed the former 200-record schema and requires the matching reader."
---

# SEP workflow history uses a byte capacity

English | [中文](guide.zh.md)

## Change

SEP retains all P1 runs and reviews instead of refusing a project's 201st record. The existing arrays and three data domains remain unchanged. The optional `p1.historyMaxBytes` setting defaults to 16 MiB and accepts integer values from 1 to 64 MiB. Writes are checked in UTF-8 bytes; active managed children retain bounded final-report space. Ordinary turn completion without configured checks no longer appends a permanent `not_run` review; explicit review still does.

Older SEP readers that enforce 200-record arrays cannot read data grown past that limit. This change does not make downgrades safe or turn the JSON backend into paged disk storage.

## Migration

1. Keep the pre-update program and data checkpoint together. Use the matching updated SEP reader after new records are written; do not replace new data with the old snapshot merely to downgrade.
2. Existing `p1` configuration needs no new field. Set `p1.historyMaxBytes` explicitly only when a different storage allowance is required. `P1_HISTORY_BYTES_LIMIT` preserves prior records; review capacity before trying new work.
3. Consumers of `suite_tasks` should follow `nextOffset` using the optional `offset` and `limit` fields, or request a known `id`. Each response stays in the caller's parent session and within 64 KiB. Confirm that retained record IDs remain readable after restarting.

See the [package capacity reference](../../../../packages/sep/system-enhancement-package/) for the whole-project loading limitation.
