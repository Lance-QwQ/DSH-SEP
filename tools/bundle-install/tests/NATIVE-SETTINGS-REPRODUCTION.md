# bundle.18 原生发现与 HTTP 认证复现

固定目标 DSH 0.2.1-alpha.1 / Loader 1.0.6-alpha.1 / Node>=24 / pnpm11.7.0。测试必须使用真实 D 盘隔离宿主、当前 tgz 与空白测试根；不要指向日常程序、私人库或凭据。宿主获取自动化/CI尚未完成。相对源旧 controlled-fixture 的六项机械变化见 native-settings-fixture.origin.json；不会读取私人 env key，Credentials-local 使用显式测试路径和空 launchEnvironment。

在仓库 PowerShell 中设置真实路径：

```powershell
$env:SEP_SOURCE_REPO='D:\AIData\ProjectWork\DSH\github-beta-publication-20261001\repository'
$env:SEP_OFFICIAL_HARNESS='D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-native-settings-r1\official-harness'
$env:SEP_BUNDLE_REPO=(Resolve-Path (Join-Path $env:SEP_OFFICIAL_HARNESS 'node_modules/dsh-sep-bundle')).Path
$env:SEP_BUNDLE_TEST_ROOT='D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-native-settings-r1\tests'
$sepNode='D:\AIData\ProjectWork\DSH\release-beta2-20261007\bundle-full\runtime\node\node.exe'
$env:SEP_TEST_PNPM='D:\AIData\ProjectWork\DSH\release-beta2-20261007\bundle-full\runtime\pnpm\bin\pnpm.cjs'
& $sepNode --test --test-reporter=spec tools/bundle-install/tests/native-settings.test.mjs tools/bundle-install/tests/native-loader-peer.test.mjs
```

新增17个固定定义=原生/HTTP14+已有子组拒绝的纯前置检查1+Loader peer2。需要同时对同一实包运行此前305个定义，不以重复轮数增加数量。真实网络认证在本机 loopback；HTML索引载具为合成外壳，官方客户端模块注册器/页面资源/路由/BrowserAuth均真实，前端自动激活、完整原生设置壳未在本阶段认证。不得将原有测试 slots/locale 浏览器用例冒充本次原生浏览器认证。

故障测试的 finally 修复了测试清理：即使外层 Fiber await 抛启动错误也继续 dispose 根宿主。green-r4 在修正前超时120秒并被测试控制层终止；保留其原始日志，不能当作通过。red-r3 验证旧包无原生设置发现；red-closeout 验证子插件失败被误判 ready。Loader optional 反例使用保存的修正前函数变体，非旧公开包缺陷。最终回归与资源审计另绑定，不覆盖这些失败证据。
