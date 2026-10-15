# Beta.3 第三方许可与源码

自有 SEP 代码采用 MIT；DSH、Electron、Node、Python、LibreOffice、字体、npm 依赖和其他组件保留各自许可。安装包不能统称为全部 MIT。

随本次 Release 一同提供 [THIRD-PARTY-SOURCES.zip](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/THIRD-PARTY-SOURCES.zip)，补充实际 sharp/libvips 版本的源码、构建配方与补丁、相关 Rust 源码以及原许可文本。请一并保存并遵守对应许可；源码附件本身也保留其上游许可。

附件 SHA-256：`237d0644ab6280a6771dc79addd579a95050cb74321c7e5021829069c5cc896b`，字节数：251343178.

以下为附件说明原文。其 Windows 版本证据直接核对 Full 包，Only 沿用同一运行支持；附件不声称覆盖整个产品所有第三方源码，更不声称第三方二进制已重建。

---

# DSH SEP third-party sources and licenses

This companion archive preserves upstream source, notices, and license text for the
sharp/libvips libraries bundled in the three identified DSH SEP release assets.
It does not change, re-sign, or rebuild any application or installer.
DSH SEP's own MIT license does not replace the licenses of bundled dependencies.

## What is included

* All 28 dependency versions listed in the installed `versions.json`, as source
  archives (libnsgif's source and notice are inside libvips itself).
* sharp 0.35.5 source; sharp-libvips 1.3.4 build recipes at
  `ebb95f8add54eee8bed840e3fb587e4cbec857d7`; Windows build-win64-mxe 8.18.7
  recipes/patches and the MXE branch snapshot referenced by those recipes.
* The five external patches referenced by the POSIX recipe, preserved as fetched
  bytes. One upstream patch URL is a pull-request URL; its acquired bytes are
  fixed by SHA-256 here, rather than claiming the URL itself is immutable.
* All 357 crates.io archives from librsvg 2.63.2's Cargo.lock, with each archive
  SHA-256 checked against that lock. Nine workspace packages are already inside
  the librsvg archive. This is an intentionally broad source superset, including
  test/build-only crates; it is not a claim that all those crates are in a binary.
* Full GPL-3.0 and LGPL-3.0 text obtained from gnu.org; original component license
  files copied from source archives for convenience. Source archives retain
  all original files and attribution. The upstream third-party notice table
  includes LGPL, MPL, BSD, MIT, Apache, zlib and other licenses.

The Windows package is `@img/sharp-win32-x64` 0.35.5 under
`Apache-2.0 AND LGPL-3.0-or-later`; Linux and macOS use
`@img/sharp-libvips-linux-x64` / `@img/sharp-libvips-darwin-arm64` 1.3.4 under
`LGPL-3.0-or-later`. All three installed version tables agree on libvips 8.18.7
and the 27 other dependency versions. Their binary files are platform-specific.

## Use and scope

Read `SOURCE-MANIFEST.json` for asset hashes, original HTTPS URLs, captured
source revisions, component metadata and the exact source/license inventory.
Build instructions and platform flags remain in the upstream recipe archives:
`sharp-libvips/build/posix.sh`, `sharp-libvips/build/win.sh`, and
`build-win64-mxe/build.sh`. Rust `.crate` files are the original compressed
source packages; Cargo.lock is in the librsvg source archive. Rebuilding uses
the upstream toolchain instructions. We have not executed these downloads,
rebuilt these third-party libraries, or demonstrated bit-identical binaries.
MXE's upstream recipe references a branch; this archive records the exact
captured revision, not an independently proven original binary build revision.

This attachment addresses source/notice availability for sharp/libvips; it is
not an exhaustive source archive for Electron, LibreOffice, Node, every Python
package, every npm package or every system library. Their existing licenses
and third-party notices remain in the application packages. In particular,
LibreOfficeKit includes its own MPL text, third-party notices and sources.

No additional restriction on modification or reverse engineering for debugging
modified LGPL components is imposed by this release's own MIT terms. Preserve
the component licenses and notices when redistributing modified versions.

`DOWNLOADS-r1.json` and `DOWNLOADS-r2.json` preserve two historical transport
failures. The sharp tag download was replaced by the same tag's resolved commit
archive; the one failed crate was subsequently fetched and checked in r3.
The current SOURCE-MANIFEST verifies all listed bytes as present. Do not read
the historical attempt status as the final attachment status.
