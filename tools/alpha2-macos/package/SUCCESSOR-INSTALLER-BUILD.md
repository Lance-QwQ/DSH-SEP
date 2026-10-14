# Fixed r74 payload successor installer: draft build scope

The r74 application archive passed its native build, ad-hoc signature and
archive-restoration checks. Its original UI round failed before actions at the
test Inspector stage; the second round did not run. The separate r75 UI rerun
passed its first round but failed its second round in the test-only emitted
preview expression. Both original results remain unchanged. This r78 draft
waits for the corrected r77 test carrier to pass both native UI rounds before
any upload or installer build. The r77 test-branch commit is
`bbebae79cfbca35a9e31c8385a985920a7798567`; no outcome is assumed here.

This job changes only the pinned application payload and the derived build-time
binding/restorer. The eleven production installer native sources, sixteen
controller runtime files, two helper sources, Contents layout preservation and
outer-only signing policy remain the byte-identical r71 versions. New payload
receipts produce a new INSTALLER hash and therefore require compiling a new
outer executable. No previous installer executable is reused with a new hash.

The planned native sequence is five signature-layout definitions, seven fixed
r74 binding definitions, six-source compile-only preflight, exact r74 download
and restoration, complete resource assembly, manifest-bound compile, outer
signature, full inventory, archive and restored archive verification, then
bounded transport splitting. All outputs are fresh RUNNER_TEMP paths. The
account application, private data and daily program are never installed or
started by this build job.

The frozen r71 installer and its successful r72 installation evidence remain
unchanged. A successful successor build will need its own actual output
digests and separate installation/lifecycle qualification. None of those
future output hashes or pass claims are supplied in this draft.
