# Fixed r74 payload successor installer: r78 built, r79 integrated

The r78 successor build has passed actual manifest compilation, ad-hoc signature
verification, archive restoration and local download verification. Its archive
is 692,801,617 bytes, SHA-256
`6043ddd8305009e9013de46f85f7660cdc775d4320987553808eb9f8ec01db4f`,
built at `e2cdf833051e9ff0b451d0885549f38690220acd` in run `38648087267`.
No installer UI or installation was performed by that build. The separate r79
audit passed six actual-control installation definitions and two installed-product
startup/restart cycles, with normal closure and no fallback or forced cleanup. See
[current artifact and evidence](MAC-PREVIEW-EVIDENCE.md).

The pre-build draft's r75 gate is historical: r74's original early-Inspector
failure and r75's renderer-expression failure remain preserved. The successor
r77 two-round run passed on the same unmodified r74 archive before r78 was
dispatched. That evidence covers actual preview/cancel/discard/recovery-candidate
UI and normal closure, not physical input, native confirmation acceptance or UI
commit. It does not replace the new installer's own qualification.

This job changes only the pinned application payload and the derived build-time
binding/restorer. The eleven production installer native sources, sixteen
controller runtime files, two helper sources, Contents layout preservation and
outer-only signing policy remain the byte-identical r71 versions. New payload
receipts produce a new INSTALLER hash and therefore require compiling a new
outer executable. No previous installer executable is reused with a new hash.

The completed r78 native build sequence was five signature-layout definitions, seven fixed
r74 binding definitions, six-source compile-only preflight, exact r74 download
and restoration, complete resource assembly, manifest-bound compile, outer
signature, full inventory, archive and restored archive verification, then
bounded transport splitting. All outputs are fresh RUNNER_TEMP paths. The
account application, private data and daily program are never installed or
started by this build job.

The frozen r71 installer and its successful r72 old-payload installation evidence
remain unchanged. r78 has its own actual output digests and download record;
r79 independently qualified this successor's installation/lifecycle at commit
`b5b64827ab2c5b1e223f838bdc2539371bf4f923`, run `38650349354`, job
`116147301943`. Actual-control installation used a separate test entry, not
external input into the original executable. The original installer received
36 normal quit requests before exit 0 and observed absence; its private controller
drain was not independently observed. Full Mac certification remains blocked;
final four-file delivery is assembled with matching full readback hashes. It
copies the exact r78 archive and adds only external documentation; it neither
re-signs nor runs the installer. The evidence navigation records its location.
