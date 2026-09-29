# Native image / P1 artifact regression

This suite loads an explicit rc.2 installed Host graph through the real Cordis Loader, then runs the production Agent, `read_image`, local filesystem, attachment store, SEP plugin, budget ledger, and JSONL session backend. The shipped DeepSeek Messages adapter uses a loopback-only HTTP recorder. No real credential is resolved, no paid model is called, and the supplied installation is read-only.

## Run

Provide Node 24 and these explicit paths; no private daily path is inferred:

```powershell
$env:SEP_IMAGE_HOST = 'D:\fixtures\rc2-beta1'
$env:SEP_IMAGE_EVIDENCE_ROOT = 'D:\results\native-image-green'
# Optional: defaults to this checkout's ../../src.
$env:SEP_IMAGE_SOURCE = 'D:\candidate\src'
node --test --test-isolation=none 'D:\checkout\packages\sep\system-enhancement-package\tests\native-image-composition\composition.test.mjs'
```

`host-lock.json` binds the complete graph digest. Before imports, the runner validates the selected dependency closure's file hashes and links. For a new packaged candidate, copy these tests to its isolated validation directory and explicitly bind a new lock to its verified graph; retain the original lock and red/green evidence. The evidence directory must be writable. Each run creates a distinct synthetic tree and leaves its source snapshot, exact Loader configuration, budget ledger, stored image, compressed Session log, fresh JSONL-reader output, HTTP messages, and source hashes for review. The staged dependency junction is only a read reference to the supplied installation; never archive or recursively delete through that junction.

## Fixed expectations

Three rounds run the same sequence: the recorded model requests native `read_image`; the real tool persists and returns a content-addressed 1×1 PNG; the next Messages request includes the managed image; a new text-only user turn still includes the existing image and completes. All three calls have settled ledger entries. The HTTP fixture independently checks that a budget reservation already exists before every Messages or Files request. The adapter attempts its native Files route; the fixture explicitly refuses it with 404, so the real inline fallback transmits the image. Native file-upload success/reuse is not tested here.

A separate negative case selects a catalogued text-only route and checks the native tool's explicit refusal, with no image content transmitted. It does not remove P1's model allowlist, impose a new daily stop-on-error policy, or claim semantic image understanding by a live model. After disposing each Loader context, a new real JSONL provider reads the durable session and compares it with the emitted events. This is owner-local recorded evidence, not the repository-wide snapshot lane.

The regression catches the old unconditional `P1_IMAGE_NOT_ALLOWED` branch both immediately after the tool result and on the later text-only followup. To reproduce red, set `SEP_IMAGE_SOURCE` to the old installed SEP `src` while keeping all other inputs unchanged. Both turn outcomes are saved even if the first expected-completion assertion fails. Unit tests under `../native-images` own explicit policy rejection, image/offload accounting, cancellation, and exact budget boundaries; this suite owns the actual Loader/Agent/adapter composition.
