# MIT 许可同步与来源材料记录

分发修订 `20260921-mit-alpha`，文档 `20260921-docs-r6`。当前程序图 `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52`。本页描述本次许可与元数据更新，office-r2 原文在[历史副本](../../history/office-r2/licenses/release/LICENSE-SYNCHRONIZATION.md)，保留原字节。

## 已确认原创范围

项目所有者授权 SEP 已确认原创部分使用 MIT，版权声明为 `Copyright (c) 2026 DSH SEP contributors`。随包 LICENSE、相应 package.json 和 LICENSE-SCOPE 按文件权属同步；它们不重新许可 vendor、上游改编代码、独立依赖、运行库、数据或素材。原 MIT 与其他有效许可不撤销。

MIT 允许使用、修改、复制、分发、再许可和销售并保留版权与许可声明；以前的销售限制不作为本版原创部分的额外条件。实际范围以[许可索引](../index.json)、[依赖清单](../../DEPENDENCIES.json)及每包范围声明为准，不能把整个程序图统一标为 MIT。

## 身份与对应源码

本轮只改许可、文档及相关元数据。运行实现基线为 office-r2 图 `a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8`；等同性与重新安装证据：**pass：本轮已核对仅已映射原创许可、包声明与文档/绑定变更，运行实现及第三方文件与 Office-r2 字节相同；沿用其固定 Windows 11 功能证据，未重跑全部功能或付费模型。最终 MIT ZIP 安装、逐文件验证与脱敏结果由包外 DELIVERY-REPORT.json 单独绑定。**。本记录不声称重跑全部功能测试。

源码交付 `DSH-SEP-Source-20260921-MIT.zip`；`SOURCE_FILES.json` 的 SHA-256 为 `ed91e199c25db5a35844111d535a75f66e3c5537bf332f08cb4a09b9ca16053f`，按实际条目对应新图。Office 适配器 JavaScript、PowerShell、C#、测试及所列打包材料纳入清单；源码计数不从历史 744／881 等数量直接复制。

## 第三方材料保持

DSH、Electron、Cordis 及其他上游授权、署名与 NOTICE 保留；已有 vendor 和混合来源文件继续按自身许可处理。saxes 6.0.0 保留 ISC 与依赖条款。Mem0 根 Apache-2.0 与固定 nested package MIT 字段差异继续披露，不擅自解释为双重授权。

office-r2 已用 SEP 自有 `@dsh-sep/office-converter` 及官方 LibreOffice 26.8.0.3 替换旧 Kit。本次沿用实现，不是找到旧 Kit 的 Node API 首选源码。官方 MSI SHA-256 `4aa6c6e1895f4055104effcb556bd3362d20c6ad707c149543304f395ef9db95`，签名者 The Document Foundation；四份匹配源归档共 654,222,716 字节已下载、哈希核验。入口和记录见[Office 转换说明](../../OFFICE_CONVERTER.md)及运行库 SOURCE-ACCESS.md、ENGINE-PROVENANCE.json、source-provenance。

官方运行库由行政提取并做已记录的布局处理：十个原 System64 DLL 按原字节复制到 program；行政 MSI 数据库和测试 bytecode 不进入运行树。原 LICENSE.html、license.txt、NOTICE、CREDITS 和组件声明保留，不受 SEP MIT 覆盖。目录重包装不等于原 MSI 逐字节不变。

sharp/libvips 主 DLL 固定来源链的既有证据保留；完整静态组件源码、第二个 C++ DLL 完整对应与重链接未全面验证。四份 LibreOffice 源码可访问不等于全部可选依赖已下载、全部二进制可重现或完成法律合规认证。

## 历史与 Alpha 发布

历史许可、缺失字段调查、覆盖计数、r1 发布阻断和 office-r2 失败／补跑均保留原身份。旧报告中的“当前”“本轮”只指当时；MIT 同步不会改写旧包或降低验收标准。已知宿主启动异常仍未归因、未证明修复；用户已接受其作为 Windows Alpha 发布的披露事项，并不因此声明稳定版准入。

[当前许可说明](../../LICENSING.md) · [发布说明](../../RELEASE_NOTES.md)
