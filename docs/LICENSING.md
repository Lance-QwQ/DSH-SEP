# SEP 许可说明与决定记录

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-mit-alpha` · 文档 `20260921-docs-r6` · **Windows x64 Alpha 测试发布**。SEP 已确认原创部分采用 MIT，第三方保留原许可。历史启动异常作为已接受的已知问题披露；功能证据与本轮封包验证分别见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。项目入口：[GitHub 仓库](https://github.com/Lance-QwQ/DSH-SEP)。
<!-- SEP_RELEASE_STATUS_END -->

项目所有者于 2026-09-21 明确授权：**本版已确认属于 SEP 原创的部分采用 MIT License**。版权声明为 `Copyright (c) 2026 DSH SEP contributors`。正式条款见 [LICENSE](LICENSE)，逐文件边界见[许可同步记录](licenses/release/LICENSE-SYNCHRONIZATION.md)及对应包的 LICENSE-SCOPE。

## 允许什么

MIT 允许使用、复制、修改、合并、发布、分发、再许可和销售软件副本，包括个人及企业商业使用。分发软件的副本或实质部分时，须保留版权声明和许可声明；软件按原样提供，不附带保证。详见 [MIT 标准文本](https://opensource.org/license/mit)。

MIT 不强制衍生版源码公开，不强制衍生版采用同一许可，也不保留此前的销售限制。衍生作品包含第三方组件时，应分别遵守它们的原有条款。

## 适用范围

- MIT 仅覆盖有权许可且已经确认的 SEP 原创代码和文档；包中 LICENSE-SCOPE、源码清单和文件声明用于划清范围。
- DSH 宿主、Cordis、Electron、lossless-claw、Mem0、PinchBench、DSH-RAG、PDF.js、LibreOffice 和其他依赖，保留各自原许可、版权、NOTICE 及适用的源码义务。
- 混合或改编的上游文件继续保留上游授权。SEP MIT 不撤销已有权利，也不把第三方或整套二进制运行环境统一改为 MIT。
- 新写的 Office CLI 适配器按其确认原创范围采用 MIT；官方 LibreOffice 运行库保留原有许可和对应源码入口。

当前许可索引与依赖映射绑定程序图 `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52`，源码归档为 `DSH-SEP-Source-20260921-MIT.zip`，`SOURCE_FILES.json` 的 SHA-256 为 `ed91e199c25db5a35844111d535a75f66e3c5537bf332f08cb4a09b9ca16053f`。实际条目以随包清单为准，不从历史计数推导当前覆盖。

## 历史与本次变更

office-r2 曾使用的自定义许可及当时解释保留在[历史许可说明](history/office-r2/LICENSING.md)和[历史许可同步页](history/office-r2/licenses/release/LICENSE-SYNCHRONIZATION.md)。历史文档中的商业限制只描述当时许可，不作为本版已按 MIT 授权原创部分的附加限制；历史包与原报告不改字节。

本轮只更新许可、文档和相关元数据；运行实现基线为 `20260921-office-r2`，程序图 `a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8`。代码与二进制等同性、重新安装、ZIP 和脱敏核验结果：**pass：本轮已核对仅已映射原创许可、包声明与文档/绑定变更，运行实现及第三方文件与 Office-r2 字节相同；沿用其固定 Windows 11 功能证据，未重跑全部功能或付费模型。最终 MIT ZIP 安装、逐文件验证与脱敏结果由包外 DELIVERY-REPORT.json 单独绑定。**。功能证据沿用该固定基线，不宣称本轮重跑了完整功能矩阵、真实模型、长时间运行或全部环境测试。

## 第三方来源与审阅边界

旧 LibreOffice Kit 由 office-r2 的 SEP 自有适配器和官方 LibreOffice 26.8.0.3 替换；本次继续沿用这一实现，不是取得了旧 Kit 缺失的 Node API 源码。四个匹配的官方源码归档已有下载与哈希核验记录，入口见[Office 转换说明](OFFICE_CONVERTER.md)。

sharp/libvips 主 DLL 固定来源对应关系的既有证据保留；全部静态组件源码交付、第二个 C++ DLL 完整对应及重链接尚未全面验证。官方 LibreOffice 四份源码可访问也不证明全部可选外部依赖已下载或二进制已本地重建。MIT 许可变更不抹去这些第三方审阅边界，不等于整个依赖闭包获得了统一合规认证。

[第三方声明](THIRD_PARTY_NOTICES.md) · [发布说明](RELEASE_NOTES.md) · [返回导航](DOCS_INDEX.md)
