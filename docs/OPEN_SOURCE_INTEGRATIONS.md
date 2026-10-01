# 适配与集成的开源项目

[导航](DOCS_INDEX.md) · [许可说明](LICENSING.md) · [第三方声明](THIRD_PARTY_NOTICES.md)

SEP 0.2.1-beta.1基于DSH 0.2.0-rc.2。这里区分运行依赖、选定代码复用、参考题目和可选后端；它们并非都是可以单独开关的插件。实际交付包、依赖版本、文件和许可身份由本版机器清单绑定，不能沿用旧图内package编号推定新包。

| 上游 | 接入方式 | 明确边界 |
|---|---|---|
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | 宿主、原生工具、模型／会话、桌面和插件体系；本版带必要宿主适配。 | 完整源码含已跟踪与新增SEP代码，实际图不等于纯官方提交。Only从精确npm来源复制，原实例不改。 |
| DSH随附Cordis分支 | 插件装载、服务注入、启停与生命周期。 | 依赖宿主scoped包及精确接口，不与任意Cordis版本互换。 |
| [lossless-claw](https://github.com/Martian-Engineering/lossless-claw) | 选定SQLite迁移、会话、summary和token模块；来源完整性与按需原文展开适配。固定来源提交`c84dd8cff727eff3bb6c9a26f3cf4c0510fbc343`。 | 原生摘要＋受控展开，不是完整OpenClaw注册器或持久化多级LCM；没有“语义绝对无损”保证。 |
| [Mem0](https://github.com/mem0ai/mem0) | 固定提炼提示词和schema，提交`c7ee362aff94a369af70f13f2b4f853f6793ff4c`。 | 当前项目／会话／轮次选定直接用户消息，不扫其他项目或全部历史；未安装Mem0云、向量库、SDK或遥测。 |
| [PinchBench skill](https://github.com/pinchbench/skill) | 固定三项参考材料及本地合成就绪检查，提交`819384ae830492365b8363fc26bc2602e73f216d`。 | 自写确定性评分，限于受管子任务；不是官方原题全量、榜单或复杂任务质量认证。 |
| [DSH-RAG](https://github.com/imkelt/DSH-RAG) | 复用／改编BM25实现，固定提交`fa211a4913b6ab465e30d09aad0a29cea134a817`。 | SEP另建四层记忆、作用域、生命周期和删除治理，不是安装完整上游插件／全部后端。 |
| [PDF.js](https://github.com/mozilla/pdf.js)、[canvas](https://github.com/Brooooooklyn/canvas)、fflate、fast-xml-parser | PDF文本提取／绘制及DOCX解包解析。 | 使用限额、取消和Worker边界；不等于全部OCR／布局还原，Worker不是操作系统安全隔离。 |
| [Electron](https://github.com/electron/electron) | 官方DSH桌面运行依赖，SEP修改main／renderer集成。 | 不是在另一桌面应用外再套第二个壳；Chromium及内嵌组件各有声明。 |
| [LibreOffice](https://www.libreoffice.org/) | 由SEP自有Office适配器提供本地文档预览。 | 独立profile及所属进程管理，不能保证Office排版等价；非默认字体配置／诊断有限。 |
| [SWE-ReX](https://github.com/SWE-agent/SWE-ReX) | 自写受控桥接与受信任启动器，外部Python／容器后端另配。固定来源`5c995c365dfb1fd5bc56fda688be5d8538f9931f`。 | 已记录受控WSL/Docker固定接口证据，不是全部SWE-ReX API或任意远端服务兼容认证。 |
| [SWE-bench](https://github.com/SWE-bench/SWE-bench) | 外部官方判分库，绑定获准实例、镜像、补丁和回执；固定来源`02e7a74ffd0b707aab73d203fe87bdc7c76afc8e`。 | SymPy与Flask两个固定实例有正负对照；不代表全部公开仓库／完整榜单／在线Agent正例闭环。 |

SWE评测默认关闭，需要专门后端。参考源码、插件接口和完整可用运行时是三个不同层次，不应因包内有接口就称后端一键安装完毕。未启用的完整lossless-claw编排器也不能仅因vendor文件存在就视为接线完成。

Node.js、pnpm、原生平台包和其他传递依赖按实际版本保留来源与许可。没有记录确切源码提交的依赖不从版本号猜测提交；预编译二进制的来源哈希不证明本地逐字节重建。第三方材料和数据／镜像须按其原许可分别处理。

BM25算法参数、中文分词、JSON数据域与SQLite辅助组件的区别，以及记忆生命周期和费用边界，见[技术概览](TECHNICAL_OVERVIEW.md)。
