# r22 / r23 historical desktop evidence

This index repairs missing Git evidence in the macOS preview reviewed at `fab50b9280a2f083ad478050d325a671918084ca`. It does not rerun a native test or change the signed installer. Original records and their historical status are retained byte-for-byte.

| Generation | Original record | Scope |
| --- | --- | --- |
| r22 | [Narrative](../EVIDENCE-R22.md), [result](r22/RESULT.json), [seal](r22/SEAL.json) | First installed desktop round failed; later two were not run. Test-owned SIGKILL is not product shutdown. |
| r23 | [Narrative](../EVIDENCE-R23.md), [three-cycle receipt](r23/DESKTOP-THREE-CYCLES.json), [seal](r23/SEAL.json) | Three synthetic same-data core desktop cycles passed with normal exits and an empty cleanup list. |
| r23 later addendum | [Addendum](r23-post-smoke/ADDENDUM.json), [post-smoke inventory](r23-post-smoke/POST-SMOKE.json) | Later independent read of the original post-smoke inventory. Does not rewrite the earlier `localReceiptRead:false` snapshot. |

Both seal inventories are complete in Git: 5 r22 members and 14 r23 members, plus the seals themselves and the two-file addendum. The copies of historical Markdown inside the sealed directories are immutable archive members; use the narrative links above for navigation. Their relative links and time-specific pending statements are preserved as originally sealed.

The missing-connection negative sample passed refusal checks but required test-owned SIGKILL. That result is separate from the positive cycles' normal shutdown. Electron API/Welcome actions are not physical mouse, Dock, TCC or AX certification. No paid provider or private daily Profile was used.

`TESTED-smoke-full.mjs` is the historical r23 test input, not a new runtime entry. Its SHA-256 equals r22's explicitly not-yet-run pending probe. The two generations must not be added together as successful runs.

See [SOURCE-BINDING.json](SOURCE-BINDING.json) for copied member hashes. The [current installer evidence](../../package/MAC-PREVIEW-EVIDENCE.md) separately binds the r78 installer and r79 acceptance. The 692,801,617-byte installer remains SHA-256 `6043ddd8305009e9013de46f85f7660cdc775d4320987553808eb9f8ec01db4f`; historical r23 results do not certify that later installer. Full Mac certification remains `blocked`.
