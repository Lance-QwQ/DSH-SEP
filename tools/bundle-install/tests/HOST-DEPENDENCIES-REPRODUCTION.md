# 固定宿主依赖认证复现

目标为固定官方 DSH 0.2.1-alpha.1；需事先具备真实D盘隔离宿主、已安装当前tgz、固定Node>=24与pnpm11.7.0。完整宿主图自动获取与CI尚未完成。本说明不是公开一键安装保证；不在日常目录运行。

在当前仓库运行，先将下面占位路径换成真实D盘路径。宿主所有声明peer须实际安装；环境中不能有私人密钥或数据。

```powershell
$env:SEP_SOURCE_REPO = 'D:\AIData\ProjectWork\DSH\github-beta-publication-20261001\repository'
$env:SEP_OFFICIAL_HARNESS = 'D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-host-dependencies-r1\official-harness'
$env:SEP_BUNDLE_REPO = (Resolve-Path (Join-Path $env:SEP_OFFICIAL_HARNESS 'node_modules/dsh-sep-bundle')).Path
$env:SEP_BUNDLE_TEST_ROOT = 'D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-host-dependencies-r1\tests'
$sepNode = 'D:\AIData\ProjectWork\DSH\release-beta2-20261007\bundle-full\runtime\node\node.exe'
$env:SEP_TEST_PNPM = 'D:\AIData\ProjectWork\DSH\release-beta2-20261007\bundle-full\runtime\pnpm\bin\pnpm.cjs'
& $sepNode --test --test-reporter=spec (Join-Path $env:SEP_SOURCE_REPO 'tools/bundle-install/tests/host-dependencies.test.mjs')
```

9项测试包含真实pnpm peers check、安装manifest版本匹配、元数据转换与拒绝路径。只验证声明解析；完整运行兼容另行认证。其余296项及宿主前提见SETTINGS-REPRODUCTION.md，需针对同一实际候选执行；测试数不能把浏览器或重复运行再加一遍。

适配器无副作用用法：从tools/bundle-install/adapt-host-dependencies.mjs导入adaptHostDependencies，对完整bundle.16根manifest调用，取得{manifest,contract}。源/目标清单常量固定；不得用当前安装版本自动扩大目标范围。生成器/pack/install脚本及本次日志快照另封存在D盘阶段目录，由索引绑定，不宣称都随源码自动获得。
