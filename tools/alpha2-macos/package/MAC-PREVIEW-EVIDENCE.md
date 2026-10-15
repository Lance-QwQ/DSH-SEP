# macOS ARM64 预览：当前制品与证据入口

当前状态：**r77 两轮实际项目页面通过；r78 新安装器构建、下载核验和限定扫描通过；r79 独立测试入口的实际控件安装 6/6、已安装新应用两轮启动及正常收尾审计通过。最终四文件交付已生成并完整回读核验。** 完整 Mac 认证为 `blocked`，具体未执行事项仍为 `not_run`。

这是一份 DSH `0.2.1-alpha.2`＋SEP Mac 派生组合的隔离预览。以下各行证明不同的事实，不能合并成已完成全部功能、私人环境或所有 Mac 认证。历史失败报告保留原状态。

## 本次新安装器

| 字段 | 实际值 |
| --- | --- |
| 文件 | `DSH-SEP-macOS-Alpha2-installer-preview.zip` |
| 字节数 | 692,801,617 |
| ZIP SHA-256 | `6043ddd8305009e9013de46f85f7660cdc775d4320987553808eb9f8ec01db4f` |
| 安装器构建提交 | `e2cdf833051e9ff0b451d0885549f38690220acd` |
| 构建 CI | run `38648087267` / job `116139848422` |
| INSTALLER 清单 SHA-256 | `93f6ca255692457a084ae91588f8d72b9cebacb232f327139a2d787acb481dd4` |
| 安装器 inventory SHA-256 | `df8bd9acc904cd733afcb724c219344347707f68c60658941075f7a33298f7aa` |
| 原始构建 RESULT SHA-256 | `778975555791cc4d6b70ba3f698cab1d7ef038ddb9288d08e29c33f9a9de1043` |

它携带固定 r74 应用：ZIP SHA-256 `20dd042cdf53752e0ce4f6c93ae919bf895c844f0772cdf9f5b881b29b654107`，来源提交 `155f324013fada4caf3ecd15a9631678d4d5c4a7`；PROGRAM `e3d13eb3ce1dcc45e3afdb755682d3c56db25d47c7811159860cbb298c026834`，BOOTSTRAP `ff97b34568f4cdf3d380191256b5523f1f27049b7e0c3a9afba16060da9fbc2b`。安装器编译/签名与应用页面验证来自不同提交，均单独绑定。

## 证据导航

本机证据根为 `D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1`。表内路径相对此根；这里只链接记录，不要求用户运行测试脚本或安装历史包。

| 记录 | 状态与范围 | 记录 SHA-256 |
| --- | --- | --- |
| `project-native-ui-r77/AUDIT.json` | 两轮未改 r74 实包、同 P2 的 Inspector 辅助实际页面与正常收尾；预览/取消/丢弃/恢复候选通过。原生项目确认接受和实际 UI commit 未验。 | `0e2a9c877dcbb84b381184666be1feefa5ebb9395f4a0ca9883a9cff47e54b81` |
| `installer-application-r78/AUDIT.json` | 11 个生产原生源、16 个控制器源和 2 个 helper 源保持；新清单编译、签名、归档恢复通过。未启动/安装应用。 | `d83d1d267531ae62ebe3c82c3609d65089a7435d8567019eda7b4ef4494ab6da` |
| `installer-r78-distribution/verified-package/DOWNLOAD-VERIFIED.json` | 三个实际 GitHub 工件、分片、原始构建回执、whole ZIP 与落盘回读一致；Windows 本地下载核验，不是原生执行。 | `e5bfadfc0b0c876f9f3a8b54542559c56585d8d4b82f9a9f1014929c06578ab2` |
| `installer-r78-distribution/privacy-scan-r1/AUDIT.json` | 新安装器独立限定扫描：29,415 个名称、16,041 个文本、128 MiB 上限；二进制/ASAR 等未覆盖，不保证绝对无私人数据。 | `48957a454a189430a74cd29c727ead85486635416eb40ba620eb2c247d05d4c3` |
| `installer-integration-native-r79/AUDIT.json` | 新安装器原字节启闭、独立实际控件安装 6/6、已安装新应用两轮同 Profile 启动/重启及正常收尾通过。提交 `b5b64827ab2c5b1e223f838bdc2539371bf4f923`，run `38650349354` / job `116147301943`。 | `e0581b598011edb008378982d3b67282b2242d4b7206e3d27cc6301a34264f78` |
| `installer-r79-peer-review/AUDIT.json` | 独立对原始回执、输入与制品绑定及交付准入的二次核对通过；未在本机重跑原生安装。 | `716c63e4979ce1e0ef0ea3b450d2a462635645a5d3529317ae8da51853e60e48` |

