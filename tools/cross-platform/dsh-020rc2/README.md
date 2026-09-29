# DSH 0.2.0-rc.2 SEP adaptation validation

Dedicated test branch only. No Release or daily deployment. The source combines official 0.2.0-rc.2 with the SEP r8 baseline and bounded startup diagnostics. SOURCE-MANIFEST.json binds the source. Tests use synthetic stores without provider calls.

Windows and WSL builds and focused runtime regressions have passed; macOS evidence is pending. Full upstream documentation gates are not yet passing (20 groups, including SEP package documentation and generated-catalog drift). This branch is a validation candidate and is not a release-readiness claim. Native desktop tests cover launch, close-to-background, reopen, settings, and owned-process exit. Physical macOS TCC interaction and public signing are outside hosted CI scope.
