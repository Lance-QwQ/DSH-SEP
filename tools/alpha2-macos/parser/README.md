# Trusted macOS parsers

This is a separate, composition-only parser capability. It does not increase
ordinary Shell/MCP or generic task limits and does not accept model-provided
code, command arguments, executable paths, environment or policy.

`createTrustedParser(config, io)` accepts one fixed `kind`:

* `context-python`: the existing hash-pinned `context_resolver.py`, Python
  static AST analysis only. `parseContext({input, signal})` accepts serialized
  authorized snapshot data up to 10 MiB and returns its JSON response. The
  deadline remains 10 seconds and combined stdout/stderr is capped at 12 MiB.
  Python never imports or executes source from that snapshot.
* `document-node`: the captured SEP `parsers.js`, `parser-worker.js` and
  `errors.js`, loaded by a fixed-hash entry. `parseDocument({bytes, extension,
  signal})` returns the existing `parts`, locators, parser version and warnings.
  Source bytes remain bounded at 8 MiB, text at 500,000 characters and parsing
  at 15 seconds. The separate 12 MiB transport accommodates base64; it does not
  change provider upload quotas. Digital PDF and DOCX keep their original
  worker limits and rejection semantics; no OCR/model fallback is implied.

Config contains `runtimeRoot`, `scratchRoot`, `authorityRoot`, `ownerPath`,
`ownerSha256`, `executable`, `executableSha256`, `parserPath`, `parserSha256`, and
`kind`. `io` must be the native APFS project adapter with its lock exactly at
`authorityRoot/.native.lock`. The trusted package assembler provisions a
read-only tool runtime from verified inputs. Each call creates a fresh private
scratch directory. Only runtime/system libraries and that scratch are readable;
only the scratch is writable. Node's realpath traversal receives metadata access
to each literal ancestor of runtime/scratch; this does not grant ancestor directory
listing or sibling file contents. No source project or controller is mounted.

The parser carrier is mechanically derived from the already tested native
single-process task carrier; `origin.json` replays every transformation. It
uses the same native sole-parent reaper and dedicated receipt pipe. `family`
mode is refused. The deprecated `sandbox-exec` backend is limited to the same
exact verified macOS 15.7.9 / 24G830 / Darwin 24.6.0 / arm64 platform. This is
not a general, forward-compatible macOS sandbox claim.

`close()` closes admission synchronously, aborts accepted parser operations,
and provides a five-second bounded receipt. `whenClosed()` resolves only once
accepted work really drains. Unknown cleanup quarantines new calls, retains
scratch and hash-only authority records, and cannot be converted into a release
claim merely because a caller deadline elapsed. Confirmed late cleanup can
allow closing, but never automatically retries or publishes task results.
At most four accepted calls are held, and dispatch is serial. Known parser
errors keep their classified codes without raw stack traces or paths.

Native test runner (fresh absolute output root):

```sh
SEP_MAC_PARSER_PYTHON=/absolute/python/bin/python3.12 \
SEP_MAC_PARSER_PYTHON_HOME=/absolute/python \
SEP_MAC_PARSER_DEPENDENCIES=/absolute/verified/node_modules \
SEP_MAC_BUNDLE_ROOT=/absolute/bundle \
node tools/alpha2-macos/parser/run-native-tests.mjs "$RUNNER_TEMP/parser-native"
```

The runner requires the previously selected Node 24.21.0 and standalone Python
3.12.14, copies isolated runtimes/dependencies, verifies captured parser hashes,
and compiles the existing native owner and APFS helper. It saves OS identity,
compiler and test logs. Dependency acquisition belongs to the separate pinned
SHA-512 installer; no dependency lifecycle scripts are run here. Portable
contract tests are not evidence for Darwin policy or process cleanup.

The r23 and r25 native runs retained two document-parser failures. The r25
synthetic diagnostic identified `EPERM` in Node's `realpathSync` on `/Users`
before entry evaluation; Node `-e` under the same policy succeeded. The next
candidate adds only literal ancestor metadata and tests that ancestor listing
and sibling content remain refused. Native run `38548342883`, commit
`1c2554dc4b3caa0bd2b8d13f483f48e6f654299f`, verified the repair: 6 contract,
2 entry and 12 native checks passed with zero skips. Artifact `11886180099`
SHA-256 is `2f7a315ec016d90deeae5fe9729c4f2e31b777befdba721838de4525683fa0d1`.
These are isolated parser checks; business/context/document routes still need
their own integration evidence. See `ASSEMBLY.md` for the production boundary.
`diagnose-native.mjs` is a synthetic CI diagnostic, excluded from the product.
