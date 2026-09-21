# 适配与集成的开源项目列表

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-office-r2` · 文档 `20260921-docs-r5` · **Office 转换器替换候选**。当前包使用自有适配器和官方 LibreOffice；验证与发布状态见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。GitHub 仓库尚未创建，未执行上传。
<!-- SEP_RELEASE_STATUS_END -->

[返回文档导航](DOCS_INDEX.md) · [第三方声明](THIRD_PARTY_NOTICES.md) · [完整依赖清单](DEPENDENCIES.json)

文档日期：2026-09-21。能力基线为 Windows 11 x64（build 26200）日常版本 sep-alpha2-stability-20260921，DSH 0.1.6-alpha.2；精确程序图见 [发布清单](RELEASE_MANIFEST.json)。本次分发候选为 `20260921-office-r2`，继承该能力来源并按文件权属同步许可；最终图与包级验证另列。`20260920-r2-sanitized` 的 e578 图仅作为历史分发记录。

## 如何理解这份列表

这里包含运行依赖、少量上游组件复用、参考题目和可选外部后端。它们并非都是可单独开关的“已安装插件”。SEP 的 Cordis 插件负责把这些能力接入宿主；只看到包名也不能断言它已经启用。完整程序图包含 DSH 本体及传递依赖，不能把图中包数当作增强插件数；当前数量以清单为准。

SEP 是本地独立适配项目，不是以下上游项目的官方发行版，也没有获得它们的性能认证。SEP 原创部分已确定允许个人及企业内部使用、修改、免费转发和制作衍生版；出售或商业分发须另行授权，衍生版沿用相同商业限制，见 [许可说明](LICENSING.md)；本页的开源属性仅指相应上游。

## 已包含的代码或材料

| 项目／固定来源 | 实际接入方式与作用 | 本地调整及明确边界 | 上游许可记录 |
|---|---|---|---|
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/tree/ddefc45fbc7f8e46dd73185e68295696d1297887)，0.1.6-alpha.2，基线提交 ddefc45fbc7f8e46dd73185e68295696d1297887 | DSH 宿主、原生工具、会话、模型与桌面框架；Full 形式包含宿主，Only 形式保留必要适配补丁。 | SEP 添加治理、任务生命周期、会话迁移、受控更新和恢复接线，调整桌面显示及后台行为。实际文件已修改，不能将上游提交号当作 SEP 最终代码身份；需要程序图哈希。未知宿主版本不能据此声明兼容。 | [MIT](licenses/graph/p0021/LICENSE)，Copyright (c) 2026 DeepSeek。 |
| [Cordis 的 DSH 分支](https://github.com/deepseek-ai/deepseek-harness/tree/ddefc45fbc7f8e46dd73185e68295696d1297887/vendor/cordis)，@deepseek-ai/cordis 4.0.2 | 真正的插件运行框架：服务注入、装载、卸载与生命周期。 | SEP 使用 DSH 随附的 scoped 包，不能与任意版本通用 cordis 包互换。未对 Cordis 单独做完整上游回归。 | 包声明 MIT；随图许可原文及实际依赖映射见 DEPENDENCIES.json。 |
| [lossless-claw](https://github.com/Martian-Engineering/lossless-claw/tree/c84dd8cff727eff3bb6c9a26f3cf4c0510fbc343)，提交 c84dd8cff727eff3bb6c9a26f3cf4c0510fbc343 | vendor 内包含 SQLite 迁移、会话、摘要和 token 等选定模块；通过受限 Worker 内存库参与来源完整性处理。SEP 将来源检查、人工审阅及受控原文展开接到原生压缩流程。 | TypeScript 转译为 JavaScript，并增加 DSH 适配。保留原生摘要算法；未移植完整多级持久化 LCM 引擎，也不承诺语义“绝对无损”。没有安装 OpenClaw 本体或其插件注册器。 | [MIT](licenses/graph/p0517/vendor/lossless-claw/LICENSE)，Copyright (c) 2026 Josh Lehman / Martian Engineering。 |
| [Mem0](https://github.com/mem0ai/mem0/tree/c7ee362aff94a369af70f13f2b4f853f6793ff4c)，提交 c7ee362aff94a369af70f13f2b4f853f6793ff4c | 复用事实提取提示词与输出 schema，作为原 SEP 四级记忆学习的辅助线索。 | 先限定当前已注册项目、当前会话当前轮次、被选中的直接用户消息；排除其他项目、工具消息、L4 正文及已过滤凭据。不是同项目全部历史扫描器。提议由 SEP 再验证、分类和存储；不安装完整 Mem0 向量库、云 SDK、遥测或另一套私人库。原核心已授权的 L3 共享不作为 Mem0 输入。 | 仓库根 [Apache-2.0 原文](licenses/graph/p0517/vendor/mem0/LICENSE)已保留；固定源码的 nested OSS package.json 又声明 MIT。这一差异如实保留，未擅自解释为双许可证。 |
| [PinchBench skill](https://github.com/pinchbench/skill/tree/819384ae830492365b8363fc26bc2602e73f216d)，提交 819384ae830492365b8363fc26bc2602e73f216d | 随包保留任务来源目录与三项参考材料；SEP 的工作前检查参考 task_sanity、task_csv_cities_filter、task_summary。 | 实际运行是内联合成数据、无工具调用的小型模型就绪检查和 SEP 自写确定性评分器。仅作用于经 suite_delegate 创建的任务；模型／推理等绑定变化或缓存到期需重评。三次样本保留，失败与缺项按既定规则处理。不是官方原题全量执行、排行榜成绩或所有子代理能力认证。 | [MIT](licenses/graph/p0517/vendor/pinchbench/LICENSE)，Copyright (c) 2026 PinchBench。 |
| [DSH-RAG](https://github.com/imkelt/DSH-RAG/tree/fa211a4913b6ab465e30d09aad0a29cea134a817)，提交 fa211a4913b6ab465e30d09aad0a29cea134a817 | 复用并改编 BM25 检索实现，作为 SEP 本地 RAG 的文本检索基础。 | 去除类型声明及原宿主封装，SEP 另行实现四级记忆、作用域、生命周期与删除治理。没有直接安装完整 DSH-RAG 插件，也没有继承其所有后端。 | [MIT](licenses/graph/p0501/licenses/DSH-RAG-MIT.txt)，Copyright (c) 2026 kai232。 |
| [PDF.js／pdfjs-dist](https://github.com/mozilla/pdfjs-dist)，6.2.108 | 本地 PDF 文本提取依赖；由 SEP 解析 Worker 调用。 | SEP 包装输入大小、取消、超时和错误边界；没有修改 PDF.js 主体的已记录证据。支持文本提取不等于完成所有扫描 PDF OCR、布局还原或所有损坏文件兼容。安装 manifest 未给出可独立确认的准确源码提交。 | [Apache-2.0](licenses/graph/p0512/LICENSE)；包内其他 notice 保留在许可证集合。 |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas)，1.0.8；Windows x64 预编译包同版本 | 图像读取及 PDF 相关原生绘制支持。 | 使用发布的预编译原生二进制；未本地重建，也没有完成 Skia 等全部内嵌组件的源代码到二进制审计。Worker 资源限制不能表述为完整操作系统隔离。 | 声明 MIT；[父包许可](licenses/graph/p0501/licenses/napi-rs-canvas-1.0.8-LICENSE)及[平台包补充许可](licenses/graph/p0501/licenses/napi-rs-canvas-win32-x64-msvc-1.0.8-UPSTREAM-LICENSE)。 |
| [fflate](https://github.com/101arrowz/fflate)，0.8.3；[fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)，5.11.1 | 解压 DOCX 并解析主文档 XML。 | SEP 对条目、展开大小和 XML 实体等加限额；当前主要提取 DOCX 正文，不应宣传为图片、页眉页脚全内容解析器。DSH 图中可能存在其他版本，由清单分别列出。 | 各包声明 MIT，具体原文随依赖清单绑定。 |
| [Electron](https://github.com/electron/electron)，44.0.0 | 当前 DSH 官方桌面框架的运行依赖；SEP 基于该桌面程序适配，不是额外在另一桌面窗口外叠加第二层壳。 | 本地改动在 DSH/SEP main 与 renderer 集成层；保留关闭窗口后后台、托盘完整退出、独立实例身份和恢复连接。未修改 Electron 二进制的已记录证据。 | [Electron MIT](licenses/graph/p0520/LICENSE)与[Chromium 及所含组件声明](licenses/graph/p0520/dist/LICENSES.chromium.html)；不能用一个 MIT 标签概括全部内嵌组件。 |

## 本轮新增的 Office 集成

| 组件 | 实际作用 | 来源与边界 |
|---|---|---|
| `@dsh-sep/office-converter` 0.1.0 | 本项目新写的 JS／PowerShell／C# 适配器，保留 DSH 上层转换接口、队列和错误回执 | SEP 原创许可；不是旧 Kit 的打包 JS 改名，源码与测试随本版快照交付。 |
| 官方 LibreOffice 26.8.0.3 / `@dsh-sep/libreoffice-runtime` | Office 文档解析与 PDF 渲染，独立 profile、Windows Job 所属进程管理 | 官方签名 MSI 行政提取并记录布局变化；原多许可证与对应源材料保留。四份官方源码已下载核验。约 1.58 GB 解压运行库，不代表完整 OS 安全沙箱。 |

旧 `@deepseek-ai/libreoffice-kit` 及其原生平台包不再作为本版转换依赖；DSH Office 服务仍负责上层授权、排队与缓存。字体诊断不可用、自定义字体配置不支持等差异见 [Office 转换说明](OFFICE_CONVERTER.md)。

此外，Node.js 24.19.0 和 pnpm 11.7.0 是单独的随附运行时根，不作为程序图内独立包条目计数；本轮只记录其根版本和许可文本。校验、XML、字体、网络与宿主其他传递依赖按实际包版本列入 DEPENDENCIES.json，不能由本表推断未列出的功能都已启用。

## 可选外部执行与评测后端

| 项目／固定来源 | 与 SEP 的关系 | 启用条件、已验证范围与限制 |
|---|---|---|
| [SWE-ReX](https://github.com/SWE-agent/SWE-ReX/tree/5c995c365dfb1fd5bc56fda688be5d8538f9931f)，1.4.0，提交 5c995c365dfb1fd5bc56fda688be5d8538f9931f；[MIT](licenses/external/SWE-ReX-LICENSE.txt) | SEP 自写受控 HTTP/容器桥接；完整 Python 运行库须在独立 Linux 环境另行配置。Windows 插件包内有受信任启动器和 Linux 桥接源码，不能据此声称运行时已随 ZIP 一键安装。 | 已有固定 WSL2／Docker 环境下的 PTY、退出码、双流输出、中文文件、超时、取消、清理与回环鉴权证据。只声明经过实现和验证的受限接口，不宣称完整任意上传、任意命令或全部 SWE-ReX API 兼容。 |
| [SWE-bench](https://github.com/SWE-bench/SWE-bench/tree/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e)，5.0.2，提交 02e7a74ffd0b707aab73d203fe87bdc7c76afc8e；[MIT](licenses/external/SWE-bench-LICENSE) | 外部官方判分运行库；SEP 绑定已审阅的实例、补丁、镜像、数据和结果回执。不是普通日常任务的自动解题插件。 | 保留官方 run_instance、测试脚本和 get_eval_report，独立评分进程的容器创建／启动／清理由受控容器适配器接管。已增加第二个公开仓库固定实例的后端执行证据；SymPy 与 Flask 两个实例均有正负对照记录。不能据此宣称跨仓库兼容性全面验证、完整排行榜分数，或同一次在线 Agent 正例闭环。 |
| [SWE-bench Verified 数据](https://huggingface.co/datasets/SWE-bench/SWE-bench_Verified/tree/78f471bf655a3137b2e8a75af1501690ec009ec3)，修订 78f471bf655a3137b2e8a75af1501690ec009ec3 | 固定评测输入及可信评分数据；不是插件或运行库。 | 当前 Parquet 身份为 030cfd7f2a704c4c0226e7f104c725a3b41230b1d3517f9c915ad7ea5be3fa25。原仓库代码、测试、数据和容器镜像各自的许可需分别保留；不能仅凭 SWE-bench 的 MIT 推定整个数据／镜像集合许可相同。本轮未随文档新增分发数据或镜像。 |

评测插件默认关闭。管理员需提前准备专用 WSL2、Python、Docker、固定镜像及受控配置身份，再显式启用；没有验证全新电脑一键离线安装。普通用户工作区不会自动被认定为可公开上传的评测输入。关闭返回 blocked 表示尚不能确认收尾成功，不能写成资源已全部清理。

## 版本、更新和卸载

上游网站可能继续更新，本页记录的是实际使用的固定版本；它不是“推荐一律升级到最新版”的清单。更新 DSH 前需检查 SEP 和其他插件，版本相同也不替代文件完整性验证。第三方组件的更新须重新封存程序图、必要的许可、兼容结果与发布说明。

当前 Only／Full 都在新目录组合一个独立实例；Only 从受支持的 DSH 程序目录校验并复制所需宿主文件，不原地改写来源实例。停用或卸载这个 SEP 实例后，原官方 DSH 仍保持原样。请按 [安装与卸载](INSTALL_UNINSTALL.md) 保留数据并处理整个实例；当前不承诺一键从组合实例中卸去全部宿主适配。删除 vendor 目录或任意 node_modules 文件可能破坏依赖，组件复用不能理解为每一行都可独立拆除。

## 可复核来源

本页以当前图的 package.json、vendor 中的固定来源元数据、SEP 解析/压缩/记忆/评测适配源码，以及既有固定输入验证记录为依据。自动清单逐项保留包版本、依赖边、manifest SHA-256、可用的上游提交和许可证文件哈希；没有记录源码提交的项目明确记为未知，不从版本号猜测提交。源归档哈希只证明所保留归档身份，不证明本地修改等于上游原字节。

请结合 [测试与验收摘要](TEST_ACCEPTANCE.md) 阅读能力范围。
