# 许可说明

[导航](DOCS_INDEX.md) · [第三方声明](THIRD_PARTY_NOTICES.md)

项目所有者已明确将 **SEP原创部分采用MIT**。此前私人预览／商业限制文档属于历史，不是本版许可。MIT允许使用、修改、复制、分发、再许可和销售，须保留版权及许可声明；不要求衍生版沿用旧商业限制。准确条文见 [LICENSE](../LICENSE)。

MIT不自动覆盖DSH、vendor代码、字体、数据、模型、容器镜像、运行库或其他第三方。它们保留各自版权、许可证和notice；不能将整个组合包简单改成单一MIT授权。

- DSH及许多JavaScript依赖采用MIT，实际文件仍带上游声明。
- lossless-claw与PinchBench材料保留MIT原文。
- Mem0固定来源根许可证为Apache-2.0，nested OSS manifest另声明MIT；两者记录均保留，不擅自解释为已取得任选双许可。
- PDF.js和其他Apache许可材料保留原文及notice要求。
- Electron的MIT不概括Chromium全部内嵌组件。
- LibreOffice与其源码／运行库适用原有多许可证及对应材料要求。
- SWE评测的代码、数据、测试和镜像分别适用原许可；SWE-bench框架的MIT不能推定整套数据或镜像同许可。

只重打包安装器、改变文件布局或转译TypeScript，不会取消上游许可。对外转发或制作衍生版时保留本包相应声明、实际依赖许可和来源记录。许可原文与文件绑定须随实际最终包核验，不能引用旧package序号当成本版索引。

实际本版材料入口：[许可证文件索引](licenses/index.json)、[组件清单](COMPONENTS.json)。它们绑定新包文件；封包前的缺失状态不得被解释为许可证核验通过。

## 历史私人预览措辞

早期核心notices的“private local preview／public redistribution has not been cleared”描述的是当时预览姿态；此后项目所有者授权原创MIT，并已有公开许可同步记录。它不是本版SEP原创部分的现行禁止分发条款。原声明中“不等于完整原生源码到二进制审计”的限制仍有效，不能把更正姿态理解为全部依赖法律合规已认证。

@nodable/entities补充许可来自其声明仓库的固定提交；canvas平台包补充许可来自同版本父包。相应原文SHA-256分别为 `750cb3fb6362804957ef52caaf9b5c824015be44d494637330d7cd8834d31d40`、`8802fecf9da4367bc23bcf20b21cc143785fc6c92b152f3fa7fbe6ce08d344d6`。本次已核对原文身份；该结果不证明发布二进制与该源码逐字对应，也不完成Skia内嵌组件审计。

LibreOffice对应源材料和原生依赖证据保留各自身份；sharp/libvips完整静态组件与重新链接、全部运行时原生源对应仍未全面验证。本版不得以一个“已清除许可”标签替代这些具体范围。
