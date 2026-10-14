# Mac sidebar identity candidate

This is an independent successor candidate. It does not alter the frozen r41 application, the desktop readiness adapters, signing, lifecycle, update policy, or existing installations.

`deriveBrandIdentity({ client, manifest })` accepts two Buffers from the **actual native Alpha.2 Mac package** and returns `{ client, origin }`. Both original SHA-256 values are fixed in `derive.mjs`; any changed or already-derived input is rejected. The manifest is only verified, never rewritten.

The sole behavioral change is the sidebar brand name component:

- Keep the official `BrandWordmark({ includeMark: false })` call, including its original HARNESS artwork.
- Append a separate SVG badge containing SEP, with width 32 and height 14 **CSS pixels**, radius 2, matching theme foreground/inverted-label colors, and a 6-pixel gap. Flex shrinking is disabled.
- Keep the official mark, loader identity, dependencies, slot registration, and package peer declarations.
- Explicitly remove the obsolete source-map reference as the second recorded transformation. The origin lists both exact replacements and the before/after hashes.

The original HARNESS rectangle is 52×14 within the official artwork. This change deliberately implements the user's requested **SEP 32×14**, preserving the official HARNESS geometry. A Retina display can render those CSS pixels as twice as many device pixels.

## Source

The source was extracted from native CI artifact `11886202375`, commit `baf409a2e902015c6d2414605d92328daaf5f379`, after verifying the inner ZIP SHA-256 `c56dd417cb40c3c42a855dffe83cfab5353eab2d5dbe858f0f7001232cbe6270`.

Package: `@deepseek-ai/dsh-client-ui-brand-official` version `0.2.1-alpha.2`.

| File | SHA-256 |
| --- | --- |
| `lib/client.js` | `22bb7e181a8d93372e1d14927b201612b09a02c84ea3d0f36933cfff1de47d71` |
| `package.json` | `a20f688b99c4bafb40b9b98690630da4664aa75e6549053ce4350c5765251c40` |

## Verification and successor integration

Set `SEP_MAC_BRAND_INPUTS` to a directory containing the two fixed files as `client.js` and `package.json`, then run `node --test derive.test.mjs`. The six tests evaluate the actual compiled module in a VM and inspect its JSX output and slot registrations. They verify transformation and component contracts, **not browser layout or native visual rendering**. The initial identity scaffold produced 1 pass / 5 failures; the implementation produced 6 passes / 0 failures.

After the r41 base is accepted, the assembly owner can call the pure API and replace **only** `Contents/Resources/product/payload/host/node_modules/@deepseek-ai/dsh-client-ui-brand-official/lib/client.js` in a fresh candidate. Keep the manifest untouched, archive `origin`, and include that file in the declared modification list and final package inventory. Produce/sign/hash the completed candidate in the established order. No ASAR/main/preload or broker changes are needed for this badge.

The next UI check must reach an actual workspace and measure the separate badge with `getBoundingClientRect()` (32×14 CSS px) while checking that the official HARNESS remains present and separated. A read-only Inspector check would be a diagnostic UI test, not a physical mouse/AX or Finder end-to-end certification. Native TCC/AX actions and full-application visual acceptance remain **not_run** for this standalone candidate.
