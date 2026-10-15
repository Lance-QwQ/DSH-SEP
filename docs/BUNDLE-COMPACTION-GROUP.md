# bundle.11 冷启动压缩与保护组合

固定官方 DSH 0.2.1-alpha.1、Windows x64 本地 NTFS 合成范围的冷启动组合通过。206 项固定定义（186 既有＋20 新增）和 22 条独立实包审核通过；完整阶段四、完整 SEP 业务 Profile 仍 blocked，根入口 pending。日常版与 GitHub 均不变。旧固定标准未降低。

## 上阶段复核

bundle.10 提交 d5043e1b58a7e2ea68714b61e62ffd2d3c7cdac1 的 450 个提交文件、当前 final-r2 包、20条审核及日志重新绑定。旧初版的449个源码、RESULT-r1/REPORT-r1、原包和安装清单位置映射也重新核对；旧证据原字节保留。新隔离目录重新安装旧封存包，186 项再次通过。BEFORE-CHECKPOINT.json 与 BEFORE.json 是本次复核入口，不累计成新场景。

## 实现和有效范围

新增两个具名 Cordis 入口。compaction-group 仅要求原生 llm/tokenMeter/sessions，配置 projects、明确 native 配置及可选 maxInputBytes。protected-runtime 先挂载已认证的 protected-profile，再根据其已登记项目挂载上述压缩组合。项目范围不允许另传未知目录。全部旧提供方及旧 lossless 摘要/Worker 源码保持字节，不修改官方源码。

宿主必须先审阅冷启动配置，停用原生压缩行并将其完整配置复制到 native；完整组合还需预先停用原文件与 SessionPersistence 行。运行中的原生引擎拒绝且保留，不能据此宣称已完成私人热替换。失败/卸载只清理自有部分，不编辑 YAML、不自动重新启用刻意停用的旧行；显式重挂原生引擎保留参数已验证。原执行方案的“自动读取当前配置、失败/卸载恢复原入口”仍待后续，未改写为已完成。

原生 auto、压力阈值、保留参数、模型策略、重试、范围选择、工具配对和 Session 事务保留。SEP 同项目摘要在内存 SQLite lossless-claw 图中复核正文覆盖/摘要哈希；原摘要 envelope 不变，没有额外模型请求、持久历史图或自动原文展开。原生摘要本身仍消耗模型 token。本轮使用合成 adapter，无付费请求；真实 API、凭据可用性和解题效果不在本结论内。项目外与原生子代理沿用原生摘要，不扩大 suite_delegate 的限制范围。

压缩卸载立即关闭新准入并取消已接收调用，等待实际结算，再卸载引擎。完整组合随后关闭保护 Profile 的 Session 和 P2；不合作的 adapter 会延迟收尾，无全应用有界期限保证。服务不可见不能作为物理释放证明，固定场景另用保留的实际 Session 提供方读取及 P2 竞争接管必须被拒绝验证顺序；放行后原操作失败但无摘要提交，随后正常取得新租约。迟到结果不能提交，旧引擎引用拒绝新工作。原生接受调用的 LlmError 归类保持，新准入关闭为 SEP_COMPACTION_CLOSED。

## 失败样本和修复归因

baseline-red.log 确认旧包缺少入口。iteration1.log 13/18：取消错误被原生包装为 LlmError，与初始“原错误对象/码不变”的测试预期不符；原生服务代理比较也需比较稳定配置，属夹具修正。不能把这些预期差异称为原生漏洞。

ordered-close-red.log 仅证实服务从上下文消失，不单独证明物理释放。iteration2.log 为17/18。physical-current.log 进一步暂缓已派发 adapter，P2 新控制器却成功取得租约，证明原实现物理所有权提前释放。原因是 async generator 自动解开 thenable disposer，Cordis 原自动清理仍独立并发。改用同步 generator 收集原 disposer，关闭链先排空压缩、再关闭 Profile。该固定测试最终同时确认实际 Session 读取仍可用、竞争 P2 接管为 P2_LOCKED、结算后正常关闭。

manual-reservation-red.log 独立证明手动压缩维护预约被 Promise 微任务延迟。改为同步调用原操作，保留原生 compactNow 预约契约。iteration3.log 19/19；最终加入完整保护组合的真实 boot/Loader 场景，sealed-runtime.log 193/193、sealed-builder-entry.log 13/13，共206个固定定义。重复运行不累加场景。

一次资源审核辅助脚本使用错误工作目录产生 MODULE_NOT_FOUND，原 resource-audit.log 保留，resource-audit-r2.log 为实际成功审计；不是包启动失败。physical-current 失败诊断曾意外取得一个控制器后未 close，进程退出后留死 owner.lock。使用既有 P2 正常接管、验证 journal 并 close，原 journal 字节未改；RESOURCES.json 记录该受控恢复。最终合成目录零 P2 owner 文件是在这次后续恢复后取得，不能证明所有旧失败样本当场无残留，也不是全桌面资源审计。

## 证据与剩余项

证据目录 D:/AIData/ProjectWork/DSH/bundle-install-20261008/phase4-compaction-r1。最终实包 artifacts/final/dsh-sep-bundle-0.2.1-beta.3-bundle.11.tgz，SHA-256 f287f529280f03e5c0169396a9214dc9a29548c5034f7bd1bd88ad69ecca08b2，425 个普通文件。静态审核268个代码文件、1069条ESM导入；部署使用已有离线缓存、禁安装脚本，并非冷缓存安装或完整离线产品。

REVIEW.json 为22条独立审核，BUNDLE-COMPACTION-VERIFICATION.json 与 RESULT.json 绑定本次源码、实际候选、测试输入快照、包和原始日志；CHECKPOINT.json 在本地提交后认证。旧 rc.2 peer 对 alpha.1 的冲突仍 fail，未用版本放宽隐藏；旧封存报告与公开 README 保留。

下一步先落实原配置绑定及恢复原入口的受控契约，再推进完整业务 Profile 的 P1 模型拦截、仅经 suite_delegate 创建任务的限制与全应用期限。之后才是配置前端与阶段五远端 Git URL GUI 安装生命周期。私人热替换、已存在私人库纳管、真实模型、Linux/macOS 和整套业务启用均不由本子阶段证明。
