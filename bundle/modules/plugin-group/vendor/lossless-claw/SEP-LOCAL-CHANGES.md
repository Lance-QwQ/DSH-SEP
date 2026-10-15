# SEP-local lossless-claw changes

Upstream source identity and MIT attribution remain in the package third-party notices; these are local changes, not a claim about upstream releases.

- `retrieval.js`: require explicit positive conversation scope and compare actual stored root, descendant and message ownership before returning their content. Refusal code: `LCM_EXPANSION_SCOPE`.
- `expansion.js`: forward the caller's conversation scope to retrieval. Conversation-wide query expansion without an explicit conversation is no longer accepted by the retrieval primitive.
- `expansion-auth.js`: unchanged. Empty `allowedSummaryIds` retains the conversation-wide meaning used by delegated query grants; nonempty lists still restrict requested summary IDs.

`tests/vendor-expansion-scope.test.mjs` exercises real in-memory SQLite stores and the auth manager. Full orchestrator loading is not validated because `@sinclair/typebox` is not an installed dependency of this package. No fake TypeBox implementation is used. These modules are not mounted by the SEP current-session history expansion path.
