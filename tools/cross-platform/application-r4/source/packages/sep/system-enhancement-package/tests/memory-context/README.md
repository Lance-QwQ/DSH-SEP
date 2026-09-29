# Memory context compatibility

Set SEP_MEMORY_HOST to the exact local.7 Host graph pinned in host-lock.json and run Node 24 --test context.test.mjs. The harness verifies the loaded dependency closure, uses the real Loader and record-only model, and creates only synthetic projects. Tests default to the persisted pre-rename producer name; SEP_MEMORY_TEST_PRODUCER=dsh-system-enhancement-package/memory exercises the current name. SEP_MEMORY_CONTEXT_MODULE can select the installed baseline explicitly for a negative control; omitted uses checkout source.

The tests cover retirement before the next request, archive limits, JSONL materialization and resume, cancellation and project authorization. The compatibility alias only identifies old suite-owned snapshot/notice messages; it does not rewrite audit history or treat arbitrary plugins as suite memory.
