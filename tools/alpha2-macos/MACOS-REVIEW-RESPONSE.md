# macOS Alpha.2 review response: evidence closure

Current follow-up: [low-priority review repairs](MACOS-LOW-REVIEW-RESPONSE.md). The remainder of this document describes the earlier R22/R23 evidence-only repair; its remaining-observation list is historical, not the current repair status.

Review target: `fab50b9280a2f083ad478050d325a671918084ca`. This documentation/evidence repair is based on `f0a5f393648b1526f05abe78cfe02349bfbb3631`, which also contains the separately accepted Windows packaging work. It changes no product runtime, installer byte, signing state, deployment or remote branch.

## Confirmed medium findings

1. **R22 was untracked: confirmed and repaired.** The existing file exactly matches the sealed 6,084-byte original, SHA-256 `51f1a3d7e10fce5280ee7bafd4b9c976ce7420931c8aa2b0523b8079571d1f13`. It is now included in the local source commit with its original failed-round and test-cleanup limitations.
2. **R23 was absent from Git: confirmed and repaired.** The original 4,427-byte document and native receipts already existed outside the repository. They are now included without rewriting their bytes, along with the original seal and later post-smoke addendum. R23 narrative SHA-256 is `884a7fb1caa92d41f64eb560ae5a2f32755211208eac74e5ac2b971b5cf4e1b9`.

The [repository evidence index](desktop/evidence/README.md) separates r22 failure, r23 core-desktop success and current installer scope. The overlay README now marks its older pending paragraphs as historical and links both historical and current evidence.

The earlier user-facing working-tree summary omitted R22 and was incomplete. The original `local-closeout-r80/FINAL-AUDIT.json` actually retained R22 in `remainingGitStatus`; it is not rewritten. Current unrelated BUNDLE15 documentation, `.serena/` and `package/__pycache__/` remain untouched. No blanket claim of a previously clean worktree is made.

## Remaining review observations at the evidence-only checkpoint

This repair does not claim to have validated or fixed the low-priority runtime observations: raw filesystem error redaction, project-tree close/next behavior, cwd hook scope comparisons, parser-worker states or optional expectedPlanHash. These need targeted source-level scenarios before any behavioral change. Finalizer cross-binding, distribution test environment documentation, old installer wording, duplicate origin descriptions and dead branches remain separate follow-up observations, not silently marked pass. The untracked Python cache was not deleted.

## Validation and unchanged boundaries

Local checks verify original seal members, the three actual stored cycle receipts, post-smoke digest binding, live documentation links, Git inclusion and unchanged installer/delivery bytes. This is a Windows readback of existing Mac evidence, not a fresh macOS execution. No paid test, public upload or daily switch is performed. Existing source checkpoints remain unchanged and refer to their own earlier commits; this repair has its own later local commit. Full certification remains `blocked`, with physical input, other macOS/Intel, paid providers, private adoption, notarization and automatic-update installation outside the accepted scope.
