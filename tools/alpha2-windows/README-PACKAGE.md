# DSH SEP — Windows Alpha.2 安装包

固定组合：DSH `0.2.1-alpha.2` + SEP `0.2.1-beta.3-alpha2-adapter.1`；分发修订 `windows-package.2`，Windows x64。此组合不代表支持所有未来 DSH 版本，也不是 RC。

## Full 与 Only

- **Full**：包含固定 DSH、SEP、必要宿主适配及 Node/Electron/Python 等运行支持。
- **Only**：不附带完整 DSH；包含 SEP、必要宿主适配代码及运行支持，安装时还必须提供精确匹配的官方 DSH npm 组件来源。安装器逐文件核验来源的大小和 SHA-256。它不能仅凭一个版本号接收任意官方桌面目录，也不是在插件市场粘贴仓库链接的通用安装包。

两个包都安装到**显式指定的新目录**，创建独立空白库、工作区、账本、凭据模板与运行锁。已有官方 DSH/SEP 程序、插件和数据保持原位；本安装器不承担私人库迁移、就地覆盖或自动更新。Only 仅读取所列官方来源文件，不在官方实例中安装或修改插件。

## 安装

先从可信交付方取得并核对 ZIP 的 SHA-256。清单哈希提供完整性核对，不等于数字签名或发布者身份认证。解压至真实本地目录；目标父目录需预先存在，目标目录必须不存在，不使用符号链接、目录联接或别名。

在解压目录运行 PowerShell：

```powershell
# Full：根据需要选择新的绝对路径
.\runtime\node\node.exe .\installer.mjs --destination 'D:\DSH-SEP-Full'

# Only：官方组件来源准备方式见 docs/ONLY-SOURCE.md
.\runtime\node\node.exe .\installer.mjs --destination 'D:\DSH-SEP-Only' --host-root 'D:\Official-DSH-Alpha2'
```

安装成功回执不等于程序已经启动。到目标目录双击 `start.vbs`（后台启动）或运行 `start.ps1`（显示诊断）。首次安装 `.env` 中的 `DEEPSEEK_API_KEY` 为空，允许打开配置界面；只有完成模型凭据配置后才能进行实际模型任务。不要把填写后的 `.env` 再分发。正常关闭窗口可保留后台；结束实例请使用托盘退出。不要按进程名称批量结束 Electron 或 Node。

初始默认金额：共享预算 100 元、单会话护栏 100 元、单轮护栏 5 元；限额相互独立，调整设置不清空已消费或预留金额。新装账本位于 `state/budget/budget.json`，其父目录与锁、记忆、会话及备份目录互不包含；本修订不迁移现有账本。记忆捕获默认关闭，自动回忆默认开启；均为新空白状态。本轮安装验证不调用付费模型。

如果安装中断，目标保留 `INSTALLING.json`，默认入口会拒绝启动。查看失败代码，保留现场，另选新目标重新安装；不要删掉标记强制运行。只有已提交安装回执的目录可正常启动。

## 边界与文档

- Windows 受保护文件入口和生命周期治理仍不代表任意本机 Shell 的全面安全沙箱；插件和 Shell 具有各自权限边界。
- Computer use、WSL/Docker 评测及外部 MCP 依赖相应系统组件、用户授权与提供方配置；随包存在不等于这些外部能力已在每台机器验证。
- 不内置个人会话、记忆正文、API Key、私人插件配置或非项目 Git 数据；依赖包中保留其公开源码、许可与样例。脱敏检查的详细范围及例外见随包交付的验证记录。
- 本地全新安装、实例隔离、重启/退出的实际结果以本次交付的验证汇总为准；不从历史测试外推为所有插件逐项认证。

参见 `docs/ONLY-SOURCE.md`、`docs/COMPONENTS.json`、`docs/BUILD-PROVENANCE.json`、`LICENSING.md` 和 `THIRD_PARTY_NOTICES.md`。未设置自动发布、未切换原日常版。
