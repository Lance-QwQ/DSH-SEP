# DSH SEP 的极简定义

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-office-r2` · 文档 `20260921-docs-r5` · **Office 转换器替换候选**。当前包使用自有适配器和官方 LibreOffice；验证与发布状态见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。GitHub 仓库尚未创建，未执行上传。
<!-- SEP_RELEASE_STATUS_END -->

## 本修订补充

`20260921-office-r2` 在原增强能力上替换 Office 预览转换实现：自有适配器配合独立的官方 LibreOffice，不再依赖此前源码入口不可访问的 Node Kit。范围与限制见 [Office 转换说明](OFFICE_CONVERTER.md)。


**DSH SEP（DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE，DSH系统增强套件）是基于 DeepSeek Harness 的模块化增强套件。它通过插件组合与必要的宿主适配，提供分层记忆与 RAG、任务执行辅助、受控更新和故障恢复能力，当前面向 Windows x64。**

SEP 依托 DSH 运行。部分能力需要配套宿主接口，因此完整安装涉及插件和宿主适配文件，不能理解为任意 DSH 版本上都能热插拔的单一插件。

- **Only**：提供增强组件、必要适配和运行依赖，安装时从受支持的 DSH 程序目录校验并复制所需本体文件，在新目录生成实例。
- **Full**：提供 DSH、SEP 和配套运行环境，在新目录生成独立实例。

“独立实例”指程序目录、配置、数据和进程归属分离，不是虚拟机。主动让两个实例编辑同一文件时，它们仍会影响同一份文件。

允许个人及企业内部使用、修改、免费转发和制作衍生版；出售或商业分发须另行授权，衍生版沿用相同商业限制。具体条件见 [许可说明](LICENSING.md)，不能由此将整个套件称为OSI认可的开源软件。实际安装包状态见 [发布说明](RELEASE_NOTES.md)。

[文档导航](DOCS_INDEX.md) · [快速入口](README.md)
