# bundle.15：设置桥接与受控冷启动根入口

本子阶段 pass。范围为 Windows x64、本地 NTFS、固定官方 DSH 0.2.1-alpha.1 与 D 盘合成资料。阶段四整体、默认业务激活和完整 GUI 仓库链接安装仍 blocked。日常版、私人数据、官方源码、公共 README、GitHub 和封存历史证据未改动。

## 入口与使用契约

新增 `dsh-sep-bundle/controlled-installation`，服务 `sepControlledInstallation`；底层 `dsh-sep-bundle/settings-runtime` 提供 `sepSettingsRuntime` 与局部 `suiteEnhancements`。默认 `dsh-sep-bundle` 和 cordis.patch.yml 保持原字节与 pending 状态，不会自动挂载本入口。新入口是受信任宿主的显式冷启动组合，前置服务必须已就绪，冲突的原生文件/Session 提供方须已受控退役；本轮不自动退役未知服务或接管私人旧库。

配置为 `{runtime, ui}`。runtime 保留 bundle.14 的 Profile、既有 V3 账本、P1、业务 sources/capture:false、原生压缩入口和关闭截止；ui 是 enabled:true 与 requestTimeoutMs（1000–300000，默认120000）。运行时同用一份 P2/三域存储/store/账本，未再挂完整 Suite。settings-consumers.js / settings-runtime.js 的 origin 文件逐项绑定原始源和转换，可独立精确重构。

根入口挂载后为 ready，调用 review 取得根 planHash，受信任调用方审阅后用该完整哈希 activate。根计划包含内层 runtimeHash 与 UI 配置；内层哈希不能替代根哈希。此前账本与绑定复检保留。启用前或关闭后，设置服务在创建底层操作 Promise 之前拒绝；不会因 track 回调抛错而留下继续运行的未登记操作。

## 设置页连接

原 ui-settings-memory 后端插件通过官方 Connection 注册精确 memory/budget 路由，局部 suiteEnhancements 仅暴露本项目 memorySettings 和此 Profile budgetSettings。这不是完整 Suite 已启用的声明。读取不向页面返回记忆正文；项目权限在读取、等待和提交前按恢复权威重检。未知/暂停项目拒绝。更新使用 CAS，旧预期值不能覆盖新设置，取消在存储等待后重检。

记忆控件区分保存值、宿主配置与实际生效状态。该片段的付费捕获仍禁止：保存 capture:true 时 configured/effective capture 仍 false，页面显示“受宿主配置限制”。召回可以暂停/恢复，从下一次记忆操作生效；关闭不会删除记忆。RAG/BM25、四层记忆和独立 P2 删除依据沿用已验收 bundle.14。未启用付费提取、媒体或完整 plugin-group 历史展开。

预算页面显示默认单会话累计上限100元、独立会话覆盖、共享总预算与单轮5元上限。它们分别生效；金额设置不是提供方余额/发票。修改默认或指定会话的额度不清零消费、预留、未知结果或子代理归属。Profile 级模型/预算拦截保持；两子任务、只读、超时、取消与统一任务记录仅约束经 suite_delegate 创建的任务。普通 Shell 未获得通用强隔离声明。

原前端 factory 的字节及注册ID保留。独占 Edge 无界面浏览器实际加载该工厂与 React18：记忆召回开关被实际点击，默认额度通过实际输入/保存按钮改为25，刷新后读取到保存值，共享旧消费1元保留，模型请求0。slot/locale/RPC 客户端适配接缝是测试夹具，后端 Connection/存储/账本为实际固定官方组件。已人工查看页面截图，控件与金额说明可读。尚未证明完整 DSH 客户端自动发现本工厂、完整桌面网络与 BrowserAuth；不能将本轮浏览器工厂测试说成 GUI 一键安装通过。更新评估 section 正确显示服务不可用，不伪报评估已连接。

## 停止与恢复

根 close 立即撤销内层准入，再等待启用流程和已接收工作；测试发现的“先等待启用、后发停止”竞态已修复并钉住。内层取消/等待实际 Agent、工具最终结果、模型预算 finally 和设置回调，恢复精确原生压缩行，再关闭消费者/存储/P2。根确认内层 whenClosed 完成后才注销设置路由、卸载运行时。

