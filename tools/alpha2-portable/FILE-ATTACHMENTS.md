# Alpha.2 Linux 非图像附件上传与只读访问

本轮仅完成 **Linux x64 / WSL2 / ext4 / 专用合成受控 Profile** 的适配验证。新增原生文件上传、不可变存储、当前会话授权读取及离线清除接续。没有切换 Windows 日常版，没有上传 GitHub；完整 Linux SEP 仍为 `blocked`。

## 实现及范围

- `linux-attachments.mjs` 通过可选 `files` 配置启用；未配置时继续拒绝非图像正文上传，既有图片 Profile 的约束不变。
- 保留官方 Alpha.2 的 `FileUploads`、原始字节上传 HTTP 路由、回执及接收 Session 身份。不是把任意用户路径交给 Shell 读取。
- 官方存储原本让命名文件与内容对象共享硬链接，不符合本载具的单链接要求。`linux-native-file-store.mjs` 对固定哈希的官方提供方做两处精确文本转换：命名别名改为原生流式独立副本发布，以及把 sharp 的 lazy require 锚点绑定回原模块。另将 bare imports 重定位到冻结安装的模块 URL；`node:` 保持不变。独立重放测试逐字节核验派生结果；444 个冻结 SEP 文件均未修改。
- 内容 SHA-256、原生文件名清洗、不可变发布、流式背压、fsync、读完后的完整哈希/长度核验仍走官方实现。规范对象与命名副本最终均为单链接、0400，目录为 0700；同内容不同名称可能产生更多独立命名副本。
- 给模型的路径为 `sep-attachment://<digest>/<encoded-name>`。新增工具 `suite_attachment_read` 只允许当前实际 Agent、当前项目、普通会话、真实用户消息中的已引用附件。其他会话、子代理、非用户来源的转录消息不构成授权。
- 工具流式校验全文哈希及 UTF-8，仅保留有界文本前缀；无正文自动注入、RAG 自动索引或额外免费模型路径。零字节文件可以上传。二进制可以在限额内原样保存，但文本工具拒绝二进制/非法 UTF-8，不承诺解析 PDF、Office、音视频。
- 普通 `read`、只读文件系统及隔离 Shell 均不能读取私有上传域。原生通用句柄模板中的复制/子代理提示不代表本 Profile 开放这些能力；实际受控工具与子代理门禁继续限制读取。

## 配置与边界

冷启动配置中，附件插件的 `source` 与 `storageRoot` 必须和业务运行时精确匹配，并启用既有原生附件/视觉载具。启用文件示例：

```json
{
  "files": {
    "enabled": true,
    "maxFileBytes": 4194304,
    "maxDomainBytes": 67108864,
    "maxFiles": 128
  }
}
```

`maxFileBytes` 可调范围为 1–4 MiB；单个流块最多 64 KiB；流操作使用 30 秒取消信号。文件启用后附件操作串行化，最多接收 4 个排队/执行操作，超量在消费新来源前以 `SEP_FILE_BUSY` 拒绝。

文件发布前计算整个附件 home 已有物理文件字节/数量，包含已有图片、缓存与租约元数据，再预留 `3 × maxFileBytes` 和 3 个文件的峰值空间。超出文件准入预算即 `SEP_FILE_QUOTA`，不会消费上传来源。因此 64 MiB 并非可用正文容量；去重上传也可能保守拒绝。这是**文件发布准入预算**，不是系统磁盘配额，也不是对既有图片请求变体增长的全局硬配额。`maxDomainBytes` 可调 1 KiB–64 MiB，`maxFiles` 可调 4–256；过小配置会立即拒绝上传。

`suite_attachment_read` 的 `maxBytes` 默认及最大为 65536。仅返回文件名、原始字节数、文本前缀和 `truncated`；不会返回宿主存储路径。读取前不允许截取已损坏对象的可见前缀；验证失败时不返回正文。

