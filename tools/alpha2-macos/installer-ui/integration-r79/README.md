# r79 fixed successor installer integration

This test operator targets the actual r78 installer archive and the unchanged, signed r74 application payload. The r78 build and archive audit passed; this r79 installation and startup sequence has not run. Build commit, test commit and payload commit are distinct.

Order: restore and verify the original installer; start and normally close its original byte-identical LaunchServices entry on an empty account; compile a separate test-main linked to the same five production modules; use actual controls and attached confirmation buttons to install; verify the installed payload and perform two LaunchServices startup/close cycles. The six result assertions, time limits, cleanup and unknown-owner handling are unchanged from r72.

The original installer window observation alone does not prove preview health. Button delivery uses a separate test entry, not external mouse interaction with the original main. Unknown cleanup remains blocked; there is no forced termination or reuse of a populated account. The native application has no Developer ID/notarization.

Reproduce derivation with `node installer-ui/integration-successor/generate-r79.mjs <verified-r78-evidence-directory> --verify`. ORIGIN.json pins every source and exact transformation. CI uses only ci-job.yml; no historical NI runner is included. The artifact token is restricted to the restore step.

Final evidence must bind the actual new integration and installed-startup RESULT.json hashes to this installer archive/manifest and payload PROGRAM/BOOTSTRAP/tree. Historical r72 evidence rows must not be reused.
