# 第8步：本地最终候选与检查点

本轮收尾候选为SEP0.2.1-beta.3-bundle.23，固定官方DSH0.2.1-alpha.1。**本阶段封存不代表完整适配/发布验收全部完成。** 默认入口pending、完整Profile blocked、业务不开启的门禁保持。第6步完整Linux/macOS/远端CI认证仍未通过。

第5步已实际发现并修复根invariants peer与官方运行时门禁不一致；只采用两个精确版本的并集，其余声明不放宽。新版本官方alpha.2/stable0.2.1/未来0.3.0仍被拒绝。业务模块、受控生命周期与预算语义未因该元数据修正改变。

第8步候选与第5步已测归档只允许根README差异；其余466个普通文件逐字节相同，新的归档、安装副本和当前仓库另经全量文件核验。因此功能证据按代码等价关联，不将旧GUI样本伪称为对最终新tar.gz重新执行。新的冻结安装与19项入口/配置/门禁检查另外留证；pnpm期间仍查询供应链元数据并重试，最终通过，不能称为完全离线；没有因文档变化重复整个模型或所有实验。

可恢复材料包含最终插件tgz、SHA256SUMS.txt、完整源码快照Git bundle（不依赖历史父提交）、源码提交、阶段日志绑定、包内文件清单和检查点JSON。源码快照Git bundle只存本地，不上传，树与原源码提交完全相同；快照使用无父提交的新Git根，原仓库提交与浅克隆历史保留。原分支bundle的独立恢复失败材料另存，不能当作成功检查点。恢复时在新的真实D盘目录执行git clone --config core.autocrlf=false --config core.longpaths=true --branch <快照分支> <checkpoint.bundle> <源码目录>，再核对快照HEAD与源码tree；或只解开插件tgz审阅，不能直接覆盖日常程序或私人库。恢复检查在独立D盘目录真实clone并核对tree/文件；不改当前仓库分支和日常数据。

仍未认证的事项：完整原生Electron/全部CLI宿主退出组合；公共HTTPS仓库安装/认证/代理分发；Linux受控保护提供方及完整安装；macOS与实际远端CI；任意第三方/私人插件；完整MCP安装生命周期、远端判题在途取消、多日压力与全部付费模型链路。第3步具体消费者、一次自有窗口MCP点击和评测后端启动证据保留原范围。历史100ms关闭、700ms观察和5s浏览器关闭异常仍未归因，不声明已修复。

文档导航见BUNDLE-CURRENT-INDEX.md。最终外部检查点目录为D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase8-final-checkpoint-r1，其中CHECKPOINT.json与REVIEW.json绑定最终提交、候选、恢复核验和资源审计。只读/合成验证未发付费模型请求。第8步结束后停下，日常版和GitHub保持原状。

恢复必须显式保留Git blob换行并支持Windows长路径。首次源码快照能clone，但继承本机global core.autocrlf=true使工作树字节不同；当次Git clean不能替代字节核验。该失败样本保留，最终恢复采用上述两项配置并逐blob比较。
