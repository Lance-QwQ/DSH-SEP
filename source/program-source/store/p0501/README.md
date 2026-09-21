# Isolated Mem0 integration candidate

See docs/71-mem0-governed-integration.md in the project. Requires the matching suite core and plugin group. Not installed in daily DSH. Model responses were injected in regression tests.

## Message-level governed expansion (current isolated candidate)

Suite 0.1.0-alpha.14.rc2-provenance.1 and group 0.1.0-isolated.7 use protocol 2.
Both matching packages are required for model history expansion. The tool and
explicit current-user request, current-project/session scope, four-call turn
limit, 4096 UTF-16 page size, source revision binding and retirement remain.

New memory origins bind session ID, direct user message ID and SHA-256 of the
whole text message. Duplicate saves merge origins, capped at 512 (overflow
refuses the write). Revision archives retain their old origins. Withdrawal and
purge retain body-free origins across the record's revision/promotion history.
Source fields are captured from host events, never accepted as tool arguments.

Complete new origins restrict their affected messages; unrelated messages remain
readable. If one message contains several facts, an affected fact restricts the
whole message. A matching message ID with a changed body is also refused. This
is not semantic matching of paraphrases or copies under unrelated message IDs.
Archives, withdrawn markers and lifecycle-eligible records are checked at read
and before redispatch of an active expanded result. The output receipt also binds
the current source graph. This does not retract a request already dispatched.

Unknown/malformed/old origins, unmigrated legacy memory and document archives or
P2 document-deletion authority without message provenance still fail closed.
Old provenance is not guessed or upgraded from textual similarity. Restoring a
memory into active storage does not automatically authorize its archived raw
source. Human review remains separate. P2 journal and snapshot restore preserve
new restrictions, including after cold payload erasure; absent old restrictions
never become a new proof of readability.

Only direct user plain text qualifies. Attachments, assistant/tool/plugin text,
seeded/fork and subagent sessions remain excluded. Pattern-based credential and
code checks are not complete secret/document classification. Source limits are
admission limits on already loaded sessions, not an OS memory cap.

Expanded tool bodies retire from the native model surface at idle/next turn and
are barred from active compaction. Native append-only audit still retains the
original and tool result; this is not physical erasure and does not guarantee
removal of assistant paraphrases. No separate body database or sidecar is added.

This is native compaction plus verified links and controlled source expansion,
not the full persistent multilevel lossless-claw engine. Daily deployment and
real-model quality validation are not part of this isolated release.
