# 审阅与局部验证

1. 使用本快照 `graph.json` 与同图 Full 包核对身份。`SOURCE_FILES.json` 的 `exact-release-file` 必须逐项匹配图中相应 store 路径。
2. Office adapter 为可编辑 JavaScript；C# Job Object 桥的编写源也随包提供，由 Windows PowerShell 在运行时加载。不要从缺源码的旧 Kit 复制实现。
3. 测试文件来自本源码快照 `program-source/store/p0438/test/*.test.mjs`；Full 的运行载荷没有这些测试。应先建立独立测试副本，保留 `test/` 与 adapter 文件的相对位置，再接入同图 Full 的匹配 Node 依赖与官方引擎。真实引擎测试读取 `SEP_OFFICE_EXE`，指向该独立环境的 `program/soffice.com`。不得直接修改受管 Full 安装树来补测试。具体测试参数见模块 README；本次没有验证从干净 Git 克隆开始的一键安装／测试命令，以上不是该能力承诺。
4. 核对 adapter README、官方 runtime `SOURCE-ACCESS.md` 与 `source-provenance`。上游 Windows 配置和精确外部依赖下载列表随包提供；未在本地重新编译官方 LibreOffice，也未证明整套 DSH 可重复构建。
5. 修改应进入新的隔离候选并重新封图，不能覆盖日常实例。`release-tools/` 是可审阅的发布转换记录：`pipeline.py` 从脚本位置的 `parents[2]` 推导原工作区，其他输入／输出为固定相对路径。它还依赖未全部放入本源码 ZIP 的已封存基线、文档覆盖层和验证材料，没有任意基线路径 CLI 参数；直接在 `release-tools/` 中运行不构成已验证的独立封包流程。旧 Office-r2 生成器以 `history/office-r2-build-reference/*.py.txt` 原字节保留，只作历史参考，不是当前 MIT 生成入口。不存在一条命令重建全部 DSH 及第三方二进制的承诺。

本快照不含真实 Key、私人会话、记忆库或原 Git 历史。MIT 仅适用于已映射原创部分，原 DSH 与第三方许可不变。完整第三方来源和许可义务见对应组件材料。
