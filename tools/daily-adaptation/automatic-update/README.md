# Windows alpha.1 自动安装链适配（本地隔离）

本层承接 `bundle.24` 的独立可写 Profile 和 schema 3 常规文件程序图。它适配现有 SEP 更新器，不改变已审查核心的默认 `entry-only/pending`，也没有安装到日常程序。暂不上传 GitHub。

2026-10-11 最终隔离结果：新增 21 项、原发布与过滤套件 105 项通过；另有 11 项按平台条件跳过，0 失败。最终包的自动链 11 个检查通过，随后更新后的实际 Electron 实例通过渲染、后台保留、官方重开处理函数及正常退出，未强制清理。自动 worker 内的启动采用真实 managed-host 接缝，后续桌面验证是补充证据；原生审阅交互仍未认证。合成目标版本 `0.2.1-beta.3-bundle.24.update.1` 不是对外发布版本。

## 当前范围

仅接受 Windows x64、DSH `0.2.1-alpha.1` 不变、依赖拓扑不变的 SEP 程序差量。真实来源转换、包内容、插件配置、账本和治理代次均受现有门禁约束。受控确认仍绑定具体计划、报告和程序图，自动准备不等于自动授权安装。

schema 2 `sep-materialized-delta` 元数据必须绑定 base/target 图哈希、宿主版本、原 SEP 和目标 SEP。schema 3 图按显式包路径验证所有常规文件及实际依赖解析，拒绝符号链接、多硬链接、未登记文件、大小写重复目录、跨界路径和包身份不符。只有已列明的 SEP/适配组件及日常适配层可变；第三方包即使嵌套在 SEP 目录内仍独立受保护。根 manifest 仅允许按目标图更新原有依赖版本，不接受新增依赖或脚本变化。

外置 Profile 只接受当前受支持的 JSON 表达（包括 JSON 内容的 `.yml` 文件），按原程序路径重定位并保留外部数据、用户插件及账本引用。未知文件或 YAML 可执行标签不会被忽略，准备直接拒绝。发布物的日常适配器必须预先由生产者转换为相对核心导入并绑定进图；安装器不在用户确认后改写下载代码。

工作目录和候选程序位于已安装程序的兄弟目录 `sep-update-work` / `sep-update-programs`。当前支持的基线位于真实 D: 路径；Electron userData 只保存小型控制记录。独立 Profile、冷启动选择、启动指针一并纳入计划。已有数据域及预算不作旧快照回写，不清零消费或预留。

沿用真实离线发布器、原生文件锁、P2 唯一提交决定、持久化写入代次和删除依据。健康通过但尚未提交时崩溃，保持停写并按原计划恢复；提交已落盘则恢复该提交，不重放安装。确认后输入变化永久作废该计划，即使后来把文件改回，也必须重新准备。文件占用导致回退也不能完成时保留维护门，释放后显式恢复。Windows 证据针对进程中断，不声称已经验证突然断电时目录项持久性。

## 验证分层

- `materialized-delta`：差量所有权、路径及 manifest 负例。
- `portable-adapter` / `origin`：生产者转换和来源链逐字节重放；新增、复制及未改旧文件均核对哈希。
- `materialized-publication`：小型 schema 3 图，但使用真实 P2、恢复控制器和原生文件发布；覆盖真实进程退出、候选替换及真实 Windows 文件占用。这里的健康回执明确只是布局夹具，不能代表宿主运行认证。
- `automatic-queue`：真实后台队列等待、重复拒绝和取消，不下载、不运行模型。
- `automatic-chain`：完整合成安装包、真实 alpha.1 宿主、受认证设置路由、精确确认、准入、独立发布子进程、P2 提交和生产重启探针。下载使用固定档案接缝，确认由脚本签署；启动接缝使用真实 managed launcher，未冒充 Electron 原生交互。
- 旧更新器回归：通过 resolver 只重定位原单仓库测试导入到真实已安装核心和 recovery 模块；不替换被测 P2/发布实现。原套件自身的依赖替身范围保持不变。平台跳过与通过分开记录。现行过滤实现从受程序图绑定的只读基线捕获；历史设置测试夹具补齐了生产版本识别所要求的 manifest.name，转换单独记入来源链，未放宽生产校验。

