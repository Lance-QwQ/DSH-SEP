本轮启动修订 `windows-alpha-20260924-startup-r2`，程序图 `0b54ac82524c0a42db44d5b8a6ebbbca1773a28c8c361839d47f9c12760f35a3`。此页原有 2026-09-21 版本号、验收数量与发布状态保留为历史；本轮结果请读 [启动修订](STARTUP_FIX.md)。更新状态没有降低固定验收标准。

# Office 转换与预览

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-mit-alpha` · 文档 `20260921-docs-r6` · **Windows x64 Alpha 测试发布**。SEP 已确认原创部分采用 MIT，第三方保留原许可。历史启动异常作为已接受的已知问题披露；功能证据与本轮封包验证分别见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。项目入口：[GitHub 仓库](https://github.com/Lance-QwQ/DSH-SEP)。
<!-- SEP_RELEASE_STATUS_END -->

本版保留 DSH 原有 Office 文档转 PDF 与预览接口，底层改为 **SEP 自有命令行适配器＋官方 LibreOffice 26.8.0.3**。此前 `@deepseek-ai/libreoffice-kit` 的 Node API 源码入口返回 404，因此不再将该旧包及旧原生 Kit 包作为本版转换依赖。旧报告照常保留；新包不继续依赖该不可访问入口。

当前程序图 `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52`。Office 实现沿用 office-r2 的 `a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8` 功能基线，原转换、异常收尾和桌面预览结果见[继承证据](evidence/office-validation.json)。本轮只更新许可、文档与相关元数据；代码／二进制等同性、重新安装、ZIP 及脱敏核验：**pass：本轮已核对仅已映射原创许可、包声明与文档/绑定变更，运行实现及第三方文件与 Office-r2 字节相同；沿用其固定 Windows 11 功能证据，未重跑全部功能或付费模型。最终 MIT ZIP 安装、逐文件验证与脱敏结果由包外 DELIVERY-REPORT.json 单独绑定。**。本轮没有重跑完整 Office 格式矩阵。

## 用户会看到什么

- 从 DSH 原文档预览入口打开受支持 Office 文件，转换得到本地 PDF。模型接口和 PDF 显示接口保留；文档预览不自动等于记忆入库。
- 本地 Office 转换本身不需要 API Key，也不调用模型。后续模型阅读文档、图片或正文仍属于另外的授权与费用流程。
- Word、Excel、PowerPoint 对应 `doc/docx/xls/xlsx/ppt/pptx` 输入。具体旧格式、中文内容、分页和字体的验证只覆盖报告列明的合成资料；不承诺所有历史 Office 文件均兼容。
- 不覆盖已存在的输出 PDF。成功返回后输出通过完整 PDF 基本检查；写入过程不是面向其他程序的原子替换事务。
- 不能可靠获得缺失字体列表时返回 `fontDiagnostics: unavailable`，界面提示“本次预览未检查字体完整性，文字和排版可能与原文档不同。”。`missingFonts: []` 不表示已证明字体齐全。

## 独立运行环境

Only 和 Full 均随附官方 LibreOffice 运行库，单该组件解压后约 **1.58 GB**。安装、保留压缩包、临时转换和新的独立实例还需要额外磁盘空间。它不要求全局安装 LibreOffice，不注册文档默认打开方式，不连接用户已有 LibreOffice 的 profile。

目标为 **Windows 10/11 x64**；官方引擎最低 Windows 版本为 Windows 10，功能基线实际执行环境为 Windows 11。未进行 Windows 10 干净虚拟机验证，也不据此宣称 ARM64、Linux 或 macOS 可用。

适配器每次转换建立专用暂存目录、独立 UserInstallation profile 和输出目录；同一转换器实例内任务排队执行。Windows Job 用于管理本次所属进程与后代，取消、超时和 dispose 按有界收尾规则处理。引擎过程与普通 DSH／个人 LibreOffice 分离，但这属于应用进程与配置隔离，**不是 OS 级文件、网络或恶意文档沙箱**。

Windows profile 和任务临时目录采用保守路径边界：实际交给引擎的目录路径须不超过 **128 个 UTF-16 字符**。原路径较长时，仅尝试 Windows 已有的 8.3 短名称，并核对短名称与原目录的卷号和文件身份一致；它仍是同一个受管目录，不新建共享目录、全局盘符或另存一份正文。没有可核验短名称，或短名称仍超长时，在引擎启动前返回 `unavailable`，提示选择更短的可写工作目录。这里的 128 是本适配器支持边界，不是所有 LibreOffice 版本的原生阈值；也不要求用户为整个磁盘启用 8.3。

引擎的 `TEMP`／`TMP` 指向本次任务内的临时目录，并参与同一目录的收尾。命令设置 `-env:CrashDumpEnable=false`，同时清除会强制启用转储的 `CRASH_DUMP_ENABLE`，避免已知的早期崩溃转储落入程序目录。禁用转储不等于修复崩溃：没有合法 PDF 仍然报错，不能因进程返回 0 宣称成功。以上 v2 策略的实际结果以页首绑定的验证摘要为准。

运行库把官方 MSI 内的十个 x64 Microsoft C++ 运行 DLL 按原字节复制到引擎 program 目录；原 System64 文件和许可保留。这样不要求为转换器全局安装 C++ 运行库。它们随 SEP 的受控运行库更新维护，不应误认为由当前用户的全局安装器自动升级。

## 限额、拒绝与字体差异

日常 DSH 预览服务的**实际有效默认**为：每次执行期限 **60 秒**、输入 **50 MiB**、生成 PDF **100 MiB**、OOXML 最多 **10,000** 个条目、声明展开总量 **250 MiB**，PDF 图像分辨率上限 **192 DPI**。这些配置由 DSH 上层服务传入，覆盖适配器独立 API 的默认值。

开发者绕过 DSH 服务直接调用适配器时，独立 API 默认才是 120 秒、输入 64 MiB、PDF 128 MiB、20,000 条目、512 MiB 展开量与 144 DPI；不能把这组值当作日常预览默认。实际配置和错误回执优先。适配器期限从排队任务开始执行时计算，不是所有排队等待时间的总上限。输入／输出大小限制不等于整个原生引擎内存上限，也不能保证内存占用只达到文件大小。

输入必须是可核验的普通单链接本地文件；路径别名、符号链接、硬链接和身份变化会被拒绝。OOXML 对 ZIP 格式、条目、压缩和关系 XML 进行预检。关系文件使用 saxes 6.0.0 严格解析：仅对标准 OOXML hyperlink 类型的 `http`／`https`／`mailto` 普通超链接作白名单放行；外部图片、模板、OLE、data、UNC、file、javascript 目标，以及 DTD／实体声明和畸形关系 XML 拒绝。

普通链接放行只表示保留可点击链接，不授权转换时主动请求该地址；office-r2 已用本地回环计数器验证固定普通链接样本零自动请求，原结果见继承证据。此检查不等于扫描了全部 XML 的所有语义与全部内嵌对象。旧 CFB 格式有基本文件头检查，但没有因此完成全部二进制内部对象安全审计。

专属 LibreOffice profile 禁用宏执行，Writer 与 Calc 外链更新设置依据该版本实际 schema 禁用。此策略不等于已为原生进程设置全系统网络拒绝规则，不要把恶意文档的所有可能行为视为已被隔离。原生解码器错误、恶意输入的未知变种和同用户其他进程的任意干扰不在完整保证之内。

CLI 使用 Windows 已安装字体。`fontDirectories`、`fontFallbacks`、`initialFontFamilies` 等自定义字体选项不支持，传入会明确报错；`maxFontFiles`、`maxFontFileBytes`、`maxLoadedFontBytes` 只接受兼容默认值，**没有实际约束 Windows 字体系统加载的数量或内存**，非默认设置报错。不能在功能宣传里继续沿用旧 Kit 的自定义字体与字体资源限额承诺。

即使转换成功，字体替代、Excel 分页、旧绘图对象、公式、图表和高级排版仍可能与 Microsoft Office 不同。交付重要文档前，应人工对照 PDF 的中文字符、页数、标题、图表和分页；此处不保证完全一致。

## 临时副本、取消和故障

原文会被复制到任务暂存目录，生成的 PDF 是新的正文副本。正常完成或可确认的失败收尾清理任务目录；无法确认进程或文件清理时明确保留错误和必要现场，不能同时宣称零残留。取消与结果返回重叠时，以最终回执说明是否完成和是否仍需处理。

日志输出持续读取并限制记录长度，避免输出管道未消费造成任务卡住；输出大小检查和期限用于停止所属任务。只处理明确属于本次转换器的 Windows Job，不按 `soffice`、`node` 或 `electron` 名称批量结束其他进程。

初轮合成转换曾生成 Python 字典扩展 bytecode，已将这些测试缓存排除出发行树并保留哈希证据。新适配器设置 `PYTHONDONTWRITEBYTECODE=1`，避免程序树中生成包含安装路径的 `.pyc`。转换临时副本及输出 PDF 的保存和删除范围见[数据与隐私](PRIVACY_DATA.md)。

历史 v1 图 `6dce713b672be4c6e7bf312e700dc48e7ed6c7ddf149206a5b4d7865252c31a7` 的三轮正常格式矩阵 18/18 未生成 PDF，原失败、转储和对照记录保留。长／短 profile 与独立输入输出目录的对照，以及转储中的 `DeploymentException`，将该固定场景定位到长 profile 初始化；未恢复出转储中缺失的异常消息，不能声称已证明具体上游源码行。v2 补测是独立证据，不改写 v1 为通过。

## 官方来源与许可

官方 MSI 下载标签为 26.8.0，运行时与源码版本均为 **26.8.0.3**，构建 ID `bce0998afefdbc355585ca324285661a2170ba77`。2026-09-21 下载的 MSI 大小 374,906,880 字节，SHA-256 为 `4aa6c6e1895f4055104effcb556bd3362d20c6ad707c149543304f395ef9db95`，Windows Authenticode 验证为 Valid，签名者 The Document Foundation。

四份匹配官方归档已完整下载、核对官方 HTTPS 校验值；总计 654,222,716 字节。可直接获取：

| 源码 | 固定官方入口 | SHA-256 |
|---|---|---|
| Core 与构建脚本 | [libreoffice-26.8.0.3.tar.xz](https://download.documentfoundation.org/libreoffice/src/26.8.0/libreoffice-26.8.0.3.tar.xz) | `42116e256933aa575974e420ffa04f7cd7096f4b7ca5d0907ddeaf2a07f68f94` |
| Dictionaries | [libreoffice-dictionaries-26.8.0.3.tar.xz](https://download.documentfoundation.org/libreoffice/src/26.8.0/libreoffice-dictionaries-26.8.0.3.tar.xz) | `4849ca14733cf4d5896a2f5bb6db87ffade9d1fbeab92e63153dc79630995a60` |
| Help | [libreoffice-help-26.8.0.3.tar.xz](https://download.documentfoundation.org/libreoffice/src/26.8.0/libreoffice-help-26.8.0.3.tar.xz) | `8443f21b7127cbd084b472c01ff494ec6a31814f0b1b382004b68103ece90e35` |
| Translations | [libreoffice-translations-26.8.0.3.tar.xz](https://download.documentfoundation.org/libreoffice/src/26.8.0/libreoffice-translations-26.8.0.3.tar.xz) | `dc1419fc6f02840735b01f28b1cd453885e50fad2b2b2f5e6beab93868bf82a4` |

运行库自身的 `SOURCE-ACCESS.md`、`ENGINE-PROVENANCE.json`、`source-provenance/source-index.json` 和 `portable-layout.json` 记录签名、下载凭据、原构建配置和重包装步骤。`download.lst` 保留构建所需外部源码的版本与哈希；没有宣称所有可选外部归档都已下载或官方二进制已经本地重建。

适配器源码在 `DSH-SEP-Source-20260921-MIT.zip`，按 `SOURCE_FILES.json` 逐项对应。LibreOffice 四个完整源归档可单独提供或通过上述链接取得，不重复塞入每份安装运行库。原 `LICENSE.html`、`license.txt`、`NOTICE`、署名和组件许可保留；SEP MIT 仅适用于已确认原创部分，官方引擎及其组件继续适用原许可。

[返回文档导航](DOCS_INDEX.md)
