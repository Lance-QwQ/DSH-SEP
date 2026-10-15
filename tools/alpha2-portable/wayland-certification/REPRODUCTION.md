# 私有 Wayland 复跑契约

这是维护者的固定合成实验，不是用户安装器。仅限专用 `DSH-SEP-Linux-RC` Ubuntu 24.04 x64 WSL2/ext4、非 root 用户 `sep-rc`，VHD/输出位于 D 盘。Windows 日常、WSLg runtime、凭据和用户资料不作为输入。所有 root 都在 `/opt/dsh-sep-cross-platform` 下；脚本以 mkdir/wx 拒绝覆盖旧尝试。已有目录不得删除或复用：从独立干净实验快照复跑，或明确派生新 tag 并记录变换。

## 准备

1. 取得 README 钉扎的原始 `.12` 包并核验 SHA，按其清单解到 `alpha2-portable-finalization-archive-r51`。使用包内 `linux-install.mjs` 的真实 review/install 流程；`install-fixture.mjs` 新建 `alpha2-portable-wayland-installed-r1`。不能复制别人的已有私人数据。
2. `complete-assets.py` 重放本轮 24 包 APT SHA 校验和 dpkg-deb 私有解包；输入缓存目录见脚本，最终资产表封存于 `assets/RESULT.json`。`prepare-assets.py` 为早期网络获取历史；不要依赖当前 apt-cache 版本与本轮永远一致，应先对照冻结资产表。
3. 需要系统已存在的 GCC 13.3、Python 3.12、python3-dbus、libxkbcommon/Wayland 运行库及 at-spi2-core。本轮只解包测试依赖，没有安装系统包。Node 24.19：`/opt/dsh-sep-cross-platform/runtime/bin/node`。
4. `build-pointer.py` 和 `build-keyboard.py` 生成私有协议输入客户端。最终键盘在 `keyboard-build-r21`，旧二进制保留。两个协议 XML 原始版权声明随文件保留。

协议来源：

- [wlr virtual pointer](https://github.com/swaywm/wlr-protocols/blob/master/unstable/wlr-virtual-pointer-unstable-v1.xml)，SHA `3ff6d540be0bc5228195bf072bde42117ea17945a5c2061add5d3cf97d6bb524`。
- [wtype virtual keyboard](https://github.com/atx/wtype/blob/master/protocol/virtual-keyboard-unstable-v1.xml)，SHA `7ad7870003ecd592cae47dc19d277a609b7f18fd7b7be012623cf3225a7294f5`。

## 执行（Linux 内）

将本目录原字节放到新的 driver 目录；下例用本轮已封存位置说明实际执行，已有 root 会拒绝覆盖：

```sh
NODE=/opt/dsh-sep-cross-platform/runtime/bin/node
BASE=/opt/dsh-sep-cross-platform
"$NODE" "$BASE/alpha2-portable-wayland-driver-r24/wayland-certification/exercise-wayland.mjs" "$BASE/alpha2-portable-wayland-actual-r24"
SEP_WAYLAND_UNICODE_PICKER=1 "$NODE" "$BASE/alpha2-portable-wayland-driver-r27/wayland-certification/exercise-wayland.mjs" "$BASE/alpha2-portable-wayland-actual-r27"
"$NODE" --test --test-reporter=tap "$BASE/alpha2-portable-wayland-driver-r29/wayland-certification/input-scope.test.mjs"
```

两轮为每次脚本内固定顺序；r27 是额外补跑，不并入原计划两轮。源码各输入代次的 tar 留在 D 盘；最终证据保存 `executed-inputs/r24`、`executed-inputs/r27`，不能用后来同名源码替代其哈希。

不要并行运行两个主交互/AT-SPI 脚本，它们共用同一合成 installation。脚本临时插入 active-inspection fixture，调用真实 Agent/Host/存储并在 finally 恢复配置；只有 LLM 返回合成。私有 compositor 禁 XWayland、无 DISPLAY、socket 0700、独立 D-Bus。客户端不连接真实 WSLg runtime。没有 uinput、Windows 鼠标注入、CDP Input 派发、File 对象替身、dialog 拦截或源码 main.js 替换。

CDP 仅 loopback 只读 DOM/截图观测。`gtk-observation.py` 是从已有 `linux-atspi.py` 派生的测试诊断副本；增加焦点、窗口内 bounds 和仅名为 Location 的合成输入值，原始堆栈只写合成证据，不送模型、不安装进 SEP。

实际原生按钮的坐标只用于测试私有桌面：欢迎页从当前只读 DOM bounds + 当前 Sway 窗口位置换算；GTK Open 使用人工核对过的真实截图位置并在派发前重验窗口 PID/ID/名称；拖动 Sway 当前装饰标题栏。它们不改变产品“语义定位、禁止猜坐标”的点击工具契约。

## 审计与封存

`collect-final.mjs r2` 在交互全部退出后调用 `audit-installed.py`，检查 manifest 全部条目、无新增程序文件、无测试 Profile 注入、当前 UID 的可识别残留，再运行三个范围检查。直接审计控制器以 PID/命令行/出生状态显式列出；不能把仍在测试的应用从残留集合中排除。`attempts/` 保存包括失败在内的各尝试；最终四轮正常应用退出与测试私有 compositor 清理分别归因。

`export-evidence.mjs actual-r24` 等只传合成结果到指定真实 D 盘目录，二进制 tar 使用 Node 流而非 PowerShell 文本管道。`seal-local.mjs` 核验所有文件哈希、日常入口、用户未提交文档、原包；仅本地同步和 checkpoint，不调用网络、不推送、不切换日常版。