上传中取消/溢出/坏流块清理原生暂存文件。对于不响应取消、卡在自身 `await` 的提供者，截止信号不能强制其 JavaScript 迭代器立即返回：运行时有界关闭先返回 `blocked/resourcesRetained`，租约保持；提供者实际退出、取消收尾完成后才能成功释放。没有把超时回执伪写为已释放。

## 保留、删除与恢复

上传不刷新 RAG 生命周期，也不自动建库。正文保留至明确离线清除；删除编辑框的草稿卡片不代表已删除上传存储副本。要修改正文，应重新上传新内容；当前不开放附件正文原位修改。

复用 `linux-attachment-cli.mjs` 的离线治理：先正常退出宿主与附件所有者，再生成计划，复核 `planHash`，以完全一致的计划确认执行。对象、命名副本、缓存及遗留隐藏暂存文件都在清单内；源项目与 RAG 不因此删除。计划含路径/大小/身份/哈希，不含正文。

```sh
node linux-attachment-cli.mjs plan "$MEMORY_ROOT" "$PROJECT_ID" > purge-plan.json
node linux-attachment-cli.mjs apply "$MEMORY_ROOT" "$PROJECT_ID" purge-plan.json "$EXACT_PLAN_HASH"
```

`MEMORY_ROOT`、`PROJECT_ID` 必须取自本次合成安装的已核验附件所有权记录，不能填写私人原库或别名目录。执行中断后重新生成计划，复核剩余副本及持久删除依据，再明确确认；不会用过期计划强行继续。

## 验证与计数

最终 `final-r13`：**149/149**，0 fail/cancelled/skipped。计数为上轮 123 个定义 + 本轮一并重放的 10 个既有基础定义（锁文件 3、Linux 原生探针 7）+ 16 个新增文件定义。重复执行不增加定义数。

新增覆盖包括中文/路径文件名、字节与 SHA-256、独立 inode/权限、流溢出/坏块/取消/暂存清理、准入配额、队列上限、有界关闭及租约保留、激活/关闭门禁、同会话/外会话/子代理/非用户消息授权、完整 UTF-8 校验、正文前缀上限、损坏/硬链接拒绝、真实 Shell 隔离、提供方转换重放、重启与遗留暂存清除，以及三个真实 `SIGKILL` 删除切点。

最终源码两轮全新真实 Linux Electron：原生路径缺失的浏览器 `File` 拖放 → 官方 worker/流上传 → 原生回执 → 真正 Agent → `suite_attachment_read` → 实际正文工具结果 → 回答 → 历史刷新 → 设置页 → 关闭后台保留 → 再打开 → 正常退出。不是直接调用读取函数伪装成界面闭环。回答和远端模型响应为合成，真实宿主、上传/消息/工具/存储链路未 mock；禁止离开 loopback 的模型网络请求。

每轮另验证：超大文本上传失败；尚未消费的真实回执不能被另一 Session 解析，原 Session 仍可解析；发送后的外会话/已退休回执重放返回 `FILE_NOT_STAGED`；独立无 cookie HTTP 返回 401。模型账本恰有 3 条 settled（预验证视觉 1 + 文件 Agent 工具前后 2），上传本身不新增消费。正常退出后可独立取得附件清除计划，4 个正文副本保留，两个所有者均已释放。

界面注入的是 pathless 合成 `File`，**没有操作系统文件选择器认证**。官方桌面对于带宿主路径的非图像文件仍可能插入路径引用；本轮没有把这一分支改为强制上传，也不能把路径引用记作已上传。上轮真实图片预览/移除/发送/刷新证据保留，相关单测本轮一并重跑。