默认 close 回执限5秒（runtime.shutdownMs 可设100–60000）。截止仍有工作则 blocked，路由保留但新操作拒绝，P2 租约保留；释放合成闸门后才实际关闭并注销路由。`whenClosed()` 仅真实完成才返回。Fiber 卸载等待实际收尾，不承诺整个应用有界退出。并发 close 合并，旧服务引用在新根 owner 挂载后仍拒绝。

外来原生行修改造成 restore-blocked，保持租约和资源，不覆盖外来配置；测试将其明确修回原值后再次 close 才成功。官方 Loader 的 create→等待 Fiber.await→review/activate→disabled→等待 Fiber.await 路径通过，保留共享宿主路由/服务并恢复原生行。Loader 测试自身写入合成 cordis.yml 是外部显式安装动作；根插件本身不写 YAML、密钥或持久部署记录。最后另做同包路由冲突反例：已有插件占用预算路由时，新根入口拒绝安装，原路由仍可读取；这是补充拒绝证据，不重复计入291项。

## 验证及异常样本

本轮先核对 bundle.14 的473个源码哈希、实包SHA和本地检查点，并重复273项历史固定检查。新测试先对旧实包运行，14项因缺少新入口而明确失败。最终固定集合291项 = 历史273 + 受控根/设置17 + 浏览器工厂交互1；最终实包日志278项 runtime与13项构建/官方准入全部通过，无取消/跳过。独立实包复核33条，443个普通文件；静态枚举277个代码文件、1147个ESM引用、12个CJS、14个配套引用、10个动态引用与2个前端工厂，不能据此扩大动态运行范围。

开发失败样本保留：draft-r1为13/14（一处测试对Cordis代理做对象身份比较导致未注入属性错误）；draft-r2为14/17（真实启用/停止竞态，及代理比较/Loader返回值的夹具误用）；draft-r3为16/17（尚未正确等待Entry的Fiber.await）；draft-r4为16/17（误以为Entry.update自身会持久写YAML）。固定业务预期不降低，按真实API修正夹具后全量通过。浏览器首轮0/1在保存过渡卸载输入框时，等待表达式访问null而失败；已改为等待控件重现，后续通过。独立审核器的旧版本/文件数断言同步为本候选，最终33条通过。开发草案日志/包不是新增验收项，也不计入最终固定通过数量。提交前Git空白检查另发现两份新增origin清单使用CRLF；统一为LF后重新打包并重跑完整291项，未更改运行逻辑。

资源审计检查本阶段230个business/controlled合成夹具：最终P2/store owner标记0，未接管陈旧锁。非合作/外来行样本先真实返回blocked，之后显式释放闸门/修回合成行并等待实际close，零残留不能倒推此前已完成。浏览器失败草案用本次独占子进程的child.kill清理；后续4个通过样本使用Browser.close并等待退出。最终只读进程审计未发现本阶段profile的Edge进程；不声明全系统句柄为零。BROWSER-PROCESS-AUDIT.json 与 RESOURCES.json 分别记录观察范围和路径。

## 交付与下一范围

实包：`D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-settings-r1\artifacts\final-r3\dsh-sep-bundle-0.2.1-beta.3-bundle.15.tgz`

SHA-256：`9808eac2ce07097717288433d17108290c10fa105c1d9860ed9abd0772804caf`

阶段目录：`D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-settings-r1`。sealed-r3-runtime.log / sealed-r3-builder-entry.log、同前缀测试输入、REVIEW.json、RESOURCES.json、BROWSER-PROCESS-AUDIT.json、RESULT.json 绑定本轮源码和实际安装包；仓库 docs/BUNDLE-SETTINGS-VERIFICATION.json 与 RESULT 字节相同。CHECKPOINT.json 记录本地可恢复提交，不推送。

原 rc.2 peers 保留，peers check 预期exit1，完整 alpha.1 包兼容尚未通过。下一范围是原生客户端工厂自动发现/设置装配、未连接的付费捕获/媒体/plugin-group与外部后端，然后才是完整根业务启用及官方GUI仓库链接安装。私人旧库/热替换、持久配置与崩溃恢复、应用根有界停机、Linux/macOS、真实付费模型均不在本轮验收范围。固定标准和此前封存结论保留。
