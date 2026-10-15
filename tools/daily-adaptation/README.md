# bundle.24 Windows 日常部署适配

> 2026-10-11 当前补充：本目录最初的“尚未切换”“私人附件尚未实际复制”属于部署准备阶段记录；本机已另行完成经确认的日常切换，历史报告保留原范围。本轮自动安装适配位于 [automatic-update](automatic-update/README.md)，仅在 D: 合成环境推进，没有切换日常程序，也没有推送 GitHub。其同宿主 schema 3 差量证据不等于任意新版 DSH 已可自动安装。

目标固定为 DSH `0.2.1-alpha.1`、SEP 核心 `0.2.1-beta.3-bundle.24`。本目录是独立的日常集成层，不改变已审查核心的默认 `entry-only/pending` 准入。候选已准备，尚未切换日常版，也未推送 GitHub。

## 已验证的范围

哈希绑定的冷启动选择、真实官方 Loader 激活、四种模式的压缩策略、两处已注册工作区的保护与记忆范围、实际 Agent 跨进程恢复、保留共享账本，以及受管宿主 RPC 写入与正常收尾，均有合成验证。日常组合接入设置、更新查询、恢复、点击、历史展开、视觉、SafeChange、TaskCheckpoint 和记忆保留工作器；保留其他插件配置。接线和结构检查不等于每个用户插件功能都经过运行认证。

程序图 schema 3 绑定全部常规文件和实际依赖解析；生产桌面入口仍为 `lib/main.js`。持久启动器绑定程序图、官方桌面描述符、冷启动选择及现有 Electron 完整载荷。Profile 位于独立可写目录，模型及插件设置不写入不可变程序树。现有 Electron 载荷仍依赖被保留的旧发布目录，不能提前清理该目录。

当前固定合并回归为 22 项。干净候选的真实 Electron 测试使用程序树之外的探针，验证实际渲染、关闭后后台保留、同窗口重开及正常退出；桌面与宿主退出码为 0、无强制清理，程序字节不变。探针预置首次提示并调用官方第二实例处理函数，不能证明真实托盘点击、首次原生提示、手动拖动或另一个实际可执行文件的重复启动。

私人会话仅作只读验证：19 个逻辑会话、9148 个事件、21 个源文件经实际 SEP 读取提供方与官方 `SessionStore.prepare` 重建，源字节不变。其中 9 个官方 `session/end-seed` 尾事件只生成于内存。此前直接按事件总数相等判断的 r1 失败记录保留为历史；不将其作为最终读取失败，也不删除记录。付费模型上的私人任务继续执行仍未验证。

## 旧附件与数据保留

`legacy-attachments.mjs` 是受信任、停写状态下的显式部署操作，不是模型工具或公开 RPC。只读计划对原附件及缓存逐文件绑定身份和哈希；仅允许所有链接均位于两个枚举域内的原生内部硬链接，外部链接拒绝。这不放宽 RAG 来源的硬链接限制。

复制在治理检查点及附件租约内进行，创建新的常规文件，不覆盖未知文件。原库保留用于回退，新副本属于受治理附件域，保留至显式停写清理；部分复制不会得到完成回执，失败现场保留并阻断切换。私人附件尚未实际复制，需在用户确认具体切换计划后执行。会话、记忆、消费及预留账本均不清零，导入也不刷新生命周期时间。

## 明确的范围限制

- 新版更新查询、过滤、版本识别与兼容清单已接线；旧安装器的 store/pNN 差量发布链尚未认证为适用于 alpha.1 的 schema 3 程序图。不得据此承诺下一次自动安装已经可用，也不得直接运行任意下载包。
- 用户插件、Windows MCP 的全部功能、真实付费模型、私人会话的付费接续未逐项认证。
- Linux/macOS 完整受保护 Profile 和桌面认证仍未完成；不得将其候选替换 Windows 日常程序。
- 不把单项目设置片段或本次日常组合的通过等同于任意宿主上的通用完整 Profile 认证。

## 复现与切换

所有新构建、安装和测试输出使用真实目录 `D:\AIData\ProjectWork\DSH\bundle24-daily-deployment-20261011`。在仓库根目录设置环境变量，使用 Node 24：

```powershell
$env:SEP_SOURCE_REPO = (Get-Location).Path
$env:SEP_DAILY_ADAPTER_SOURCE = Join-Path $env:SEP_SOURCE_REPO 'tools/daily-adaptation'
$env:SEP_BUNDLE_TEST_ROOT = 'D:\AIData\ProjectWork\DSH\bundle24-daily-deployment-20261011'
$env:SEP_OFFICIAL_HARNESS = Join-Path $env:SEP_BUNDLE_TEST_ROOT 'alpha1-runtime-r2'
$env:SEP_DAILY_FULL_HOST = $env:SEP_OFFICIAL_HARNESS
$env:SEP_DAILY_MANAGED_HOST = Join-Path $env:SEP_BUNDLE_TEST_ROOT 'alpha1-runtime-r14'
$env:SEP_DAILY_PRIMARY_RUNTIME = 'C:\Users\PUBLIC_USER\Documents\ChatGPT\DSH SYSTEM ENHANCEMENT PACKAGE\dsh-daily\runtime\primary-runtime'
node --test tools/daily-adaptation/tests/*.test.mjs
```

`build/` 中的构建调查脚本有固定官方来源和输出代次，执行前必须检查并显式设置 D: 输出根；拒绝复用已有代目录，不得删除历史目录绕过。`prepare-daily-candidate.mjs` 仅准备候选、绑定私人输入引用并制作无正文附件计划，不启动私人宿主、不切换入口。含本机路径和私库指纹的候选及报告只存本地，不属于公共发行包。

`tests/desktop-probe-bootstrap.mjs` 只供合成测试，不能成为生产入口。干净桌面测试应采用外置入口并验证程序字节不变。实际切换须先取得停写锁，重新核对候选、配置、数据代次和路径指纹。程序及配置发布、健康核验、提交记录可靠落盘全部成功后才能开放业务；健康通过而提交记录未落盘即崩溃时，重启仍保持维护，不能假定已提交。只有无业务新写入且删除依据可验证时才能恢复旧选择，不能恢复旧数据覆盖新业务。

只有具体指纹计划确认后才能执行日常切换。本阶段不发布 GitHub。

恢复或新克隆需要保留历史模板的原字节；使用 `git -c core.autocrlf=false clone <仓库或本地 bundle> <新目录>`，不修改用户全局 Git 设置。自动更新来源目录另有局部 `.gitattributes`，避免已捕获源码在默认 Windows 检出时被换行转换。
