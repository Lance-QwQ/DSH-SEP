# Alpha.2 桌面与受控副本验证工具

本目录为开发/验收工具，**不在 npm 产品包 files 中，不是插件设置入口或生产纳管器**。根包继续保留其基线版本；Alpha.2 是单独派生候选。阶段结论见 `../../docs/ALPHA2-DESKTOP-PRIVATE-CONTINUATION-20261012.md`，来源见 `SOURCE-FINAL.json`、`TOOL-ORIGINS.json`，结果及输入哈希见 `EVIDENCE.json`。

源覆盖：将 `source-overlay/` 的 99 个文件覆盖到固定官方 Alpha.2 完整源码的新 D: 构建副本，逐个核验 SOURCE-FINAL 的 resultSha256。不要覆盖仓库历史 source 树，不要把正式日常目录作为编译输出。`daily-adaptation/build` 保留了本次固定构建/转换载具；部分旧文件名含 alpha1，不是版本判定依据。它们不是通用安装器，运行前必须检查每个脚本的固定阶段/输出目录，使用新的真实 D: 目录；个人原安装路径改为显式 `SEP_RETAINED_DAILY_ROOT`，不默认猜测。

核心接口候选先按 `../alpha2-adaptation/README.md` 构建。本轮压缩修复在 `../../bundle/lib/native-compaction.js`；将该文件补入新的 Alpha.2 实例并生成**新的**完整程序图及官方运行时描述符。不要重用旧 tgz 的 SHA，也不要就地修改本轮 sealed r5。

合成回归环境：

```powershell
$env:SEP_OFFICIAL_HARNESS = '<verified-alpha2-host>'
$env:SEP_BUNDLE_TEST_ROOT = '<fresh-real-D-test-root>'
& $taskNode --test --test-reporter=tap --test-timeout=60000 `
  '<repository>\tools\bundle-install\tests\native-compaction.test.mjs' `
  '<repository>\tools\alpha2-desktop\verification-copy.test.mjs'
```

`verification-copy.mjs` 的 prepare 返回 `planPath/planHash/storageRoot`；只有受信任本地验证组合显式把返回的计划哈希交给 open 才能打开复制件。普通 `openControl`、安装包和日常更新器均不识别它。计划持有者与原生测试代码属于受信任操作方，不承诺防御同用户权限的任意代码。

`private-profile.mjs` 是本轮**本地操作方载具**，要求阶段已有 `private-capture-r4/CAPTURE.json`、核对原库仍静止且字节一致，并事先保护 `private-working-root` 的 ACL。它派生测试专用 Profile、使用真实官方 runProfile，创建两次独立进程；所有副本保留在该受保护父目录。不能把捕获清单、正文、复制后的库、凭据或原始私人日志提交进 Git。重放涉及私人数据时需重新确认当前范围；原库变化使旧计划失效。

`default-entry.mjs` 和 `prepare-reopen-probe.mjs` 依赖本阶段已准备的合成 desktop fixture 与协调启动器。前者跑未修改的生产 Electron main，后者在程序图外观测真实第二进程重开。它们不冒充公共安装正例。用户实际拖动/首次提示由单独回执记录；没有以 app.emit 模拟第二进程代替本次 r5 的 reopen 验证。

`final-audit.mjs` 是固定阶段证据核验器，含本轮的哈希、计数和受限结果代次。它只读原库，写本地回执；不是面向其他用户的健康检测或部署许可。复用前必须审查并更新输入，不能把当前 pass 直接用于另一套库/另一候选。
