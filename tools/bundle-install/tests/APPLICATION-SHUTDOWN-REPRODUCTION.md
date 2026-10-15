# 应用关闭八场景复现

前提同 NATIVE-SETTINGS-REPRODUCTION.md：Windows x64、真实本地合成目录、Node 24、固定官方 DSH 0.2.1-alpha.1 组件图与已安装的本候选。不得指向日常程序/私人库。测试不调用付费模型。

官方源码固定提交 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`。除通用环境变量 `SEP_OFFICIAL_HARNESS`、`SEP_BUNDLE_REPO`、`SEP_SOURCE_REPO`、`SEP_BUNDLE_TEST_ROOT`，子进程还要求以下两项。哈希必须与包内 application-shutdown.json 一致，不能只对任意文件重新计算后视为受信任。

```powershell
$env:SEP_OFFICIAL_SHUTDOWN_SOURCE = Join-Path $officialSource 'apps/cli/src/process-shutdown.ts'
$env:SEP_OFFICIAL_SHUTDOWN_SHA256 = '30743d5ac88154b25fd2d14ac22f7ff1b8d94e915547383de1ca7e49d1bbfc66'
if ((Get-FileHash -LiteralPath $env:SEP_OFFICIAL_SHUTDOWN_SOURCE -Algorithm SHA256).Hash.ToLowerInvariant() -ne $env:SEP_OFFICIAL_SHUTDOWN_SHA256) { throw 'OFFICIAL_CONTROLLER_HASH' }
& $node --test --test-concurrency=1 --test-reporter=spec "$repo/tools/bundle-install/tests/application-shutdown.test.mjs"
```

`$officialSource`、`$node`、`$repo` 均需由操作者指定为已准备路径；新测试根必须事先创建为空目录。八场景以700ms缩短进程截止，断言官方默认仍5000ms。退出码0也可能是 forced/blocked；结果中的 resourcesConfirmedReleased 必须区分当场正常整树释放与之后所有者核验恢复。强制样本不会被解释为正常关闭。