r79 的原字节安装器接收 36 次正常退出请求后 exit 0 并被观察为消失；这只证明所记录的启动和最终正常退出，不证明单击立即退出，也没有独立观察其私有控制器内部 drain。独立测试入口使用未改生产模块、真实控制器、实际 NSButton/NSAlert，安装结束后 UI 释放、controller closed 回执、输出 EOF、确切 exit 0 均通过；安装后应用两轮各自同代 closed/pass、LaunchServices wait exit 0 及确切外层/桌面进程消失通过，无强杀或后备清理。全系统进程清点未执行。

原始安装 RESULT SHA-256 为 `4a995cd30c081c7447a6d046196739e8d97f9614f842bf73f6b4139ea7ad35dd`，安装后启动 RESULT 为 `d56ea659f062f2cad5c5f9101c778db585108d3560ddbf8fa0aae4de9233c60a`。两行证据分别绑定 r79 测试提交及 r78 installer/r74 payload，构建提交不冒充测试提交。

r77 原生环境为 macOS 15.7.9 ARM64，run `38647172082`、job `116136794001`，测试提交 `bbebae79cfbca35a9e31c8385a985920a7798567`。第二轮启动前的代次提交由可信合成载具完成，不计作 UI 提交；两轮真实页面的 normal close 与确切 exit 0 独立保存。使用后全产品树清点未在这两轮执行。

限定扫描中的 101 个候选为 100 个依赖文件中的 CI 构建路径和一处 jose 私钥格式校验字符串；未发现覆盖规则内的凭据/状态文件名或令牌样式。这不是全面安全或隐私审计。扫描结果不替代新安装器的 r79 原生安装验证。

## 旧证据如何保留

r71 旧安装器携带 r61 应用；r72 的真实安装 6 项及安装后两轮通过只属于该旧组合。r70 待审计划重启缺陷、r74 早期 Inspector blocked、r75 测试表达式失败保持原记录；后继 r73/r77 的修复和验证不改写过去的失败、未执行或未确认收尾。

## 唯一交付入口

新安装器实际 AUDIT 与二次核对通过后，已运行固定 SHA-256 `5b8566cd4a1d91d3dfd0ddb1d2722884810f95d6ed465acc4f8517f3f6268b10` 的本地 `finalize-mac-preview.mjs`，使用同一 DOWNLOAD/AUDIT 生成以下四文件。目录为 `D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1\mac-preview-delivery-r1`；每个文件已完整回读，SHA256SUMS 的三个条目逐项一致。文档在 ZIP 外，没有运行、重签或修改应用，也没有推送发布。

| 文件 | 字节数 | SHA-256 |
| --- | --- | --- |
| `DSH-SEP-macOS-Alpha2-installer-preview.zip` | 692,801,617 | `6043ddd8305009e9013de46f85f7660cdc775d4320987553808eb9f8ec01db4f` |
| `README.md` | 2,949 | `bd56840d1e1b5b3cc76ee00974f9722f5f6d8d0578a7bb4b41fc21c54ed8226d` |
| `MANIFEST.json` | 4,500 | `48d4a25760bb6fff09fb08ecc0cfbafaf3109b31b5ed7e259d87b959d413c975` |
| `SHA256SUMS` | 265 | `1a6539aae3070f0c805eb2b3056576790a7dce8b1721cd965648e7e0ee6e8799` |

使用与边界见 [用户说明](MAC-PREVIEW-USER-GUIDE.md)。普通 Shell、任意 MCP/Computer Use、自动更新安装未开放；任意项目导入、多项目、原生项目确认接受、付费模型、私人资料接续、物理输入、Intel/其他 macOS、Developer ID/Apple 公证仍未完成。Windows 日常版和 GitHub Release 不随本记录改变。
