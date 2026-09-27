# DSH SEP 0.2.0-beta.2 完整源码 / Windows x64

DSH 0.1.7-rc.2；SEP 原创部分 MIT，第三方保留原许可。此包以已公开 Beta.1 Source ZIP 为基准，只应用本次原生图片修复、明确的 Beta.2 版本绑定及可公开运行的回归测试。源码、完整接口、安装器和启动模板均保留；没有私人工作区、真实 Key、私人会话或 `.git` 历史。

- `source/`：DSH 与 SEP 完整源码，SEP 位于 `source/packages/sep/`。
- `packaging/`：安装器与启动模板。
- `SOURCE-PROVENANCE.json`：源文件与实际程序图的逐项哈希对应。
- `VERSION-OVERLAY.patch`：公开 Beta.1 到 Beta.2 的 4 项版本绑定；`IMAGE-INPUT-FIX.patch`：其余 3 项运行时变化。
- `history/`：Beta.1 原始交付元数据，保留原字节；历史状态不代表本版当前状态。
- `SOURCE-DELIVERY.json`：测试锁、快照换行策略等交付元数据变更；这些不是额外生产功能修改。

## 构建与运行测试

DSH 通用构建说明见 `source/README.md` 与 `source/docs/development.md`。本包不宣称全部上游编译产物和原生库已达到逐字节可重现构建。已打包的运行程序应由 Full / Only 安装，不要用源码目录覆盖现有安装。

新增测试使用 Node 24 和本次公开 Full / Only 安装形成的空白 fixture，图指纹固定为 `7ccb8c88330c3f2f576bc3bc50b0e235ea1e0ee28e7fd772521039b213e4f0e5`。不接受根据版本号猜测的安装。设置显式路径后，以下入口运行 27 项图像/预算单元、6 项预算回归和 4 项真实组件组合，共 37 项；只使用合成资料与本地录制 HTTP，不读实际 Key、不调用付费模型或操作真实桌面。

```powershell
$env:SEP_IMAGE_HOST = 'D:\fixtures\public-beta2'
$env:SEP_IMAGE_EVIDENCE_ROOT = 'D:\results\native-image-beta2'
node .\source\packages\sep\system-enhancement-package\tests\run-native-images.mjs
```

测试新建唯一证据子目录并保留合成记录；不要选私人数据目录。组合测试的 `suite-stage/node_modules` 是指向只读 fixture 的依赖 junction，归档或清理时不要递归跟随。`SEP_IMAGE_SOURCE` 可显式选择另一个套件 `src` 做旧版对照；普通使用无需设置。实际图像上传成功、远端 Files 复用、在线视觉理解质量和任意私人环境不在这些合成测试结论内。

源码内的 `.gitattributes` 追加快照规则以保持交付文件字节，避免 Git 自动转换换行导致程序对应哈希失效。该元数据不改变运行逻辑。历史文档中旧 Alpha/local.8/Beta.1 状态以其原范围阅读；当前发布范围见发行页的 RELEASE-NOTES.md 与 VERIFICATION.md。
