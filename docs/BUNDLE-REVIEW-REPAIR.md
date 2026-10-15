# bundle.24：bundle.17–23 双审查核验与修复

本轮基线是 `9db625afc1653e758d23e050b020e84cd3fa5291`，SEP 根版本现为 `0.2.1-beta.3-bundle.24`，固定官方 DSH `0.2.1-alpha.1`。对用户转交的 KIMICODE/GROK BUILD 报告逐项独立核验，再修复确认的问题。没有部署日常版、推送 GitHub、发布 Release 或执行第9步；bundle.23 的第8步检查点保持原字节。完整 Profile 仍 `blocked`、默认组合准入仍 `pending`。

本轮最终四组共 **382/382，0失败、0取消、0跳过**。这是固定 Windows x64 合成实包范围，不代表三个平台或全部私人插件完成认证。机器可核对数据见 [本轮证据](BUNDLE-REVIEW-REPAIR.json)。保留历史失败与中间调试记录，重复运行不增加覆盖计数。

## 审查结论对账

|编号|独立核验与处理|
|---|---|
|K1 活契约|部分成立。旧 `business-runtime` 仍导入 `governed-consumers`，要求 `capture` 为字面量 false；其旧能力限制保留，并新增明确入口作用域。真正过时的 `settings-installation` 已更新为可选捕获、受控历史/视觉接线和各项未认证限制，旧计数明确为历史基线。没有为消除表面矛盾而打开旧入口。|
|K2 origin 漂移|成立。修正两个 fixture 的可重放转换，并同步五个运行时 adapter origin。七链逐项重放；旧 origin 的 SHA 绑定基线提交原记录，不指向未提交的临时版本。原始捕获模块383个文件未改。|
|K3 清理顺序/拒绝记忆化|成立。evaluation blocked 不再跳过独立消费者及记忆域清理；保留评测 fiber/root 所有权。成功释放不重复，未完成释放可重试；一并解除 Entry.stop、评测插件 stop、分层域与 Profile 域的失败 Promise 永久缓存。根关闭返回有界 blocked，whenClosed 仍仅表示实际释放。|
|K4 原始错误丢失|成立。可信控制状态新增 initializationCause/mountCause，保留有界 code/errorType 及不同的内层 causeCode，与清理错误分开；不返回任意原始消息、堆栈、路径或正文。无法分类时明确 UNCLASSIFIED_FAILURE，不伪造根因。|
|K5 CI 回执|本地确认并修正 Windows 分隔符及缺失文件静默告警：输出统一 RUNNER_TEMP，写入 GITHUB_ENV 前转正斜杠，上传缺失改 error，保存 install.log。远端工作流仍 not_run，不能称为已上传回执。|
|K6 复现契约|补齐 [应用关闭复现说明](../tools/bundle-install/tests/APPLICATION-SHUTDOWN-REPRODUCTION.md)，测试把官方控制器文件与包内固定哈希绑定，并增加 resourcesConfirmedReleased 精确断言。|
|G1 写入回执绕过|成立。严格模型文件入口仅接受明确 createIfAbsent 或带非空字符串 version 的 replaceIfVersion；null、空对象、缺失/null version 不再越过观察约束。原生无条件文件API的契约没有被改成SEP要求。|
|G2 评测路径穿越|成立。设置 schema 与 Entry.start 在外部 spawn 前共同校验 /opt/dsh-sep-eval/ 下规范 POSIX 路径，拒绝点段、空段、反斜杠、控制字节，入口名必须 lifecycle.py。此为词法边界；受信任WSL文件配置、符号链接/完整性仍是独立前提，不称为通用沙箱。|
|G3 Windows CI 私人目录|成立的是硬编码私人机器目录，不是“所有托管Windows一定没有D盘”；统一使用 RUNNER_TEMP。|
|G4 兼容测试对象|采纳。读取实际已安装候选的 manifest。另复制 manifest 故意设错误 peer（源码不变），测试真实失败；这是预期负例，不叠加到382项正常通过计数。|

核心实现入口：[写入回执](../bundle/lib/protected-file-tools.js)、[路径校验](../bundle/host/evaluation-entry/backend-paths.mjs)、[独立清理编排](../bundle/lib/consumer-cleanup.js)、[评测有界停止](../bundle/host/evaluation-entry/entry.mjs)、[诊断分类](../bundle/lib/failure-diagnostic.js)、[settings runtime](../bundle/lib/settings-runtime.js)、[Profile域关闭](../bundle/lib/protected-profile.js)、[分层域适配](../bundle/host/layered-memory/index.js)。后者通过独立 adapter 修复收尾，捕获模块原字节及原许可保留。

## 实包与测试绑定

最终安装包：`D:\AIData\ProjectWork\DSH\bundle-install-20261008\review-repair-bundle24-r1\artifacts\final-r1\dsh-sep-bundle-0.2.1-beta.3-bundle.24.tgz`。

SHA-256：`f1305cecdd1cf8080514909b2c6a357d1a03514ad4f969d26d7dd000d4399e8d`。

472个实际打包文件逐一核对源文件、tar条目及安装结果；manifest仅允许包管理器格式归一化后的JSON等价，其余逐字节一致。383个原始捕获模块文件按固定契约核验未变。七个origin按转换重放，并核对其前任记录。此项不是全仓库秘密扫描或公开发布认证。最终包与上一轮 sealed-r1 包只有五个运行时origin元数据文件不同；最终382项仍重新对最终包执行，没有仅用此等价推断代替运行。

