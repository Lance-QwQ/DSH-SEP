# 测试与验收摘要

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-mit-alpha` · 文档 `20260921-docs-r6` · **Windows x64 Alpha 测试发布**。SEP 已确认原创部分采用 MIT，第三方保留原许可。历史启动异常作为已接受的已知问题披露；功能证据与本轮封包验证分别见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。项目入口：[GitHub 仓库](https://github.com/Lance-QwQ/DSH-SEP)。
<!-- SEP_RELEASE_STATUS_END -->

状态值只使用 `pass / fail / blocked / not_run`，范围和解释单独列出。当前程序图 `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52`；本轮是许可／文档／元数据更新，不宣称所有功能测试重新执行。

## 本轮 MIT Alpha 封包验证

本轮只更新许可、文档和相关元数据；运行实现基线为 `20260921-office-r2`，程序图 `a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8`。代码与二进制等同性、重新安装、ZIP 和脱敏核验结果：**pass：本轮已核对仅已映射原创许可、包声明与文档/绑定变更，运行实现及第三方文件与 Office-r2 字节相同；沿用其固定 Windows 11 功能证据，未重跑全部功能或付费模型。最终 MIT ZIP 安装、逐文件验证与脱敏结果由包外 DELIVERY-REPORT.json 单独绑定。**。功能证据沿用该固定基线，不宣称本轮重跑了完整功能矩阵、真实模型、长时间运行或全部环境测试。

源码清单 `SOURCE_FILES.json` 的 SHA-256 为 `ed91e199c25db5a35844111d535a75f66e3c5537bf332f08cb4a09b9ca16053f`。最终身份与包级验证由 [版本清单](RELEASE_MANIFEST.json)、包根状态与交付记录绑定。没有证据的项目保持 not_run，不能把 Alpha 发布授权当作测试通过。

历史 `GUARDIAN_NOT_READY`／`HOST_STARTUP_UNATTRIBUTED` 宿主启动异常仍未归因、未证明修复；原 Only 合成安装追加的 10 次启动、记忆只读检查和正常退出均未复现。项目所有者已允许带此已知问题进行 Windows Alpha 测试发布。这项决定不把历史 fail 改为 pass，不降低原验收标准，也不表示通过稳定版准入。

## office-r2 功能证据（继承，非本轮重跑）

基线程序图 `a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8`。见[原 Office 验证](evidence/office-validation.json)：适配器 69/69；真实格式转换三轮 18/18，加 16 项边界共 34/34；超链接保留且零自动请求；宿主服务三轮、字体字段断言、4 项通信契约与真实桌面预览通过。各组不同对象的测试数不相加为独立场景总数。本次通过逐文件等同性核验关联该证据，而不是将原证据哈希改绑到新图。

固定要求保持不变：实际 DOCX／XLSX／PPTX 与列明旧格式样本、中文路径及内容、PDF 页数／正文和视觉检查；取消、超时、并发队列、损坏输入、超限输出和所属进程清理分别留证。不得把合成 stub 成功当作真实 Office 渲染，也不得把 `--version` 成功当作全部转换验收。未执行项保留 `not_run`，失败样本与补跑分开记录。

历史 v1 图 `6dce713b672be4c6e7bf312e700dc48e7ed6c7ddf149206a5b4d7865252c31a7` 的三轮六格式正常矩阵为 `fail`，18/18 未生成 PDF；退出码 0 没有被当作成功。profile 长度分离对照和原生 `DeploymentException` 转储保留。v2 增加同目录短名称身份核验、保守路径边界、任务内临时目录与禁转储设置，最终补测结果只采用上方新图摘要，不能覆盖 v1 失败或继承旧图的通过。

当前源码获取证据为 `pass`：官方 MSI 哈希和 Authenticode 有效，四份匹配源码归档完整下载并核验。该状态只覆盖获取与身份；不替代功能或包级验证。真实 Windows 10、全字体／所有旧 Office 文档与恶意文档沙箱兼容均不由此推导。


## 历史启动异常的追加证据

对原先发生失败的同一 Only 合成安装另做 **10 次**“启动 → ready → 记忆只读检查 → 正常退出”，结果 `pass`，10/10 未复现，stderr 为零，未发现所属进程残留，未调用付费模型。它是原历史图的追加启动证据，不是本次替换图的 10 轮完整 UI／共存测试。原 `GUARDIAN_NOT_READY` 仍未归因、未证明修复。

以下历史 r1 表中“本次”“新包”等相对称谓均指当时归档；固定状态、失败和补跑保留，不能作为本版新结果。

<!-- SEP_HISTORICAL_R1_TESTS_START -->
## 历史分发 20260921-r1（原结果保留）

程序图：`ef21d43d3c9545bb715819f4ef774c76ef0e9af76df7433b37d6771d2e5a2d40`。两份预验证 ZIP 已实际安装并通过逐文件校验。438 项补跑通过；首轮 424/438（14 个旧夹具元数据不匹配）保留。桌面首试第1轮自动化点击超时后停止；聚焦补跑前2轮通过，第3轮Only宿主ready前code1退出，原因未确定。官方合成首试缺运行时资源，补齐夹具后3轮结果单列。不得宣称桌面3轮全通过或公开就绪。最终归档另行实装核验并由包外交付报告绑定。该历史包当时因 LibreOffice Kit Node API 源码缺口阻塞公开上传；本版已替换组件，此旧记录不代表新组件状态。

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

[历史 r1 公开验证摘要](evidence/release-validation-summary.json)。未列为必需的 not_run 项继续保留范围限制，不能以离线交付完成推断所有环境均通过。
<!-- SEP_HISTORICAL_R1_TESTS_END -->

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
