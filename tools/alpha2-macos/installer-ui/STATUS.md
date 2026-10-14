# Installer integration status through r63

The complete user installer is still under development. These fixed inputs
were run on the limited macOS ARM64 test image, without private data or paid
model requests. They do not certify a physical Mac interaction or public release.

| Evidence | Result and exact scope |
| --- | --- |
| r55, CI 38599226907 | Native installation controller 31/31: original 22, boundary 5, recovery list 4. Protocol 17 + Node session 12 + manifest 11 = 40/40 in a separate job. |
| r56, CI 38600667418 | Ten signed synthetic bundle configuration definitions passed. Native admission was still an explicit missing implementation: all 29 definitions failed as expected; this is RED evidence, not a pass. |
| r57, CI 38601620342 | Fifteen actual AppKit control definitions passed using synthetic transport/opener. Six entry-invocation definitions passed separately. AppKit termination callbacks were synthetic; actual child cleanup was not proved here. |
| r58, CI 38602599222 | Admission 28/29: the remaining probe serialized an integer instead of the required boolean. The private-transport job stopped in fixture preflight, before compilation and its 15 definitions. Original failed artifacts remain unchanged. |
| r59, CI 38628614197 | With only the probe boolean corrected, the unchanged admission 29/29 passed. The corrected transport fixture reached compilation and all original 15 definitions; the unimplemented transport produced 15 real RED failures. Nine static closure checks passed, including a new comment-separated dynamic-import refusal. |
| r60, CI 38629317145 | Twelve resource-assembly definitions reached the missing implementation with signed synthetic payloads. All twelve were genuine RED, not functional passes. |
| r62, CI 38629984742 | Both native transport jobs failed compilation because two helper names collided with SDK typedefs. The original fifteen and six additional definitions were not executed. |
| r63, CI 38631108180 | After only renaming those symbols, transport reached 9/15 passes and six failures. Six role-replacement definitions failed, including explicit fixture cleanup after FIFO/pending deadlines. Eight application lifecycle definitions reached genuine missing implementation failures. These remain repair work. |
| r63, separate resource job 116082665761 | Resource assembly passed all twelve unchanged definitions, zero skipped/cancelled. This verifies signed synthetic payload assembly and the fixed runtime closure, not the full application payload or installation. |

Current native admission verifies the compiled-in manifest, fixed executable
roles and complete controller source closure. It deliberately does not claim
to verify the entire nested application inventory; the admitted Node
configuration and first-install controller perform that verification before
publication. A valid admission probe still refuses to run an unconnected UI.

The AppKit layer includes visible plan confirmation, cancellation, recovery
classification, a separate Open action and bounded close reporting. Its
15-definition evidence uses actual Cocoa controls but programmatic actions and
synthetic channel replies; it is neither physical input nor a complete install.
The NSTask transport is now being implemented against the unchanged RED cases.

The source-closure review found that a comment between `import`/`require` and
`(` could evade the original dynamic-dependency refusal. A new definition failed
before the fix and passed after it. No current module in the 16-file controller
closure used that spelling. This is a narrow conservative static-source capture,
not a general JavaScript parser or an arbitrary untrusted-code sandbox.

Pending: actual private transport GREEN, full-payload resource assembly, production AppKit
entry and LaunchServices opener, final complete payload signing/archive restore,
native installation through that UI, and same-data application startup from the
installed path. Physical Finder/Dock, Developer ID/notarization, arbitrary macOS
versions, private environment continuation and paid model operation remain
unverified. Only the dedicated Mac test branch is updated; main, Releases and
the Windows daily program are unchanged.
