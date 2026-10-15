# Linux 受控工作副本、提交与恢复事务

最新接线与恢复阶段见 [PROFILE.md](PROFILE.md)：受控 cleanup_blocked 恢复、真实宿主工具路由及 Linux 桌面生命周期已有本轮证据。下文 41 项、载具未接线及桌面 not_run 等属于历史事务阶段，固定标准与原记录保留。

2026-10-12。**pass：限定 Linux x64 / WSL ext4 合成受控项目事务。** 已接入上一轮强隔离载具，尚未装入 SEP 生产 Profile。Windows 日常程序不变；未上传 GitHub。完整 Linux 受保护 Profile 仍为 blocked，Linux Electron 与 macOS 为 not_run。

## 流程与边界

`managed-project.mjs` 的 `openManagedProject` 把显式选择的合成源目录捕获为受控项目第 1 代。源目录只读捕获，之后不会回写；**受控项目的当前代次才是事务权威状态**。这不是任意共享目录的原位覆盖器。

`run` 将当前代次只读挂入 Bubblewrap。可信 `snapshot-bootstrap.py` 先独立复制到空工作目录、核对整树内容摘要，再执行任务。子进程确认退出后，控制器用 `project-tree.mjs` 重新验证并独立复制为候选。拒绝符号链接、硬链接和特殊文件；任务无法看见控制数据库、恢复代次、宿主 Home 或凭据环境。

`review(planHash)` 只返回路径及创建／修改／删除类型，不返回正文。计划绑定根目录身份、事务 ID、基线代次、累计写入序号、候选内容与变化清单，另持久保存候选身份摘要。`commit({planHash})` 再校验基线、序号、候选内容和身份；文件被替换、或另一计划已提交，都会拒绝旧计划。

`planRestore(generation)` 从已验证历史代次制作新候选，再走审阅和提交。恢复不回退累计写入序号，也不覆盖旧控制数据库。

所有非可信命令必须经 namespace 载具。SQLite 租约只排斥合作控制器，不宣称能阻止任意同用户宿主代码。根目录要求真实 ext4、当前用户所有、0700，拒绝路径别名及源／根互相包含。任意同用户宿主代码、内核漏洞和 CPU／内存／磁盘配额不在本轮证明内。生产 Shell、MCP 和子代理尚未全部接线，因此完整 Linux Profile 门禁保持关闭。

## 唯一提交判定

`state.sqlite` 使用 `synchronous=FULL` 与回滚日志；`owner.sqlite` 的 `BEGIN IMMEDIATE` 覆盖控制器生命周期，进程死亡后由 OS 释放，不依赖永久 `.lock` 文件。代次文件逐文件 fsync，目录从叶到根 fsync 后才发布。

| 阶段 | 持久状态／准入 | 重启处理 |
| --- | --- | --- |
| 工作执行中 | running，当前代次不变；重启发现未收尾工作则停写 | 核验并清理中断副本后解除阻断 |
| 候选就绪 | ready，计划及候选身份落盘；未产生新业务写入 | 有效期内可以继续确认，仍需重新核验 |
| 提交意图落盘 | intent + 基线 + 目标 + pending；业务关闭 | 基线与序号核验通过后回滚未提交事务 |
| 新代次发布 | published，pending 保留；业务关闭 | 同上，不推断 committed |
| 完整性健康检查通过 | published；提交记录尚未落盘；业务关闭 | **恢复原基线**，不把健康通过当作提交成功 |
| 最终提交落盘 | **同一 SQLite 事务写入 committed、切换当前代次、序号 +1、清除 pending，并成功 COMMIT** | 才开放业务；保留新代次，不回滚已提交写入 |

这里的健康检查只是目标树完整性核验，不是 DSH 桌面、模型或完整 Profile 认证。控制状态和提交记录共用 SQLite 原子事务，没有独立 head 文件窗口。

序号只在成功的业务／显式恢复提交时递增；复制、准备、检查、审计及失败提交不递增。全部本控制器写者受同一租约约束。新序号、前镜像缺失、内容或身份变化会阻止自动恢复，保持停写。项目文件版本恢复不取代记忆 P2 的永久删除依据；记忆域仍必须走原治理。

## 收尾及副本治理

