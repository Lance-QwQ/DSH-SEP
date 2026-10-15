> bundle.24 审查修复候选。默认包入口仍为 Cordis 的 pending 准入，不自动开启业务。显式 settings-runtime/native-settings-installation 与旧 business-runtime 是不同入口：旧入口只接受 capture:false；设置组合默认 capture:false，可在绑定项目与精确计划后启用受同一 Profile 账本保护的捕获、按需历史及显式授权视觉。配置与限制以 contracts/settings-installation.json / business-runtime.json 分别为准。
>
> 写入保护拒绝 null/空/无版本覆盖回执；仅 createIfAbsent 可不带观察版本，仍由原生提供方拒绝覆盖已有文件。评测入口/config 必须是 /opt/dsh-sep-eval/ 内无空段、点段、反斜杠和控制字符的规范路径；这是词法约束，受信任 WSL 文件部署与完整性校验仍是独立前提。评测收尾有界返回 blocked，不强制杀后端；保持根租约，修复或实际退出后显式重试 close。初始化状态仅保留错误码/类型，不返回正文或路径。
>
> Windows 合成范围有定向回归；Linux/macOS 完整受保护运行、完整桌面退出、公共 HTTPS 安装与远端 CI 仍未认证。本轮不发布、不部署。以下内容保留其历史时点，不代表本轮扩大支持。

> bundle.22 / 第3步当前范围：共享记忆捕获、同项目/会话历史、上下文、评测后端与点击消费者已接入显式受控根；图片采用独立原生附件域、明确上传授权与离线计划清理。默认 pending，完整 Profile blocked；当前浏览器收尾失败保留，后续完整 UI/GUI安装/三平台/最终包未认证。见 [剩余消费者与附件治理](../docs/BUNDLE-REMAINING-CONSUMERS.md)。以下为历史阶段原文。

> bundle.21 / 第2步补充：提供 `dsh-sep-bundle/application-shutdown` 可信专用宿主退出桥。调用者须明确 `dedicatedHost: true`，提供本宿主的实际 `dispose`、`forceExit`、`complete` 和官方 `createProcessShutdown`。先同步撤销根准入，再等待真实关闭与整树释放；默认进程截止5000ms。截止或重复中断为 forced/blocked，不能用退出码0推断已正常清理。保留账本预留、未决业务意图；重启先验证所有者，未决事务继续拒绝业务。8项隔离进程回归以700ms缩短截止，未认证桌面IPC/菜单接线或所有原生后代。完整Profile/default pending 状态不变。以下历史原字节保留。

## bundle.20 初始化失败、关闭与明确重挂载（隔离候选）

受控根在任何异步初始化之前发布恢复控制；可信启动监督器使用 `ctx.get('sepControlledInstallation', false)` 取得仍处于 Cordis LOADING 状态的控制。普通业务保持严格发现并受 phase/计划门禁限制。初始化失败且实际收尾尚未完成时返回 blocked，保留租约和可重试 close；whenClosed 只表示真实释放。

关闭归属于一次根安装实例。宿主依赖刷新、重新执行同一根或替换内部 Runtime 不能重新开放；明确 dispose 后创建新的根实例允许重挂载。同名 Loader Entry 会被复用，不能把它作为永久禁用标记。注册前拒绝正在初始化的外来提供方，注册异常也进入有界回滚。

bundle.19 已补验原生浏览器自动激活、真实 SettingsRoot 中三个 SEP 页面、设置保存/刷新/重连与撤回；使用测试自有最外层设置席位和空会话载具，并非完整 DSH 主界面、HMR 通知传输或 GUI 仓库链接安装认证。以下 bundle.18 及更早说明为历史。默认入口仍 pending，完整 Profile 仍 blocked；不部署、不发布。

## bundle.18 原生设置发现与真实 HTTP 认证（隔离候选）

新增显式入口 `dsh-sep-bundle/native-settings-installation`。受信任宿主必须通过官方 Loader 挂载其绝对文件 URL；直接 ctx.plugin 挂载会在取得存储租约前拒绝。该入口在内存专属子树挂载原字节设置插件，让官方 ClientModuleRegistry 自动发现并提供原页面资源。默认组合入口仍 pending，完整业务准入仍 blocked。

本入口要求固定官方 DSH 0.2.1-alpha.1、Loader 1.0.6-alpha.1，以及 controlled-installation 的全部受控前提；专用项目宿主、Agent 取消范围与最终 tools/result 事件依赖继续适用。内存子条目不写用户 YAML；外层 Loader 条目的配置持久化由可信调用方负责。review 返回的新根 planHash 必须精确授权，旧入口或内层 runtimeHash 不能代用。close 返回有界回执，blocked 时不推定收尾完成；外国替换子树/子组保留，只有原所有权恢复后才能重试。UI 子插件必须实际 active，存在失败条目或资源文件不算就绪。关闭完成后页面发现和设置路由撤销，旧控制引用仍拒绝。

