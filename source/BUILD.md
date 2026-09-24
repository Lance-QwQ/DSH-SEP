# 构建与局部验证范围

当前生成器为 startup-source/distribution/build.mjs，使用显式 --config 文件。它从固定的公开 9 月 21 日 MIT Only／Full／Source 基线和本轮已验证 overlay、bootstrap 生成新候选；不是从空目录编译所有 DSH 和原生依赖。

基线下载：https://github.com/Lance-QwQ/DSH-SEP/releases/tag/windows-alpha-20260921-mit 。基线程序图必须为 `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52`，归档校验值必须与该公开发行 SHA256SUMS.txt 一致。不要用未知同名包替代。Node、Electron、Office 和其他原生依赖需要匹配的 Full／Only 载荷，不能凭本源码快照重新创造这些二进制。

1. 保留基线原字节，在独立目录准备 overlay 与 bootstrap；采用逐文件 before/after SHA-256 绑定。build.mjs 只允许新建 outputRoot，禁止覆盖已封存归档或用户安装。
2. 运行源码中生成器前，阅读 startup-source/distribution/IMPLEMENTATION.md 并提供真实绝对路径配置；不要把示例占位路径直接执行。新包 repair-policy 只支持明确的旧图及入口哈希。
3. 当前测试为可审阅编写源，需要匹配的运行程序与隔离 fixtures。core / managed 测试涉及旧版和候选真实进程，部分依赖原工作区相对布局；SEP_OWNER_PATCH_ROOT、SEP_MANAGED_ENTRY、SEP_HOST_TEST_ENTRY 等参数只覆盖各测试实际实现的入口。没有验证从干净 Git 克隆开始的一条命令跑完所有测试。不要直接在现用程序目录加测试文件。
4. startup-source/preferred-host 提供合并生命周期与诊断层后的首选 TypeScript 及配套 .mjs；两个原始编写阶段单独保留；program-source 保留与封图逐字节对应的编译输出。区别 authored 与 exact-release-file，不能把手工修改输出冒充上游完整可重复构建。
5. 完成实装／修补／故障恢复测试后，运行 finalize-docs-source.mjs --candidate <新候选> --report <该图机器验收报告>；随后对最终 ZIP 完整读回、扫描隐私并生成新 SHA256SUMS。不得复用旧 pass 或仅凭本脚本运行成功宣称稳定版。

MIT 仅适用于映射原创内容；第三方许可、源码访问及原始声明保留。Office / LibreOffice 源码义务见相应材料。history/release-tools 中旧许可转换脚本只是历史记录，不能当作当前独立构建入口。

## 启动修订生成器补记

program-source 仍为最终封图的逐字节权威来源，非完整上游可重复二进制构建承诺。integrate-core.mjs 已纳入 managed/guardian-lifecycle-transform.mjs，生成 onSpawn、manual 与保守未知状态处理；ownership/apply-journal-gate.mjs 是后续独立日志治理阶段；诊断层 diagnostics/build-overlay.mjs 最后叠加安全诊断并保留 startHost 参数。执行顺序必须为 integrate-core → ownership/apply-journal-gate → 其余本轮明确阶段及 diagnostics；不得用早期中间产物覆盖已封定目录。managed/generator-consistency.test.mjs 和 managed/rpc-manual.test.mjs 提供生成一致性及真实 RPC 回归源码。生成器依赖匹配基线和原工作区布局，源码快照不提供“干净克隆一键跑完”的保证。

实际安装说明见 startup-source/REAL-INSTALLED-ACCEPTANCE.md。新增小修补包实测是外层交付报告的追加证据，不倒写先前测试统计。