| 阶段 | 原始测试结果 | 说明 |
| --- | --- | --- |
| red-r1 | 0/7 | 可选 files 能力尚不存在 |
| implementation-r2 | 0/1 | 新工具注册括号错误，模块解析失败；文件级失败不能记作 7 个已执行定义 |
| implementation-r3 | 0/7 | 缺少 Cordis fs inject 声明，启动失败 |
| implementation-r4 | 3/7 | 一处原生错误码投影遗漏；另三处夹具问题为配额漏计元数据、未建索引、关闭后读取已移除服务 |
| governance-r5 | 7/7 | 修复及夹具纠正后通过 |
| suffix-red-r6 | 13/14 | 仅验证文本前缀，漏查后部二进制；真实复现 |
| suffix-green-r7 | 14/14 | 流式校验全文后通过 |
| ui-r8 | 14/14；桌面整体 fail | 文件界面流程成功并正常退出；观察器误套旧图片场景断言，整体 fail 保留 |
| ui-r9 | 14/14；桌面 pass | 修正观察器分支并补活跃回执检查 |
| final-r10 | 147/147；桌面两轮 pass | 不是最终来源授权修复版本 |
| final-r11 | 148/148；桌面两轮 pass | 增加普通 Shell/文件系统私有域负例 |
| provenance-red-r12 | 15/16 | 非用户消息被误当授权来源，真实复现 |
| final-r13 | 149/149；桌面两轮 pass | 最终用户来源约束与所有回归 |

最终零可识别残留进程只覆盖专用发行版中当前 UID 的相关载具、测试和 Electron 命令行。取消阻塞样本是在测试明确释放不合作提供者、实际 abort 完成并成功重试关闭后达到零；删除崩溃样本在逐项离线恢复后达到零。不能据最终审计倒推先前 `blocked` 已释放。最终两轮桌面没有强杀清理。

## 复现、证据与未认证项

- 官方固定提交：`d743267388641bc76f17c45ce8b4c231aed1d32c`（DSH 0.2.1-alpha.2）。
- 本轮源码基线：`97b930868a3cd213d676458ac9fe887992cae641`。
- 冻结 SEP：`0.2.1-beta.3-alpha2-adapter.1`，444 leaves，artifact SHA-256 `5dd125b1493c100acce355a69511ebcf5686b8a4bf440ab2a5cec3c7daeb16ff`；未制造公共新版本。
- 完整输出：`D:\AIData\ProjectWork\DSH\alpha2-linux-file-attachments-20261013-r1`。`linux-evidence/RESULT.json` 绑定每代源码、原始日志、原生输入、桌面回执、截图与最终资源审计；`SYNC-AUDIT.json`、`FINAL-AUDIT.json` 和 `source-checkpoint.bundle` 绑定本地提交及真实恢复克隆检查。
- `run-file-attachments.ps1 -Tag <fresh-tag> -Tests <test-files>` 自动拒绝已有输出。最终测试为此目录的全部 15 个 `*.test.mjs`，并发度 1。不要运行旧脚本的默认输出路径来替代本轮 D: 根。
- 桌面环境必须同时设置 `SEP_LINUX_BUSINESS=1 SEP_LINUX_VISION=1 SEP_LINUX_ATTACHMENT_UI=1 SEP_LINUX_FILE_UI=1`；`SEP_BUNDLE_TEST_ROOT` 为新合成目录，`SEP_PORTABLE_ROOT` 为固定冻结根，`SEP_BWRAP_SHA256` 使用已核验 Bubblewrap 哈希。依次运行 `prepare-linux-file-ui-desktop.mjs`、`run-linux-desktop.mjs`。操作方必须使用封存的 Node 24.19.0、Electron 44、固定官方桌面输入，不从网络临时替换依赖。

完整 Linux SEP、其他官方 presets、私人资料、在线模型、二进制格式解析、系统文件选择器、真实鼠标拖动/托盘菜单、独立宿主进程重启后 UI 恢复、原生点击/判题、通用安装/自动更新、macOS/其他发行版、全应用强制截止、断电/磁盘满及外部同 UID 任意宿主代码攻击均未获本轮认证。固定标准没有降低。
