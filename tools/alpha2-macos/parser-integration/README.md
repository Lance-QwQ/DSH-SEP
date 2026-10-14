# Parser runtime assembly and bridge

Production modules are `runtime.mjs`, `services.mjs` and `lifecycle.mjs`. This is trusted package
composition code, never a model tool or workspace file-access API. The assembler
accepts only a fresh destination and upstream-verified program inputs:

```javascript
await assembleParserRuntime({
  destination,
  inputs: {
    node: {path, sha256}, // verified official Node 24.21.0 arm64
    owner: {path, sha256}, // compiled, source-pinned task-owner
    helper: {path, sha256}, // compiled, source-pinned APFS helper
    python: {root, sha256}, // full verified standalone Python 3.12.14 prefix
    dependencies: {root, sha256}, // SHA-512-verified fixed parser dependency set
    capturedRoot, // directory containing the three fixed SEP parser sources
  },
});
```

`inspectInputTree(root)` supplies the canonical materialized-tree SHA-256 and
relative entries for the two directory inputs. The caller must first authenticate
their source artifacts and dependency lock; hashing arbitrary local inputs is
not upstream provenance. Internal prefix symlinks are materialized as independent
regular files. Escaping/dangling aliases, cycles, hard links and changing files
are refused. Trusted staging parents must remain under the assembler's ownership;
this Node installer does not claim the stronger untrusted-project fd traversal
boundary. It never receives original workspace/private memory roots.

All installed files become read-only (executables 0555, other files 0444), all
directories 0555. The generated `manifest.json` and `tool-runtime/package.json`
receive explicit chmod 0444 after creation, including under installer umask 077.
The output `manifest.json` contains relative paths, hashes,
modes and input digests, with no source-machine paths. The returned
`manifestSha256` must be pinned in the enclosing installation descriptor. Partial
or failed assembly is retained as an unpublished candidate, never auto-deleted.
Assembly limits are 50,000 entries, depth 32, 512 MiB per file and 2 GiB total;
these program-staging limits do not change project, parser or attachment limits.

The bridge API is:

```javascript
const services = await openParserServices({
  runtimeRoot: destination, manifestSha256, stateRoot,
});
// Frozen binding: { runtimeRoot, manifestSha256, stateRoot }
services.binding;
services.parseContext({input, signal});
services.parseDocument({bytes, extension, signal});
await services.close();
await services.whenClosed();
services.status();
```

The bridge enforces the existing exact macOS platform gate and verifies every
installed entry before creating private state. The enclosing application must
hold its instance lease for `stateRoot`. It creates separate context/document
scratch and authority domains and always uses the real APFS adapter. State may
be reopened after a prior completed service close; records remain present and
new requests get unique scratch directories. No record rotation bypass exists.

Close synchronously rejects new calls and aborts both parsers, merges concurrent
attempts, and aggregates their bounded receipts with an outer 5.5-second deadline. Only both actual closed states
resolve `whenClosed()`; unknown initialization cleanup or runtime cleanup cannot
be changed into pass. The application must also drain consumers around parser
calls before releasing their stores/P2 resources. No raw parser code, arbitrary
executable arguments or environment enters either public parse API.

`runtime.test.mjs` has nine filesystem/manifest definitions, including assembly
under umask 077 with the prior process mask restored in finally; POSIX tests use
synthetic executable bodies and are not Darwin parser evidence. On Darwin its
final pre-state rejection checks manifest failure; on Linux it checks the platform
gate. `lifecycle.test.mjs` has five aggregate-boundary tests with controlled
completion promises, including misleading early pass, unknown cleanup and child quarantine status; those
tests do not claim real native process termination. `native.test.mjs` has four
actual assembled-service definitions, for 18 definitions total. Run them
with the same fixed carrier/dependency environment as `../parser/run-native-tests.mjs`:

```sh
"$runtime/node/bin/node" tools/alpha2-macos/parser-integration/run-native.mjs \
  "$RUNNER_TEMP/parser-integration"
```

Keep `SEP_MAC_PARSER_PYTHON`, `SEP_MAC_PARSER_PYTHON_HOME`,
`SEP_MAC_PARSER_DEPENDENCIES` and `SEP_MAC_BUNDLE_ROOT`. Archive output `*.log`,
`*.json`, and `installed/manifest.json`; runtime files and synthetic scratch are
test artifacts, not release user data. `RESULT.json` records exact test input
and log hashes. Native integration remains pending until that run succeeds.
