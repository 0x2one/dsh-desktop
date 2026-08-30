# Changelog

## Unreleased

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

- 嵌入固定版本 `@deepseek-ai/dsh@0.1.1-rc.2`（独立 Node 子进程，不打进 Electron）
- 无边框窗口 + 内容栏右上角自定义最小化 / 最大化 / 关闭
- 系统托盘：关闭隐藏到托盘，可切换 / 新建 harness 环境
- 专属 profile `dsh-desktop`，与用户 `web` profile 隔离；依赖通过共享 `node_modules` 复用
- 首次启动自动安装 `dshmarket` 插件市场
- 启动时检查 Node.js / pnpm
- 打包版通过 GitHub Releases 自动更新（`electron-updater`）
- 单实例：再次启动唤起已有窗口
