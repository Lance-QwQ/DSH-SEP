# 完整源码与来源

本版为 **DSH 0.2.0-rc.2 + SEP 0.2.1-beta.1 / Windows x64 Beta**。完整Source包由维护工作树的项目源码生成，基于上游提交 `639ed015397290b3745d163aafe02ffee4aa3f84`，包括已跟踪改动及允许交付的新增SEP代码。上游HEAD本身不包含这些本地改动。

## 如何检查

Source包的自身README及机器清单记录源码文件、来源、排除范围和公开版overlay。公开复制中的版本／文档／元数据修订单列，修改前清单保留，原维护仓库不改写。本版最终程序对应见 [RELEASE-STATUS.json](../RELEASE-STATUS.json) 和随包 `SOURCE-PROVENANCE.json`；测试／交付适配见Source包自身的 `SOURCE-DELIVERY.json`。本次导出14,686源码文件、331程序对应核验及既定模式扫描已通过；内容目录验收见 [VERIFICATION-RESULT.json](VERIFICATION-RESULT.json)。四份最终归档（含Source）的CRC、SHA-256、脱敏审计和ZIP安装结论，由随资产提供的包外 `ARTIFACT-VERIFICATION.json` 和 `SHA256SUMS.txt` 权威记录。

项目中的credentials／sessions测试与源码是正常程序文件，仍保留；私人运行根、真实环境／签名文件和原Git目录不作为公开来源。来源记录绑定的是项目代码，不附原私人Git历史或日常会话。

测试用于验证脱敏的固定仿Key常量，只有在完整文件与匹配哈希明确绑定后才按夹具保留，不提供真实Key。公开扫描结果须区分这类受检常量与实际凭据；不能仅看字符串模式就宣称泄露或无凭据。

14个Git相对链接在Windows交付复制中按普通目标文本文件表示，原120000模式及相对目标有记录。它们不应替换成任意外部junction；在POSIX归档／checkout恢复时按记录还原，保持可执行模式并拒绝越出源码根的目标。此规则来自Windows符号链接权限限制，不代表有新的程序功能。

## 构建边界

使用Source包记录的构建和测试命令，在独立目录及受支持运行环境进行。不要从源码目录覆盖现有安装或导入私人日常状态。完整源码可审查，不等于全部上游原生二进制已逐字节可重现构建。

DSH根MIT、SEP各原创许可、vendor及依赖原文均保留。第三方与原生组件的源码／二进制要求分别适用，不能因重新打包而统一标成SEP原创MIT。[第三方声明](THIRD_PARTY_NOTICES.md) · [组件清单](COMPONENTS.json) · [许可证索引](licenses/index.json)
