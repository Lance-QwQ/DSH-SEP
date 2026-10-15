# DSH SEP 0.2.1-beta.3 · 三平台 Beta 分发

**DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE（DSH 系统增强套件）** 为 DeepSeek Harness 增加分层记忆、本地检索、受管委派、预算护栏、受控文件变更与恢复等能力。本次统一提供 Windows、Linux 和 macOS 的最新已验安装资产；发布级别为 **Beta／预览，不是 RC**。

## 选择下载

| 系统与包型 | 资产 | 使用说明与验证范围 |
| --- | --- | --- |
| Windows x64 Full | [完整独立安装包](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/DSH-SEP-Full-0.2.1-beta.3-Windows-x64.zip) | [Windows.md](Windows.md) |
| Windows x64 Only | [SEP＋必要适配包](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/DSH-SEP-Only-0.2.1-beta.3-Windows-x64.zip) | [Windows.md](Windows.md)：需精确官方 npm 来源 |
| Linux x64 | [隔离预览包](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/DSH-SEP-0.2.1-beta.3-Linux-x64.tar.gz) | [Linux.md](Linux.md) |
| macOS ARM64 | [原生安装器隔离预览](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/DSH-SEP-0.2.1-beta.3-macOS-arm64.zip) | [macOS.md](macOS.md) |

三平台对应 **四份主安装资产**，不把 Windows Full／Only 合并为一个包。安装前应阅读对应说明并核验 SHA-256；包型和平台不可混用。

## 版本对应

统一分发标识为 `0.2.1-beta.3`，四份资产仅采用统一下载名称，程序包保持已验证的原始字节：

- Windows：DSH `0.2.1-alpha.2`＋SEP `0.2.1-beta.3-alpha2-adapter.1`，修订 `windows-package.2`。
- Linux：DSH Alpha.2 派生 `closeout.12`，附同包 Wayland 补验证据。
- macOS：DSH Alpha.2＋Mac 派生运行时，r83 新原生复验及新安装器代次。

这是分发代次统一，不是把各子包内部版本、运行依赖或认证范围改成一致。包内历史文件名、版本和已有证据保留；当前范围以本发布及平台说明为准。

## 本次交付依据

Windows 提供修复后两份固定 ZIP 的全新安装、服务和核心桌面验证；账本父目录与其他状态域分离。Only 对固定官方来源逐文件校验，两个包均新建独立实例，不覆盖已有 DSH。

Linux closeout.12 补齐监督与退出、受控工作副本依赖及原生退出确认后销毁窗口的适配。Wayland 补验在私有 Sway 环境完成拖动、中文输入、隐藏／重开、GTK 选择器和退出确认的四轮场景执行；实际退出窗口的 AT-SPI 语义点击仍失败，未由键鼠结果替代。

macOS 完成新源码原生回归、新应用与新安装器构建、同一固定安装器的实际安装及两轮已安装产品启闭。实际环境是 macOS 15.7.9 ARM64／APFS；ad-hoc 签名，不含 Developer ID／公证。

## 发布边界

- Linux 与 macOS 的完整公开认证继续为 **blocked**，以限定环境的隔离预览提供。不是“全部平台、全部功能已经认证”。
- Windows 直接 PS1 重开仍可能受执行策略阻止；已验 VBS／Node 结果不取消该限制。
- 未将三平台的自动更新、公共 HTTPS 下载、原生确认与安装联动宣称为完整通过；本次资产发布不构成任意旧版本的更新授权。
- 默认使用新独立目录与空白数据。不要覆盖现有程序／私人库，不把安装包当旧库迁移或自动回退工具。
- 付费模型、私人资料接续、所有外部服务与所有第三方插件没有得到全面认证。各平台的关闭／清理证据及保留限制见平台说明。
- 脱敏结论仅针对实际声明的扫描范围，不保证发现任意编码、二进制或所有形式的敏感内容。

## SHA-256

```text
bdc09894307cbd53c8f120c454e3a80d5ee687341ff8de15d9079a15fbc64b04  DSH-SEP-Full-0.2.1-beta.3-Windows-x64.zip
a1db5cb400a04d8b76536604de63cb018d14272b6d39e858da9d61755556ff79  DSH-SEP-Only-0.2.1-beta.3-Windows-x64.zip
1708b8050c35471c930c6fc61d48289296609b64c7d2a431013eb299b7482f00  DSH-SEP-0.2.1-beta.3-Linux-x64.tar.gz
021f240986db15064182e6f3f0e002753b435093a4eb1876a4ea4fb018243db7  DSH-SEP-0.2.1-beta.3-macOS-arm64.zip
```

自有代码采用 MIT；DSH 与其他组件保留各自许可。校验和提供字节完整性核对，不替代发布者签名、操作系统信任认证或平台公证。

本次发布补充的第三方许可与对应源码说明见 [THIRD-PARTY.md](THIRD-PARTY.md)。SEP 自有代码 MIT 不替代第三方组件许可。
