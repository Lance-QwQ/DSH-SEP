# SEP update protocol

SEP and DSH discovery use separate release metadata. The SEP entry queues a download and prepares a local candidate after normal application exit. Closing the window only hides it. Waiting for exit expires after three hours. Preparation permission does not authorize publication.

The worker streams the same-release ZIP, verifies SHA-256, accepts only delta-protocol entries, clones the program and preserves the local Profile. It checks Host, recovery and storage with a fixed empty Profile. This is directory and instance isolation, not an operating-system security sandbox. User plugins are inventoried without executing them as probes; unknown compatibility remains visible in the full report.

Peer absence is recorded only after checking the ancestor package search directories. A confirmed absent optional peer does not imply a broken plugin; a missing required peer is incompatible. Existing untracked dependencies remain unverified. File-URL entries inherit dependency metadata only when the entry and owning manifest match the installed graph. External files do not acquire another package's identity.

Controlled offline preparation accepts an optional `compatibilityEvidence` input with `compatibilityEvidencePath` and exact file `bindings`. It uses the same per-plugin evidence reader as the updater, binds the evidence files into the P2 plan and reads them again during publication checks. Evidence is scoped to the tested graph, configuration, activation and environment; a healthy Host alone never certifies all plugin instances. A supplemental report does not replace an already sealed report or its consent.

A separate window displays that report and the exact plan. Acceptance binds consent to plan, report and graph hashes. Cancellation, changed inputs, unresolved earlier transactions and hard blocks prevent publication. P2 rechecks under locks, preserves the three data domains, records the sole durable commit decision, then opens writes. A subsequent desktop/Host check must pass before the update is reported as verified. Recovery accepts only the exact new launcher bound to an attempted transaction.

Download limit: 512 MiB and five minutes. ZIP limit: 20,000 entries and 2 GiB expanded. Preparation review expires after 30 minutes; a failure notice exits within 60 seconds. The full-graph publisher wait is bounded to ten minutes. Timeout means an unknown outcome: the process is not killed or blindly retried. P2 recovery is bounded to two attempts and retains unresolved records.

## Release-check information

Discovery reports how many manifests it verified, how many match this platform, how many inspected releases lack a manifest, and whether the five-manifest download bound prevented further verification. With matching verified manifests and missing history, metadata-partial reports the comparison within verified manifests and the missing information separately. No newer eligible version in those manifests does not certify every public release or declare the installation latest. Missing manifests, exhausted metadata downloads and an empty non-draft release list are informational results; the desktop clears stale availability without displaying a check-failure badge. Network, origin, digest, JSON-validation and host-adaptation failures still produce errors. Metadata never authorizes package execution.

Run focused discovery regressions with node --test apps/desktop/tests/sep-release-discovery.test.mjs. Desktop state and the keyless partial-metadata dialog snapshot are exercised by node node_modules/vitest/vitest.mjs run --project thread-safe apps/desktop/tests/sep-sidebar-state.spec.ts.

## Supported package and installation scope

Publish dsh-sep-update.json alongside a Windows SEP-only ZIP in a DSH-SEP GitHub release. Schema 1 contains product dsh-sep, platform win32-x64, independent semantic sepVersion, exact hostVersion, and bundle (name, sha256, canonical same-release url). The manifest bytes must match GitHub's asset digest; downloaded ZIP bytes must match the manifest's bundle hash. Metadata is not install authority.

ZIP entries are sep-package.json, base-graph.json, target-graph.json and payload/SHA256. The delta requires the exact installed base graph, unchanged DSH version and unchanged dependency topology. Only owned SEP packages and the desktop integration seam may change. Unknown baselines, higher DSH versions and changed topology need separate adaptation. Plain JSON/YAML profiles are supported. Executable YAML tags, unresolved sources and unsupported profile aliases stop preparation. External plugin paths remain external; this is not a backup of those plugins.

Schema-2 local admission binds archive, preservation policy, publisher, health records and plan. Existing schema-1 replacement policies remain supported. Generated schema-2 sep-program-delta-policy is independently checked against actual composed profiles and inventories. Accepting unknown compatibility does not waive byte preservation, activation, configuration or DSH version checks.

## Local files and delivery

Review records live under this installation's Electron user data in sep-updates/preparations/ID. The independent program and its copied Profile live under the installation's releases/sep-ID directory. Before downloading, the worker rejects a resulting native icon path of 260 or more UTF-16 code units; extended paths are supported for archive extraction and recovery leases. Configuration copies, reports, checkpoints and failure evidence can contain private paths or inline settings. They are private local update material, never public release assets. The preparer does not traverse .env files, configured memory-store directories or Git directories. Copied root JSON/YAML can contain inline private data; business stores remain governed in place. Unresolved transaction records must be retained. This revision also retains completed/cancelled preparation files and does not claim TTL cleanup. Remove them only through reviewed maintenance after confirming they are not the active program or required recovery evidence.

The updater's first installation uses the existing controlled local deployment path. Later compatible deltas use the new entry. A locally generated manifest with a prospective GitHub URL is not an online release until its assets are published.

## Optional assessment callback

Official DSH discovery can forward a bounded static report to the Host assessment service. Its independent setting defaults to off. Assessment does not alter discovery timing or installer admission. See the [assessment reference](../../../../packages/sep/system-enhancement-package/docs/update-assessment.md).
