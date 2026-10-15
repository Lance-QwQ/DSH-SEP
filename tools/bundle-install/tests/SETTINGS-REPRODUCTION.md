# 设置受控根的复现入口

测试源码已在本仓库。需要 Windows x64、本地 NTFS、Node 运行时、固定 DSH 0.2.1-alpha.1 官方组件图及本候选 tgz 的已安装副本。浏览器工厂测试需要 Edge、React 18.3.1/react-dom 18.3.1。不能用审查者机器没有 Node 的事实推断运行时通过或失败；本说明不声称已有 CI 验证。

安装输入必须固定、校验完整性并使用本地/离线依赖，不应从未知 latest 组装替代图。`SEP_OFFICIAL_HARNESS` 指含 package.json 与 node_modules 的独立测试宿主目录；其 dsh-sep-bundle 依赖必须是待测 tgz 的安装副本，而非源码软链接。`SEP_BUNDLE_TEST_ROOT` 是新建的真实 D 盘合成目录。不要使用私人库、日常程序或已封存测试目录。本轮实际输入和锁文件哈希见 BUNDLE-SETTINGS-REVIEW-VERIFICATION.json。

```powershell
# 请将四个路径替换成自己的真实本地路径；不要使用别名父目录。
$node = 'D:\AIData\Tools\node.exe'
$repo = 'D:\AIData\ProjectWork\DSH\repository'
$env:SEP_OFFICIAL_HARNESS = 'D:\AIData\ProjectWork\DSH\review-host'
$env:SEP_BUNDLE_TEST_ROOT = 'D:\AIData\ProjectWork\DSH\review-test-new'
New-Item -ItemType Directory -Path $env:SEP_BUNDLE_TEST_ROOT -ErrorAction Stop
& $node --test --test-reporter=spec "$repo\tools\bundle-install\tests\controlled-installation.test.mjs" "$repo\tools\bundle-install\tests\mount-failure.test.mjs" "$repo\tools\bundle-install\tests\settings-browser.test.mjs"
```

该设置子集23项=原受控根17+新增故障5+浏览器1；运行正常不会请求付费模型。完整296项=283项实包运行时与13项构建/准入。重复执行不增加固定项数，开发失败和补跑分别保留。

完整实包运行时文件名：modules、runtime、configuration、host-contract、session-v4、session-live、import-closure、file-protection、content-observation、file-consumers、project-binding、protected-profile、compaction-group、native-compaction、p1-runtime、business-runtime、business-closure、controlled-installation、settings-browser、mount-failure（均为本目录 `<名称>.test.mjs`）。需要额外设置 `SEP_BUNDLE_REPO` 为实际已安装包根、`SEP_SOURCE_REPO` 为当前源码仓库；不要指向其他候选。构建/准入 builder.test.mjs、entry.test.mjs 需要把 SEP_BUNDLE_REPO 切回源码仓库，并提供 SEP_TEST_PYTHON、SEP_TEST_PNPM、SEP_BUNDLE_SOURCE_PROGRAM：分别为 Python、pnpm.cjs、经过核验的源程序图。后者是构建输入前提，并非随源码自带的运行时；未准备这些输入就不能声称独立复验完整集合。

故障5项验证：UI冲突+恢复失败、普通冲突回滚、非合作恢复+Fiber等待、挂载中关闭、UI冲突+物理租约关闭失败。最后一项由测试持有的原 coordinator 在明确观察 cleanup-blocked 后关闭自己的租约，再重试根 close；不是自动接管陈旧锁。故障未解除前的 blocked 与之后的清理完成分别记录。测试需等待正常结束；超时或强制结束必须记录异常，不可算正常关闭成功。

这些命令不验证完整 DSH GUI/BrowserAuth、默认根准入、Linux/macOS 或付费模型。CI和可独立获取的完整测试宿主图仍是后续可复现性工作，不能用本地日志替代。