真实 HTTP 试验使用官方 Connection、WebServer、Credentials-local 和 BrowserAuth，在 D 盘空白凭据库、空 launchEnvironment 与合成模型下执行：索引 token 只换取签名 cookie，不能用于 API；未认证、错误 Host/Origin、篡改 cookie、非法/超限信封拒绝；授权金额设置保持原消费并拒绝旧修订。该证据不代表已验证完整原生浏览器模块系统自动激活、全应用有界退出或公开仓库链接一键安装，后者继续下一阶段。

用法：可信调用方解析 `dsh-sep-bundle/native-settings-installation` 到文件 URL，用 `ctx.loader.create({id, name: fileUrl, config: trustedConfig})` 挂载，再等待 loader.await、核查 sepControlledInstallation.status() 为 ready，review 并确认本根计划后 activate。卸载前 close、确认 pass 并等待 whenClosed，然后卸载外层 Fiber；blocked 时保留 owner 并处理具体原因。不要把 API/query token 写入日志或仓库。

证据见仓库 docs/BUNDLE-NATIVE-SETTINGS.md、docs/BUNDLE-NATIVE-SETTINGS-VERIFICATION.json；复现见 tools/bundle-install/tests/NATIVE-SETTINGS-REPRODUCTION.md。根 peer 现为34项：历史33项范围不变，新增精确 optional Loader；历史模块捕获清单和子包 manifest 保持原字节。以下 bundle.17 及更早段落保留为历史。

## bundle.17 固定宿主依赖声明（隔离候选）

根包的 33 项 peer 现在精确对应固定 DSH `0.2.1-alpha.1` 合成宿主：21 项声明有变化，12 项保留。`dsh-invariants` 实际仍为 `0.2.0-rc.2`；不按宿主大版本强行改名。此修正只处理 dependency-resolution，不等于完整运行兼容。历史 `contracts/modules.json` 与十个子包 manifest 原字节保留；以下历史段落的“原 rc.2 peer 限制保留”描述仅适用于 bundle.16 及之前。

适配器是仓库 `tools/bundle-install/adapt-host-dependencies.mjs` 的纯函数 `adaptHostDependencies(manifest)`。在原模块捕获步骤之后应用；只接受已审阅的源/目标声明，缺项、新增 peer、未知范围或可选性变化均拒绝。产出的 root manifest 与 `contracts/host-dependencies.json` 一起打包。重新运行旧模块捕获器会还原历史声明，必须再次应用此步骤并核验，不能只改版本字符串。

精确匹配与包管理器检查均需针对实际安装图执行；optional 保持原状，缺少 optional peer 不能解释为相应功能可用。默认入口仍 pending，完整业务激活仍 blocked。原生客户端自动发现、部署 BrowserAuth、全部消费者及跨平台认证另行推进。完整证据见仓库 `docs/BUNDLE-HOST-DEPENDENCIES.md` 和 `docs/BUNDLE-HOST-DEPENDENCIES-VERIFICATION.json`。

以下保留 bundle.16 及更早阶段原文。

## bundle.16 审查修正（隔离候选）

`controlled-installation` 的 UI 挂载失败若未能在 `runtime.shutdownMs` 内完成清理，会返回保留资源的 `mount-failed-blocked` 控制 owner，代码为 `SEP_INSTALLATION_MOUNT_FAILED`。受信任调用方必须检查 `sepControlledInstallation.status().phase`；Fiber 挂载返回不等于设置或业务已就绪。只能在 `ready` 时 review，再用精确计划 activate。阻塞 owner 拒绝 review/activate/stream，允许 status/close/whenClosed；先处理底层原因，再重试 close，等待 whenClosed、卸载旧 Fiber 后，才可重新挂载。不会自动恢复业务。若清理已完成，仍抛出原挂载错误。内层运行时初始化失败和整个应用退出的独立截止仍未认证。

此入口要求专用的受控项目宿主。close 会取消宿主中 cwd 为所选项目根或其后代的所有 Agent，包括其他组合创建的会话；不能无条件挂入共享项目宿主。工具 drain 依赖固定官方 Agent-loop/Tools 调度器最终发布 tools/result（含失败和取消）；缺失事件时保持 blocked、令牌和租约，不推定工作完成。

设置路由只验证载具类型、协议和请求形状。部署的 Connection 载具必须先完成 Host/Origin 与 BrowserAuth 或已认证桌面管道准入；测试中的 createSharedFetchHandler 不等于已认证的网络服务。完整 BrowserAuth、完整 GUI 仓库链接安装及默认 bundle 准入仍未通过。

审查响应与复现命令：仓库 `docs/BUNDLE15-REVIEW-RESPONSE.md`、`docs/BUNDLE-SETTINGS-REVIEW.md`、`tools/bundle-install/tests/SETTINGS-REPRODUCTION.md`。bundle.15 的封存报告、索引和失败样本保留。

# bundle.15 当前范围与显式入口

