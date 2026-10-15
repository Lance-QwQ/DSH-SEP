# Windows distribution privacy inspection

`scan_distribution.py` is a read-only, standard-library scanner for a pinned program graph or a final ZIP. It reports relative member path, whole-file hash, rule, line and representation, never matched secrets or excerpts. It neither runs packaged code nor extracts archives. Known state filenames, credentials databases, `.env` and JSONL bodies are flagged without reading their bodies. No daily profile is an input.

The graph entry point requires the separate graph and desktop descriptor hashes. The ZIP entry point requires the complete archive SHA-256 and checks regular-file identity before and after reading. Selected patterns cover Windows/POSIX home paths, local AIData build paths, absolute file URLs, GitHub/provider/AWS key syntax and PEM private-key delimiters. Raw and NUL-normalized scans are streaming. Bounded decoding handles JSON/JSONC, inline base64 source maps, ZIP, packed ASAR, gzip and TAR. In-archive TAR hardlinks may reference only a regular archive member; nothing is linked on disk. All other links or unsafe names are rejected.

Default limits: depth 3, 16 MiB decoded text/gzip view, 8 GiB expanded views and 200,000 files. Oversized or unsupported decoding remains an explicit gap. Arbitrary encodings, hidden payloads, binary semantics and the absence of all private content are not certified. `fullPrivacyAudit` remains `not_run`, including when the selected checks pass. File suffixes select container parsers. ASAR unpacked siblings must be present in the enclosing ZIP.

Exact review exceptions bind path, whole-file SHA-256, rule, line and representation. They cannot exempt structure, state files, source-binding failures or coverage gaps. Current-user and local build-root matches are not accepted by the reviewed release policy. Upstream published code examples, compiler paths, and three specific PEM/WASM literal coincidences have separate external evidence. An npm pass for one exact member is not promoted to a pass for an entire mismatching source audit.

Example commands (all outputs must be new D: paths on Windows):

```text
python -B scan_distribution.py zip ARCHIVE --sha256 SHA256 --allowlist EXACT-EXCEPTIONS.json --output D:\AIData\ProjectWork\DSH\release\privacy\FINAL.json
python -B scan_distribution.py graph PROGRAM --sha256 GRAPH_SHA --descriptor-sha256 DESCRIPTOR_SHA --output D:\AIData\ProjectWork\DSH\release\privacy\PROGRAM.json
```

The installer review separately verifies its four program files and pure cold-profile conversion. Runtime support comes from manifest-selected public program files. Installation creates fresh roots, UUID, empty credential placeholder and zero ledger; it does not copy daily data. These provenance and construction facts are complementary to the bounded byte scan.

`verify-public-presets.mjs` compares all seven policy rows: four match pinned repository policy; three derive from fixed official source defaults through an exact public plan-mode clause change and two compaction changes. `!!js` remains inert data, with no evaluation or private profile input. The public receipt explicitly says these are derived defaults, not original official bytes. The verifier accepts program root, official package subset root, official source root, official commit, graph path, fresh output, public base-policy path and source commit as positional arguments. Local identity consistency does not authenticate GitHub.

Regression logs and historical failed attempts live outside the distribution under the release privacy evidence directory. Test fixtures require `SEP_PRIVACY_TEST_ROOT` to name an existing D: directory. Run Python with `-B` and Node's `--test`. Actual final Full/Only ZIP reports are independent runs and cannot be replaced by source-tree success.
