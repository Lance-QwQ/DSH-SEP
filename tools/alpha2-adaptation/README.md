# Alpha.2 隔离接口适配工具

当前证据目录：`D:\AIData\ProjectWork\DSH\alpha2-adaptation-20261012`。完整派生源码在其 `candidate-source`，实际测试宿主在 `host-alpha2`；日常程序保持原位。本目录只提供派生工具和定向测试，没有把 Alpha.1 主分支的门禁直接放宽。

顺序：

1. 固定官方两个 tag 的完整源码，保留来源提交和下载 SHA-256；用 `inventory.mjs <alpha1-source> <alpha2-source> <fresh-D-root>` 生成全量清单。API compare 的前 300 文件不是完整列表。
2. 对基线 Git HEAD 建立 bundle checkpoint 和 archive；把 archive 展开到 `<D-root>\candidate-source`。所有源码、包、依赖及测试资料必须使用真实 D: 路径。
3. 用 `prepare-host.mjs <D-root> <retained-alpha1-host>` 读取旧合成宿主的 package.json、映射 Alpha.2 官方版本并准备新宿主。不会复制旧宿主的数据或密钥。旧 manifest 中的基线 SEP 包本机路径是前提；异机复现需提供同哈希基线包并调整该 file 引用。不得读取或借用私人日常安装来补齐测试依赖。
4. 进入新宿主运行固定 pnpm 安装，TEMP/TMP/缓存均指向 D:。配置只允许已审核的必要构建脚本；不要通过全局自动允许脚本处理失败。保留完整 lock 和日志。
5. `prepare-tests.mjs <baseline-repository> <D-root>` 派生测试载具。把本目录 `host-compatibility.test.mjs` 复制到 `<D-root>\tests`。可先在原 bundle.24 上保留失败证据。
6. `derive-candidate.mjs <baseline-repository> <D-root> <this-tools-directory>` 只修改隔离派生副本。它对锚点出现次数做精确检查并生成来源记录；参数中的基线程序文件必须保持本轮输入哈希。
7. 用 pnpm pack 明确指定 D: 产物目录，把生成的 tgz 安装到隔离宿主，再测试实际安装包。不能只对复制源码报告实包通过。
8. 设置 `SEP_OFFICIAL_HARNESS`、`SEP_DAILY_FULL_HOST` 为新宿主，`SEP_BUNDLE_TEST_ROOT` 为 D: 合成目录，`DEEPSEEK_API_KEY` 为合成占位值，关闭遥测。运行：

```powershell
& $taskNode --test --test-reporter=tap --test-timeout=60000 `
  "$taskRoot\tests\host-compatibility.test.mjs" `
  "$taskRoot\tests\full-profile.test.mjs" `
  "$taskRoot\tests\native-settings.test.mjs" `
  "$taskRoot\tests\shared-consumers.test.mjs"
```

9. `verify-candidate.mjs <baseline-repository> <D-root>` 检查本轮冻结布局中的来源重放、实包文件、43 项 TAP 结果、起点 checkpoint 和日常文件哈希，生成 RESULT.json。它是本轮证据核验器，内含固定包名、日志代次和起点哈希；新轮次必须重新评审更新这些输入，不应把旧核验器误当通用安装许可。

当前最终回执/报告在证据目录；本仓库文档 `docs/ALPHA2-INTERFACE-ASSESSMENT-20261012.md` 说明接口差异及未认证边界。完整桌面、私人库、Linux/macOS 和公网自动安装都不因这 43 项通过而自动放行。没有 GitHub 上传或日常切换授权。
