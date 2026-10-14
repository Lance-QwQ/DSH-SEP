# Combined document, image and settings candidate

`standalone.mjs` is the single package entry. It precisely derives the frozen media standalone, preserves cold native attachments, the native image/P1 route, settings adapter verification and authenticated settings HTTP checks, then substitutes the combined profile and runtime. Frozen `business`, `media-business` and captured 375-file source are not edited.

The new production allowlist contains exactly nine files:

```
document-business/derive.mjs
document-business/parsed-tools.mjs
document-business/context.mjs
document-business/consumers.mjs
document-business/runtime-source.mjs
document-business/runtime.mjs
document-business/profile-layout.mjs
document-business/standalone.mjs
document-business/startup-cleanup.mjs
```

These files additionally depend on the already included frozen business/media/settings modules and the independently verified `parser-integration` and `parser` runtime modules. No test module belongs in the application payload.

## Trusted assembly input

Keep the media standalone input and add only:

```js
parser: {
  runtimeRoot,        // immutable installed prefix from PROGRAM
  manifestSha256,    // independently bound manifest.json SHA-256
  stateRoot,         // exactly join(dataRoot, 'parser')
}
```

The profile record persists the complete binding. Existing media profile records do not silently migrate to this candidate: use fresh isolated data. The runtime validates the three-field service binding and rejects overlap with source, memory, locks, budget, and managed-project domains. Tools and UI cannot supply parser code, executables, paths or configuration.

Both `suite_index` and `suite_extract` first read through the unchanged scope/P2 capability, then invoke the trusted parser even for UTF-8 text. There is no host parser fallback. The extraction-only derivative removes the captured old vision/DeepSeek method; image understanding continues through the frozen native attachment/P1 implementation. Capture remains false by default. The parser close admission/abort starts with business close; accepted outer calls and actual parser `whenClosed` drain must complete before store/P2 release. A blocked receipt never means release succeeded. The new startup exception handler also stops cleanup on a blocked runtime/project receipt, retaining the lower-level project/host rather than releasing their ownership prematurely. Its thrown error preserves the original error as `cause` and offers `retryCleanup()` to the trusted caller; retries merge in flight, skip owners already confirmed released, and never repeat a confirmed host shutdown.

All captured sources have exact input hashes; every transformation checks its exact occurrence count and records whole-input/whole-output and replaced-span hashes. `inspect-origins.test.mjs` compares complete derived hashes against fixed expected values and emits `ORIGIN-RECEIPT.json`. Profile/standalone hashes normalize only the deployment source-root URL, preserving every other byte.

## Context boundary

Context is **not mounted by the default combined profile**. The original feature requires an explicitly authorized, immutable `visibility: public` snapshot, task metadata, project root and exact SHA-256. Neither the captured host nor the already validated Linux adapter provides a trusted snapshot-generation UI. A native fixture with a configured synthetic public snapshot proves the interface only. It does not enable context for arbitrary user projects.

The context adapter removes the original spawn implementation and sends only `{input, signal}` to the fixed AST service. It preserves canonical snapshot paths, session ownership, child refusal and post-parser cancellation/scope checks. Its configured Python path must equal the executable location under the installed service binding; that field never selects an executable.

A future usable snapshot entry must take a direct user's explicit file selection, read only a held controlled project view after P2 exclusions, enforce the snapshot size limit, bind the view version/project/path/hash, and separately obtain authorization for public-snapshot semantics. It must not relabel an arbitrary private project as public automatically.

## Verification and native job

Portable contracts use a clearly named test-only service substitute to test refusal, response provenance and lifecycle. Real image decoding/attachment admission and the real official Agent/Loader still run with synthetic model responses. This is not a full browser picker test and makes no paid model calls.

`run-native.mjs OUTPUT` consumes the parser integration runner's `fixture.json`. Required environment:

```
SEP_MAC_TREE_HELPER
SEP_MAC_ATTACHMENT_HELPER
SEP_OFFICIAL_HARNESS
SEP_MAC_BUNDLE_ROOT
SEP_PARSER_ASSEMBLY_FIXTURE
```

Use the same actual Apple-silicon macOS runtime and prepared official host/settings adapter as the passed native media job. Set `SEP_MAC_PROGRAM_ROOT` if the source root differs from the packaged program root. The runner writes only inside its explicitly supplied output root, with separate stdout/stderr logs. It runs 22 composition contracts, 7 preserved combined image/Agent/Loader cases using the real installed parser service, 3 native document/P2/explicit-context cases, and 1 two-round real standalone HTTP/settings/restart case: 33 definitions, expected zero skips. Standalone initialization must use a host where `prepareSettingsUi` has already completed.

At source preparation time the combined native run is **not_run**. Portable evidence and failed fixture attempts are kept separately under the D: artifact root. Only the root coordinator uploads and runs CI, assembles the full package, and updates native status after collecting actual results.
