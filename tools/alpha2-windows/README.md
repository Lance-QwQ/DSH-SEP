# Windows Alpha.2 Full / Only 封装源码

固定版本：DSH `0.2.1-alpha.2`、SEP `0.2.1-beta.3-alpha2-adapter.1`，分发修订 `windows-package.2`。这是本地 Windows x64 安装包制作与验证工作，不会触发 GitHub 发布或日常切换。最终结果以 `CLOSEOUT.json` 和外部阶段目录中的原始回执为准。

目录分工：

- `build/`：复制并核对固定程序图、去除本机构建路径、重建程序描述符、核定 Only 的来源划分、装配和压缩。产物目录创建后不自动删除或覆盖。
- `installer/`、`installer.mjs`：Full / Only 的全新安装器，公开默认 Profile 转换，官方 npm 原字节审计及相关回归。安装器只读来源，拒绝已有目标，不迁移私人状态。
- `privacy/`：有界的内容扫描、精确例外、公用默认配置来源核验。扫描不能替代任意编码及全部二进制语义的隐私认证。
- `verification/`：最终 ZIP 解包、独立字节审核、实包安装及拒绝路径、随包运行时、两个 Host 并存及实际桌面入口验证。测试只使用新建空白资料。
- `README-PACKAGE.md`、`ONLY-SOURCE.md`：包内用法。`EXTRACTION.md` 为交付侧的短路径解压说明。

输出根固定为真实路径 `D:\AIData\ProjectWork\DSH\alpha2-windows-packages-20261015-r1`；较大的测试、安装、缓存和 ZIP 全在该目录下。原程序、日常库、Key、会话、用户插件配置不作为新安装输入。

## 构建输入与复现范围

本次装配从已经封存的 Alpha.2 r6 程序图、固定 Electron 44.7.0、此前公开支持运行时和经过检查的启动器源码派生。外部阶段目录的 `BASELINE.json`、`PROGRAM-COPY.json`、`PROGRAM-REDACTION.json`、`PROGRAM-SEALED.json`、`SUPPORT-COPY.json`、`SUPPORT-REDACTION.json`、`SUPPORT-PYC-OMISSION.json` 记录输入与派生关系。Only 的 4239 个原字节文件来自 311 个精确官方 npm 包的 SHA-512 SRI 与成员 SHA-256 核验；5 个适配文件保留在 payload。

本仓库的源代码与检查点支持审查和恢复本轮实现，**不单独构成从空机器重建全部历史依赖的证明**。复跑装配需要上述固定输入。代码含本轮固定 D: 实验路径，应先阅读脚本及输出契约，不要直接重跑已占用的创建型输出。

安装用户不需要这些构建输入：Full 直接从最终 ZIP 安装；Only 还需要满足包内官方来源契约。源目录、开发宿主或测试工具通过不能代替实际 ZIP 安装证据。

## 验证顺序

先核对 `ARCHIVES.json` 的完整 ZIP 摘要，再使用 `verification/install-archives.mjs` 的 schema-1 SPEC 进行全新目录解包、安装和运行时冒烟。随后将安装结果文件的 SHA-256 传给 `headless-probe.mjs`，再串行传给 `default-desktop-probe.mjs` 的 `full` / `sep` 两种输入。具体参数、作用域及期限见 `verification/README.md`。所有后续结果绑定前一步的输入字节。

Headless 诊断明确使用 `readCredential:false`；桌面验证通过原有 `--inspect-desktop` 观察选项运行真实入口，正常读取空 `.env`，不会注入假 Key。真实二次启动不带观察选项。程序化窗口隐藏、恢复及退出不等同于物理鼠标、托盘菜单或首次关闭提示的认证。

首次深路径解包失败、解包器长路径修正及补验均保留。一项未改变的 junction 夹具命令被 Windows 以 WinError 225 阻断，最新提取器回归按 30 通过 / 1 阻断记录；不能与历史 30 项绿色拼成当前 31/31。它与实际安装器的路径拒绝检查分别记账。

历史 `windows-package.1` 完成解包和安装器检查后，真实 Host 启动失败。原因是新建账本位于 `state/budget.json`，其父目录包含 `state/locks`，违反已有数据域不得重叠的规则。修订 2 将新安装账本移至 `state/budget/budget.json`，不修改已有账本或程序保护规则。原包、退出码 1 的失败样本和后续诊断均保留；交付须由修订 2 的全新 ZIP 安装及 Host/桌面结果支持，不能沿用旧包的启动结论。修订包和对应审计位于阶段目录的 `repaired-r2/`。

修订 2 的首次服务探针已启动两个真实 Host，但错误地将记忆服务的项目键与配置 UUID 比较，整体仍记为失败。记忆设置接口使用恢复权威的 `memoryKey`，并不使用其 `id`；后继探针按实际权威记录核对映射。失败后正常退出的事实与后继复跑通过分开保存，不修改产品以迎合测试。

下一次服务探针把项目保存开关误当作配置开关，失败样本同样保留。最终断言分别核对 `controls`、`configured`、`effective`，证实新装捕获实际关闭。静态复核还发现旧桌面健康 helper 适用于启用遥测的旧 Profile；新包的验证须明确检查三个必要服务活跃、两个公开配置中关闭的遥测模块停用，不启用这些模块来迎合旧 helper。

直接执行原 `start.ps1` 在本机被 Windows PowerShell 执行策略拒绝，仍按 `blocked` 记录，窗口恢复为 `not_run`。Node 入口和原 `start.vbs` 单独验证，不能抵消 PS1 阻断。原 VBS 含子进程级 `-ExecutionPolicy Bypass`，本轮没有新增绕过参数或修改系统策略；其异步后代没有独立逐个跟踪。入口用法见 `EXTRACTION.md`。

首次 Full 桌面探针在上述策略阻断后，失败清理仍连接 Inspector，等待退出达到截止后记录 `blocked`。后续独立 Guardian 日志链核对只证明该次 Host 正常退出，不改写当时的失败或为 Electron/启动器补造成功回执。探针修正为先断调试连接，再核验启动器退出和精确 PID／锁释放；新回执绑定各自运行，交付汇总另检查每轮 Host 的 generation、ready、退出码及 forced 字段。

GUI r2 的原回执保留，但最终独立复核发现其页面判据会把 `HARNESS / Loading plugins…` 启动画面误当作工作区就绪。它的窗口、二次启动和退出证据仍有对应日志，页面就绪结论不能引用为通过。后续须使用启动占位符消失与实际工作区控件的断言生成新回执，不能只修改旧报告文字或沿用 r2 的通过计数。

本轮不运行付费模型，不宣称所有插件逐项认证、任意新 DSH 兼容、完整公网安装或物理桌面认证。失败当时的资源状态与后续测试清理分开记录。最终 ZIP、报告、校验文件和本地 Git 恢复检查点均留在 D:。
