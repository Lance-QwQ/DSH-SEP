# r6 emitted renderer expression correction

This candidate changes only the test carrier. The fixed r74 product is restored without rebuilding or signing. r74 remains blocked and r75 remains failed.

r75 round 1 passed. Both rounds observed their exact owned desktop PID, Electron 44.7.0 browser process, installed ASAR path and ready state. Round 2 reached its real pending project and dispatched the single selection click, then the first preview observation returned a renderer error. Both rounds subsequently confirmed normal owned-resource and same-P2 fixture cleanup; worker exits were 0 and 1 respectively.

The frozen `native-dom-r3.mjs` preview expression contains a newline escape inside an outer template. Expanding that template produces a literal line break inside a JavaScript single-quoted string. Compiling the actual emitted expression reproduces `SyntaxError`. This prevents the test from observing the review; it does not prove that the earlier selection click failed or that the product did not generate a review.

The new `native-dom-r4.mjs` doubles that one escape. `native-worker-r6.mjs` changes only its DOM import. `native-operator-r6.mjs` changes only its worker reference and input evidence list. All action counts, waits, assertions, same-store preparation, ownership cleanup and `finally` logic remain unchanged. Initial renderer failure is retained in the DOM readiness trace even if final inspection overwrites the worker's summary code.

Three tests compile actual emitted expressions. The preview is also executed against a small synthetic DOM to verify the returned diff uses a newline. All other 19 DOM templates and four worker/Inspector templates compile without additional changes. Old r3 reports RED: 2 pass, 1 fail. New r4 reports 3 pass. Complete portable regression is 31 pass: original 15, identity 6, package binding 7, grammar 3. Native product rounds remain `not_run` for r6.

```sh
node tools/alpha2-macos/desktop/project-workflow-product/derive-renderer-grammar.mjs --verify
node --test --test-reporter=tap tools/alpha2-macos/desktop/project-workflow-product/native-renderer-grammar.test.mjs
```

No environment variable is needed. To reproduce the preserved old grammar only, set `SEP_RENDERER_GRAMMAR_SOURCE=native-dom-r3.mjs`. The normal test defaults to the new r4 DOM file.

Use the same exact-r74 restoration result and SHA with `native-operator-r6.mjs`; its CLI and fresh RUNNER_TEMP output/data layout are unchanged. Each round records 23 source inputs. Run round 2 only after round 1 succeeds. Keep all JSON/log evidence and do not reinterpret later clean shutdown as a pass for a failed UI action. This test does not accept native dialogs, bypass TCC, or claim physical interaction.
