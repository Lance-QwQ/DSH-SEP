# Actual installer integration test entry

This is a new test-only directory. Existing native UI, transport, admission,
application delegate, fixed opener, controller and payload are not changed.
The current test-main and full operator are implementation drafts awaiting
native execution. They exercise the production combination directly. No native
success is claimed. The earlier NI runner is retained as disabled history: its
artificial assertion failures could not establish a product defect and were
never sent to CI.

The old `run-red.mjs` now rejects before compilation or output creation. The six
fixed definitions in `main-result.test.mjs` validate the actual integration
receipt; compile/setup failures never count as six exercised definitions.

The planned entry is:

    node tools/alpha2-macos/installer-ui/integration/run-full.mjs <fixed-restore-RESULT.json> <RESULT-sha256> "$RUNNER_TEMP/installer-integration"

It requires the successful fixed installer restorer's result, copied original
assembly receipt and inventory. The successful r71 installer build is bound to
commit `1b5bcfa5c8a88fda7ad5727ee104eef8f8f0ad04`; the restorer's three download
artifacts, original assembly and complete archive are hash-pinned. The failed r69 package is refused. All
test output is below RUNNER_TEMP. An existing application, product data or
installer governance directory is a refusal, never an instruction to remove it.

The full operator uses the verified installer archive and fixed
r61 payload. It first starts and normally closes the **original byte-identical
Installer.app through LaunchServices**, while account target/data/governance are
absent. A separate test copy then replaces only the entry binary, links the five
unchanged production implementation modules and their headers, and uses the same
compiled INSTALLER hash and actual private controller. It does not use a mock
transport, test home, arbitrary executable, reply override or environment path.

The test entry observes actual enabled visible buttons by existing identifier,
uses NSButton `performClick:`, and clicks the unique visible enabled `Cancel` or
`Install` button inside the real attached NSAlert sheet. It never calls
`endSheet:returnCode:` to invent acceptance. It checks a cancelled review, a
cancelled real confirmation, then the real confirmed installation. The displayed
plan and actual persisted confirmation must match. The outer operator verifies
the full installed package/signature, unchanged source, fixed target, and that
the product data root is still absent before the product is opened.

Normal close must prove UI resource release and the real transport's closed
receipt, output EOF and exact child exit. An unfinished operation is allowed to
keep running until its separate test deadline; an elapsed caller deadline is
not termination. Unknown ownership remains blocked with evidence and no force
kill. CI teardown, if needed, is recorded separately. Only afterward does the
ordinary installed product's independent LaunchServices lifecycle run.

The test-main is **not the original product entry**, so successful button actions
do not claim external mouse input into the byte-identical Installer.app. The
original startup/close, test-entry installation, and installed-product startup
are distinct evidence rows. No AX/TCC change or physical user operation is used.

The original installer observer reports exact PID, UID, bundle path/identifier
and integer kernel birth. On-screen window metadata is not a preview-health
proof and may include an error alert. That scope is recorded separately from
the test-main's stronger actual UI/controller assertions. Original-app exit is
observed through LaunchServices and exact process absence; it is not a global
descendant census or a newly invented private-controller receipt.

`installed-startup.mjs` is a mechanically replayable derivative of the existing
two-cycle installed-product probe. Its origin lists only three import
relocations and the old r44 archive pin's replacement with verified r61. The
installation and source checks additionally bind r61 PROGRAM, BOOTSTRAP, tree,
29,365 entries and 1,794,064,040 bytes. No old product identity is relabeled.
