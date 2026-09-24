# DSH SEP Full · Windows x64 Alpha

**DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE（DSH系统增强套件）**

分发 **20260921-mit-alpha**，文档 **20260921-docs-r6**，DSH **0.1.6-alpha.2**，SEP **0.1.0-alpha.15.dsh-alpha2.1**。程序图 `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52`。本轮只更新许可、文档与相关元数据，没有升级宿主或改变运行实现。

## 当前交付状态

本轮只更新许可、文档和相关元数据；运行实现基线为 `20260921-office-r2`，程序图 `a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8`。代码与二进制等同性、重新安装、ZIP 和脱敏核验结果：**pass：本轮已核对仅已映射原创许可、包声明与文档/绑定变更，运行实现及第三方文件与 Office-r2 字节相同；沿用其固定 Windows 11 功能证据，未重跑全部功能或付费模型。最终 MIT ZIP 安装、逐文件验证与脱敏结果由包外 DELIVERY-REPORT.json 单独绑定。**。功能证据沿用该固定基线，不宣称本轮重跑了完整功能矩阵、真实模型、长时间运行或全部环境测试。

历史 `GUARDIAN_NOT_READY`／`HOST_STARTUP_UNATTRIBUTED` 宿主启动异常仍未归因、未证明修复；原 Only 合成安装追加的 10 次启动、记忆只读检查和正常退出均未复现。项目所有者已允许带此已知问题进行 Windows Alpha 测试发布。这项决定不把历史 fail 改为 pass，不降低原验收标准，也不表示通过稳定版准入。

本包包含独立官方 Office 运行库，单该组件解压后约 **1.58 GB**，无需全局安装 LibreOffice；目标 Windows 10/11 x64，功能基线实测 Windows 11。使用独立 profile 与所属进程，不是操作系统安全沙箱。字体诊断明确为 unavailable，不保证排版完全等同 Microsoft Office。转换、字体配置与限额差异详见 [Office 转换说明](docs/OFFICE_CONVERTER.md)。

Office 转换建议使用短工作目录：profile／任务临时目录的原路径或经身份核验的同目录 8.3 名称须不超过 128 个 UTF-16 字符，否则启动前明确拒绝。任务的 TEMP／TMP 留在受管目录；不会自动新增全局盘符。历史 v1 长 profile 失败保留，v2 补测见继承的 office-r2 功能证据。

许可原文、组件来源与可审阅源码不等于全部原生依赖已重建。sharp/libvips 等既有审阅范围保留在文档中。请依据 `RELEASE-STATUS.json`、`SOURCE-PROVENANCE.json` 和 [测试摘要](docs/TEST_ACCEPTANCE.md) 判断本包状态；上传是否完成以实际发布记录为准。

## 本包是什么

本包包含固定的完整DSH＋SEP程序图、Electron桌面以及Node／Python Office运行环境，不要求电脑已经安装DSH。

Only／Full都安装到新的独立目录，不原地覆盖原DSH，不删除原实例的数据或自装插件。Only要求版本、依赖布局及所需文件全部匹配；相同alpha.2版本号不保证任意官方安装布局均受支持。未知版本或文件不匹配时会拒绝，不能改清单绕过。

能力包括四层记忆和本地RAG、记忆设置、受管子任务、文件变更辅助、Worker、恢复中心、任务检查点，以及HARNESS／SEP一体式桌面。可选SWE-bench／SWE-ReX评测和上下文准备默认关闭，需要另行配置受控WSL／Docker等环境，不是任意仓库即装即用的解题服务。

## 安装与启动

1. 在本机解压。选尚不存在的本地目标，建议短路径，如 `D:\DSH-SEP`。目标父目录须存在；不能与解压目录或Only来源目录互相包含，不能用路径别名绕过。
2. 在解压目录用PowerShell执行（本包的实际参数形式）：

   ```powershell
   .\install.ps1 -Destination 'D:\DSH-SEP'
   ```

   也可直接用随包Node，不必更改系统脚本策略：

   ```powershell
   & '.\runtime\node\node.exe' '.\installer.mjs' 'D:\DSH-SEP'
   ```

   `installer.mjs` 接收 `<new-directory> [supported-host-root]`；Only需要第二个位置参数，Full不需要。Only的交互脚本会在未提供参数时分别询问新目录和受支持程序目录；来源根应含 `node_modules`。

