# Installer status through r79 integration

The r78 successor installer has completed actual native build, manifest-bound
compile, signature verification, archive restoration and local download
verification. It carries the fixed r74 payload whose two actual current-project
UI rounds passed in r77. New-installer integration r79 passed at commit
`b5b64827ab2c5b1e223f838bdc2539371bf4f923`, run `38650349354`, job
`116147301943`: six actual-control installation definitions in a separate test
entry, followed by two installed-product startup/restart cycles with normal
closure. AUDIT SHA-256 is
`e0581b598011edb008378982d3b67282b2242d4b7206e3d27cc6301a34264f78`.
The four-file local delivery has been assembled and read back with matching
hashes. Full Mac certification remains blocked.

See [current artifact and evidence](../package/MAC-PREVIEW-EVIDENCE.md). The r78
installer archive is 692,801,617 bytes, SHA-256
`6043ddd8305009e9013de46f85f7660cdc775d4320987553808eb9f8ec01db4f`.
The older r71/r61 installer completed its separate r72 installation chain;
that result does not qualify this new payload. The historical table below
retains each stage's original limitations and failures. All native evidence is
limited to the macOS ARM64 test image, not physical input or public certification.

| Evidence | Result and exact scope |
| --- | --- |
| r55, CI 38599226907 | Native installation controller 31/31: original 22, boundary 5, recovery list 4. Protocol 17 + Node session 12 + manifest 11 = 40/40 in a separate job. |
| r56, CI 38600667418 | Ten signed synthetic bundle configuration definitions passed. Native admission was still an explicit missing implementation: all 29 definitions failed as expected; this is RED evidence, not a pass. |
| r57, CI 38601620342 | Fifteen actual AppKit control definitions passed using synthetic transport/opener. Six entry-invocation definitions passed separately. AppKit termination callbacks were synthetic; actual child cleanup was not proved here. |
| r58, CI 38602599222 | Admission 28/29: the remaining probe serialized an integer instead of the required boolean. The private-transport job stopped in fixture preflight, before compilation and its 15 definitions. Original failed artifacts remain unchanged. |
| r59, CI 38628614197 | With only the probe boolean corrected, the unchanged admission 29/29 passed. The corrected transport fixture reached compilation and all original 15 definitions; the unimplemented transport produced 15 real RED failures. Nine static closure checks passed, including a new comment-separated dynamic-import refusal. |
| r60, CI 38629317145 | Twelve resource-assembly definitions reached the missing implementation with signed synthetic payloads. All twelve were genuine RED, not functional passes. |
| r62, CI 38629984742 | Both native transport jobs failed compilation because two helper names collided with SDK typedefs. The original fifteen and six additional definitions were not executed. |
| r63, CI 38631108180 | After only renaming those symbols, transport reached 9/15 passes and six failures. Six role-replacement definitions failed, including explicit fixture cleanup after FIFO/pending deadlines. Eight application lifecycle definitions reached genuine missing implementation failures. These historical failures remain preserved; later outcomes are recorded separately below. |
| r63, separate resource job 116082665761 | Resource assembly passed all twelve unchanged definitions, zero skipped/cancelled. This verifies signed synthetic payload assembly and the fixed runtime closure, not the full application payload or installation. |
| r64, CI 38632614457 | The original fifteen private-transport definitions and six role-admission definitions passed natively. All 35 synthetic child receipts confirm normal drain and exit without forced cleanup. The application delegate initially passed 6/8; the two failures are retained and addressed by the later test-carrier evidence below. |
| r64, full-resource job 116087760608 | Resource assembly used the actual fixed r61 payload: 29,365 entries, 1,794,064,040 bytes. The real fixed controller completed list, preview, cancel, list and close. Account state was unchanged; closed receipt, stdout EOF and exact child exit 0 were verified without force. No installation confirmation, outer installer app signing or UI execution occurred in this job. |
| r66, CI 38634271006 | The menu diagnostic passed 7/8: its first fixture remained in reading even after the real Quit action was delivered. The signed synthetic opener reached its expected RED: five refusals passed and its two positive cases failed with the stub. These are separate historical outcomes, not successes inferred from r68. |
| r68, CI 38635520085 | All eight original application lifecycle behaviors passed with the unchanged production delegate and an exact, replayable test-only derivation that waits for actual preview and menu events. The fixed opener passed all seven definitions: two actual signed synthetic app dispatches and normal exits, plus five refusals. Neither suite installs the complete payload or proves original product process exit. |

Current native admission verifies the compiled-in manifest, fixed executable
roles and complete controller source closure. It deliberately does not claim
to verify the entire nested application inventory; the admitted Node
configuration and first-install controller perform that verification before
publication. A valid admission probe still refuses to run an unconnected UI.

The AppKit layer includes visible plan confirmation, cancellation, recovery
classification, a separate Open action and bounded close reporting. Its
15-definition evidence uses actual Cocoa controls but programmatic actions and
synthetic channel replies; it is neither physical input nor a complete install.
The NSTask transport has passed the unchanged native definitions. The fixed
opener's native signature and exact-path checks now have seven-case evidence.
The production main and its six implementation/five header inputs are frozen
in `application/PRODUCTION-SOURCES.json`. Their actual composition passed r71
build and r72 old-payload installation; r78 recompiled the same native sources
against the new manifest and passed build/signature/restoration. Complete
new-payload UI-to-controller installation and installed startup passed
in r79 within the separate-test-entry scope above. A dummy-manifest compile preflight alone never establishes native
admission, UI or installation.

The source-closure review found that a comment between `import`/`require` and
`(` could evade the original dynamic-dependency refusal. A new definition failed
before the fix and passed after it. No current module in the 16-file controller
closure used that spelling. This is a narrow conservative static-source capture,
not a general JavaScript parser or an arbitrary untrusted-code sandbox.

The r79 original-byte installer received 36 normal quit requests before exit 0
and observed process absence. This does not establish one-click immediate exit
or independently observe private controller drain. The separate test entry has
actual UI-release, controller closed-receipt, output EOF and exact exit 0; both
installed cycles have same-generation closed/pass and exact exit. No forced or
fallback cleanup was used. Build, download and bounded privacy inspection remain
separate records. Final delivery is under
`D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1\mac-preview-delivery-r1`;
this local copy/document step did not execute or re-sign either application. Physical Finder/Dock,
Developer ID/notarization, arbitrary macOS
versions, private environment continuation and paid model operation remain
unverified. Only the dedicated Mac test branch is updated; main, Releases and
the Windows daily program are unchanged.
