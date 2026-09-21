# 测试与验收摘要

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-r1` · 文档 `20260921-docs-r4` · **候选验收未全部通过，暂不可公开发布**。GitHub 仓库尚未创建；具体下载与反馈地址未绑定。最终程序图及验证见[发布说明](RELEASE_NOTES.md)。
<!-- SEP_RELEASE_STATUS_END -->

本页随文档集 `20260921-docs-r4` 交付，区分来源产品证据与 `20260921-r1` 新包验证。只记录已经执行的结果，未执行的新包项目保持 not_run。详细图哈希、来源证据摘要哈希见 [公开证据摘要](evidence/verification-summary.json)。

状态值使用 `pass / fail / blocked / not_run`。有限范围的通过在范围列解释，不另造“范围内通过”等状态字符串。

<!-- SEP_RELEASE_TESTS_START -->
## 本次分发 20260921-r1

程序图：`ef21d43d3c9545bb715819f4ef774c76ef0e9af76df7433b37d6771d2e5a2d40`。两份预验证 ZIP 已实际安装并通过逐文件校验。438 项补跑通过；首轮 424/438（14 个旧夹具元数据不匹配）保留。桌面首试第1轮自动化点击超时后停止；聚焦补跑前2轮通过，第3轮Only宿主ready前code1退出，原因未确定。官方合成首试缺运行时资源，补齐夹具后3轮结果单列。不得宣称桌面3轮全通过或公开就绪。最终归档另行实装核验并由包外交付报告绑定。公开上传仍被 LibreOffice Kit Node API 首选源码缺口阻塞。

| 项目 | 状态 | 证据与范围 |
|---|---|---|
| 预验证归档实际安装与完整性 | pass | Only/Full 各27227程序文件、2640内部链接；5768个Only来源文件前后不变。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| 固定438项回归首轮 | fail | 424 pass /14 fail；旧测试package.json与本次许可元数据不同；完整结果保留。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| 元数据对齐后的独立补跑 | pass | 438/438；51文件原有断言不变，产品图未改。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| 桌面首试 | fail | 计划3轮，第1轮自动化等待按钮稳定超时后停止；后2轮未执行。失败后的正常app.quit及runtime.close后资源清点为空。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| Only/Full 桌面与恢复补跑 | fail | 计划3轮：前2轮通过，第3轮Only宿主在ready前code1退出（GUARDIAN_NOT_READY）；原stderr正文未持久化，原因未确定。新诊断通过不能反推已修复。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| 官方合成首试 | fail | 第1轮因测试夹具缺office-skills/primary-runtime资源退出；保留失败记录，补齐测试资源后另立三轮。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| 官方合成第二次夹具运行 | fail | 官方正常初始化将简略空配置规范化，引起before哈希误报；保留原结果，最终夹具使用官方已规范化的空模板，之后仍严格核对配置及插件。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| 官方合成实例并存最终固定三轮 | pass | 3 /3轮已执行；官方alpha.2桌面/宿主源码副本＋已记录依赖池（含部分SEP适配），不是官方签名安装器完整证明。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| 全量隐私模式扫描 | pass | 两个预验证ZIP全部成员；私人路径、密钥模式、Git和私人配置未检出。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| 内置运行环境及源码 | pass | 两包Python文档/表格/图片、pnpm及8入口；744源码快照文件逐项核验。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| 真实模型、连续三小时、官方签名安装器完整共存 | not_run | 不属于本轮新增验证。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| 公开软件上传 | blocked | LibreOffice Kit Node API首选源码访问未建立，另有未归因宿主启动失败；GitHub仓库尚未创建。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |
| 追加有界启动诊断 | pass | 单次诊断及另5次连续启动/正常退出均未复现；5次stderr均0，不证明此前启动失败已修复。；证据：`evidence/package-prevalidation.json`，SHA256 `bb0c8ce162c3153b1e35a4b9c776b2bc8c0f1dbdb750239be7ab6a5f037012a7` |

[本次公开验证摘要](evidence/release-validation-summary.json)。未列为必需的 not_run 项继续保留范围限制，不能以离线交付完成推断所有环境均通过。
<!-- SEP_RELEASE_TESTS_END -->

## 能力来源修复构建 ffb961…（继承证据）

| 项目 | 状态 | 结果与适用范围 |
|---|---|---|
| 完整核心回归 | pass | 438/438，0失败、0跳过，绑定最终图。包括已有记忆/RAG、治理与相关核心行为。 |
| 长路径捕获与备份 | pass | 30/30；本地NTFS、中文路径、原277字符失败输入、身份/链接/权限保护、新旧锁排除。 |
| 桌面恢复组件 | pass | 10/10；代次、PID、身份、取消、期限和迟到结果契约。 |
| 更新器回归 | pass | 83/83；调度边界、插件清单、硬门禁、固定受控更新和恢复。 |
| Electron→Node工作器 | pass | 3/3；拒绝Electron假作Node，真实工作器进入固定合成P2提交及回退流程。不是任意上游安装器兼容证据。 |
| 最终实际桌面 | pass | 3/3；每轮官方查询、539行组件/插件报告、关窗留后台、所属宿主崩溃后新代次导航/认证/只读RPC，以及正常完整退出。539行不等于539个独立用户插件。 |
| 最终程序完整性 | pass | 27,159个文件、2,640条实例内链接，来源清单核对一致。 |
| 日常冷部署 | pass | 提交记录可靠落盘后开放业务；启动与记忆接口可用，原数据/配置/密钥/预算/会话及插件链接保留，快捷方式复用同一新宿主。 |
| 最新修复图与官方签名安装实例的完整并存 | not_run | 不把旧版本的源码构建并存证据当成当前图的签名安装器完整验证。 |
| 任意未来DSH版本和未知第三方插件 | not_run | 无法从当前固定图推出通用兼容保证。 |
| 全Windows版本、物理断电、实际磁盘拔出 | not_run | 不在本轮合成范围。 |

记录的执行环境为 Windows 11 x64（10.0.26200），不含个人设备标识。三小时检查使用确定性时钟边界测试；三轮短测不等于连续运行三小时。

最终三轮崩溃后恢复观测为6560/5050/4382ms，不作为Worker开销或跨版本性能比较。正常收尾后所属合成进程残留0；有意终止宿主的故障注入与最后正常退出分别计，不把事后清理等同于当场成功。

## 历史分发图 e57816…

20260920-r2-sanitized 的 Only/Full 均完成实际安装、文件/链接核验、运行时检查、两份SEP实例并存三轮和最终归档扫描。后来对同一图做的补测各438项通过，同时明确发现T01–T04四组缺陷。它们在最新日常图修复，不会因此改变历史ZIP的字节或缺陷状态。

与另一官方DSH实例并存的既有三轮证据，采用固定alpha.2上游源码构建和合成插件，并非官方签名安装器；更新、回退、卸载全过程仍不能用双启动结果替代。旧报告里437/438的未归因工作前评测样本继续保留为历史fail。

历史在线正例已验证真实模型→RAG→合成随机码回答及一张合成图片理解；不由此推导所有模型、推理等级、音视频格式和任意外部服务均已覆盖。最新四修及本套文档编写没有重新付费执行这些实验。

## 失败与重跑

原始失败不覆盖。新合成库漏建P2治理基线、菜单角色定位错误、异步等待未及时捕获拒绝、导航提交前过早断言，都有单独夹具修订和补跑记录。补跑保持最终产品图不变；产品缺陷与夹具缺陷分别归因。

所有计划轮次与失败样本保留，追加样本另列。本摘要不计算混合场景的性能中位数，不把后续通过倒推为历史异常已修复，不因文档更新降低固定验收条件。

## 公开证据

[evidence/verification-summary.json](evidence/verification-summary.json)包含去除私人路径和会话内容的汇总，并保留原始证据文件的SHA256锚点。摘要不是全量原始日志，也不是第三方审计签章；发布者分享原日志前应另行脱敏。安装包、源码和证据的最终对应仍由 [发布清单](PUBLICATION_CHECKLIST.md) 完成。

[返回导航](DOCS_INDEX.md)
