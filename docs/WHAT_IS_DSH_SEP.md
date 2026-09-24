本轮启动修订 `windows-alpha-20260924-startup-r2`，程序图 `0b54ac82524c0a42db44d5b8a6ebbbca1773a28c8c361839d47f9c12760f35a3`。此页原有 2026-09-21 版本号、验收数量与发布状态保留为历史；本轮结果请读 [启动修订](STARTUP_FIX.md)。更新状态没有降低固定验收标准。

# DSH SEP 的极简定义

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-mit-alpha` · 文档 `20260921-docs-r6` · **Windows x64 Alpha 测试发布**。SEP 已确认原创部分采用 MIT，第三方保留原许可。历史启动异常作为已接受的已知问题披露；功能证据与本轮封包验证分别见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。项目入口：[GitHub 仓库](https://github.com/Lance-QwQ/DSH-SEP)。
<!-- SEP_RELEASE_STATUS_END -->

## 本修订补充

`20260921-mit-alpha` 仅更新原创许可与发布元数据，沿用 office-r2 的 Office 预览实现：自有适配器配合独立的官方 LibreOffice，不再依赖此前源码入口不可访问的 Node Kit。范围与限制见 [Office 转换说明](OFFICE_CONVERTER.md)。


**DSH SEP（DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE，DSH系统增强套件）是基于 DeepSeek Harness 的模块化增强套件。它通过插件组合与必要的宿主适配，提供分层记忆与 RAG、任务执行辅助、受控更新和故障恢复能力，当前面向 Windows x64。**

SEP 依托 DSH 运行。部分能力需要配套宿主接口，因此完整安装涉及插件和宿主适配文件，不能理解为任意 DSH 版本上都能热插拔的单一插件。

- **Only**：提供增强组件、必要适配和运行依赖，安装时从受支持的 DSH 程序目录校验并复制所需本体文件，在新目录生成实例。
- **Full**：提供 DSH、SEP 和配套运行环境，在新目录生成独立实例。

“独立实例”指程序目录、配置、数据和进程归属分离，不是虚拟机。主动让两个实例编辑同一文件时，它们仍会影响同一份文件。

SEP 已确认原创部分采用 MIT，版权声明为 `Copyright (c) 2026 DSH SEP contributors`。允许使用、修改、复制、分发、再许可及销售，须保留版权和许可声明；MIT 不要求衍生版沿用原来的商业限制。第三方代码、素材及运行库继续适用各自许可，不能将整包重新许可为 MIT。详见 [许可说明](LICENSING.md)。

[文档导航](DOCS_INDEX.md) · [快速入口](README.md)
