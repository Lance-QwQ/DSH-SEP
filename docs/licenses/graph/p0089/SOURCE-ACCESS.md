# sharp Windows 原生依赖的许可与源码入口

对象：@img/sharp-win32-x64 0.35.4。原 LICENSE 是 Apache-2.0；README 的原生库表另外列出 LGPLv3、MPL-2.0 等许可，不能仅用顶层 Apache 标签覆盖所有 DLL。原 LICENSE、README.md、versions.json 与实现字节保持不变。

## 已确认的固定来源链

1. [sharp v0.35.4 源码](https://github.com/lovell/sharp/tree/7f1a0a22cc285fe180766f4935d50b55af6e8432)的 package.json 指定 @img/sharp-libvips-win32-x64@1.3.3；npm/from-local-build.js 说明 Windows DLL、版本信息和第三方声明的复制流程。
2. 该 1.3.3 npm 包的 SHA-512 与 registry dist.integrity 一致。其 lib/libvips-42.dll 与本包同名 DLL 逐字节一致，SHA-256 为 e6cc51bbc763e7deda536c6f56ce96b4c51ea769690ce4f4ed07607527b81dae；versions.json 也逐字节一致。
3. 固定 npm 元数据 gitHead 指向可公开取得的 [sharp-libvips 6e5971d333377743163edc3ad9e5d0b897abcbc9](https://github.com/lovell/sharp-libvips/tree/6e5971d333377743163edc3ad9e5d0b897abcbc9)。其中 build/win.sh 指向 libvips/build-win64-mxe 的 v8.18.6 Windows web-static 发布。
4. 该发布配方的固定提交是 [09cfccf20b91b441fbe97fa7a7ed8a597e55e830](https://github.com/libvips/build-win64-mxe/tree/09cfccf20b91b441fbe97fa7a7ed8a597e55e830)，包含构建入口及依赖源获取、补丁说明。此处 libvips-web 依赖版本与随包清单相符；不要把该仓库另列的 all 版本、可选 HEVC 组件一并当成本包已包含依赖。
5. libvips 8.18.6 本体源码：[426af3f44246fce9cfa8dd51a353aa4dfd48c553](https://github.com/libvips/libvips/tree/426af3f44246fce9cfa8dd51a353aa4dfd48c553)。

以上公开入口于 2026-09-21 查询成功。原生库精确版本以本包 versions.json 为准，许可分类见原 README.md。来源身份、URL、下载包完整性与 DLL 对照摘要见 SOURCE-PROVENANCE.json。此前未找到 sharp-libvips 的 v8.18.6 tag 不能据此判断没有来源：其 npm 版本是 1.3.3。

新增 licenses/ 下的 LGPL、GPL、MPL 是标准条款全文副本，不是新授权，也不是某个上游仓库原始声明。保留所有已有版权、构建信息和替换独立 DLL 的能力；SEP 自定义许可不限制接收者按相关第三方许可取得的权利。

## 验证边界

已建立 libvips-42.dll → 同字节固定 npm 包 → 公开固定打包配方 → 固定 Windows 构建版本的来源链。未重新编译 DLL，未对每个静态内嵌组件单独下载完整源归档、重建及验证重新链接，也未对另一个 libvips-cpp-8.18.6.dll 单独完成同样字节来源对照。故不能声称完成所有二进制可重现或全部 copyleft 对应源码交付的认证。公开分发前还应确认接收者可按各适用许可取得确切对应源码与修改/重新链接所需材料；已解决固定来源入口问题，不代表这项最终分发核验可以省略。