此前失败运行保留，包括健康夹具缺少官方 bundles、空 sources、预算目录与治理根重叠，以及来源清单漏记 import 插入。包内旧模板覆盖现行过滤 API 的回归已经修复。另一次自动发布因并行回归使用同一程序根而触发 SEP_PLAN_APP_RUNNING；原事务按原计划恢复旧选择，不放宽停写门禁，最终发布链串行执行。最终结果应引用本轮封存索引，不引用这些历史失败作为最终结论，也不删除失败日志。

## 复现

必须设置真实 D: 输出根，使用 Node 24 和 PowerShell。不要覆盖已有代目录。`build-update-runtime.mjs` 接收仓库路径和新的输出目录；其输出无需执行第三方下载脚本。

```powershell
$env:SEP_SOURCE_REPO = (Get-Location).Path
$env:SEP_BUNDLE_TEST_ROOT = 'D:\AIData\ProjectWork\DSH\automatic-update-local-replay'
$env:SEP_DAILY_MANAGED_HOST = '<真实不可变 alpha.1 基线程序目录>'
$env:SEP_OFFICIAL_HARNESS = $env:SEP_DAILY_MANAGED_HOST
$env:SEP_DAILY_ADAPTER_SOURCE = Join-Path $env:SEP_SOURCE_REPO 'tools/daily-adaptation'
$env:SEP_DAILY_PNPM = '<已保留 pnpm.cjs 的绝对路径>'
$env:SEP_DAILY_ELECTRON_PAYLOAD = '<已保留 Electron 完整载荷目录>'
$env:SEP_UPDATE_RUNTIME = Join-Path $env:SEP_BUNDLE_TEST_ROOT 'runtime-r1'
$env:TEMP = Join-Path $env:SEP_BUNDLE_TEST_ROOT 'temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:SEP_BUNDLE_TEST_ROOT,$env:TEMP
$src = Join-Path $env:SEP_SOURCE_REPO 'tools/daily-adaptation/automatic-update'
node (Join-Path $src 'build-update-runtime.mjs') $env:SEP_SOURCE_REPO $env:SEP_UPDATE_RUNTIME
```

独立运行时需要能解析 `semver` 和 `yauzl`。本轮只在外置测试运行时中使用指向不可变基线 `node_modules` 的测试 junction；`build-fixture.mjs` 排除它，实际程序包为全常规文件，不依赖该 junction。基线必须是已经包含受控日常组合与固定官方描述符的程序，不是任意 npm DSH。

```powershell
New-Item -ItemType Junction -Path (Join-Path $env:SEP_UPDATE_RUNTIME 'node_modules') -Target (Join-Path $env:SEP_DAILY_MANAGED_HOST 'node_modules')
node --test @(Get-ChildItem -LiteralPath (Join-Path $src 'tests') -Filter '*.test.mjs').FullName
node (Join-Path $src 'tests/build-fixture.mjs') r1
$env:SEP_UPDATE_FIXTURE = Join-Path $env:SEP_BUNDLE_TEST_ROOT 'UPDATE-FIXTURE-r1.json'
$env:SEP_UPDATE_RUNTIME = Join-Path $env:SEP_BUNDLE_TEST_ROOT 'base-program-r1/node_modules/@deepseek-ai/dsh-desktop/lib/sep-update'
node (Join-Path $src 'tests/automatic-chain.mjs') r1
```

旧回归还需设置 `SEP_TEST_TMP=$env:TEMP`、`SEP_TEST_YAUZL` 为实际 `yauzl/index.js`，以及 `NODE_OPTIONS=--import=<tests/legacy-resolver.mjs 的 file: URL>`；URL 中空格必须编码。用 `node --test` 执行已生成运行时的 `tests/*.test.mjs`，子进程继承同一 resolver。Windows 原生步骤不能以 POSIX 代跑结果替代。

## 尚未认证

公共 HTTPS 分发和完整原生更新审阅交互、任意 DSH 跨版本升级、依赖拓扑迁移、Linux/macOS 自动安装，以及私人插件逐项运行仍未认证。不同版本或布局必须拒绝并等待独立适配包。日常部署仍须退出后台、生成新的具体指纹计划并由用户确认；本轮隔离成功不替代这项确认。
