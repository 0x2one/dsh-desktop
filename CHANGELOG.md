# Changelog

## Unreleased

---

## v1.2.5

嵌入 harness 升级到 `@deepseek-ai/dsh@0.2.0-rc.1`。升级后若启动失败，可能需要手动删除 `~/.dsh/profiles/` 中的对应环境。会话日志会迁移到 V4，升级后的会话不支持用旧版本读取。

### Features

- 嵌入 `@deepseek-ai/dsh` 从 `0.1.5-rc.2` 升级到 `0.2.0-rc.1`

### Fixes

- 修复新会话（首条消息前）标题行只剩「打开右侧边栏」时被窗口最小化 / 最大化 / 关闭按钮盖住：0.2.0 的 slot 运行时把会话标题行包进一个 `display: contents` 元素，原注入样式的 `[class*="_header"] > [class*="titleRow"]` 子代选择器静默失配，`margin-right: 130px` 不再生效（打开会话时的 Session log 等尾部控件同样受影响）。改用后代选择器，并让 blank 态拖拽条止于角位左缘，避免拖拽区吞掉按钮点击。`@dsh-desktop/window-controls` bump 到 `0.1.11`
- 修复 `scripts/verify-plugin-browser.mjs` 在本机只装旧版 chromium 时启动失败：`chromium.executablePath()` 会返回未安装的修订路径，现按文件存在性回退到已安装的修订
- 修复 0.1.7 下桌面端启动失败（`Failed to load plugins`，`dsh-client-shortcuts: failed` 并连累 23 个客户端插件）：preload 为 harness 的 macOS/平台 CSS 设置了 `data-platform`，而 0.1.7 的 `dsh-client-shortcuts` 在 desktop 运行时要求 `window.dshDesktop.keyboard`，缺失即抛 `Desktop keyboard bridge unavailable`。现补齐 `window.dshDesktop` 桥：`keyboard.subscribe` 转发按键事件，`shortcuts` 走主进程文件持久化（`userData/shortcuts.json`），按键绑定可跨启动保留
- 修复多次启动后出现纯白空白页（无任何报错）：每次 `dsh web` 启动都会用 `?token=` 换取一个**唯一命名**的 `dsh-auth-*` cookie（`127.0.0.1`），它们永久累积在 Electron 持久会话中，最终令 `Cookie` 请求头超过 Node 默认 16 KB 上限，harness 返回 `431 Request Header Fields Too Large`，窗口只画出空白。现在每次加载 harness 前清理 loopback 旧认证 cookie（本次加载再用 URL token 重新认证）
- 适配 0.2.0 新增的插件兼容性校验：0.2.0 会读取 profile 插件行的 `peerDependencies`，凡是 `@deepseek-ai/dsh*` 版本范围不含当前运行版本（`0.2.0-rc.1`）的插件会被自动禁用（`dsh: disabling profile plugin row ...`），窗口操作栏与「桌面」设置分区因此消失。两个桌面插件把 peer 范围从 `^0.1.0` 提升到 `^0.2.0-rc.1` 并各自 bump 版本（window-controls `0.1.10`、settings `0.1.4`），注入器按版本差异重新拷贝到 profile，无需手动处理

---

## v1.2.4

收起右侧栏时，「打开右侧边栏」不再盖住窗口最小化 / 最大化 / 关闭按钮。

### Fixes

- 收起右侧栏时，「打开右侧边栏」不再盖住窗口最小化 / 最大化 / 关闭按钮

---

## v1.2.3

嵌入 harness 升级到 `@deepseek-ai/dsh@0.1.5-rc.2`。升级后若启动失败，可能需要手动删除 `~/.dsh/profiles/` 中的对应环境。会话日志会迁移到 V3，升级后的会话不支持用旧版本读取。

### Features

- 嵌入 `@deepseek-ai/dsh` 从 `0.1.2-rc.1` 升级到 `0.1.5-rc.2`

---

## v1.2.2

嵌入 harness 升级到 `@deepseek-ai/dsh@0.1.2-rc.1`；打开带进程令牌的就绪地址。升级后若启动失败，可能需要手动删除 `~/.dsh/profiles/` 中的对应环境。

### Features

- 嵌入 `@deepseek-ai/dsh` 从 `0.1.1-rc.2` 升级到 `0.1.2-rc.1`

### Fixes

