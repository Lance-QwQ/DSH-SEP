# Linux x64 · DSH SEP 0.2.1-beta.3 隔离预览

[下载 Linux 包](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/DSH-SEP-0.2.1-beta.3-Linux-x64.tar.gz)。统一分发版本为 **0.2.1-beta.3**；资产保留 `Alpha2-closeout.12` 的原始字节，内含 DSH `0.2.1-alpha.2` 和 SEP Alpha.2 派生运行时。Wayland 补验没有修改或重新打包它。

支持证据限定于 **WSL2／Ubuntu 24.04 x64／ext4**，包括私有 Xorg 和受控 Wayland 载具。完整 Linux 公开认证仍为 **blocked**；不是其他发行版、真实物理桌面或所有官方 DSH 功能的等价认证。

## 安装与启动

需要系统 Python3、Linux 用户命名空间、D-Bus、GTK 依赖及有效桌面显示；监督还要求 Python pidfd 接口和相应内核支持。使用普通用户运行，不使用 sudo。安装不寻找、接管或覆盖另一个官方 DSH。

1. 核对下面的 tar SHA-256，在同一 ext4 文件系统的受控目录完整解包。包内含 `payload/README.md`、`payload/PACKAGE.json` 和程序清单。解包目录、安装目标与数据目录须使用规范绝对路径，无符号链接；目标父目录须存在，程序目标和数据目标均须不存在且互不包含。
2. 创建 `request.json`。以下路径是占位示例，必须替换为自己的真实路径。`manifestSha256` 是本包固定清单摘要，也可与包内 `PACKAGE.json` 核对；不要把该文件中记录的构建机 `payload` 路径当作本机安装来源。

```json
{
  "payload": "/absolute/extracted/payload",
  "destination": "/absolute/new-program",
  "dataRoot": "/absolute/new-data",
  "manifestSha256": "1f087d0680ca3d0c1b13a38983d564b73c2a0e068b6ec1d9eb87fbc55ca5b196"
}
```

3. 在解包目录运行审阅命令，核对返回计划，再把返回的 `planHash` 加入同一请求 JSON，执行安装：

```sh
./payload/node/bin/node ./payload/src/linux-install.mjs review ./request.json
# 审阅并将返回的 planHash 加入 request.json 后：
./payload/node/bin/node ./payload/src/linux-install.mjs install ./request.json
```

4. 用 `<安装程序>/start.sh <数据目录>` 启动，两个占位值替换为请求中的绝对路径。默认启动 Electron 和独立宿主；测试服务器可用 `--headless`。重复启动返回 `SEP_LINUX_ALREADY_RUNNING`，不复用无关进程，也不保证激活已隐藏窗口。
5. 自行填写数据目录 `home/profiles/desktop/.env` 的 `DEEPSEEK_API_KEY`，或使用桌面凭据页面。凭据模板默认空白；本轮没有验证付费在线请求。

欢迎页关闭会请求退出；进入主工作区后，窗口关闭会隐藏到后台并保留宿主和任务。正常结束请用 **Application → Quit（Ctrl+Q）**；启动终端中的 Ctrl+C 也可请求收尾。本包没有 Windows 式托盘入口。不要在运行中移动目录或删除锁来强行重启。

## 能力和保护边界

已接入四层记忆、项目内 BM25、同项目 Mem0、自动回忆与可选捕获、历史展开、预算设置、受控委派、图片与文本附件、数字 PDF／DOCX、受控工作副本及提交／恢复。自动捕获默认关闭。

文件、Shell 和 MCP 使用 Linux 命名空间隔离；修改保留在工作副本，提交／丢弃／恢复由受信任控制方处理，模型没有发布权限。当前只有一个受控项目：最多 1024 项、合计 32 MiB、单文件 4 MiB；普通工具截止最长 10 秒、输入 16 KiB、合并输出 64 KiB。同用户外部代码、内核漏洞和通用资源配额不在保护保证内。

原生评测与 AT-SPI 点击默认关闭，需要额外依赖和明确授权。原生终端、Job 控制页、PTC、系统 Open In、workspace-changes／deliverables 和产品遥测在此预览中关闭，不能绕过保护门禁激活。

## 验证结论

closeout.12 有 226 个固定回归定义通过、24 次冷启动及固定评测正负对照证据。Wayland 补验另有 **10 个场景定义、四轮共 40 次成功执行**，以及 3 个输入范围检查；没有重跑或合并历史 226 项。

Wayland 环境为私有 headless Sway 1.9／pixman，禁用 XWayland。验证了原生表面、指针交互、装饰标题栏移动、中文输入、隐藏与官方 second-instance 重开、真正 GTK 选择器取消和图片预览／移除、活动任务退出确认的取消与批准。它不是物理鼠标、GNOME／KDE／门户后端或 WSLg 外层交互认证；图片没有发送，不证明在线视觉。

**实际 Wayland GTK 退出窗口的 AT-SPI 语义点击仍为 fail**，原生键鼠通过不替代它。原因尚未单方归因，功能继续 opt-in，不自动退回坐标点击。

正常通过样本的产品收尾与后续测试 compositor／输入客户端／D-Bus 清理分别归因。历史 blocked 样本可能依靠后续恢复才清理，不倒推为当场正常退出。三监督全部遭强杀、断电、内核永久阻塞等没有自动收尾保证。

## 更新与恢复限制

只支持独立首次安装，不是 Linux 在线更新器；公网自动安装更新正例、私人库导入、OCR、音视频和全部插件认证未完成。程序发布后但安装提交前的中断，可按包内 README 用 `linux-install.mjs recover` 和原目标／数据路径／计划哈希核验；复制阶段中断不保证可直接恢复。不要覆盖旧数据目录或自动回滚已有新业务写入的库。

包内 README 的早期“Wayland 交互尚未认证”描述保留原字节；本页所列补验只更新明确的 Sway 范围，未提升完整认证结论。

SHA-256：`1708b8050c35471c930c6fc61d48289296609b64c7d2a431013eb299b7482f00`。程序来源提交：`84d3e447a4713a234005685358456cc22c641289`；Wayland 补验来源：`79e07bfd`。校验和不是发布者数字签名，第三方许可见包内随附文件。

本次发布补充的第三方许可与对应源码说明见 [THIRD-PARTY.md](THIRD-PARTY.md)。SEP 自有代码 MIT 不替代第三方组件许可。
