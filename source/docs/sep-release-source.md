# Standalone release source notes

The release is DSH `0.2.0-rc.2` plus SEP `0.2.1-beta.1` for Windows x64 Beta. Its source base is the current working project based on upstream commit `639ed015397290b3745d163aafe02ffee4aa3f84`, including selected local tracked changes and non-ignored untracked SEP source.

The outer Source delivery contains the source file manifest, source origin record, exclusion record and publication overlay map. The original pre-overlay file manifest is retained for comparison. Changes in the publication copy are recorded separately; the original working repository is not rewritten.

Tests and source directories named credentials or sessions are ordinary project code and remain included. Private runtime roots, actual environment/signing files and the entire original Git directory are excluded before their contents are read. One upstream fixed unit-test constant that resembles a provider key is retained solely as a diagnostic-redaction test input; its path, complete file hash and exact matched hash are bound in the scan report. No actual key is supplied.

Fourteen relative Git links are represented as ordinary target-text files, matching a Windows Git checkout with core.symlinks=false; their original 120000 mode and target are recorded. Creating actual symlinks was rejected by Windows privilege error 1314. When preparing an archive or a POSIX checkout, restore these explicit relative link records, preserve executable modes, and reject targets outside the source root. Do not replace them with arbitrary external junctions.

[Review entry](../SEP-REVIEW.md), [SEP notices](../packages/sep/system-enhancement-package/THIRD_PARTY_NOTICES.md) and [plugin group notices](../packages/sep/plugin-group/THIRD_PARTY_NOTICES.md) distinguish current delivery from historical preparation statements. The root DeepSeek MIT license, each SEP MIT license and all third-party licenses remain present. Native-source obligations and binary terms remain those of their own components; no relabeling or blanket native source audit is claimed.

The full final release report and package checksum/update records are delivered outside this source tree. Run only the documented source build/test commands in an isolated environment. Do not copy private daily state or credentials into a public export.
