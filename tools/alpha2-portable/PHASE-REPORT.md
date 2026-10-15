# Alpha.2 Linux 基础适配阶段复核（2026-10-12）

最新受控 Profile 阶段见 [PROFILE.md](PROFILE.md)：60 个定义通过，真实 Linux 桌面两轮通过；完整 SEP 业务/受保护 Profile 仍 blocked。下文仅保留本基础阶段的原始结果。

已完成 Linux Alpha.2 的冻结依赖安装、基础运行回归和独立强隔离原型验证。**完整 Linux 受保护 Profile 仍 blocked，Linux 桌面和 macOS 运行仍 not_run，尚未达到跨平台发行条件。** Windows 日常保持 Alpha.2，未切换、未上传 GitHub。

|项目|本轮实际结果|
|---|---|
|固定程序输入|仓库 `94d15f6d`；官方 Alpha.2 `d7432673`；r6 派生 SEP `0.2.1-beta.3-alpha2-adapter.1`|
|冻结安装|pass；342 项直接依赖；815 条供应链检查；minimumReleaseAge 1440 分钟；ignore-scripts|
|真实 Loader、配置／账本只读、原生文件入口、压缩、P2 租约、Worker、身份与门禁|47 个定义，三轮各 46 pass / 1 fail；失败始终来自完整受保护 Profile 的 Windows 平台限制|
|强隔离原型|最终 7 个定义，三轮各 7 pass / 0 fail；没有跳过|
|本轮资源审计|pass；仅本代次 Node／沙箱命令行与测试自己的子进程，不能解释为全系统零句柄|
|日常 Windows|两个启动入口 SHA-256 与部署后记录一致，没有修改|
|公网更新同次正例|继续搁置|
|Linux 完整 Profile／桌面／MacOS／远端 CI|未完成，不用于本阶段通过声明|

核心首轮是 40 项现有测试（39 pass / 1 fail）加 7 项新 Linux 原语测试（7 pass）；后二轮为全部 47 项一起执行。原始日志中的 fail 保留，完整 Profile 的产品可用性记录为 blocked，未重写验收标准。

关键发现是 Linux flock 不阻止非合作方写入。用户明确选择“更强隔离，验证后再开放写入”。本轮没有删除 Windows-only guard，也没有冒充 Windows 句柄语义。使用发行版 Bubblewrap 构造源目录只读、私有工作目录可写的独立命名空间；结果尚不能发布回项目，也未挂入日常 SEP。

补测暴露原型工作目录预置硬链接的绕过：6 pass / 1 fail。已要求新建且为空的 0700 私有工作目录，最终三轮 7/7。旧红灯、初版 5/5、修复后三轮均保留并独立绑定哈希。更进一步的工作副本导入必须复制文件和验证身份，不能复用已有目录来绕过空目录限制。

程序 tarball SHA-256：`5dd125b1493c100acce355a69511ebcf5686b8a4bf440ab2a5cec3c7daeb16ff`。它仅是本轮固定测试包，不是公开安装候选。此前 Alpha.2 r2 包或旧平台日志不能替代本轮证据。

证据根：`D:\AIData\ProjectWork\DSH\alpha2-portable-20261012-r1`，其中 `linux-evidence-r2/RESULT.json` 为复核结果，原始日志、测试输入及安装 manifest/lock 一并保留。完整操作方代码和复现契约在仓库 `tools/alpha2-portable/`。`source-checkpoint.bundle` 保存阶段前源码；后续 SOURCE-CHECKPOINT.json 单独绑定阶段后本地提交和恢复包。

下一阶段依次推进：受控快照复制／候选清单 → 独立写权限域与受信任文件服务 → Shell/MCP/子代理沙箱接线 → 提交、恢复与并发外部更改的处置 → Linux 桌面全生命周期。只读沙箱不阻止宿主外部写者，因此没有用本轮测试推导出“可安全自动发布”。macOS 需要对应原生载具单独验证；本轮不上传 GitHub，所以没有运行 macOS CI。
