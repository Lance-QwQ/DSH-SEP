# DSH SEP Office 替换交付

分发修订 `20260921-office-r2`，程序图 `a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8`。DSH 仍为 0.1.6-alpha.2；本轮更新 Office 转换组件、调用接口和字体提示，未升级其他宿主代码。

- [仅 SEP 包](DSH-SEP-Only-Windows-x64.zip)：包含插件、必要宿主适配与独立 Office 运行库；安装时需要受支持的原 DSH 来源。
- [完整包](DSH-SEP-Full-Windows-x64.zip)：包含 DSH 与 SEP，安装到独立目录及空白数据环境。
- [可审阅源码](DSH-SEP-Source-20260921-office-r2.zip)
- [文档集](DSH-SEP-Release-Docs-20260921-r5.zip)
- [SHA-256](SHA256SUMS.txt) · [完整交付结果](DELIVERY-REPORT.json)

pass：适配器 69/69；真实格式转换三轮 18/18，加 16 项边界共 34/34；超链接保留且零自动请求；宿主服务三轮、原字体字段断言、4 项通信契约及真实桌面预览通过。最终 ZIP 实装和隐私扫描另由包外交付报告绑定。

旧 Kit 与 native 包已移除，换为自有 CLI 适配器及官方 LibreOffice 26.8.0.3；前者完整编写源、后者四份对应源档的下载地址与核验记录一并交付。这不表示旧仓库的 404 已解决。

本轮未改日常安装，未创建或上传 GitHub 仓库。历史启动异常仍未归因，故没有把“本轮替换验证通过”改写成“公开发布所有门槛已通过”。新失败与修订复验分别保留；字体、长路径和安全范围见包内 OFFICE_CONVERTER.md。
