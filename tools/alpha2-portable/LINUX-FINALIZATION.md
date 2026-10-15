# Alpha.2 Linux 本地收尾与证据说明 — 2026-10-13

本轮范围为专用 WSL2 / Ubuntu 24.04 x64 / ext4、空白合成库、私有 Xorg 及 WSLg 原生 Wayland。源码基线 `7913385b77bac65710034a41b22bc42e4b34dda1`。**完整 Linux 公开认证仍 blocked**；Windows 日常版保持原位，不上传 GitHub，不替换其他 DSH。公网自动更新正例继续遵从用户“搁置”的决定。

本轮226项回归、24次实包冷启动及4次固定原生判题均已有绑定证据；本地隔离收尾通过，不等于完整Linux公开认证通过。

输出根：`D:\AIData\ProjectWork\DSH\alpha2-linux-finalization-20261013-r1`。最新本地候选为 `DSH-SEP-Linux-x64-Alpha2-closeout.12.tar.gz`；DSH `0.2.1-alpha.2`，SEP 冻结基线 `0.2.1-beta.3-alpha2-adapter.1`。`.12` 是 Linux 派生构建号，不能称新的公开 Beta 或 RC。

压缩包 SHA-256：`1708b8050c35471c930c6fc61d48289296609b64c7d2a431013eb299b7482f00`。程序清单 SHA-256：`1f087d0680ca3d0c1b13a38983d564b73c2a0e068b6ec1d9eb87fbc55ca5b196`。包内含35个自有运行时文件、52,183项程序清单；没有私人库、用户会话、消费账本、API Key 或测试插件。安装用实际压缩包重新解包，运行包内安装器，创建全新的独立程序与数据目录；不把构建目录冒充已安装包。

## 修复与证据范围

1. **退出有界与租约保持。** 外层入口、独立 guardian、Node 三者持有同一租约；外层与 Node 同时死亡后，guardian 接管所属孤儿后代。收到退出请求或 Node 私有管道通知后才开始40秒期限，不限制普通长任务。超时定向 KILL、报告 blocked；不是优雅退出通过。死亡 Node 以 WNOWAIT 保留内核身份直到后代收尾完成。未知所有权保留租约，不能为快速返回而解锁。
2. **监督故障路径。** 关闭诊断管道不妨碍清理，也不能释放未知租约。空快照还要核对 guardian 直接子进程。只信保留身份的原 session 与 guardian 直接收养子进程，不通过可复用的中间数字 PID 推导所有权。混合时点单行 `/proc` 注入真实复现了旧算法误杀无关合成进程；修复后保留无关进程。这不是高速真实 PID 复用压力试验。
3. **交付依赖。** `.8/.9` 曾遗漏 `snapshot-bootstrap.py`，实际安装后受控写入在派发前 ENOENT。改为统一装配清单，纳入必需复制助手并排除误装的测试 worker。回归真实装配运行时并通过 Bubblewrap 创建工作副本；不能只验证源码目录里的写入路径。
4. **缺失数据诊断。** 缺独立删除计划报 `SEP_LINUX_DOCUMENT_PLAN_UNVERIFIED`，缺代次分别报基线变化或恢复证据无效，不把缺失解释为批准删除。MCP EOF 后载具拒不退出报 `MCP_EXIT_DEADLINE`，执行有界清理；协议已经收到响应不代表外部操作可安全重试。
5. **主工作区原生退出。** `.10` 在真实 GTK 原生确认后发生 Electron SIGSEGV。被动进程观测定位 Electron 信号退出、Host 正常退出；不把 guardian 最后清理成功写成正常退出。最小原生 Electron 44 / GTK3 对照中，无对话框退出0、对话框 Promise 回调立即 destroy 为 SIGSEGV、延后一次事件循环退出0。`.12` 对固定官方编译 main 只做一处批准分支转换：延后 finishQuit 并重新核对 quitting／installer ownership。原生问题、选项、取消及 Host 收尾都保留。`desktop/SEP-LINUX-MAIN-ORIGIN.json` 绑定源哈希、逐字节转换和结果哈希；未知官方输入拒绝装配。**本候选不再声称官方 main 完全未修改**，官方冻结源输入本身未变。

最终实包夹具部分沿用“no main/preload replacement”的措辞，含义仅为测试没有再替换安装包入口、原生对话框或退出检查；不能据此否认 `.12` 已包含前述有 origin 记录的 main 派生修复。机器索引同时给出此范围澄清。