- 命令默认 3000 ms，允许 50–10000 ms；输出上限 64 KiB。取消／超时只终止自己创建的进程组，确认退出后才清理并返回 aborted。并发工作拒绝；并发 close 合并，重复 close 保留原回执。
- 若 2 秒内仍无法确认终止，返回 blocked，保留工作副本及 cleanup_blocked 记录，关闭业务准入。重启也不会自动删现场或开业务。**尚无自动解除该阻断的操作员工具**；后续需绑定 PID／出生身份核验，不能凭等待时长猜测完成。
- `transactions/<UUID>/work` 和 `candidate` 是正文副本；正常失败、取消、discard、成功提交及回滚会清理。崩溃遗留的 running 副本在显式 `recover()` 时处理；收尾不明的副本保持私有并保留。
- ready 计划 24 小时后不能审阅／提交；显式 `recover()` 清除过期候选。**没有常驻 TTL 工作器，不宣称无人运行时会准时删除。** 可用 `discard(planHash)` 主动删除候选；空事务目录和无正文审计元数据保留。
- `generations/<N>/data` 是当前数据和恢复前镜像，默认保留，尚无自动历史保留量／清理器。仅用于合成资料，私人项目接入前必须补齐留存治理。每棵树上限 1024 项、深度 16、单文件 4 MiB、合计 32 MiB；不保真迁移文件扩展属性。

## 使用与复现

这是可信操作方 API，不是模型工具、生产设置路由或安装器。初始化时指定 `root`、`source`、`isolation: {bwrap,binarySha256}`；后续打开省略 source。正常流程是 `run → review → 用户确认精确 planHash → commit → close`。异常后重新取得租约并执行 `recover()`，拒绝时不得手改数据库或序号绕过。

固定环境：Ubuntu 24.04.5 / WSL2、Node 24.19.0、UID 1000；Bubblewrap 0.9.0-1ubuntu0.3，二进制 SHA-256：`e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71`。沿用已验证 APT 元数据的本地解包组件，不安装系统服务、不更改 WSL automount／interop。

源码基线 `3518fe3fa3c922323a7ce44bbce4224ebd8d2534`；DSH Alpha.2 固定提交 `d743267388641bc76f17c45ce8b4c231aed1d32c`。没有改变 DSH／SEP 公共版本或生产平台判断。

在 `/opt/dsh-sep-cross-platform/alpha2-portable-transactions-final-r6` 中创建新的空合成目录，再运行：

```sh
export SEP_PORTABLE_ROOT=/opt/dsh-sep-cross-platform/alpha2-portable-20261012-r1
export SEP_BUNDLE_TEST_ROOT="$PWD/samples-new"
export SEP_BWRAP_SHA256=e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71
umask 077
mkdir "$SEP_BUNDLE_TEST_ROOT"
/opt/dsh-sep-cross-platform/runtime/bin/node --test --test-concurrency=1 \
  --test-timeout=15000 --test-reporter=tap \
  transactions.test.mjs isolation.test.mjs isolation-transactions.test.mjs
```

## 验证与未覆盖范围

| 代次 | 定义数 | pass | fail |
| --- | ---: | ---: | ---: |
| 事务初始失败 | 19 | 0 | 19 |
| 复制／取消初始失败 | 3 | 0 | 3 |
| 首版 | 29 | 29 | 0 |
| 新增对抗 | 39 | 37 | 2 |
| 终止拒绝复现 | 1 | 0 | 1 |
| 修复后 | 40 | 40 | 0 |
| 关闭复现 | 2 | 0 | 2 |
| 最终第一轮 | 41 | 41 | 0 |
| 最终第二轮 | 41 | 41 | 0 |
| 最终第三轮 | 41 | 41 | 0 |

最终 **41 个独立定义，三轮 123 次执行，0 失败／取消／跳过**，重复不算更多覆盖项。已修复测试发现的：过期计划仍可提交、目录尚未创建时恢复失败、终止未确认却删副本并返回 aborted、重复关闭回执漂移及并发关闭数据库。

真实 SIGKILL 覆盖 intent-durable、published-durable、health-passed、committed-durable、恢复中的 health-passed，另有控制器在沙箱运行时被杀。目录创建前窗口由持久合成记录构造；终止拒绝在 OS signalling 边界注入 EPERM，其余子进程、namespace、目录与 SQLite 真实。

限定资源审计没有本代次 worker／沙箱／工具命令特征残留。**EPERM 样本最终零残留来自测试 finally 对已记录自有进程组的精确终止，不能倒推当时 blocked 操作已清理完成。** 该样本的数据库阻断及私有副本保留。不宣称全系统零句柄。

证据：`D:\AIData\ProjectWork\DSH\alpha2-portable-transactions-20261012-r1\linux-evidence\RESULT.json`，绑定九个最终源码／测试输入及全部原始日志。Windows `FINAL-AUDIT.json` 另核对源码同步、两个日常入口哈希与 Git 检查点；不导出样本正文、私人库、凭据。

未认证：完整 Linux Profile／桌面、macOS、生产工具全面接线、初始化断电、磁盘满及 SQLite 损坏。公网更新三段同次正例仍按用户指示搁置。下一阶段先补收尾不明的受控核验，再接线文件服务、Shell/MCP/子代理并验证完整 Linux Profile；Linux 桌面和 macOS 后端分别验收。
