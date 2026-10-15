# Installation preparation portability — r3

This slice implements bounded ZIP preparation using yauzl 3.4.0, native-platform delta metadata, POSIX file modes, a command-line quiescence gate, manifest schema 2, a POSIX shell bootstrap, and mode-bound public file publication/restoration. Windows manifest schema 1 remains Windows x64 only. Schema 2 requires exact platform/architecture and explicit safe file modes; cross-platform host binaries are never inferred from a version number.

The process scan is a read-only inventory of visible command lines referring to managed installation roots, repeated by the existing preparation/publication flow. It is not proof of all possible writers, a process-kill capability, or a replacement for owner leases and governed-writer locks. Unknown query results block. POSIX scanning uses UTF-8; newline/control characters or a failed/truncated query are not silently treated as idle.

The ZIP extractor allows only the three metadata files and content-addressed payload files. It rejects traversal, duplicates, links, encrypted/unsupported compression, oversize metadata/data, CRC errors and entry-size contradictions. Parsing and streaming are bounded; cancellation/failure retains only an unselected partial directory. Hash checks still bind archive, graphs, payload and source. Local privileged adversaries and a permanently stuck filesystem are outside this cooperative installer threat model.

POSIX publicFiles plans include oldMode/candidateMode; changing a mode requires a new plan, and old POSIX plans without modes are rejected. Public file modes are restricted to 0600/0644/0700/0755 and verified on both publication directions. File modes are included in the approved operator input and final graph audit. Raw ZIP attributes never grant executable or privileged permissions.

Tests use real ZIP parsing and owned child processes, plus a synthetic program graph and bootstrap. The profile/YAML/semver test hooks throw if used; these tests do not demonstrate full profile composition, a real DSH host update, or a graphical desktop. The POSIX start.sh fixture launches a synthetic entry through the real Node runtime. No model calls or private data.

Remaining: full native dependency/app builds, real per-platform runtime bundles and graph generation with executable modes; native catalog/channel selection (the public SEP feed still advertises Windows only); complete profile/health/P2 update integration, Only/Full coexistence, desktop/tray/TCC/Computer Use acceptance. Do not distribute this test snapshot as an installer. No daily deployment, main branch update, or Release in this slice.

Dependency reference: https://github.com/thejoshwolfe/yauzl (MIT). The existing source lock already contained 3.4.0; this change makes it an explicit desktop runtime dependency. The diagnostic CI dependency lock records both yauzl and pend integrity values.
