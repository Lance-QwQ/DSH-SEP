最新 Linux SEP 业务核心组合见 [本轮适配](ALPHA2-LINUX-SEP-CORE-20261012.md)：79 项回归及两轮真实桌面记忆/预算设置验证通过；已补入显式 userProfile 接线。完整 Linux SEP 仍 blocked，文档删除、视觉附件与平台服务等仍待适配。Windows 日常版未改动，未上传 GitHub。以下为历史阶段证据。

---

最新 Linux SEP 业务核心组合见 [本轮适配](ALPHA2-LINUX-SEP-CORE-20261012.md)：78 项回归及两轮真实桌面记忆/预算设置验证通过；完整 Linux SEP 仍 blocked，文档删除、视觉附件与平台服务等仍待适配。Windows 日常版未改动，未上传 GitHub。以下为历史阶段证据。

---

最新 Linux 受控 Profile 阶段见 [恢复、工具隔离与真实桌面](ALPHA2-LINUX-PROFILE-20261012.md)：60 项事务/工具回归通过，真实 Linux 桌面两轮通过；完整 SEP 业务/受保护 Profile 仍 blocked，macOS not_run。Windows 日常 Alpha.2 保持原位，本轮未上传 GitHub。下文为历史阶段证据。

---

最新事务阶段见 [Linux 受控副本及提交恢复](ALPHA2-LINUX-TRANSACTIONS-20261012.md)：41 个定义三轮通过，仍仅合成载具；完整 Linux Profile blocked，桌面与 macOS not_run。下文为历史阶段证据。

---

当前 Alpha.2 进展见 [Linux 基础适配阶段复核](ALPHA2-LINUX-FOUNDATION-20261012.md)：冻结安装已通过，强隔离原型三轮通过；完整受保护 Profile 仍 blocked，Linux 桌面与 macOS 运行仍未认证。下文为 Alpha.1／bundle.23 的历史报告，原文保留。

---

# 第6步：三平台与CI范围

本阶段调查、载具和本地复核完成，完整三平台认证仍 blocked。默认组合入口 pending、完整Profile blocked未变。当前固定DSH0.2.1-alpha.1及bundle.23；历史平台报告不替代本轮证据。

|范围|Windows x64|Linux x64/WSL|macOS|
|---|---|---|---|
|当前固定包文件内容|467文件比对通过|467文件与Windows逐字节一致，tar.gz本身因平台打包字节不同|未执行|
|完整冻结依赖安装|通过，139项直接依赖及锁文件|blocked：npm元数据请求失败，minimumReleaseAge检查拒绝；未放宽策略|not_run|
|入口/配置/门禁/官方fs保留|19/19通过|仅10项离线配置/账本测试通过，不能冒充真实Loader或fs通过|not_run|
|SEP受控Profile业务|第5步所列Windows合成范围通过|blocked：保护提供方明确只支持win32+x64|blocked：同一平台边界|
|完整桌面发行/全部插件|未认证|未认证|未认证|

Linux使用原有D盘ext4虚拟磁盘中的新独立目录，未启用interop、未改变自动挂载、未替换任何日常版。首次离线配置尝试没有Zod，6通过4失败；提供固定原版Zod4.4.3后10/10通过。这是有限依赖手工准备，不是成功pnpm安装。安装失败是网络与元数据验证阻断，不是已归因的SEP平台故障；Windows-only guard则是明确功能限制。

新增仅本地的.github/workflows/sep-bundle-portable.yml。手工dispatch，固定Node24.21.0/pnpm11.7.0，以准备脚本生成候选tarball和固定锁图，执行有限入口测试并保存报告。无Release、无仓库写权限。Windows已按该流程实际安装与运行；YAML及PowerShell语法另核验。Linux当地Node24.19.0，不能冒充计划CI的24.21.0。macOS与GitHub实际运行均not_run，遵守本轮不推送约定。

复现：node tools/bundle-install/platform-ci.mjs <全新输出目录> <pnpm.cjs> prepare；在输出host执行pnpm install --frozen-lockfile --ignore-scripts，再执行同脚本verify。Windows输出使用真实D盘路径；CI自带相应参数。此CI不是整套桌面或受控Profile验收，不承诺任意插件兼容。下一轮如要完成POSIX业务发行，必须实现/核验对应恢复提供方及资源身份语义，不能直接删除平台拒绝条件。

证据：phase6-platform-ci-r1/RESULT.json、windows-r1、linux-results-r1。第7步只有限整理历史关闭异常；第8步封存候选后停下。未认证项保留在最终交付，不将完成记录等同于达成跨平台发布条件。
