# DSH 0.2.0-rc.2 SEP adaptation validation

Dedicated test branch only; no Release or daily deployment. SOURCE-MANIFEST.json binds the official DSH source plus SEP adaptation. Validation uses synthetic stores and local recorded model responses.

The first macOS run passed source/build, native installation and all four SEP composition groups. Desktop rounds did not start: the workflow passed an incorrectly decoded Unicode directory name. This revision corrects that workflow path. The first failed run is retained.

Linux image composition exposed a missing root-node_modules binding for libvips RPATH after dependency flattening; the library bytes were already included. The assembler now includes that unique dependency in the hashed root graph, with refusal tests and real image decoding. Windows strict programmatic movement still has a recorded 1–2 DIP size drift at 175% scale; physical input waits for an unlocked desktop. These remain separate from passing lifecycle and update evidence.

Full upstream documentation synchronization has outstanding failures. This is a validation candidate, not a release-readiness claim. macOS physical TCC interaction, distribution signing and private plugin functions are not covered by hosted CI.
