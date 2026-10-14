# Private installer transport

r59 compiled the explicit non-launching stub and confirmed all fifteen fixed behavior definitions failed for missing implementation. The implementation candidate now replaces only that stub; native GREEN is pending. `FREEZE-RED.json` and `FREEZE-RED-R2.json` preserve the original and corrected test inputs; `FREEZE-CANDIDATE.json` identifies the implementation. Local synthetic-controller preflight validates test input generation only, not NSTask.

The production interface is internal `SEPInstallerPipeTransport`, initialized with the result of `SEPInstallerVerifyMainBundle` and the compiled manifest hash. The admitted `node` and `controller` values are records `{path, sha256}`. There is no public executable-path argument, environment configuration, HTTP or model entry. The native test binary has a test-only command line for its Node executable and synthetic controller.

The intended implementation generates a fresh 64-hex nonce internally, rechecks admitted role hashes, launches only fixed Node with `[fixedController, nonce, manifestSHA]`, and supplies a minimal environment. It implements the existing protocol without changing it: one accepted request, 4 KiB request limit, 16 KiB response limit, exact nonce and monotonically increasing sequence in 1..10000, exact object shapes, strict UTF-8, and no duplicate completion. Parallel requests are refused locally without a second dispatch or loss of the first accepted operation. Invalid responses close admission while the output pipes continue to drain. Stderr is discarded with a saturated byte counter, never passed to UI.

Actual process termination and stdout EOF are separately observed. The final complete frame must be delivered before the termination observer is notified. Neither EOF, exit code 0, nor a blocked close is a resource-release receipt: the existing UI independently requires the `closed/resourcesReleased:true` reply and normal actual termination. Errors do not kill unknown descendants or turn an unknown installer owner into a released one.

The fifteen native definitions cover private binding and preview/normal closure; split UTF-8; parallel refusal; unknown request/extra path; wrong nonce and sequence; extra response fields; delayed duplicate frames; the 16 KiB limit; invalid UTF-8; partial EOF; stderr backpressure and redaction; parent exit before inherited stdout EOF; twenty immediate last-frame/exit children; blocked close; and changed admitted controller hash. The twenty repetitions are one fixed race definition, not twenty unrelated claims.

Each synthetic controller has its own four-second test deadline. Cleanup evidence records whether it finished and drained; this deadline belongs only to the fixture and does not model production recovery. The inherited-stdout fixture has one explicit test descendant that exits after 350 ms. No production payload, private data, physical input or actual installer is involved.

Native command (fresh output directory):

```sh
clang -fobjc-arc -fblocks -Wall -Wextra -framework Cocoa InstallerPipeTransport.m InstallerPipeTransportTests.m -o "$RUNNER_TEMP/tests"
"$RUNNER_TEMP/tests" "$(command -v node)" "$PWD/controller-fixture.mjs" "$RUNNER_TEMP/fresh-fixtures"
```

`ci-job.yml` records the historical RED workflow; `green-ci-job.yml` runs the unchanged definitions against the candidate. Both bind all six implementation/test inputs, run the fixture preflight, compile actual Cocoa, and preserve raw results, compile log and exit code. Production composition is a separate stage.
