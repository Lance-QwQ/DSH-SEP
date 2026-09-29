# r6 原生隔离安装与更新回退验证

Windows 日常版保持原位，没有切换；仅更新获准的 GitHub 测试分支，不更改 main，不发布 Release。

本轮是内部受控宿主安装候选。Full 包含程序依赖图和脚本运行时，**尚无 Electron GUI 载荷，不是面向用户的完整桌面发行包**。SEP-only 仅使用精确匹配、已经适配的宿主文件；不代表可安装于任意官方原版 DSH。

## 当前结果

- Linux WSL2 x64 最终候选：6 项生成器检查、12 项真实安装运行检查、13 项真实更新回退检查通过；最终图完整性、持久化决策与所属进程审计通过。
- macOS arm64 最终候选：同版 6 + 12 + 13 项检查及最终审计通过。两平台均为 31 项本轮检查，0 失败、0 跳过；另列最终状态审计。历史失败和补跑分别保留，不合并计数。
- Windows：只执行 9 项打包/启动器隔离回归，通过；没有用 Linux 或 macOS 包替换日常版。

[最新 macOS CI](https://github.com/Lance-QwQ/DSH-SEP/actions/runs/36542638783) · [上轮 macOS 安装更新通过](https://github.com/Lance-QwQ/DSH-SEP/actions/runs/36540275201) · [后续桌面验证顺序](NEXT-DESKTOP.md)

## 具体覆盖

1. schema 2 Full / SEP-only 生成：源文件被改、已有目的目录、运行时链接逃逸须拒绝；插件来源必须具备明确根绑定。
2. 真实 installer.mjs 在两个全新目录安装；使用原生 Node、可执行 start.sh 和独立项目 ID / HOME / 存储 / 锁目录。
3. 两个 SEP 测试实例并发启动，端口与宿主 PID 不同。A 修改默认额度后 B 仍保持 100 元；关闭 A 后 B 仍可响应。
4. A 的设置与合成非零账本跨重启保留；不支持宿主在创建目标目录之前被拒绝。
5. 实际 preparePackage / copyProfile / prepareOfflinePlan / executePreparedPlan 更新链；错误指纹同意被拒绝。
6. 测试子进程内注入固定 R6_SYNTHETIC_HEALTH，验证旧程序指向及账本恢复；另建精确绑定的新计划，成功提交后再启动并关闭。
7. 对账本、已有受控数据域文件和一个合成用户文件检查字节保留；最终重新审计程序图、回退原因、后续提交、开放门禁、零待完成写入和所属进程退出。

1.25 元账本是人为生成的合成回执，不是 API 消费。没有私人资料、真实凭据或付费模型调用。测试签名只用于这些合成计划，不构成日常版部署同意。

## 修复与失败样本

| 样本 | 归因和处理 |
| --- | --- |
| Linux 末次生成器单测重跑的 TMPDIR 缺失 | 单独重跑命令设置了尚未创建的临时目录，6 项均在 fixture 建立时 ENOENT。创建指定目录后原代码 6/6 通过（linux-generator-final-02.log）；不是新增产品故障。CI 驱动本来就先创建 TMPDIR。 |
| 初次 Linux 安装驱动 BUDGET_CONFIG | 驱动错误使用 Budget 构造参数。修正驱动；最终使用新安装目录重做安装断言。不是产品预算故障。 |
| 初次合成候选 RECOVERY_MANAGED_SUITE_VERSION | 只改 SEP 版本而漏掉 Recovery 精确版本绑定。候选显式适配绑定，未放宽版本检查。 |
| PROFILE_BUNDLE_UNVERIFIED | 图中缺少 @deepseek-ai/dsh-base 与 @deepseek-ai/dsh-web-app 的显式 roots；生成器补齐可唯一定位的包根，歧义仍拒绝。 |
| Linux 与 macOS 更新准备 ENOENT home/profiles | 安装器漏建目录。已在真实安装器初始化，并对两个新安装实例分别断言。旧失败日志及 macOS 36539487093 保留。 |
| Linux attempt-03/update-01 未在 180 秒内返回 | 原调用保留 fail。持久化记录已有预设健康错误触发的 rolled_back，P2 门禁开放、pending=0；随后受控 recover 返回 alreadyFinalized、recoveryAdmission=open。不能据此说原调用正常结束。 |
| 历史 Linux update-02 补跑 | 新目录、新计划；故障子进程改为 600 秒有界等待，保存退出码/信号/错误。回退、提交与最终审计通过，不覆盖原失败。 |

最终零残留是最后补跑的正常 finally 收尾之后由只读审计确认；更早超时样本另外经过上述受控恢复。审计没有执行进程清理。不同平台耗时不用于性能对比。

## 严格边界

- 更新是同 schema 的合成 SEP 版本变化及相应 Recovery 精确版本绑定调整，不是新结构迁移，也不是公开下载更新服务验证。
- 当前存在的三域文件均核对；测试只有 suite 数据域实际存在，memory/archive 域原为缺失，按缺失保留。不能声称验证了非空 L2/L3/L4 记忆迁移。
- 用户文件是单个合成标记，不是完整自装插件运行状态。两个 SEP 并存不是官方 DSH 与 SEP 并存。
- 历史 Linux 合成候选清单有 810 条 unknown、5 条 incompatible、0 项 hardBlock。5 条来自 Recovery、dsh-sep-plugin-group 两个组件及 Recovery 的三个加载实例：它们的依赖声明仍精确要求原 SEP 版本，而合成候选增加了 -r6.1。该历史样本只在隔离试验中签署具体报告的风险接受，验证的是这条更新事务路径，不是无风险升级。这也不等于发现 5 个独立运行崩溃。随后在提交 45855179 同步这两处 peerDependencies，并增加零声明不兼容断言；Linux attempt-04 全部 31 项检查与最终审计已通过，清单为 815 unknown / 0 incompatible / 0 hardBlock。最终 Linux 与 macOS 清单均为 815 unknown / 0 incompatible / 0 hardBlock（629 个组件包、186 个插件实例）。unknown 不声明运行兼容，也不是故障数量。
- Electron 载荷、真实窗口/托盘、平台权限与 Computer Use、macOS 签名公证、其他 CPU 架构仍未验收。固定标准未改、未降低。

## 版本与证据

最终测试工具提交：45855179999ecf7dc0e07897b6d48af401cf36c9。实际应用输入仍绑定 r4 SOURCE-MANIFEST.json（SHA-256 d9fb142f8d3b6c80143310fb12e0ecf10de76d7d5bf7b1f9c2e9145951bb040a），不把重新构建说成升级了 DSH 版本。DSH 为 0.1.7-rc.2。

Linux 原生图：7f7af425e35159f98cd631349eb6a04a6758404921174f73383ef6fced51a6dc；最终合成目标图：ecea503ca264c1f523f22c8ecd1d3c0798b248bab4eb05db638fa64ad5ce6806。对应 629 个包、23162 个文件。本地 linux-final-evidence 含最终实际包清单、图、安装回执、更新结果和审计；linux-evidence 保留上一轮样本。macOS 证据由 CI artifact 摘要核验后保留。

旧导航原字节存于 index-before-r6.md；r5 历史证据不修改。新结论只以本轮 RESULT.json、EVIDENCE.json 及对应实测日志为依据。

macOS 最终基础图 d45c7875109c84d6c6a7ef8ead507cd291e3a707572712adabfc332e47db04b8，目标图 6b74b50afb3ef0e63aff9de23a0df281ec72f6bf1973ddcd4a49e665fe888ac3；629 个包、23843 个文件。CI 36542638783 的 artifact 已下载并核对 GitHub 提供的 SHA-256；摘要见 RESULT.json。