- 解析 `dsh web` 就绪行时保留进程 token（`?token=`），否则 Electron 打开无令牌地址会 401

---

## v1.2.1

托盘只保留显示窗口、开机自启、切换环境和退出；检查更新改在设置「桌面」分区完成，启动不再弹窗。

### Features

- 设置「桌面」分区的更新说明按 GitHub Release 的 HTML / Markdown 渲染

### Fixes

- 启动静默检查发现新版本时不再弹出专用更新窗
- 托盘去掉快捷键配置、新增环境和检查更新及对应弹窗

---

## v1.2.0

设置里新增「桌面」分区，快捷键、开机自启、启动环境和检查更新可在应用内完成。

### Features

- 设置新增独立「桌面」分区（插在「通用」与「模型」之间）：快捷键、开机自启、启动环境、检查更新
- 快捷键录制、新增环境、检查更新（状态 / 进度 / 安装）均在设置页内嵌完成；托盘菜单仍保留原弹窗

### Fixes

- 启动后静默检查更新期间，在设置页点「检查更新」不再卡在「正在查看」
- 设置页与托盘不能同时录制快捷键，避免全局快捷键失效或错乱
- 就绪后的 `dsh web` 异常退出会清掉服务地址并通知界面，避免继续指向已死进程

---

## v1.1.1

开机自启托盘交互与状态同步。

### Features

- 托盘「开机自启」改为「开启 / 关闭」子菜单，当前状态打勾

### Fixes

- Windows 查询登录项时带上 `--hidden` 参数，避免开启后托盘仍显示为关闭
- 系统登录项仍在时托盘显示为开启，与实际开机行为一致

---

## v1.1.0

窗口体验：记忆窗口状态、首次关闭提示、开机自启与静默启动。

### Features

- 记住窗口大小 / 位置 / 最大化状态，重启后恢复（显示器拓扑变化时自动回退居中）
- 首次关闭到托盘时弹出系统通知，说明如何恢复窗口与真正退出（仅一次，可点击通知恢复窗口）
- 托盘新增「开机自启」开关，Windows / macOS 注册登录项；自启时静默启动到托盘，不弹主窗口

---

## v1.0.4

全局快捷键显示 / 隐藏窗口。

### Features

- 全局快捷键显示 / 隐藏窗口（默认 Ctrl+Alt+空格），可在托盘菜单自定义

---

## v1.0.3

更新窗口与安装体验。

### Features

- 专用无边框更新窗口：检查 / 下载进度 / 安装确认，替代系统对话框
- NSIS 安装向导与卸载程序使用深色鲸标图标（适配白色向导背景）
- 更新说明同时渲染 GitHub Release 的 Markdown 与 HTML

### Fixes

- 安装时强制结束已在运行（含托盘隐藏）的进程，避免覆盖安装失败

---

## v1.0.2

macOS 双架构原生构建与发版流程修正。

### Fixes

- macOS Intel 与 Apple Silicon 改为在对应 runner 上分别原生构建（`macos-15-intel` / `macos-15`），不再在 Apple Silicon 上交叉编译 x64
- dmg / zip 文件名带 `-mac-${arch}`，避免双架构产物互相覆盖
- GitHub Release 改为草稿上传，构建完成后手动发布

---

## v1.0.1

macOS 支持与双平台发版。

### Features

- macOS：系统红绿灯窗口控制、应用菜单与快捷键（Cmd+Q / Cmd+C/V/X/A）、菜单栏模板图标
- CI 同时产出 Windows NSIS 与 macOS dmg/zip

### Fixes

- 发版 workflow 使用预创建草稿，避免 electron-builder 并发上传拆成多条 Release

---

## v1.0.0

首个正式版本：把 `dsh web` 嵌进无边框 Electron 窗口。

### Features

- 嵌入固定版本 `@deepseek-ai/dsh@0.1.2-rc.1`（独立 Node 子进程，不打进 Electron）
- 无边框窗口 + 内容栏右上角自定义最小化 / 最大化 / 关闭
- 系统托盘：关闭隐藏到托盘，可切换 / 新建 harness 环境
- 专属 profile `dsh-desktop`，与用户 `web` profile 隔离；依赖通过共享 `node_modules` 复用
- 首次启动自动安装 `dshmarket` 插件市场
- 启动时检查 Node.js / pnpm
- 打包版通过 GitHub Releases 自动更新（`electron-updater`）
- 单实例：再次启动唤起已有窗口