3. 安装成功须有 `installed.json` 回执。只有 `INSTALLING.json` 的中断现场不得当作可用安装；保留错误，处理后换新目录重试。
4. 在安装目录自己的 `.env` 中填写 `DEEPSEEK_API_KEY`。空密钥可开界面，不能真实请求模型；不要把此文件发到公开仓库或反馈日志。
5. 双击安装目录的 `start.vbs`，或运行 `start.ps1`。从受管入口启动，不直接运行内部Electron绕过实例管理。

## 关闭、并存与数据

窗口关闭会隐藏并保留后台；完整结束本实例用“应用 → 退出”或托盘“退出DSH SEP”。更新、迁移或卸载前先让任务正常收尾，不按 `node`／`electron` 名称批量结束进程。

每个实例独立拥有程序、home、state、data、workspace、凭据路径、项目身份、本机动态端口和恢复中心。它是应用实例隔离，不是虚拟机／Windows Sandbox。普通Shell使用当前Windows用户权限；两边主动选择同一工作目录时会修改同一真实文件。

新安装为空白业务库，不带原会话、私人记忆、API Key、账本或其他实例的自装插件。需要迁入资料或插件时单独核对兼容与治理范围。预算按实例实际配置记账，多个新实例不能据此绕过用户约定的总额度。

Mem0辅助提炼只使用同项目允许的消息；L3共享需要显式绑定；L4按需访问。RAG拒绝多硬链接或无法核验本地身份的来源。文件保护与安全变更只覆盖接入的受管入口，普通Shell和任意插件直接写入不受完整统一沙箱保证。

## 更新、恢复与卸载

启动及每运行三小时查询官方发布，用户可以暂缓；实际安装要求受控候选、插件兼容与保留检查及维护流程，风险确认不能跳过数据与完整性门禁。历史未归因工作前评测样本继续保留，上游503等外部失败仍可能出现，不自动重放未知结果的操作或释放费用预留。

安装后的内部链接绑定位置，不要直接移动整个目录。需要换位置时重新安装，再另行处理数据。当前没有通用 `uninstall` 命令；正常完整退出并保留所需资料后，按安装指南处理明确的本实例目录。原DSH未被本安装器原地改写，可通过原入口继续使用；SEP新增资料不会自动迁回。

工作区备份不包含所有记忆域与凭据，也不代表有新业务写入后可以随意覆盖旧快照。更新恢复需兼容性、持久化提交状态、写入代次及不会随快照回退的删除依据。未知状态保持停止，不删锁或强行改数据。


## 许可、来源和文档

SEP 已确认原创部分采用 **MIT**，版权 `Copyright (c) 2026 DSH SEP contributors`；允许使用、修改、复制、分发、再许可及销售，须保留版权和许可声明。第三方组件保留自身条款，不能把整个安装包统一重新许可为 MIT。具体范围见 [许可说明](docs/LICENSING.md)、LICENSE 与各包 LICENSE-SCOPE。

可审阅源码归档 `DSH-SEP-Source-20260921-MIT.zip`，清单 SHA-256 `ed91e199c25db5a35844111d535a75f66e3c5537bf332f08cb4a09b9ca16053f`。程序与来源身份见 graph.json、SOURCE-PROVENANCE.json；不声称所有传递原生依赖都可从一个 Git 提交逐字节重建。当前 ZIP 自身最终哈希在包外 SHA256SUMS.txt，哈希不是发行者签名。

[文档导航](docs/DOCS_INDEX.md) · [测试摘要](docs/TEST_ACCEPTANCE.md) · [GitHub 仓库](https://github.com/Lance-QwQ/DSH-SEP)。普通问题与安全报告按仓库公布入口提交；不要公开私人日志、正文、密钥或完整转储。
