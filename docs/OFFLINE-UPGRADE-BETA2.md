# 从 Beta.1 受控升级到 Beta.2

仅适用于 Windows x64 / DSH 0.2.0-rc.2 / SEP 0.2.1-beta.1 的两份精确程序图：公开图 ec39d3b4…（28个文件）与本地更新过滤图682529a8…（7个文件）。目标图96fbacdd…。同版本异图拒绝。旧内置更新器的所有者保护不被放宽；差分ZIP不可直接运行。

从本版 Release 下载并解压 `DSH-SEP-Offline-Bridge-v0.2.1-beta.2-Windows-x64.zip`。正常退出 SEP，包括后台托盘；官方 DSH 无需退出。先使用旧安装随附 Node 建立桥内依赖链接，再逐步准备：

```powershell
& '<旧安装>/runtime/node/node.exe' '<桥目录>/install.mjs'
& '<旧安装>/runtime/node/node.exe' '<桥目录>/cli.mjs' stage '<旧安装>' 'D:/AIData/SEP-upgrade-work' '<旧安装>/releases/sep-beta2'
& '<旧安装>/runtime/node/node.exe' '<桥目录>/cli.mjs' prepare 'D:/AIData/SEP-upgrade-work'
```

准备目录和新代目录必须尚不存在、父路径必须真实。准备不会切换。阅读 PREPARED.json、review/report.html、文件清单，确认列出的入口、兼容性和具体后果。明确同意该报告的未验证范围后填写三份完整SHA-256：

```powershell
& '<旧安装>/runtime/node/node.exe' '<桥目录>/cli.mjs' accept 'D:/AIData/SEP-upgrade-work' '<planHash>' '<reportHash>' '<graphHash>' --accept-unknown-compatibility
& '<旧安装>/runtime/node/node.exe' '<桥目录>/cli.mjs' apply 'D:/AIData/SEP-upgrade-work'
```

确认绑定具体报告和程序图，取得锁后复查指纹。只有可靠committed并开放业务写入才能继续任务。超时不证明没有执行；请保留现场并先检查，用同工作目录 recover，不盲目重跑 apply。存在业务新写入、输入变化或无法确认时保留阻断，不能自动覆盖旧数据。

```powershell
& '<旧安装>/runtime/node/node.exe' '<桥目录>/cli.mjs' recover 'D:/AIData/SEP-upgrade-work'
```

保留用户插件及配置、会话/记忆、凭据路径、完整预算消费/预留/额度。计划目录和恢复快照可能包含私人副本，仅在本机治理，不可公开上传。不会自动删除旧代或失败记录。没有初始化保护记录的新实例直接用Full/Only。本桥不是未来任意版本升级框架，也不支持跨宿主迁移。
