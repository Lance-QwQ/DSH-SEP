# bundle.18：原生设置宿主发现与真实 HTTP 认证

本阶段范围内 pass：显式原生 Loader 入口、官方 ClientModuleRegistry 发现与设置页面资源服务、真实 loopback HTTP BrowserAuth 与金额设置。完整浏览器模块系统自动激活、完整原生设置页面、GUI 仓库链接安装及完整业务准入仍 blocked；日常版和 GitHub保持原状。

## 实现与边界

新增 dsh-sep-bundle/native-settings-installation 显式入口，由受信任调用方通过固定官方 Loader 1.0.6-alpha.1 以绝对文件URL挂载。与原 controlled-installation 是不同计划域；内层 runtimeHash 和旧入口计划不能代用。新根从旧根经六项机械转换生成，native-settings-installation.origin.json 可重放；原根、settings-runtime、旧UI后端与前端工厂及全部捕获模块不变。

native-settings-ui 使用官方 EntryTree 的内存子树建立 sep-native-settings 条目，指向原设置插件。官方注册器因此自动发现原客户端工厂并从真实 HTTP /plugins 提供原资源；未重写页面标签或 Connection hook。前置拒绝无 Loader entry、已存在的子树/子组、已有 SEP UI 或重复owner，避免取得存储租约后才发现冲突。子插件必须实际 active，加载失败的条目或存在页面资源不能当作就绪。

内存子条目不写用户YAML；外层条目的持久化仍由可信调用方负责。close 沿用有界回执、真实 whenClosed 与先收尾后卸载规则。替换子树或子组保留且返回blocked，恢复原所有权后才能重试。路由冲突且原生恢复失败时，返回 mount-failed-blocked，保留租约和拒绝激活；底层修复后显式 close。正常关闭撤销发现和路由，重挂载不复活旧控制引用。

专用项目宿主、取消该项目及后代cwd的所有Agent（含其他组合）、tools/result事件最终发布前提继续适用，不推广到共享项目宿主。Profile级模型/预算门禁独立；两子任务、只读、超时、取消与记录限制只适用于suite_delegate创建的任务，普通Shell保障不扩大。

根peer新增精确optional Loader，现34项；历史33项不变。dsh-invariants仍0.2.0-rc.2，其余按真实固定alpha.1安装图。适配器支持已审阅的33项源或34项目标清单，拒绝未知范围、缺失历史peer或非严格true的optional元数据。静态闭包检查器从新的native-settings契约读取新增页面资源引用，没有修改历史modules.json或business-runtime契约。

## 认证验证的实际链路

合成宿主使用真实官方boot、Loader、ClientModuleRegistry、WebServer、Connection、Credentials-local及BrowserAuth。凭据库显式放在D盘测试目录，launchEnvironment为空；HTML索引外壳是合成的，仅调用官方authorizeIndex。测试没有读取私人key或发出付费模型请求。

验证了索引token换签名HttpOnly/SameSite=Strict cookie，API query token不能代替cookie；未认证索引/API为401，错误Origin和真正发出的恶意Host为403，篡改cookie为401。授权HTTP设置可修改默认会话金额、拒绝旧revision，并保留initialSpent和账本条目。非法信封和超限正文拒绝且不改设置。Host负例使用node:http显式发送Host，不能以Node fetch忽略Host覆盖的结果误判服务缺陷。

这不是完整原生浏览器认证：已验证主机侧模块注册/资源返回和网络认证，尚未在官方浏览器ModuleSystem自动拉取、激活和完整原生settings壳中操作页面。继承的设置浏览器用例使用真实原工厂/后端与测试slots/locale/RPC接缝，已计入历史283，不冒充新增原生前端证据。

## 固定统计和独立复核

322个固定定义=历史305+新增17。最终实包：运行时283、构建/默认准入13、既有依赖9、原生/HTTP14加前置所有权单元1、新Loader peer2；全部pass，0fail/cancelled/skipped/todo。重复运行、反例、独立审计不增加固定数量。

12项独立复核：旧artifact/index和历史记录；501个真实Git blob；448个归档文件和安装副本逐字节；原运行时/UI/模块不变；四份导航保留旧字节；两份origin各六项机械重放；根metadata限定变更；34项实际peer；固定日志；测试定义与反例；最终资源；契约范围。包管理器仅省略package.json末尾LF，其余包字节与源码一致。

失败证据保留：最初缺inject、Windows ESM URL和Host发送/路由名等属于夹具/脚本错误。red-r3在旧包确认客户端发现缺失；red-closeout在早期候选确认UI子插件失败却被误判ready；red-owner-preflight确认已有子组未拒绝。Loader optional反例使用保存的修正前纯函数变体，不声称是旧公开包漏洞。静态闭包回归因新增资源未声明而失败，补新契约后原测试不改即通过。

sealed-r2-history 的一次并行运行282/283通过；历史普通工具drain用例在释放合成gate后第二次close返回blocked，未满足原100毫秒期限。此运行时代码与旧检查点字节完全相同，资源竞争仅是待验证假设，不能凭后续通过宣称归因或修复；未修改测试定义和期限，原失败日志保留，随后同包单独运行日志另列。阶段内一次性通过和多批并行稳定性是不同范围。

green-r4中有一次失败清理超时120秒，由测试控制层终止。原因是测试finally在外层Fiber抛启动错误后未执行根宿主dispose；改为try/finally后green-r5与最终回归正常结束。该次中断日志保留，不能解释为通过或当场资源清零。后续只读进程审计无该测试残留；未按进程名批量杀进程。

最终sealed-r2的64个business/controlled夹具中P2/store owner标记为0；继承浏览器1个正常关闭，本阶段明确匹配的测试Node/Edge进程为0。恢复/外来树/子组等故障用例先返回blocked，须按用例恢复原owner或解除原测试故障，再显式重试close，才取得最终零标记。最终结果不推翻当时blocked，也不声明全系统句柄或全部历史夹具为零。

## 证据、检查点与后续

- 候选：`D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-native-settings-r1\artifacts\sealed-r2\dsh-sep-bundle-0.2.1-beta.3-bundle.18.tgz`。
- SHA-256：`e738e4878de3ebda088dfec8fc987853c1f16796492f9b7678e00113ede1d4cd`；1278401字节、448个普通文件。
- 阶段目录：`D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-native-settings-r1`；BEFORE-CHECKPOINT.json、REVIEW.json、RESOURCES.json、PROCESS-AUDIT.json、INSTALLED-HOST-PEERS.json、RESULT.json、CHECKPOINT.json。
- 最终日志：sealed-r3-history-runtime.log(283)、sealed-r3-history-builder-entry.log(13)、sealed-r2-host-dependencies.log(9)、sealed-r2-native-native.log(15)、sealed-r2-peer-loader-peer.log(2)。测试源码和helpers快照单独绑定；原失败日志、旧候选不覆盖。
- 仓库索引：BUNDLE-NATIVE-SETTINGS-VERIFICATION.json；复现：tools/bundle-install/tests/NATIVE-SETTINGS-REPRODUCTION.md。历史bundle.17及更早封存证据原字节保留。

下一阶段集中验证官方浏览器ModuleSystem自动发现/激活原设置页面、完整原生设置壳与网络连接行为，再推进完整GUI仓库链接安装。内层Runtime初始化失败回滚、全应用独立有界退出、全部peer功能、其他业务消费者、独立CI与跨平台仍另列，不能用本阶段pass替代。默认pending和完整业务blocked继续保留。
