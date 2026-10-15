# Alpha.2 私人副本桌面核验载具

这是固定本机阶段的开发/验证工具，不在产品 npm `files` 中，不导出插件能力，也不授权生产复制库纳管。所有私人副本只能写在事先受限权限的真实 D: 父目录中。不要将任何生成配置、正文、日志、捕获清单或密钥提交 Git。

先读 `../../docs/ALPHA2-PRIVATE-DESKTOP-CLOSEOUT-20261012.md`。旧源工具仍在 `../alpha2-desktop`。复用前检查所有固定路径及输出代次；已存在的目录或回执会拒绝覆盖。`close-electron-cache-acl.ps1` 专用于本轮已退出的单一测试副本，不能直接套到生产或其他目录。

共用环境变量：`SEP_SOURCE_REPO` 为源码仓库、`SEP_BUNDLE_TEST_ROOT` 为阶段真实 D: 根、`SEP_OFFICIAL_HARNESS` 为已核验 Alpha.2 程序。`prepare-private.mjs` 要求冻结的 `private-capture-r4`、源库静止及 `private-working-root` 的三主体 ACL；`prepare-desktop.mjs` 将同一复制件接入真实受管桌面。`run-desktop.mjs rN` 等待实际 Windows UI 观测回执，两轮运行同一副本；回执不能先填预期值。不得在真实密钥或模型请求下运行。

`prepare-candidate.mjs` / `prepare-current-candidate.mjs` 是固定阶段候选制作器，额外要求 `SEP_RETAINED_DAILY_ROOT`、`SEP_DAILY_ADAPTER_SOURCE`、`SEP_DAILY_ELECTRON_PAYLOAD`。它们仅写新程序和候选选择，不发布日常指针。前者保留旧布局失败样本出处；后者接续当前 Alpha.1 的有效 Profile。路径转换只对已拥有的程序入口名称生效，其他配置不重写。

合成回归：`identity.test.mjs`、`verification-copy.test.mjs`、`current-profile.test.mjs`。完整/受管宿主回归另需设置 `SEP_DAILY_FULL_HOST`、`SEP_DAILY_MANAGED_HOST` 为候选程序，以及 `SEP_DAILY_PRIMARY_RUNTIME` 为本轮核验的独立 primary-runtime；遗漏会导致载具失败。无真实模型消费。

`finalize-plan.mjs` 必须在源码同步、测试、源库和资源审计完成后运行，只读生成新的指纹计划。它不会执行安装；确认也不能替代切换时再次取得锁及重核指纹。当前 r5 私人桌面与 r6 日常候选属于分别绑定的证据。
