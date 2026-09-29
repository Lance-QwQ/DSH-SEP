# P1 native-image accounting tests

These Windows artifact tests run the candidate P1 policy and real budget ledger with a synthetic downstream provider. They read Zod from an explicitly supplied rc.2 Beta graph, verify that graph digest and every Zod file, and never read a credential, execute a private task, or send a request. The graph is fixed in the test; changing it requires a reviewed fixture update.

```powershell
$env:SEP_IMAGE_HOST = 'D:\fixtures\pinned-rc2-beta-host'
node --test 'D:\checkout\packages\sep\system-enhancement-package\tests\native-images\native-images.test.mjs'
```

The tests inspect durable reservations and settlement, per-occurrence image accounting, offloaded placeholders, capability/pricing refusals, and the original provider/model/input/output/budget restrictions. Image pixels and attachment identity are outside this unit fixture; the separate Loader/Agent/real-attachment composition verifies that part of the entry path. No native desktop action or online model quality claim follows from these tests.
