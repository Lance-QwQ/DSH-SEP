# macOS Alpha.2 低优先级审查逐项处理

本轮基线：`a9b06f135a8a3529921e6fa6e04d6e66bc4ff904`。这是本地源码修复与隔离回归，不是新的 Mac 安装包验收。源码最终提交、精确输入及日志哈希见本轮外部 `FINAL-AUDIT.json` / `RESULT.json`。

证据根：`D:\AIData\ProjectWork\DSH\macos-low-review-20261015-r1`。旧失败、环境失败和更正后的复跑分别保留，不把重复运行加为新的测试定义。

## 逐项结论

| 审查观察 | 核验与处理 | 证据 / 边界 |
| --- | --- | --- |
| 文件错误可能暴露受管路径 | 确认。模型 execute 出口重新构造分类码错误，移除原 message、stack、path、cause 与附加属性；无法分类时为 FS_IO_ERROR。 | 真实文件移走造成 ENOENT，以及提供方夹带路径，两项先红后绿；未修改内部操作方诊断接口。 |
| project-tree close/next 潜在悬挂 | 确认。close 曾覆盖 stat/sync 的等待槽，重复 close 也会提前返回。现在拒绝 next 重入、先关闭准入、等待已接收操作在原截止内结束、合并并发 close、失败允许重试。 | 实际 POSIX native helper 回归；派生附件树同步包含修复。新 Darwin/APFS 序列未运行。 |
| 两处 cwd 比较有放行方向 | 确认。未知或不同原项目的请求不再透传；专用宿主关闭时取消所有注册 Agent。 | 五项钩子测试使用实际模块和依赖接缝；不是完整 Loader/付费模型验收。官方 Alpha.2 的 header.cwd 是原项目身份，工作目录变更由 workingDirectory 投影承担；仍保留该身份比较。 |
| parser-worker 状态语义 | 未复现为具体缺陷，未改变生产状态机。补充 lifecycle 与 operation outcome 的区别；closed 不等于解析成功，收尾未确认不释放 whenClosed。 | 六项既有可移植输入/来源契约通过；不能据此认证原生迟到回执、截止及崩溃序列。 |
| expectedPlanHash 可选 | 确认。新删除 intent 必须绑定原审阅库存哈希；已持久化 intent 仍可按已授权前缀恢复。 | 十项实际 SQLite 授权检查；另三项确认 P2 marker 已落盘、恢复跳过 inspectSource 时，从原持久化且已验证的 P2 计划取 managedPlanHash，缺失/篡改时两域都不写。 |
| installer-ui / installer-entry 旧措辞 | 修正文档，分别说明当前 r79 安装/已安装启动证据和历史失败/分层限制。 | 不扩大原字节物理确认、Finder/键鼠、签名公证的认证范围。 |
| finalizer 未交叉核对 tree/assembly | 确认。读取原始 SOURCE-ASSEMBLY.json，交叉核对其摘要、安装器树/清单/归档/构建提交及四个 payload 指纹；发布通过清单前再次核验三份记录。 | 17 项 finalizer 检查通过，包含 21 种新增拒绝变体；实际旧 r78/r79 记录只读交叉核验通过。不是远端身份认证。 |
| distribution 测试环境未文档化 | 新增 package/TESTING.md，列出实际环境变量、真实 D: 输出根及历史证据依赖，运行使用 python -B。 | 两套实际合成 ZIP 测试各 9 项通过。无下载、签名或安装行为。 |
| transactions 条件死分支 | 正常不变量下 pending 应已清除；原表达式却可能返回 status=pass/action=blocked。改为最终读回仍有 pending 就拒绝，成功快照后才解除 startupInterrupted。 | 用真实 SQLite 与 native helper，在已有回滚事件接缝注入重新出现的 pending，原代码未拒绝，新代码拒绝且原来源不变；不宣称普通路径曾自然触发该分支。 |
| 两份 RUNTIME-ORIGIN 未说明现行 | 新增 RUNTIME-ORIGIN-STATUS.json：r2 为当前六个生成文件的来源，原四项清单为历史。 | 原清单字节不改；该清单不覆盖整个程序，更不替代原生验收。 |
| 未跟踪 __pycache__ | 增加局部忽略规则，并用 -B 避免新字节码。 | 原缓存文件保留且哈希不变，没有删除用户文件或工作目录。 |

## 本轮验证分组

* 文件/Profile/目录生命周期：33/33，真实 Linux ext4、SQLite 和 `SEP_POSIX_TEST` native helper；初轮 32/33 的唯一失败是测试误以为 rename-back 能恢复 inode 时间戳，已更正测试，原失败日志保留。
* 业务钩子、持久化删除授权、parser 可移植契约：24/24；实际原生 APFS、Loader 和付费模型不是这组测试对象。
* 事务及新增最终恢复读回：29/29，真实 SQLite 和 POSIX helper；新增反例先在基线失败。最初一次编译因旧 C 源在额外 -O2 下的警告未进入测试，独立保留，不计入功能反例。
* 事务 origin、只读派生、预览及控制边界：18/18。
* finalizer：17/17；distribution：9/9 + 9/9。回归调用实际生产模块，不改其固定输出策略。
* 额外业务派生导入：1/1（与业务组24项合计25个定义）；当前 pending 安装清单：1/1。独立复核的重跑不重复计数。全部最终测试组共141个定义通过、0失败、0跳过；语法/闭包检查不混入该数字。依赖解析接缝及独立复核见 `business`、`integration-review`。

## 当前与历史输入

活引用已同步：事务 origin、只读事务派生、附件树派生，以及 media/document/pending-startup 的源哈希。当前输入在本轮结果中逐文件绑定。独立复核发现 pending-startup 活安装清单另有两处旧哈希；新增反例复现后已同步当前八个源文件，旧清单原字节另存 package-inputs-r73.json。当前清单只声明源码绑定，nativeVerification 仍为 not_run。

`project-workflow/SOURCE_INPUTS.json`、`FREEZE.json`、原生 CI 清单和旧构建 ASSEMBLY 是历史冻结证据，保持原字节。它们的历史复现命令须在对应旧提交/检查点运行；在本轮修改后的源码上因字节不符而拒绝是正确行为。不能用刷新旧清单的方式给新源码继承旧原生通过结论。当前原生验证需另建输入代次。

## 交付边界

原 `DSH-SEP-macOS-Alpha2-installer-preview.zip`（692,801,617 字节，SHA-256 `6043ddd8305009e9013de46f85f7660cdc775d4320987553808eb9f8ec01db4f`）及三个配套交付文件保持不变，**不包含本轮源码修复**。本轮未重新签名、打包、安装或运行 Mac 原生 CI。已有 Mac 包仍只具有原声明范围的隔离预览证据。

完整 Mac 认证仍为 `blocked`。本轮修改后的 Darwin/APFS、完整原生桌面/安装/退出、物理交互、新构建签名与安装后复验仍为 `not_run`；其他旧未认证范围继续保留。Windows 日常入口、用户文档和原缓存哈希不变。未上传 GitHub，未切换日常版。
