# 发布说明

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-mit-alpha` · 文档 `20260921-docs-r6` · **Windows x64 Alpha 测试发布**。SEP 已确认原创部分采用 MIT，第三方保留原许可。历史启动异常作为已接受的已知问题披露；功能证据与本轮封包验证分别见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。项目入口：[GitHub 仓库](https://github.com/Lance-QwQ/DSH-SEP)。
<!-- SEP_RELEASE_STATUS_END -->

本版将已确认 SEP 原创部分改为 MIT，并按 **Windows x64 Alpha 测试版** 发布。DSH 仍为 `0.1.6-alpha.2`，SEP 包版本仍为 `0.1.0-alpha.15.dsh-alpha2.1`；软件包版本号相同不表示分发字节相同，应同时核对分发修订和程序图。

## 本次身份与变化

| 对象 | 身份与用途 |
|---|---|
| 当前 Only／Full | `20260921-mit-alpha`，程序图 `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52` |
| 当前文档 | `20260921-docs-r6`，文档归档 `DSH-SEP-Release-Docs-20260921-MIT.zip` |
| 当前可审阅源码 | `DSH-SEP-Source-20260921-MIT.zip`；清单 SHA-256 `ed91e199c25db5a35844111d535a75f66e3c5537bf332f08cb4a09b9ca16053f` |
| 运行实现与 Office 功能证据基线 | `20260921-office-r2`，图 `a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8` |
| 更早核心能力来源 | `sep-alpha2-stability-20260921`，图 `ffb961…`；其回归是继承证据 |

本轮只更新许可、文档和相关元数据；运行实现基线为 `20260921-office-r2`，程序图 `a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8`。代码与二进制等同性、重新安装、ZIP 和脱敏核验结果：**pass：本轮已核对仅已映射原创许可、包声明与文档/绑定变更，运行实现及第三方文件与 Office-r2 字节相同；沿用其固定 Windows 11 功能证据，未重跑全部功能或付费模型。最终 MIT ZIP 安装、逐文件验证与脱敏结果由包外 DELIVERY-REPORT.json 单独绑定。**。功能证据沿用该固定基线，不宣称本轮重跑了完整功能矩阵、真实模型、长时间运行或全部环境测试。

程序图会因许可文件和包元数据变化而变化，不能把旧图哈希写成新图。最终归档哈希见包外 `SHA256SUMS.txt`；[RELEASE_MANIFEST.json](RELEASE_MANIFEST.json) 与包根 `RELEASE-STATUS.json` 记录身份和状态。哈希校验不等于发布者数字签名。

## 许可

SEP 已确认原创部分采用 MIT，版权声明为 `Copyright (c) 2026 DSH SEP contributors`。允许使用、修改、复制、分发、再许可及销售，须保留版权和许可声明；MIT 不要求衍生版沿用原来的商业限制。第三方代码、素材及运行库继续适用各自许可，不能将整包重新许可为 MIT。详见 [许可说明](LICENSING.md)。

原有 MIT 与其他第三方权利保留。源码归档包含实际交付的 SEP 和宿主适配文件、Office 适配器及测试源码，准确范围按 `SOURCE_FILES.json`。旧 Office 构建生成器以历史文本（`.py.txt`）归档，不能直接当作本轮生成脚本运行；本次附相应 MIT 发布流水线。源码归档不是所有传递原生依赖源码的完整镜像，也不宣称一个 Git 提交能逐字节重建全部上游二进制。

## 继承的功能

保留四层记忆与本地 RAG、同项目候选记忆、上下文原文展开、经 `suite_delegate` 创建的受管子任务、标准文件入口保护、安全变更辅助、Worker、检查点、受控更新、守护恢复、记忆设置页、关窗留后台和 HARNESS／SEP 一体式桌面。

更新中心、长路径纳管、桌面断线重连及旧锁名备份排除沿用既有修复。Office 转换沿用 SEP 自有 CLI 适配器及官方 LibreOffice 26.8.0.3，不再运行旧 Kit；原 404 记录不改写成已找到旧源码。功能和限制见[使用手册](USER_GUIDE.md)、[Office 转换](OFFICE_CONVERTER.md)与[兼容性](COMPATIBILITY_KNOWN_ISSUES.md)。

Only 从受支持的 DSH 来源只读校验和复制所需本体文件；Full 自带本体。两者在新目录创建空白实例，不自动迁入原数据和自装插件，不能作为任意版本原地覆盖升级器。

## Alpha 已知问题与未覆盖范围

历史 `GUARDIAN_NOT_READY`／`HOST_STARTUP_UNATTRIBUTED` 宿主启动异常仍未归因、未证明修复；原 Only 合成安装追加的 10 次启动、记忆只读检查和正常退出均未复现。项目所有者已允许带此已知问题进行 Windows Alpha 测试发布。这项决定不把历史 fail 改为 pass，不降低原验收标准，也不表示通过稳定版准入。

历史工作前评测异常同样未获唯一归因。供应商 HTTP 503 等外部失败仍可能发生；未知结果的有副作用操作不能盲目重放。Windows 10 干净环境、官方签名安装器完整共存、任意模型／插件组合和长时运行未因本次许可封包获得新增功能覆盖。

项目所有者的 Alpha 发布决定只接受明确披露的产品已知问题，不免除第三方许可义务，也不把未执行的验证改为通过。文档与本地包完成不等于 GitHub 上传和下载回验已完成；实际上传状态按发布记录。

## 历史记录

[office-r2 原文](history/office-r2/README.md)、[旧测试摘要](history/office-r2/TEST_ACCEPTANCE.md)及[旧许可说明](history/office-r2/LICENSING.md)均按原字节归档。旧 Office v1 18/18 失败、r1 首试和补跑、全部固定验收标准保留。历史文档中的“本轮／当前”指当时版本，旧限制许可不约束本版已明确 MIT 授权的原创部分。

[测试与验收](TEST_ACCEPTANCE.md) · [发布检查表](PUBLICATION_CHECKLIST.md) · [文档导航](DOCS_INDEX.md)
