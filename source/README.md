# DSH SEP MIT Windows Alpha：可审阅发布源码

修订 `20260921-mit-alpha`；公开仓库：https://github.com/Lance-QwQ/DSH-SEP。程序图 `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52`，逐文件清单 `SOURCE_FILES.json`。

本快照提供发布图对应的 SEP／适配宿主可编辑文件、Office 适配器 JavaScript／PowerShell／C#、相关测试及补充编写源。当前原创授权为 MIT，原 DSH 和第三方继续适用其原许可。它不是全部传递原生依赖源码或整套软件独立可重复构建证明。

Office 入口为 `program-source/store/p0438/index.js`，测试在本源码快照的同目录 `test/`，不在 Full 的运行载荷中。测试需在独立副本中配合匹配 Full 的依赖／引擎，真实引擎参数 `SEP_OFFICE_EXE` 及范围见 `BUILD.md`；未验证干净克隆的一键测试命令。官方 LibreOffice 匹配源码访问见 `program-source/store/p0439/SOURCE-ACCESS.md`；四份大型上游源码归档没有塞入此 ZIP。

本轮只调整许可、文档与绑定，运行实现与已验证的 Office-r2 图逐字节相同。历史启动异常仍未归因，项目所有者明确批准在披露此已知问题的前提下进行 Windows Alpha 测试发布；这不是稳定版认证。

`release-tools/` 记录从固定旧分发到 MIT 分发的生成过程，采用原发布工作区的固定相对布局，依赖基线归档、外部文档覆盖层与验证材料；没有接收任意基线路径的 CLI 参数。它们可供审阅，不是从本快照直接运行即可封包的独立构建工具。旧 `packaging/*.py` 已移至 `history/office-r2-build-reference/*.py.txt`，只作原字节历史参考，不能作为当前 MIT 生成入口。更多使用边界见 `BUILD.md`。