上述机制依据 [Linux waitid/WNOWAIT](https://man7.org/linux/man-pages/man2/waitpid.2.html)、[pidfd](https://man7.org/linux/man-pages/man2/pidfd_open.2.html)、[subreaper](https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html) 与 [Python pidfd 信号接口](https://docs.python.org/3/library/signal.html#signal.pidfd_send_signal)。Electron 的 [原生对话框](https://www.electronjs.org/docs/latest/api/dialog) 与 [菜单 Quit](https://www.electronjs.org/docs/latest/tutorial/menus) 说明支撑入口解释；崩溃归因来自本轮实际对照，不把历史相似 issue 当作同一故障证明。

## 测试口径与原始失败

226个固定定义 = 历史211 + 监督8 + 诊断4 + 实包装配1 + 桌面转换2。最终 `delivery-r49/result.tap` 为226通过、0失败／取消／跳过；中间217、219、223、224以及定向补跑均保留，不重复累加为新增定义。40秒单元场景使用显式时钟加速；实际安装组另测未经加速的期限，两者区分记录。

历史 red 样本、无效／无效力的注入、`.8`缺助手、主页面导航假设、重复合成SessionId、`.10`主窗口崩溃、测试漏点 unknown 原生确认等均保留。`review-red-r17` 和 `ancestry-r18` 两个无效失败夹具留下的合成 worker 经PID、birth、cwd、精确命令和pidfd受控清理；该结果归为**测试清理**，不是生产自修复。`.11`文档派生尝试因复制了已有 seal manifest 被拒，未形成交付；没有覆盖原封存目录。

最终实包的12组每组两轮（24次冷启动）在单一 `.12` 安装上顺序执行，组别为：核心受控文件／提交／恢复／RAG，Node崩溃，外层崩溃，两者同时崩溃，欢迎页原生退出确认，真实主工作区原生退出确认，默认窗口，Host崩溃，原生Wayland启动关闭，Node停住，Host停住，活动Agent工作副本中断。最终 `evidence/RESULT.json` 已核验这24次全部pass；各正常／故障组仍分别保留自己的操作回执，故障blocked不因测试断言通过而改写为正常退出。Node停住两轮约42.1秒收尾；Host停住两轮从故障注入起约46.4秒，包含约4秒等待unknown原生确认，40秒退出时钟在批准后的真实收尾请求开始。最终实包各组 `testCleanup` 均为空。

Linux 官方 Alpha.2 主工作区的窗口关闭会隐藏后台，欢迎页关闭会请求退出。真实主工作区验收通过官方“Set up later”进入，未登录DeepSeek账号；退出使用 Application→Quit／Ctrl+Q，不把窗口隐藏当成退出。unknown Host检查仍需用户批准，等待确认不是40秒收尾超时。私有Xorg使用针对核验PID／birth的合成XTest键盘，未操作用户桌面。LLM提供方仅合成，Host、Agent、工具、native dialog、COW及IPC真实执行。

资源结论分层：正常关闭要Host回执pass且Electron退出0；故障组可验证程序强制收尾、所属可识别后代停止，同时维持blocked和非零；未知所有权继续保留租约。私有Xorg由测试外层停止。最终零可识别进程只针对专用发行版、当前UID和本轮路径／cwd，不能倒推历史blocked当场已释放，也不等于全机零句柄、全部远端任务已结束。最终实包组若需要测试强杀，审计必须失败并保留样本。

## 原生评测补充

`evaluation-evidence/AUDIT.json` 独立封存两轮正负对照，共4次真实Docker／SWE-bench5.0.2官方判题。固定 `pallets__flask-5014`，baseCommit `7ee9ceb71e868944a46e1ff00b506772a53a4f1d`，Docker image `sha256:c49e17e5027074bbadef708406ab6e31cd0cf96fcc9c5d4076cd4c06a36b403c`。正例使用公开数据集gold派生补丁，两轮resolved=true；负例两轮resolved=false。均完成并核对收据、官方报告哈希及容器ID消失，关闭pass，model调用0。

该证据使用同宿主Linux SEP消费者、COW、RAG与native评测组合，运行在专用评测发行版。它不是 `.12` 默认Electron里的同次模型解题闭环，也不证明更多仓库／问题类型。root只用于已授权专用Docker测试发行版，不是日常Linux安装要求。初次eval入口别名绑定拒绝的r5保留；r6使用规范冻结路径。

## 交付索引与剩余项

`candidate-ready-export.json` 绑定 `.12`压缩包；`evidence/RESULT.json` 绑定226项、实包、运行时、官方派生、24次启动、日志和测试输入；`evaluation-evidence/AUDIT.json` 绑定4次判题；`UI-OBSERVATION.json` 记录截图人工核验；`VERIFICATION.json` 汇合证据；`FINAL-AUDIT.json` 与 `source-checkpoint.bundle` 绑定本地Git提交和真实恢复克隆。中间 `.8/.9/.10` 导出记录保持各自名称，不能替代最新入口。

未完成的外部认证仍明确保留：物理Linux桌面及其他发行版、Wayland拖动／系统选择器／AT-SPI真实交互、隐藏主窗口的真实桌面重新激活、DeepSeek账号认证、真实付费模型、计划任务正例、私人旧库首次纳管、全部插件、同次模型+桌面+原生判题、公网自动更新，以及macOS。guardian本身也被终止、永久内核阻塞、断电、高速PID复用和同用户恶意主机代码不在本轮证明范围。当前是可复核的隔离Linux预览包，不能据此宣称完整Linux公开发布认证通过。