|最终组|定义数|通过/失败/跳过|内容|
|---|---:|---|---|
|final-runtime-r1|309|309/0/0|运行时、文件保护、会话、真实Loader、Settings浏览器、初始化/挂载/关闭、预算与受控原生设置|
|final-consumers-r1|57|57/0/0|本轮回归、真实评测子进程、应用关闭8例、共享/点击/上下文/视觉消费者、实际peer及平台准入|
|final-builder-r1|13|13/0/0|组合构建及默认pending入口|
|deep-context-r1|3|3/0/0|381字符真实安装路径的Python伴随程序、取消与作用域；保留原“超过300字符”断言|
|合计|382|382/0/0|四组文件集合不相交，补跑、预期负例不重复计数|

日志、全部测试输入哈希、实际安装路径、官方控制器SHA和各组文件列表均记录于同名JSON。测试使用真实已安装候选、固定官方组件及真实Loader/HTTP/子进程；模型请求采用合成适配，未调用付费模型或操作真实桌面。独立清理编排单测用可控失败资源，根关闭重试另由真实存储域/Loader集成验证；不是每个测试都不使用替身。

## 失败记录与资源收尾

旧bundle.23红测及全部中间记录保存在本轮目录，不改写成通过：包括旧失败Promise缓存、嵌套诊断缺失、最初未冻结可选依赖的离线缺包、自己修改lock表达式跨行的安装错误、CI测试过宽断言，以及短路径夹具不满足深路径测试前提。最终修复恢复固定依赖图，没有关闭minimumReleaseAge策略；pnpm虽使用offline取包，仍尝试年龄元数据网络查询并有ECONNRESET重试，因此不声称完全离线安装。

`sealed-targeted-r1` 的75/76不是最终成功总数。唯一失败发生在Python执行前的路径长度前提；另建真实深目录后保持同一断言与同一最终包，3/3通过。临时清理诊断曾直接触达内层close，其早期通过不作为最终证明；最终集成用例仅经根控制close重试。

最终资源审计仅覆盖本轮四个成功测试目录及与本轮目录/测试命令相符的进程：这四组无P2 owner.lock残留、无匹配的活动测试进程。失败夹具的死进程标记保留，详见本轮RESOURCES.json；不宣称整个测试根或全系统零句柄。

正常应用样本由实际整树dispose取得释放回执。四个forced样本当时仍是blocked且resourcesConfirmedReleased=false；最终租约消失发生在子进程退出后的所有者核验、重新打开及close，不倒推为当场正常清理。评测子进程先100ms截止blocked，测试显式IPC放行、确认退出后重试stop才pass；产品未新增强杀后端。红测卡住夹具仅由测试watchdog终止自己的测试工作进程，证据及标记保留。这些路径分别归因。

## 复现

使用Node24.21.0、pnpm11.7.0及固定官方0.2.1-alpha.1组件图；安装用历史固定lock，仅替换本候选file路径/完整性/版本。不要重新浮动解析依赖。安装构建输出必须是新的真实D盘合成目录，不能指向日常程序或私人库。先按原[原生设置复现说明](../tools/bundle-install/tests/NATIVE-SETTINGS-REPRODUCTION.md)准备安装载具。

需要环境：SEP_OFFICIAL_HARNESS为合成宿主；SEP_BUNDLE_REPO为宿主node_modules/dsh-sep-bundle的实际目录；SEP_SOURCE_REPO为本仓库；SEP_BUNDLE_TEST_ROOT为每组新建空目录；SEP_TEST_PYTHON指向Python；SEP_TEST_PNPM指向pnpm.cjs；SEP_BUNDLE_SOURCE_PROGRAM为受控构建输入（按builder契约）。应用组另设置上述关闭说明中的官方源码路径和固定SHA。官方源码固定提交5badb15009ae1756c3afe0ae0cef1faafc290ccc，控制器SHA为30743d5ac88154b25fd2d14ac22f7ff1b8d94e915547383de1ca7e49d1bbfc66。

运行形式：`node --test --test-concurrency=1 --test-reporter=spec <组内各测试文件>`；四组完整文件列表见JSON的testGroups[].files。builder组的SEP_BUNDLE_REPO指向本源码，验证构建器输入；其他组必须指向实际安装包。context组另准备真实深路径安装，实际context_resolver.py路径须超过300字符，再更换两项宿主/包环境变量。全部日志重定向到自己的新目录，不覆盖封存日志。每组文件是Node独立测试定义集合，不用仅按日志“✔”行计数。

## 保持未认证与低优先项

Linux/macOS完整受保护Profile及桌面认证仍blocked，macOS/远端CI执行仍not_run。完整Windows Electron菜单/IPC退出、公共HTTPS Git/auth/proxy分发、真实付费模型质量、真实Windows MCP/远端判题取消及其全部资源行为未在本轮认证。自动强杀评测后端未实现；blocked保留所有权直至明确修复/退出。

其余审查低优先项保持列明，不因回归通过自动称修复：automationId本地独立复核仍依赖可信MCP；用户主动close期间初始化标签/preparing流分类；三处载具装配重复；失败浏览器body.innerText工件仅适用于合成数据；取消安装的pnpm子孙终止尚无新增断言；CI actions未固定SHA、全局pnpm安装完整性、远端年龄策略等价与环境变量白名单；vision挂载前/historical subagent额外负例尚未新增。resourcesConfirmedReleased断言、控制器固定哈希绑定、根closed短路已在本轮补上。

仓库原有 `docs/BUNDLE15-REVIEW-RESPONSE.md` 的无关未暂存标点编辑保持原状并排除本次提交。修复完成后停在本地可审查候选；是否推进第9步由用户决定。
