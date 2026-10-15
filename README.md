# DSH SEP · Windows / Linux / macOS Beta

**DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE（DSH 系统增强套件）**：为 DeepSeek Harness 增加分层记忆、本地 RAG、预算护栏、受管委派、受控文件修改与恢复。

**最新统一分发版：0.2.1-beta.3 · 宿主 DSH 0.2.1-alpha.2。** [下载本次 Beta](https://github.com/Lance-QwQ/DSH-SEP/releases/tag/v0.2.1-beta.3)。SEP 是 Beta，宿主 Alpha.2 与平台预览范围单独标明，不代表 SEP 已进入 RC。

| 平台 | 下载 | 支持与说明 |
| --- | --- | --- |
| Windows x64 | [Full 完整包](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/DSH-SEP-Full-0.2.1-beta.3-Windows-x64.zip) · [Only 增强包](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/DSH-SEP-Only-0.2.1-beta.3-Windows-x64.zip) | [全新独立安装](release/v0.2.1-beta.3/Windows.md)；Only 要求精确的官方 npm 来源。 |
| Linux x64 | [完整预览包](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/DSH-SEP-0.2.1-beta.3-Linux-x64.tar.gz) | [Ubuntu 24.04 / WSL2 已验范围](release/v0.2.1-beta.3/Linux.md)，含受控 Wayland 补验。 |
| macOS ARM64 | [原生安装器预览](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/DSH-SEP-0.2.1-beta.3-macOS-arm64.zip) | [macOS 15.7.9 / APFS 已验范围](release/v0.2.1-beta.3/macOS.md)，ad-hoc 签名，未公证。 |

Linux 与 macOS 的**完整公开认证仍为 blocked**，按限定环境预览分发。Windows 的 PowerShell 策略、Linux AT-SPI 实际退出点击失败、Mac 未公证等限制均保留。先阅读平台说明，再选择下载。

## 这次更新

三平台采用同一发布号，提供四份原字节安装资产。Windows 使用修复后的 windows-package.2；Linux 使用 closeout.12 并补充四轮 Wayland 场景证据；Mac 使用完成新原生复验的 r83 安装器。**包内派生版本和构建号保持原值**，详见[版本与 SHA-256 绑定](release/v0.2.1-beta.3/ASSET-BINDINGS.json)。统一发布号不改变已有签名或验收指纹。

全部安装包用于建立新独立实例，不覆盖另一官方 DSH 或旧 SEP，不迁移私人库。Only 不是向任意官方桌面目录安装的插件。**本次不提供任意旧版本的原位自动更新包**；[旧版本使用者须知](release/v0.2.1-beta.3/UPGRADING.md)。根仓库组合入口仍有准入限制，不能将桌面包发布理解成任意 DSH 版本粘贴仓库链接即可启用全部能力。

## 核心能力

- 四层记忆：L1 模型上下文、L2 项目与临时事项、L3 习惯与重要事实、L4 按需归档；作用域与生命周期分别治理。
- 本地 RAG 使用 **BM25** 词项排名，不依赖外置向量数据库；Mem0 提炼适配限制同项目消息，捕获默认关闭。模型提炼及上下文注入可能计费。
- 共享预算、单会话与单轮护栏分别生效；设置变化不清零账本。默认会话 100 元、单轮 5 元是本地估算上限，不是服务商账户余额。
- 受管委派、观察后修改、候选工作副本、显式提交、恢复与删除依据。具体保护范围和已开放流程按平台说明，不能推断全部 Shell 或外部插件都受同一种隔离保护。

更多见[技术摘要与 BM25](release/v0.2.1-beta.3/TECHNICAL-NOTES.md)。

## 文档、源码与验证

[文档总索引](docs/DOCS_INDEX.md) · [本次公开发布核验回执](release/v0.2.1-beta.3/PUBLICATION.json)

[本版发布说明](release/v0.2.1-beta.3/RELEASE-NOTES.md) · [Windows](release/v0.2.1-beta.3/Windows.md) · [Linux](release/v0.2.1-beta.3/Linux.md) · [macOS](release/v0.2.1-beta.3/macOS.md) · [升级边界](release/v0.2.1-beta.3/UPGRADING.md) · [许可与对应源码](release/v0.2.1-beta.3/THIRD-PARTY.md)

当前源码为经过脱敏导出的统一快照；来源与变换清单说明原始审查提交、原字节保留项和维护脚本路径模板。它不包含私人 Git 历史、未跟踪文件或日常运行库。完整源码下载及所有资产摘要见 Release；本次没有切换维护者的 Windows 日常实例。

安装包的验证范围、失败/阻断和未执行项分别记录。各测试组可能重叠，不累加成全部独立功能数；脱敏扫描也不是任意内容无秘密的绝对证明。[历史阶段入口](docs/PRE-BETA3-README.md)只描述当时状态，旧文档中的“未上传”“当前”不能替代本版发布记录。

自有代码采用 [MIT](LICENSE)，第三方组件继续遵守各自许可；整个安装包不能统称为全部 MIT。安全问题与使用反馈可通过本仓库 Issues 提交，请勿附 API Key、私人会话或完整账本。
