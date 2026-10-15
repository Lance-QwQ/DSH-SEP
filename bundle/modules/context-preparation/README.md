# DSH SEP context preparation — isolated candidate

Native plugin `dsh-sep-context-preparation`, tool `suite_context_prepare`. Disabled unless explicitly configured. No daily installation is performed by this package.

Trusted host configuration:

```json
{
  "enabled": true,
  "python": "C:/absolute/path/python.exe",
  "snapshots": [{
    "id": "public-example",
    "projectId": "example",
    "root": "C:/absolute/authorized/project",
    "path": "C:/absolute/public-snapshot.json",
    "sha256": "<exact SHA-256 of snapshot file>"
  }]
}
```

Snapshot format: `{ "visibility": "public", "task": { "instance_id": "...", "repo": "...", "base_commit": "<40 lowercase hex>", "problem_statement": "..." }, "files": { "pkg/leaf.py": "...", "pkg/base.py": "..." } }`. Only these fields are accepted; no oracle patch or scoring fields. `public` is an operator assertion, not an automatic privacy classifier. Only register reviewed public source; private catalogs are not supported in this release. Snapshot loading verifies regular single-link file, bounded size and hash, then keeps the bound content in memory. Changes on disk require reconfiguration with a new hash; in-flight requests retain the original binding. The hash proves byte identity, not provenance from Git; source acquisition must separately verify the baseline commit.

Tool arguments:

```json
{"snapshotId":"public-example","seeds":["pkg/leaf.py"],"roots":[{"path":"pkg/leaf.py","symbol":"Leaf"}]}
```

The caller must be a registered top-level Agent inside the configured project. Paths in arguments select only entries in the configured snapshot, never host filesystem paths. Sources remain untrusted data. The tool does not execute supplied code, call a model, grade a patch, access a network, or change project files. Model-selected roots are not guaranteed to be the right roots for a task.

Python AST follows static named base classes, absolute/relative imports, module aliases and reexports inside the authorized catalog. Missing/external/conditional/dynamic/ambiguous bindings, wildcard imports, cycles and depth limits yield `blocked`; byte/file limits reject the request without claiming completion. `pass` means only the requested static named inheritance edges were found. Metaclasses, decorators and runtime dependencies are outside scope and explicitly noted. Other languages and automatic repository acquisition are not supported.

Bounds: catalog at most 4096 Python paths / 8 MiB source, encoded input 10 MiB; selected context at most 128 files / 2 MiB UTF-8, 32 roots, resolver depth 64. The native tool admits one active preparation per plugin instance, rejects siblings without queueing, and forwards cancellation. A dedicated Python process has a 10-second deadline, bounded stdout/stderr and exact-process termination; the promise settles after process close. This is not an OS memory sandbox. The configured interpreter and plugin installation are trusted.

The host receives full selected source in its normal tool result and may retain it in session history. That is why this candidate supports reviewed public snapshots only. It introduces no private-data retention policy and must not be represented as a complete SWE-ReX/SWE-bench execution interface.
