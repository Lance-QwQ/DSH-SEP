# 阶段四实时 Session 适配子阶段

本地候选 `0.2.1-beta.3-bundle.5`，目标官方 DSH `0.2.1-alpha.1`。本子阶段 pass 只表示所述隔离合成行为；**完整阶段四仍 blocked**，日常与公开 Beta.2 不变，未发布。

已完成：实际原生 Session writer 的必需任务持久化，提供方卸载重开与新 Node 进程冷读；写前修订/字段/身份拒绝；实际 fork 与嵌套 fork 保留父任务身份、验证真实父前缀，拒绝伪造、父缺失与循环；Zstandard；两实例写锁冲突与释放；未知必需事件拒绝；中断 JSON 尾部只读不变及受控写前修复。父记录必须仍存在且 cwd 一致，最多 64 代；取消父链读取传递原取消原因。

旧日志范围：只有一个空 V3 原生日志验证了读取不发布、写开旁置 V4 并保留 V3 原字节。含 task/checkpoint-change 或 recovery/continuation 的历史日志继续拒绝，不隐式更改必需性、恢复链接或版本。纯 V4 审阅 API 仍拒绝继承 SEP；实际父证据仅属于显式实时提供方。

这不是完整 Agent 解题/任务续跑，也不是 GUI/插件热替换或首次私人纳管证明。现有提供方不得叠装；完整启用仍等待文件保护、恢复权威、Profile 受控替换及人机绑定。写前重读完整前缀及父代次带来本地 I/O/解析开销，尚未做长日志吞吐认证，不调用付费模型。

复核发现并处理：官方 writer 必须显式取得，SessionStore 创建本身不建立写句柄，首轮夹具据此纠正；Worker 搬移后原 ../package.json 引用失效，改为实际 LLM 元数据；产物审核原来未遍历适配器的深层导入，新检查已固定“缺少语义校验模块”和“缺少 Worker”两种负例。所有原失败日志与候选版本保留。

完整新记录见 BUNDLE-SESSION-VERIFICATION.json。上一轮 BUNDLE-HOST-VERIFICATION.json 保留原字节，其恢复阻断结论属于 bundle.4 当时的官方默认提供方；本轮是新的显式自有提供方，不表示官方默认目录已被修改。

证据根：D:/AIData/ProjectWork/DSH/bundle-install-20261008/phase4-session-r1。下一步是 SEP 自有文件保护与恢复权威适配，通过后再接 Profile 与前端。

## 最终复核与证据

78 个固定定义通过：此前 59 项回归，加本轮 17 项实时 Session 与 2 项产物缺件拒绝。最终实包运行日志为 packed-runtime-sealed.log（65/65）；构建/官方准入为 builder-entry-final.log（13/13）。早期失败日志全部保留，重复执行不计作新增定义。

独立审核 11 条通过，检查 410 个包内常规文件及 260 个代码文件的静态依赖闭包。审核同时验证了许可、逐文件字节、官方衍生组件的声明变换、完整性清单及旧证据/日常未变。Worker.ts 是已钉定编译 JS 中不可达的源码分支；实际 Worker.cjs 必须存在。动态导入和前端工厂仍需后续业务认证。

最终候选相对证据根：artifacts/final-docfix/dsh-sep-bundle-0.2.1-beta.3-bundle.5.tgz。
SHA-256：7c5cf1bd713c7e1666b6ecf7d78a5fcdb19ce4851ccb0974f15c6af203e40e93。
开发复核器最后修正了缺件错误分类；新包仅再修正文档中的目录表述。历史 final/r4 包、失败样本与日志各自保留，不能据其文件名引用为本轮最终实包。

peers-check-sealed.log 仍以退出码 1 保留 rc.2 对 alpha.1 的旧接口要求冲突。它是完整阶段未通过的证据，不用本子阶段 78 项通过来覆盖。安装采用既有官方 npm 缓存的离线复用，不宣称本轮做了新冷安装。当前提供方对五个关键 Session 宿主包检查精确版本；没有覆盖所有宿主组件。

RESULT.json 与仓库 BUNDLE-SESSION-VERIFICATION.json 绑定官方提交、源码、实际包和全部日志。CHECKPOINT.json 将在本地提交后核验同一绑定。未部署、未发布；完整阶段状态 blocked。
