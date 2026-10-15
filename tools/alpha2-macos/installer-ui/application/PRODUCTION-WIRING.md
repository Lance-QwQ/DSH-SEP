# Fixed installer application composition

Current composition status: r71 built the original complete installer, r72 verified its old r61 payload installation, and r78 built the successor carrying r74. The eleven native sources remain unchanged; the new INSTALLER manifest is compiled into a newly signed outer executable. r79 passed six actual-control installation definitions using a separate test entry and two installed-product startup/restart cycles with normal closure. The original-byte installer separately passed LaunchServices start and eventual normal exit after 36 quit requests; its internal controller drain was not independently observed. See [artifact and evidence navigation](../../package/MAC-PREVIEW-EVIDENCE.md). Full Mac certification remains blocked; neither physical input nor a one-click immediate-exit claim follows.

Final local delivery copies the exact r78 installer archive and places README, MANIFEST and SHA256SUMS beside it. All four files were read back; no application was run or re-signed by that step. The current artifact navigation records the delivery hashes and separate r79 audit/peer review.

Historical module evidence: native r64 passed the private transport's 15 original and six role checks. The unchanged application delegate initially passed six of eight tests; r66 showed that the first failing fixture was still awaiting its preview even though the menu action was delivered. A pinned test-only derivation waits for the real preview request, preview phase, and menu delivery. All eight original behavior assertions passed in r68; production delegate bytes remain unchanged. The fixed opener's seven definitions reached expected native RED in r66 (five negative passes, two positive failures), then all seven passed with the implementation in r68. The two positive cases observed distinct exact synthetic application processes and their normal termination. These are separate module tests, not complete installer certification. The local candidate directory is named `installer-r67-candidates`; its remote execution was r68.

`PRODUCTION-SOURCES.json` freezes the six implementation and five header files used by the complete compositions. Native run `38635520085` at commit `3b7522a2781a5b75f4ca115b515a9640d4609173` supplies the r68 module evidence. The audit and original artifacts are retained under `ci-r68-results`; previous failed samples remain unchanged.

The frozen `main.m` accepts only the normal application invocation (`argc == 1`). It creates AppKit and calls `SEPInstallerVerifyMainBundle` using the compiled `SEP_INSTALLER_MANIFEST_SHA256`. Admission reads the actual main bundle and returns the fixed configuration. Neither command-line paths nor environment paths become authority. r69's historical signature-layout failure is retained; r71 and r78 later completed actual manifest-bound builds. A compile-only preflight with a dummy manifest hash does not execute admission or UI and cannot prove installation.

After admission, the private transport starts the verified fixed Node/controller. A definite pre-launch refusal (snapshot `started: false`) owns no controller, so a classified error alert may be dismissed and this installer process may exit. An established or unconfirmed owner must stay behind the original UI close gate. The application menu, Cmd-Q, and window close all converge on that gate. A `closed` response alone does not permit termination; the original UI also requires the private child's actual normal termination after output drain. No application-layer kill is planned.

The opener receives only the verified expected PROGRAM and BOOTSTRAP hashes. It resolves the account home through `getpwuid(geteuid())` and accepts only `~/Applications/DSH SEP.app`. Before dispatch it must reject aliases and changed fixed documents and validate the installed app's native code signature. The NSWorkspace completion confirms only launch dispatch, never startup, readiness, or full application health.

Final compilation uses these six implementation files:

- `installer-ui/native/InstallerUI.m`
- `installer-ui/admission/installer-admission.m`
- `installer-ui/transport/InstallerPipeTransport.m`
- `installer-ui/application/InstallerApplication.m`
- `installer-ui/application/FixedApplicationOpener.m`
- `installer-ui/application/main.m` (actual r71/r78 build; original-entry lifecycle observed in r79; actual-control installation used a separate test entry)

Link Cocoa and Security. The main bundle executable is exactly `DSH SEP Installer`. Tests' `SEP_INSTALLER_APPLICATION_TESTING` macro is never enabled in production. Resources are assembled first; their exact INSTALLER manifest hash is compiled into the application; the outer application is signed without `--deep`, and all fixed nested role hashes are rechecked afterward. The assembler owns the final signature/inventory/restore and complete native installation tests.

The underlying full-resource assembly already passed separately in r64 with the fixed 1,794,064,040-byte r61 payload and five real controller operations (list, preview, cancel, list, close). This was not an outer Installer.app build and did not accept an installation plan. The complete chain must first start and normally close the original installer, then use a separately identified test-entry copy for actual AppKit button/sheet operations against the real controller and payload, and finally verify the installed application independently. Test-entry actions do not certify external input into the byte-identical product entry.
