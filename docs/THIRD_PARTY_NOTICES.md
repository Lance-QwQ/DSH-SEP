# 第三方声明与来源范围

[导航](DOCS_INDEX.md) · [集成列表](OPEN_SOURCE_INTEGRATIONS.md) · [许可说明](LICENSING.md)

本版为独立DSH SEP Windows Beta，不是官方DeepSeek、OpenClaw、Mem0、PinchBench、SWE-ReX或SWE-bench发行版，没有获得上游性能认证。SEP原创代码MIT；第三方原文和notice随实际分发材料保留。

| 来源 | 许可／归属及随包处理 |
|---|---|
| DeepSeek Harness | DeepSeek上游版权及MIT保留，当前宿主0.2.0-rc.2的源码／npm来源绑定见机器记录。 |
| Cordis的DSH分支 | 保留实际scoped依赖中的上游MIT及版权；不以通用Cordis标识替代其来源。 |
| lossless-claw | Josh Lehman／Martian Engineering，MIT；固定vendor源码、许可证与SEP本地改动记录保留。 |
| Mem0 | 固定来源根Apache-2.0原文与nested OSS manifest的MIT声明均保留；仅提炼提示词和schema复用。 |
| PinchBench skill | PinchBench，MIT；三项参考材料及其来源清单保留，不声称运行官方全部题／grader。 |
| DSH-RAG | kai232，MIT；BM25代码复用保留来源声明。 |
| PDF.js／pdfjs-dist | Apache-2.0及随包notice保留；不是SEP原创解析引擎。 |
| canvas及原生平台二进制 | 父包、平台包与原生组件声明分别保留；未作完整源到二进制审计。 |
| fflate、fast-xml-parser等解析依赖 | 按实际package许可及版权保留，不因包含在SEP里变为SEP原创。 |
| Electron／Chromium | Electron MIT及完整Chromium许可证集合保留。 |
| LibreOffice | 官方运行库、多个原许可及相应源材料身份保留；自有Office适配器另按SEP原创授权。 |
| SWE-ReX／SWE-bench | 框架固定来源和MIT原文保留；可选外部后端不等于运行库已全部随Windows包安装。 |
| Node.js／pnpm及其他传递依赖 | 随附运行根和实际程序依赖分别记录版本、来源、哈希和许可文本。 |

上述说明是导航，不取代许可原文。依赖清单、许可集合和来源按本版内容记录保留；四份最终归档的CRC、SHA-256、脱敏审计和ZIP安装结论由随资产提供的包外 `ARTIFACT-VERIFICATION.json` 和 `SHA256SUMS.txt` 权威记录。不把内容目录的通过结果改写为所有原生来源／法律合规认证。包内保留的原package LICENSE／notice和对应源材料应随再次分发保留。

SWE-bench Verified数据、公开任务仓库、测试和容器镜像有独立许可与分发条件，本版不把框架许可扩展给这些材料，也不因文档引用而新增分发数据或镜像。

实际依赖与许可文件分别见 [COMPONENTS.json](COMPONENTS.json) 和 [licenses/index.json](licenses/index.json)；准确版本、文件身份及完整性结果以这两份本版清单为准。

早期“私人预览未获公开分发”及“仅借用rc.5外部宿主”的文字是历史姿态。本版采用DSH 0.2.0-rc.2组合发行：Full含宿主，Only从精确官方npm来源创建新实例；SEP已确认原创MIT。这个更正不将第三方重新许可，也不构成完整二进制源码审计或法律合规认证。原生组件仍按原声明及 [许可边界](LICENSING.md) 阅读。