默认入口仍是 Cordis 准入插件 `dsh-sep-bundle`，只显示 pending；不会自动启用完整 SEP。新的受控冷启动入口是 `dsh-sep-bundle/controlled-installation`，底层设置运行时是 `dsh-sep-bundle/settings-runtime`。二者与默认入口不同，只有受信任宿主可以在前置服务已就绪、冲突的原生文件/Session 提供方已受控退役后显式挂载。原 rc.2 peer 限制保留；固定 alpha.1 合成试验通过不能解释为完整包兼容。

```javascript
import * as ControlledInstallation from 'dsh-sep-bundle/controlled-installation';
// trustedConfig is explicit host-owned configuration, never a model tool argument.
const fiber = ctx.plugin(ControlledInstallation, trustedConfig);
await fiber;
const installation = ctx.get('sepControlledInstallation');
const review = await installation.review();
// Trusted caller reviews this exact plan before authorizing activation.
await installation.activate({ planHash: review.planHash });
const stopped = await installation.close();
// A blocked receipt retains resources. Do not remove prerequisites or declare exit.
if (stopped.status === 'pass') await fiber.dispose();
```

`trustedConfig` 形状为 `{runtime, ui}`。runtime 沿用 `business-runtime` 配置：`profile.selection` 绑定已登记项目、sessions/memory/locks/backups 根、既有 budgetPath 和凭据引用名；`profile.recovery` 明确备份限额；`p1` 绑定同一个既有 V3 账本且 initialSpentCny 为0（不是将已消费清零）；`business` 提供项目相对 sources，capture 只接受 false，recall 默认true；`compaction.nativeEntryId` 指向固定官方原生压缩行；shutdownMs 默认5000，可设100–60000。ui 仅接受 enabled:true、requestTimeoutMs 1000–300000（默认120000）。根审阅绑定 runtimeHash 和 UI 配置；不能用内层哈希代替根计划。

运行时只向本地原生设置路由暴露 `suiteEnhancements.memorySettings` 和 `budgetSettings`。两者必须在 activate 后调用；旧引用在 close 后拒绝。记忆开关保存与实际生效状态分别展示：保存 capture:true 也不会绕过该片段的付费捕获关闭限制。预算分别显示共享总账、单轮限额和单会话累计限额，修改设置不清零消费或预留。接口不是 Agent 工具。

前端仍使用包内 `modules/ui-settings-memory/lib/client.js` 的原工厂。受信任宿主还须通过其原生客户端加载器装载该工厂；本轮在独占无界面浏览器中验证工厂、React18、控件交互与真实后端路由，slot/locale/RPC 接缝为测试夹具。本入口不宣称已完成原生客户端工厂自动发现、完整 DSH 桌面/BrowserAuth 或远端 Git URL 一键安装。评估设置 section 会显示不可用；本片段尚未接入付费更新评估。

close 先撤销准入，再等待启用流程与已接收操作；截止未完成则 blocked。`whenClosed()` 只在实际收尾后完成，外来原生行变更会阻断恢复，受控修正后需再次 close。Fiber 卸载等待真实收尾，没有整个应用有界停机保证。不修改 YAML、不首次纳管私人旧库、不解析密钥、不热替换未知提供方。本轮不部署日常版或发布 GitHub。

本包内契约见 `contracts/settings-installation.json`。仓库详细证据见 `docs/BUNDLE-SETTINGS-INSTALLATION.md` 和 `docs/BUNDLE-SETTINGS-VERIFICATION.json`。

## 历史说明（bundle.14 及更早）

以下“当前”“尚未”均为对应历史阶段的原记录；以本页最前的 bundle.15 范围为准。

> 当前补充：bundle.15 已验证显式受控冷启动根入口、记忆/预算设置桥接和原设置工厂的隔离浏览器读写。默认仓库准入仍 pending，完整阶段四仍 blocked。实际 Loader 启停与有界 blocked 回执已验证；不包含热替换、完整桌面安装、BrowserAuth、付费提取、媒体和私人资料。详见 [设置与受控根入口报告](../docs/BUNDLE-SETTINGS-INSTALLATION.md)。

当前本地候选：bundle.14。显式 `dsh-sep-bundle/business-runtime` 与契约 `bundle/contracts/business-runtime.json` 接入共享 P2 的 RAG、分层记忆和本地自动召回；需冷启动审阅/确认，捕获开关只接受 false。文档删除使用独立 P2 依据，归档按需；旧库迁移、付费捕获/媒体、完整设置页和根业务激活未验收。根默认入口仍只做准入。关闭超时报告 blocked，实际收尾前保留资源。日常版/GitHub 未变更。旧说明保留如下。

当前本地候选：bundle.13。新增显式 `dsh-sep-bundle/p1-runtime`，契约见 `bundle/contracts/p1-runtime.json`。它是受控冷启动 P1 片段，需复用既有治理与 V3 账本并确认本次审阅哈希；根默认入口仍只做准入，不会自动启用完整 SEP。`close()` 超时返回 blocked 并保留资源，Fiber 卸载等待实际收尾；完整业务/前端/跨平台认证尚未完成。旧阶段说明保留如下。

