# Native installer admission

This directory is a RED scaffold, not a functioning installer. The native implementation currently returns `SEP_INSTALLER_ADMISSION_NOT_IMPLEMENTED`. Its 29 fixed definitions await execution on real macOS before implementation. Windows syntax checking does not certify native compilation or behavior.

The eventual `SEPInstallerVerifyMainBundle(int argc, NSString **failure)` accepts no caller path. It obtains the fixed `Contents` layout from `NSBundle.mainBundle`, checks the compile-pinned raw `INSTALLER.json` hash and exact manifest schema, and verifies each Node/controller/helper role plus the complete runtime file closure. Regular-file hardlinks, symlinks and group/world writable components are rejected. Reads bind native descriptors to identity before and after reading and reopen from the held root to detect parent replacement.

The native layer checks the payload directory, receipt, PROGRAM and BOOTSTRAP hashes. It does **not** scan the entire app payload. The fixed trusted Node bundle-config entry and lower controller preview must independently verify that inventory before installation. A successful admission receipt is evidence of these reads, not a permanent filesystem capability. No process is started by this API.

The test bundle is synthetic: Node and helpers are inert identity placeholders and the payload manifests do not describe a real app. Every mutation case builds its own bundle and checks real filesystem behavior; two read-boundary cases replace a file or its parent with identical bytes while the native reader holds its descriptor. The probe-only compile macro reports admitted paths for tests. A build without that macro always refuses `SEP_INSTALLER_UI_NOT_CONNECTED`; actual UI/child wiring belongs to a later stage.

The test hook has one literal read boundary and a private inherited fd. Production builds omit the hook and its call site. Hostile environment variables and external arguments cannot select paths or executables. The test does not claim that launching through a symlink necessarily preserves the symlink spelling in NSBundle; it tests actual payload and runtime component aliases instead.

Ad-hoc signatures and same-user re-signing are not isolation. This layer does not claim protection from arbitrary code controlled by the same account. The original bootstrap, lower installation core, current product package and daily installation are unchanged.
