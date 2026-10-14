# Isolated first-install transaction candidate

CI.md records the frozen r46 RED contract. On real macOS, all 13 fixtures first compiled and passed ad-hoc signature verification, then failed with SEP_INSTALL_NOT_IMPLEMENTED (run 38581365790, job 115911801127). This implementation now replaces those stubs; its native GREEN run is pending. The 13 definitions and fixture bytes remain unchanged.

This is an internal installation core, not an automatic updater or public installer command. It never starts an app and never adopts, clears or migrates existing account data. No frozen r44 application bytes or active daily program are modified.

## API and authority

prepareFirstInstall({sourceApp,parent,dataRoot,receipt,helperPath,helperSha256}) validates a trusted caller's receipt and returns a hash-bound plan. The receipt contains inventory, programSha256, and bootstrapSha256, supplied from an independently authenticated checkpoint. A fresh self-calculated receipt for an unknown download is not publisher authentication. Ad-hoc code signing verifies integrity, not Developer ID or notarization.

executeFirstInstall({plan,helperPath,helperSha256,onProgress?}) publishes only the fixed basename DSH SEP.app. recoverFirstInstall accepts the same inputs. onProgress is a trusted operator notification hook, not model configuration. The eventual user-facing wrapper must derive the real account's fixed Applications and data paths; fixtures pass a fresh temporary parent.

Plans bind source and parent filesystem identities, full inventory, PROGRAM/BOOTSTRAP hashes and the exact native helper. Source, package structure, signature and manifests are rechecked before publication. Native operations use held directory descriptors, openat/fstatat with no-follow semantics, and an APFS-only gate. Source files must be regular and single-linked; directory/file extended ACLs and group/world-writable or special permission modes are rejected. Internal relative symbolic links are copied without following them; the inventory verifier additionally rejects broken or escaping link chains. File/directory extended attributes, including the app's quarantine attribute, are copied; this candidate does not claim preservation of symbolic-link extended attributes.

## Transaction and recovery

The helper holds one nonblocking parent installation flock throughout its life, including while copying after its JS caller dies. It creates one private journal/staging directory below that same parent. This is a dedicated package copy with 100,000 entries, depth 64, 2 GiB per regular file and 8 GiB total; project and attachment limits are unchanged.

Persistent phases are copying, verified, publish-intent, published, committed. State uses a digest-bound envelope, regular-file atomic replacement, file fsync plus Darwin F_FULLFSYNC, and directory fsync. Application publication exclusively uses renameatx_np(RENAME_EXCL), never an overwrite rename. An existing target wins any race.

Recovery takes the same native lease. A live prior helper returns SEP_INSTALL_BUSY. A verified staging copy may be published only after exact inventory/signature checks; a target already published must match the recorded staging inode and full receipt. Missing, corrupt or ambiguous state is preserved and blocked. A copying interruption currently returns SEP_INSTALL_RECOVERY_BLOCKED; it neither guesses which partial files are owned nor deletes them. No automatic rollback, target deletion or recursive cleanup is implemented.

Returning pass additionally requires the native coordinator's actual process close. A caller deadline never means native work stopped: unknown cleanup returns SEP_INSTALL_CLEANUP_UNCONFIRMED, and the native lease remains authoritative until the process really exits. The helper never forks or starts other programs. Codesign checks are fixed read-only OS invocations. Same-UID hostile host code can still modify user-owned directories; this is not a general OS sandbox against the account owner.

## Platform and evidence limits

The candidate is limited to macOS 15.7.9 / build 24G830 / Darwin 24.6.0 / ARM64, with APFS source and destination. Native fixtures cover first installation, existing target/data, aliases, source changes, signature and manifest rejection, publication races, two SIGKILL points, lease exclusion and corrupt journal. Full-package installation and first launch, Gatekeeper/App Translocation, Developer ID, notarization, all power-loss windows and finer interruption during copying remain unverified.

Install before first application launch: the controlled application's initial profile binds its final absolute program path. Moving a previously started app is not supported by this first-install core. A published app might be launched independently before the commit record finishes; therefore recovery never assumes no business writes and never rolls it back.