# DSH SEP 组合包候选：准入、模块与通用配置

当前本地封装候选为 `dsh-sep-bundle@0.2.1-beta.3-bundle.10`，尚未发布或部署。当前公开版本仍是 Windows SEP 0.2.1-beta.2 的 Full/Only 安装包。

默认入口是 `bundle/lib/index.js` 的 Cordis 准入插件。根清单声明 `dsh.bundle`，补丁只插入 `sep-bundle-installation`。状态保持 `pending`、`businessEnabled: false`，原因 `SEP_BUNDLE_ADAPTATION_PENDING`。配置 `enabled: true` 只记录意图，不绕过宿主适配门禁；不加载业务、关闭原生压缩或改写宿主文件。

## 通用配置入口

`config/default.json` 为通用模板，`config/schema.json` 为 JSON Schema。准入插件的配置参数通过 `dsh-sep-bundle/configuration` 导出的 `normalizeBundleConfig(input)` 校验；未知字段、字符串金额、无效金额与超过共享上限的单轮额度被拒绝。此 JSON Schema 尚未映射为原生设置页面控件，真实宿主绑定属于下一阶段。

默认共享上限 100 元，单会话默认上限 100 元，单轮上限 5 元，分别控制不同范围。记忆检索默认开启、付费自动捕获默认关闭；业务总开关默认关闭。压缩采用 `inherit-native`，沿用用户既有原生参数，不携带本机个人调优值。

模板不含绝对路径、项目 ID、密钥值或重置消费选项。项目必须由宿主已登记的恢复权威提供；存储、账本、凭据引用、Python/MCP/可信后端由后续宿主适配明确绑定。缺少这些接口不能降级为无保护业务。

```javascript
import { normalizeBundleConfig } from 'dsh-sep-bundle/configuration';
import { reviewExistingBudget } from 'dsh-sep-bundle/configuration-budget';

const intent = normalizeBundleConfig({ budget: { sessionDefaultLimitCny: 50 } });
// existingLedgerBytes 必须由受控读取提供；审阅函数自身没有路径参数或磁盘写入。
const review = reviewExistingBudget(existingLedgerBytes, intent);
```

`reviewExistingBudget` 返回原账本版本、哈希、汇总金额与既有额度，不返回消息正文、会话 ID 或收据内容。预留、未知结果和已核准更正按现有账本规则计入。配置默认值不覆盖既有共享额度、会话默认及单独额度；不会清零已消费、释放预留或迁移旧账本。既有账本缺失、损坏或超过该审阅入口的 16 MiB 输入界限时拒绝审阅，不伪造新余额。

真实额度修改继续通过带预期修订号的人工设置服务。没有单独额度的会话跟随账本当前默认值，因此不把“更改默认值”描述成只作用于未来新会话。阶段三的审阅入口本身不执行这种修改。首次建立新受控库的流程与私人旧库纳管继续遵守后续宿主门禁。

## 预构建内容与许可

`modules/` 含十个 SEP 组件的 JS、Worker、Python 辅助文件、前端产物、类型与许可。`contracts/modules.json` 绑定原发布程序图与当前文件哈希。两处私有包导入改为相对导入；另外仅清理前端工厂产物的三处 CSS 区域构建路径注释，非注释字节和行数保留。task-checkpoint 的两份缺失许可文本已补齐。

六个第三方直接依赖固定版本并由包管理器安装。DSH、Cordis、React 接口列为 optional peer，避免另装宿主；optional 不豁免必需接口。组件原 rc.2 版本要求尚未被新宿主认证。

不含安装时构建脚本，不依赖开发源码、旧缓存或手工依赖链接。依赖仍需从 npm 下载，本包不是完全离线包。前端工厂产物保留注册 ID，浏览器接入尚待宿主适配。

`trusted-evaluation-entry/entry.mjs` 的底层 `Entry` 不在根入口自动启动。Python、可信后端/容器与 Windows MCP 是显式外部环境，本包不内置这些完整运行环境。OpenClaw 上游 engine/plugin/CLI 及其辅助源码仅为参考，不被活跃 DSH 模块导入，不是可调用的业务入口。

## 当前边界

首个目标为 Windows x64，Node.js 24 或更新。固定检查覆盖合成解析、选用组件的独立运行、通用配置、只读账本审阅和准入状态；不代表完整宿主、模型对话、真实桌面、可信后端或远端 GitHub URL 实装通过。

剩余阶段为宿主适配、官方 GUI 仓库链接安装与生命周期回归、最终分发复核。阶段记录和固定标准见仓库 `docs/BUNDLE-INSTALL-PROGRESS.md`。未完成前不能把本候选当作完整 SEP 使用。

## 阶段四：bundle.4 历史只读 V4 审阅范围

