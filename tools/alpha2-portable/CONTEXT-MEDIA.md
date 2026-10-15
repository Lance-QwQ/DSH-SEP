# Alpha.2 Linux 静态上下文准备与本地文档解析

2026-10-13。本轮将实际 SEP 的 `suite_context_prepare` 接入 Linux 受控组合，并核验已有 PDF／DOCX 解析器。仅专用 WSL2、Ubuntu 24.04 x64、ext4、合成库及私有认证 Xorg。**166/166 项相关检查、两组桌面案例通过，每组含两次独立宿主／Electron 启动。** 完整 Linux SEP 继续 blocked；Windows 日常版未改动，未上传 GitHub。

## 行为与边界

- 控制方配置按 SHA-256 绑定的公开 Python 快照；模型仅选择 snapshotId、seeds、roots，不能选择宿主程序或任意路径。冻结 AST 解析器只跟随静态具名基类及必要 import，动态基类返回 blocked／unresolved。不会执行快照代码，不等于完整可执行依赖闭包，不执行判题。
- 解析走当前受控项目的只读 Bubblewrap 命名空间，源／工作视图只读，网络隔离，记忆及账本等控制目录不可见；不产生可提交写入候选。仅支持 `/usr/bin/python3`，Linux 路径额外按大小写敏感的精确 canonical path 校验。
- 普通 Shell／MCP 仍为输入16 KiB、合并输出64 KiB。仅同进程受信任解析能力最多输入10 MiB、合并输出12 MiB、10秒截止，模型无修改上限入口。取消等待本次沙箱退出；无法确认则 blocked。上游目录清单最多4096项／8 MiB，最终选取最多128个文件／2 MiB。
- 真实 `suite_extract` 已核验数字 PDF 页正文、DOCX 中文主文档段落，以及页／段落定位、untrusted 标记和主文档范围提示。空白或无可提取文本 PDF、坏 DOCX、实体声明拒绝。扫描 PDF OCR、音视频和全部 Office 功能未认证。

工具解析本身零模型请求，账本不变。另有真实 Agent 闭环：合成适配器两次请求、实际上下文工具结果回流、两笔合成 usage 结算；不是付费在线模型证据。每代桌面直接上下文探针零模型请求，账本不变。

## 输入与证据

DSH Alpha.2 提交 `d743267388641bc76f17c45ce8b4c231aed1d32c`，源码基线 `485fb80a434afdb9dbcde850af7ff189aec3669f`。冻结 SEP `0.2.1-beta.3-alpha2-adapter.1`、444文件、artifact SHA-256 `5dd125b1493c100acce355a69511ebcf5686b8a4bf440ab2a5cec3c7daeb16ff`；另核验118个桌面输入。冻结程序未修改，本轮为本地适配载具增量，没有新公共安装版本。

上下文入口 SHA-256 `32364edece8f70a972d784c051b6da256c2ab3cb074232be078fec551928a1de`；解析器 `a5ecf6c75e891d4973a1e5bf0395f9eb18a632c109e8c1ac3944b865b11bc38d`。适配仅两项严格单锚点转换：解析函数依赖注入、调用该依赖。消费者依赖注入也有 origin 清单。证据索引记录原始哈希、变换、转换后哈希和被测文件；输入不匹配拒绝挂载。

输出为真实 `D:\AIData\ProjectWork\DSH\alpha2-linux-context-20261013-r1`；WSL 的 `alpha2-portable-context-*` 副本位于既有 D 盘 ext4 VHD。`linux-evidence/RESULT.json` 绑定源码、日志、截图、历史样本和资源审计；`SYNC-AUDIT.json`、`FINAL-AUDIT.json`、`source-checkpoint.bundle` 及恢复克隆绑定本地 Git。新测试副本不含用户凭据或私人资料。

## 统计及历史样本

152个原有定义 + 11个上下文／载具／Agent定义 + 3个二进制文档定义 = 166。最终 `final-r8` 的18个测试文件全部通过，0 fail／cancelled／skipped；两组桌面 `desktop-r1`、`desktop-r2` 各两代，重复执行不计入定义数。

| 代次 | 结果及归因 |
| --- | --- |
| red-r1 | 2 pass／8 fail：上下文及大I/O能力未实现；坏DOCX的测试预期错误码不符已有契约 |
| green-r2 | 0 pass／2 fail，文件级加载失败：适配层指纹录入错误，校对冻结输入后修正 |
| green-r3 | 8 pass／2 fail：测试忽略卸载后的UNKNOWN_TOOL、试图改写只读夹具；修正夹具，保留旧工具引用关闭拒绝断言 |
| green-r4 | 13/13 定向验证 |
| agent-r5 | 13 pass／1 fail：夹具重复注册官方禁止重复的同名适配器 |
| agent-r6 | 14/14，含真实Agent闭环 |
| final-r7 | 156/156，漏安装／环境两个独立测试文件；桌面失败，测试驱动写死旧目录前缀而拒绝本轮合成路径，未执行选择动作 |
| final-r8 | 166/166；两组桌面四次启动通过。驱动改为绑定当前实例明确输入目录并核验真实路径 |

桌面复验保留真实 GTK 取消、文本路径引用、图片选择、非图像上传→Agent读取→刷新、重启原会话读取、其他会话拒绝及失效回执拒绝。每代真实 Loader 中的上下文工具成功。Host／Electron 正常退出，无强杀；外层随后显式停止自己的私有 Xorg。有限进程审计零残留，不倒推历史异常当场已释放全部资源，不宣称全系统零句柄。

## 复现

恢复本轮检查点并核验冻结输入及资产。Windows：

```powershell
$tests = @(Get-ChildItem -LiteralPath '<源码目录>\tools\alpha2-portable' -Filter '*.test.mjs' | Select-Object -ExpandProperty Name)
& '<源码目录>\tools\alpha2-portable\run-context.ps1' -Tag '<新tag>' -Tests $tests
```

进入该tag的WSL目录，分别使用两个不存在的新case：

```sh
export SEP_PORTABLE_ROOT=/opt/dsh-sep-cross-platform/alpha2-portable-20261012-r1
export SEP_BUNDLE_TEST_ROOT=/opt/dsh-sep-cross-platform/alpha2-portable-context-<新tag>/<新case>
export SEP_BWRAP_SHA256=e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71
export SEP_LINUX_BUSINESS=1 SEP_LINUX_VISION=1 SEP_LINUX_FILE_UI=1
/opt/dsh-sep-cross-platform/runtime/bin/node exercise-context-desktop.mjs
```

载具使用umask077、动态显示号、随机Xauthority、无TCP的私有Xorg。仅在新合成目录执行，不在私人原库或日常目录运行。固定collector只收本轮final-r8；新复现应另建索引，不覆盖旧证据。

## 剩余事项

下一阶段优先适配 Linux 受信任评测后端。原生computer use点击、通用安装／自动更新仍未接入。WSLg人工可见性／物理桌面、实际拖动和托盘、私人库、付费在线模型、全应用强制截止、其他发行版和macOS未在本轮认证。fullLinuxCertification仍为blocked，固定验收标准未降低。
