# SEP 离线升级桥 · Windows x64 Beta

本工具只接受两份精确基图：公开 SEP 0.2.1-beta.1（ec39d3…，28 个程序文件）或已安装更新过滤器的本地 Beta.1（682529…，7 个版本绑定文件）。目标为 SEP 0.2.1-beta.2（96fbac…），DSH 保持 0.2.0-rc.2。版本号相同但文件不同仍会拒绝。此工具没有修改旧内置更新器的通用允许清单，也不是通用升级框架。

完整退出 SEP 后执行。关闭窗口会保留后台。官方 DSH 无需退出。本工具不结束其他进程；发现相关写者仍运行时拒绝。工作目录和目标程序目录必须尚不存在，父目录必须是真实路径。准备目录建议放 D:；目标程序在原安装的 releases 下建立新代。已正常使用的账本和保护记录必须存在；未初始化的新安装应直接使用 Full 或 Only，新库不得借升级清空旧账本。

首次解压后，用旧安装随附的 runtime/node/node.exe 执行 install.mjs，重建并验证包内依赖链接。它只修改升级桥自身目录。随后用同一个 Node 执行 cli.mjs。每项路径写完整路径：

```powershell
& '<旧安装>/runtime/node/node.exe' ./cli.mjs stage '<旧安装根目录>' 'D:/AIData/SEP-upgrade-work' '<旧安装>/releases/sep-beta2'
& '<旧安装>/runtime/node/node.exe' ./cli.mjs prepare 'D:/AIData/SEP-upgrade-work'
```

审阅工作目录中的 PREPARED.json、review/report.html 和具体文件清单。prepare 只生成健康证据和计划，不接受风险、不切换。兼容性 unknown 表示没有逐项运行证明，不表示故障；confirmed incompatible 和 hard block 会阻断。工具保留配置、私人会话/记忆与凭据路径、用户插件及别名、全部账本字段。不会将用户内容复制到升级桥发行包中。私人计划目录包含本机路径、配置副本与数据恢复材料，仅本地保存，不用于公开反馈或打包。

用户明确接受具体报告范围后，填写三份完整 SHA-256，不只填前缀：

```powershell
& '<旧安装>/runtime/node/node.exe' ./cli.mjs accept 'D:/AIData/SEP-upgrade-work' '<planHash>' '<reportHash>' '<graphHash>' --accept-unknown-compatibility
& '<旧安装>/runtime/node/node.exe' ./cli.mjs apply 'D:/AIData/SEP-upgrade-work'
```

确认绑定计划、兼容性报告和目标图；取得原生/P2 锁后复查，指纹变化则拒绝。复用 P2 三域发布、持久化提交和写入代次规则，保持原消费与未知预留，不因升级清零。结果为 committed 且业务入口开放才可开始新任务。报错/超时不等于没有执行，不要重新运行 apply 猜测；先检查保留现场，在条件满足时执行 recover 同一工作目录。出现维护停写、业务新写入、输入改变或状态无法确认时必须保留阻断状态。

```powershell
& '<旧安装>/runtime/node/node.exe' ./cli.mjs recover 'D:/AIData/SEP-upgrade-work'
```

成功切换后原程序仍保留。新版本产生业务写入后不得直接覆盖旧快照恢复。临时计划和快照包含私人内容，需要按既有恢复/删除治理处理，不能当作可分享的安装包。本工具不会自动删除旧代或失败证据。没有验证 Linux/macOS 安装。本桥只处理本版列明的两份基图，不保证未来任何版本均可升级。

原创桥接代码采用 MIT；operator/shared 与 dependencies 保留各组件原许可。tests 记录固定输入的行为，不能代替所有私人插件功能验证。验证与源码审查结果在包外随发布资料提供，避免测试日志或私人计划混入工具。