`dsh-sep-bundle/session-v4-review` 导出 `reviewSepV4Session(physicalHeader, physicalRows)`。调用方明确提供 V4 物理头和事件行；返回保留正文的深冻结审阅产物与哈希，故该结果应在受控审阅范围内保存，不能当成脱敏诊断自动上传。函数不执行任何工具、模型、磁盘写入或迁移。最多 100,000 行、16 MiB UTF-8 JSON；不支持旧代次，带继承前缀且含 SEP 扩展的会话也暂时拒绝，包括扩展仅出现在本地后缀的情况。

它增加两种已分类的 SEP 事件解释，继续调用官方 V4 头、关系、消息、图片投影与 Session 校验，并校验任务修订、必需性和本会话归属。未知必需事件仍拒绝。错误只输出固定代码；成功产物保留调用方本来提交的正文。

```javascript
import { reviewSepV4Session } from 'dsh-sep-bundle/session-v4-review';
const reviewed = reviewSepV4Session(controlledPhysicalHeader, controlledPhysicalRows);
// reviewed.persisted === false；不要将其当成已保存或已恢复业务。
```

本入口已在官方 0.2.1-alpha.1 实际发布组件上验证，但尚未成为实时 JSONL 保存/恢复服务。官方恢复器仍拒绝未适配的必需 SEP 任务事件；原生文件系统尚无 SEP 持久恢复保护。原有 rc.2 peer 要求保留，alpha.1 试验安装的 peer 警告也保留；版本解析成功不等于业务兼容认证。原生 Connection 的设置路由与预算服务仅完成进程内合成验证，未验证完整浏览器认证、前端工厂或真实 GUI。

完整宿主适配仍未通过。没有自动替换官方文件、停用原生压缩、改变日常版或发布 GitHub。准备的下一步工作清单见 `docs/BUNDLE-HOST-ADAPTATION.md`；它不是可直接执行的部署计划。

## 显式实时 Session 适配器

`dsh-sep-bundle/session-persistence` 的默认导出是 Cordis `SepSessionPersistence` 提供方，配置入口沿用原生 `root`（显式提供，沿用原生一次性目录解析）与 `compression`（none/zstd）。它仅认证官方 0.2.1-alpha.1 的所述 Windows 合成范围，加载前校验关键宿主版本；不能与已有 SessionPersistence 提供方叠装。根组合包不会自动挂载它，业务仍 pending，受控 Profile 替换及私人根绑定尚待后续。

它使用单独封装的官方 JSONL 衍生组件，保留原生句柄、锁、同步和不可覆盖的代次发布；只将两类 SEP 事件交给精确的本地语义校验。写入前校验完整候选；读取含 SEP 的继承日志时，核对同一存储中的原父前缀，保留祖先任务身份，拒绝把父任务改绑为子任务。父代次须仍可读取、cwd 相同，祖先最多 64 层；缺失、改动、循环或跨项目拒绝。取消读取继续传递原 AbortSignal 和取消原因。

当前 V4 任务及恢复链接无需把必需任务标成 ignorable。V0–V3 含 SEP 的日志仍拒绝并保留原字节；已有纯迁移审阅入口不能冒充实时迁移。普通 V3 的只读不发布、写开旁置 V4 已以一个空日志固定实例验证，不代表所有历史迁移。Worker 仍使用原生词汇，只为上述原生历史实例服务；已修正其搬移后的版本元数据引用。

`session-v4-review` 仍是独立纯审阅 API，没有目录中的父代次证据，所以继续拒绝含继承前缀的 SEP 数据；它与上述有实际父证据的实时提供方范围不同。完整 Agent 任务执行/恢复、热替换、私库纳管、长日志吞吐和 GUI 尚未认证。完整前缀复核增加本地读/解析成本，不产生模型 token；本适配器不发起模型、工具或外部后台任务。

## 显式文件保护与本地恢复权威核心

`dsh-sep-bundle/recovery-authority` 是显式配置 controlRoot 的 Cordis 插件；项目仅通过受信任本地流程 registerProject 登记。它不自动扫描或纳管私人目录，不启动 HTTP/后台进程。`dsh-sep-bundle/file-protection` 默认导出受保护文件提供方，显式选择 cwd、projectId 和 recovery 的独立目录/文件字节/总字节/条目数/保留期限。它与已有 ctx.fs 提供方不能叠装，根入口不自动启用。

首个范围是 Windows x64、本地 NTFS、普通单硬链接文件与同盘独立备份目录；重解析点、流、其它卷/平台不能无保护降级。复用 Beta.2 图绑定的受保护派生引擎，没有改写官方 alpha.1 的默认 fs-local。关键宿主版本仍精确检查。chokidar 4.0.3 和 koffi 3.1.1 是显式宿主 peer。

当前验证了真实写/编辑拒绝、移动、removeFile 删除和 restoreMutation，持久原文件副本、配额、冲突恢复、文件/祖先句柄占用、发布前中断证据，以及项目和写入记录的新进程恢复。受管变更、维护停写和重绑定共用本地准入队列；提供方卸载拒绝新变更并等待已接收的本地操作。异常 prepared 副本保留供核对，不自动宣称恢复成功，也不会因正常拒绝守卫而新增备份。元数据检查仍可用于维护诊断。前镜像含用户正文，须使用受控私人备份位置；未解决/最新恢复记录不以容量压力自动删除。

