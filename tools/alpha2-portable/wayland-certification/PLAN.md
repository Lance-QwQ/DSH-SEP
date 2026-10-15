# Wayland 交互补验计划 — 2026-10-14

固定基线：Git `84d3e447a4713a234005685358456cc22c641289`、实际 closeout.12 压缩包 SHA-256 `1708b8050c35471c930c6fc61d48289296609b64c7d2a431013eb299b7482f00`、manifest `1f087d0680ca3d0c1b13a38983d564b73c2a0e068b6ec1d9eb87fbc55ca5b196`。不修改旧包、旧证据或Windows日常，不上传GitHub，不调用付费模型。

输出：`D:\AIData\ProjectWork\DSH\alpha2-linux-wayland-20261014-r1`，专用WSL2/ext4。用原包安装器另建程序/空白数据；新增测试依赖只下载并解包到本轮私有目录，不apt install、不运行包维护脚本。私有headless Sway使用pixman，禁XWayland、独立0700 runtime/socket与独立D-Bus；不连接WSLg或用户桌面。原生键鼠仅送本私有合成器。

计划两轮冷启动，每轮按顺序验证：原生Wayland表面与窗口身份；欢迎页键鼠进入真实主工作区；指针拖动导致可观察窗口位置变化；输入/清除合成中文草稿；真正GTK文件选择器取消无选择、图片选择预览及移除；活动Agent原生退出取消保持任务、批准真实收尾；下一轮再次启动及保留合成状态。另验证语义AT-SPI入口（如环境提供）及隐藏窗口原生激活，不能以CDP事件或合成File替代原生输入/chooser。

测试可为只读DOM/截图观测启用loopback CDP，不通过CDP派发输入、不替换dialog/File/pathFor，不在待测应用中注入虚拟输入实现。仅测试Provider合成；其余使用实装Host、SEP、预算与附件服务。用户文件选择产生路径引用与正文上传必须区分。

所有尝试保留独立日志；失败不删除、不算通过，修正夹具后补跑单列。两轮均保留，不计算性能中位数、不追加付费解题。各操作有界，最后审计归因区分正常退出、生产强制收尾和测试清理。通过只能证明私有Sway/Ubuntu24.04的原生Wayland交互，不能宣称物理鼠标、WSLg外层、GNOME/KDE、门户后端或全部Linux公开认证通过。