bundle.6 历史结论：原生五段 FsVersion 语义保留；本机实测同长度快速覆写可能不改变版本。当时版本变更拒绝已验证，严格正文观察保护尚未完成；当前补充见下一节。不能用该核心子集冒充完整文件保护、工具消费者/Profile 组合、私库纳管、全应用有界收尾或 GUI 验收。完整阶段四及业务入口仍 blocked/pending，普通 Shell 的保障范围不扩大。

## bundle.7：严格正文观察核心

显式受保护文件提供方的 readText、readBytes、完整消费的 streamText 现在以真实 Windows 文件与祖先句柄读取有界完整快照，只在成功后保留原始字节的 SHA-256 凭据。原生五段 FsVersion 不增加字段，RAG 的来源身份格式和业务组件原代码保持；原生默认文件提供方未修改。仅 stat、字节窗口、失败读取或提前停止流不会建立完整观察。

带 expected.version 的 writeText/editText/moveFile/removeFile，在原文件和祖先已持有的写预检中重新验证凭据。缺少观察返回 FS_NOT_OBSERVED；同元数据但正文不同返回 FS_STALE_CONTENT；同版本先后观察到不同正文则返回 FS_OBSERVATION_AMBIGUOUS，保留歧义而不由较新读取覆盖旧凭据。上述拒绝发生在新增持久记录/正文前镜像之前。恢复仍用原来的已提交哈希/版本与前镜像校验。

观察仅存摘要，不持久化读取正文。observationMaxEntries 默认 1024，必须为正安全整数；每个路径/版本占一项，无自动淘汰，满后完整读取拒绝为 FS_OBSERVATION_LIMIT。卸载排空已接收读取/变更后清空观察，新提供方须重新完整读取。完整正文读取上限是显式 recovery.maxFileBytes；readBytes 还受调用方 maxBytes 限制。streamText 使用该有界快照再交付文本，不承诺任意大文件的常量内存流。文本继续拒绝非法 UTF-8/二进制样本，保留 CRLF；原始字节读取可用于二进制保护。

直接调用且不带版本守卫的变更仍沿用原生显式无条件语义，并具有受控前镜像；它不获得正文陈旧检测承诺。模型工具消费者后续必须正确传递观察/守卫，不能用此 API 绕过消费者的未读拒绝策略。普通 Shell 保留，完整工具、Sandbox/Profile、私人环境和 GUI 验收仍待后续。根业务仍 pending，完整阶段四 blocked。详见 docs/BUNDLE-CONTENT-OBSERVATION.md。

## bundle.8：显式标准文本文件工具组合

`dsh-sep-bundle/protected-file-tools` 是一个单独的 Cordis 插件模块。仅用于已准备的受控 Profile 文件工具片段，不自动替换已有 fs 或同名工具，也不等于整套 SEP 业务启用。先由宿主组合 tools/systemPrompt/recoveryHost/sandboxPolicy，并通过受信任流程登记项目；再显式加载本模块。配置为 `{ files: { cwd, projectId, recovery: { root, maxFileBytes, maxTotalBytes, maxEntries, retentionMs } }, tools: { /* 可省略，沿用官方读窗口默认值 */ } }`。所有路径和项目身份须由本地用户选择，不能复制测试配置；目前不提供生产私库自动替换向导。

模块依次挂载自有受保护提供方、官方观察策略和官方 read/write/edit 工具。实际 Session 的观察隔离与 expected 守卫保留，提供方向原生工具声明 Sandbox 能力；只读、会话模式和拒绝标记有效。即使原生模式更宽，写入仍限制在所选受保护项目。需要升级权限时沿用原生用户授权服务，不自行批准。无原生 Sandbox 时拒绝；观察策略卸载后不退化为无条件写入。已有提供方或同名工具则明确拒绝，并保留用户组件。

成功 write/edit 在发布且恢复 journal 可靠落盘后、原生文件/祖先句柄释放前，使用实际已提交正文建立摘要凭据；连续 create→edit→overwrite 不需无意义地重读。容量不足不把已提交操作改成失败，而是省略新凭据；下一次带版本变更仍拒绝为 FS_NOT_OBSERVED，新读取可能为 FS_OBSERVATION_LIMIT。不能自动淘汰旧歧义或重置项目记录。独立 file-protection 的显式无版本 API 语义保持，严格消费者要求守卫。

已验证失败激活回滚、卸载与原生 Sandbox 保留，以及官方 boot/Loader 的一个明确配置项；原生非默认压缩参数和合成账本原字节保留。尚未验证 read_image/附件、其他文件工具、完整 Profile 热替换、私人根、真实模型回合、全应用收尾截止或 GUI。根 cordis.patch 仍只加载准入入口，业务 pending；完整阶段四 blocked。详见 docs/BUNDLE-FILE-CONSUMERS.md。

## bundle.9：显式项目、Session、存储与账本绑定审阅

`dsh-sep-bundle/project-binding` 是显式 Cordis 插件模块，提供同进程受信任服务 `ctx.sepProjectBinding`。根组合包不自动挂载；它不是模型工具或远端 RPC。必须先组合已有恢复权威、SEP Session 持久化、SEP 文件保护、三域原生 JSON 提供方和受控 P2 协调器，再审阅。P2 协调器须由受信任宿主流程通过 `sepStorageControl` 提供，覆盖已建立、writer 模式、无维护屏障或待恢复事务；已有私人旧库不能据外观自动认定可用。

输入格式为 `{ projectId, roots: { sessions, memory, locks, backups }, budgetPath, credentialRef: 'DEEPSEEK_API_KEY', configuration? }`。所有目录必须由本地用户明确选择，具有可核验本地身份且互不重叠，并位于所有已登记源项目之外；这里只认证 Windows x64 本地普通目录，不接受目录别名。必须使用既有 V3 账本，缺失、损坏或需迁移则拒绝，绝不生成新余额。未知字段、重置参数和密钥值拒绝。

`review(selection)` 返回冻结审阅计划和 `planHash`；`confirm({ planHash })` 再读项目代次、目录身份、实时提供方、账本原字节、P2 头和配置意图，任一改变则旧计划失效。确认只保存在该插件进程内，卸载或重启后需重新审阅；它不等于持久化提交、用户 GUI 授权、部署同意或业务开放。

`reviewSession(nativeSession)` 仅为同一项目根 cwd 的真实 Session 提供新的只读接续快照。确认后的项目/根/提供方变化仍拒绝；同一根中的合法预算操作和受管数据写入不会使确认自动失效，读取当前账本消费、预留、更正及已有额度。该服务不提供新的金融授权或账本连续性保证；实际调用继续经过现有 Budget、P2 和文件守卫。credential 仅显示引用名、`resolved:false`，未读取密钥或证明其可用。

本轮21项固定检查使用真实官方 Session、SEP 持久化、文件保护、恢复权威、P2 与 Budget，不调用付费模型。根入口仍 pending，完整阶段四 blocked，尚未完成完整 Profile 替换、原生压缩切换、全应用收尾、前端或远端仓库 GUI 安装。详见 docs/BUNDLE-PROJECT-BINDING.md。

## bundle.10：显式冷启动 Profile 保护组合

`dsh-sep-bundle/protected-profile` 是一个明确的 Cordis 函数插件模块，配置入口为 `{ selection, recovery, session?, tools? }`。selection 沿用上一节项目/Session绑定格式；recovery 明确给出 maxFileBytes、maxTotalBytes、maxEntries、retentionMs；备份根取 selection.roots.backups。session.compression 为 none/zstd，默认 none；tools 沿用官方文件工具配置。未知顶层字段、初始化/重置选项拒绝。

先由官方宿主组合 tools/systemPrompt/sessions/storageDomain、sandboxPolicy 和已登记 recoveryHost。只有冷启动时，经明确审阅的宿主配置停用原 fs 与 SessionPersistence 行之后，才可挂载本模块；已运行的提供方不会被卸载、覆盖或热替换。模块打开既有受管 P2 协调器、组合 SEP Session 保存、受保护 read/write/edit 工具及项目绑定，并提供 ctx.sepGovernedStorage 与 ctx.sepProtectedProfile。未知存储在打开协调器前拒绝，避免新增 P2 元数据目录；不建立新库、迁移私库、改写消费或读取密钥。

sepProtectedProfile.review()/confirm({planHash})/reviewSession(nativeSession) 沿用临时只读接续确认；确认不是所有写入或完整业务的授权门。文件和Session能力仍按各提供方的执行器守卫运作，受管三域通过 sepGovernedStorage.open/withAccess 使用既有P2记录。该组合本身不加载完整SEP业务、付费模型或外部运行器，也不替换原生压缩。

激活失败仅回滚自有子插件、域和协调器租约，保留原生前置服务与用户工具；不会自动重新启用宿主配置中明确停用的原行，启动器须依既有维护/恢复流程决定下一步。卸载先关闭新增受管存储准入，等待已接收访问结束，再关闭自有子插件/域并释放协调器；旧域/表引用拒绝新调用。若清理失败返回 SEP_PROFILE_CLEANUP_FAILED，不宣称零残留。全应用关闭截止仍待后续，不由此承诺所有原生任务有界结束。

17项新增定义含真实Agent文件工具、SEP必需任务的保存及提供方重挂后冷读、三域持久化、冲突拒绝、失败回滚、保留用户组件及实际官方boot/Loader冷启动替换。仅用合成资料，无付费模型。完整阶段四与整套Profile业务仍blocked，根入口pending，私人热替换、压缩、前端、远端仓库GUI未认证。详见 docs/BUNDLE-PROTECTED-PROFILE.md。

域close重复调用共享同一原生关闭结算；调用方先发起的关闭也由组合追踪，原生close成功前不移出自有域集合。关闭失败保留域归属并上报清理失败，不能宣称零残留。


## bundle.11 当前补充：显式冷启动压缩与保护组合

新增 `dsh-sep-bundle/compaction-group` 和 `dsh-sep-bundle/protected-runtime`，只认证 Windows x64 本地 NTFS 合成范围。前一入口配置 `{projects:[{id,root}], native:{...原生压缩配置}, maxInputBytes?}`；后一入口配置 `{profile:{...bundle.10 原配置}, compaction:{native:{...原生压缩配置}, maxInputBytes?}}`，项目范围固定取 `profile.selection.projectId` 的已注册项目。

这两个入口要求明确的冷启动宿主组合：原生压缩行预先停用，将其完整配置复制至 `native`；完整组合还要求原生文件和 SessionPersistence 行预先停用。不得在已运行的私人 Profile 上热替换。已有原生引擎会被拒绝并保留，模块不编辑 YAML；失败与卸载不自动启用刻意停用的原生行，恢复原行须明确重新配置、重挂。

压缩沿用原生 `auto`、压力/保留参数、模型策略、范围选择、工具配对、重试和持久化提交。SEP 仅在同项目摘要路径使用内存 lossless-claw 图验证正文覆盖和摘要哈希，不额外调用模型、不持久保存图、不自动展开原文。项目外及子代理保留原生路径。`maxInputBytes` 默认 8 MiB，允许 1 KiB 至 8 MiB；超限拒绝，不截断选中历史。原生摘要本来会消耗 token；本补充没有增加模型请求。

卸载阻止新压缩、取消已接收的压缩并等待其真实结算，再卸载引擎。完整组合按压缩、保护 Profile 的顺序收尾，后者关闭 Session 和 P2；拒绝取消的提供方会延迟收尾，尚无全应用有界期限保证。服务从上下文撤下不等于物理资源已释放，测试使用实际 P2 租约和保留的 Session 提供方确认顺序。手动压缩仍同步取得原生维护权。已经接受的摘要失败沿用原生 LlmError 归类，新调用在卸载后拒绝 `SEP_COMPACTION_CLOSED`。

20 项新增定义覆盖真实原生摘要/Worker/事务、保存后提供方重挂冷读、失败回滚、取消与迟到结果、持久租约顺序、用户组件保留，以及官方 boot/Loader 的两个明确组合。完整阶段四和 SEP 业务仍 blocked/pending；P1/委派的完整组合、全应用期限、前端和真实 Git URL GUI 生命周期仍未认证。详见 `docs/BUNDLE-COMPACTION-GROUP.md`。此前 bundle.10 的“未验证压缩”属于其历史范围，旧封存证据保留。

## Native row controller (bundle.12, isolated cold start)

`dsh-sep-bundle/native-compaction` is an explicit named Cordis plugin (`name`,
`inject`, `provide`, `apply`), not the default business entry. Configure the
actual full `nativeEntryId` from `ctx.loader.entries()`, `projects: [{id,root}]`
with existing canonical absolute directories, and optional `maxInputBytes`.
Only a plain current official BasicCompactionEngine row is supported. The
trusted startup caller must hold business admission and have no live Sessions;
this plugin does not supply a global application lock or a model-facing tool.

After mounting, use the trusted same-process service:
```js
const plan = await ctx.sepNativeCompaction.review();
// Review plan.nativeConfig and confirm this exact plan hash.
await ctx.sepNativeCompaction.activate({planHash: plan.planHash});
// Before controlled controller unload, explicit restoration can report errors.
await ctx.sepNativeCompaction.restore();
const receipt = ctx.sepNativeCompaction.status();
```
Review binds the actual original row, native owner/config and project identity.
Activation rechecks them, pauses only the specified native row in memory, and
copies the effective native config. Failure or controlled controller unload
drains the owned compressor before restoring the original raw row. It preserves
omitted defaults/disabled fields and user plugin rows; it does not edit YAML.
If the original row changes or its native module cannot reload, restoration is
`restore-blocked` (`SEP_NATIVE_RESTORE_BLOCKED`), not a successful rollback.
Repair the conflict through the trusted operator and retry explicit `restore`
while the controller is still mounted. Cordis disposal may swallow errors:
retain/inspect the status receipt; disposing a fiber alone proves no restoration.

This is one activation per mount. A noncooperative model adapter can delay
actual closure. Full-root shutdown restoration, persistent config/crash restart,
private hot replacement, GUI installation, Linux/macOS and complete business
Profile/P1/delegate integration remain unverified. No extra model request,
persistent lossless graph or automatic raw-history expansion is introduced.
Root entry-only/business gate and all earlier explicit provider contracts stay
unchanged. See `bundle/contracts/native-compaction.json` and the scoped report.
