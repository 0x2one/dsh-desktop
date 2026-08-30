# DeepSeek Harness Desktop

DeepSeek Harness 的桌面客户端：把 [`dsh web`](https://github.com/deepseek-ai/deepseek-harness) 嵌进无边框 Electron 窗口，不改 harness 源码。

默认使用专属 profile `dsh-desktop`，与本机已有的 `web` 等环境隔离；依赖通过 `~/.dsh/profiles/node_modules` 共享，避免重复安装。

## 功能

- 嵌入固定版本 `@deepseek-ai/dsh@0.1.1-rc.2`（`npx` 子进程，独立 Node ABI，不打进 Electron）
- 无边框窗口：Windows/Linux 内容栏右上角自定义最小化 / 最大化 / 关闭；macOS 保留系统红绿灯，不重复渲染自定义按钮；会话区顶部可拖动
- 系统托盘：关闭窗口隐藏到托盘，托盘可切换 / 新建 harness 环境（macOS 菜单栏模板图标，自动适配明暗模式）
- macOS 应用菜单与快捷键：Cmd+Q 退出、Cmd+C/V/X/A 编辑、全屏等（仅 macOS）
- 首次启动自动安装 `dshmarket` 插件市场（装进当前 profile，不碰用户 `web` profile）
- 启动时检查 Node.js / pnpm，缺失或版本不足会弹窗提示
- 打包版通过 GitHub Releases 自动更新（`electron-updater`）
- 单实例：再次启动会唤起已有窗口

## 运行要求

本机需要：

| 运行时 | 版本 |
| --- | --- |
| Node.js | `22.19+` 或 `24+` |
| pnpm | 任意已安装并在 PATH 中 |

首次启动会联网拉取 `@deepseek-ai/dsh@0.1.1-rc.2`；若当前 profile 尚未安装 `dshmarket`，还会阻塞安装插件市场（可能数分钟）。之后与本地 `dsh web` 共用同一套依赖，一般不再重复下载。

Windows 是主要目标平台，macOS 也受支持：红绿灯窗口控制（不再渲染自定义按钮）、应用菜单与快捷键（Cmd+Q / Cmd+C/V/X/A）、菜单栏模板图标；CI 打版本标签时同时产出 Windows 安装包与 macOS dmg/zip（Intel + Apple Silicon）。macOS 产物未签名未公证，首次打开需在「系统设置 → 隐私与安全性」中允许，或用右键 → 打开。

## 下载与安装

从 [GitHub Releases](https://github.com/0x2one/dsh-desktop/releases) 下载对应平台的产物：

- **Windows**：`dsh-desktop-<version>-setup.exe`
- **macOS**：`dsh-desktop-<version>.dmg`（Intel `-x64` 与 Apple Silicon `-arm64` 两个架构）

macOS 产物未签名未公证，首次打开时系统会拦截：在 Finder 中右键应用图标 →「打开」，或到「系统设置 → 隐私与安全性」点击「仍要打开」。安装后启动数秒会静默检查更新；发现新版本时弹出对话框，确认后下载。下载完成可立即重启安装，或等到托盘「退出」时安装。也可随时用托盘菜单「检查更新…」手动检查。`pnpm dev` 开发模式不访问更新源。

当前未配置代码签名（Windows 与 macOS 均未签名）。

## 托盘与环境

关闭窗口会隐藏到系统托盘，不会退出。托盘菜单：

- **显示窗口** — 恢复主窗口
- **启动环境** — 列出 `~/.dsh/profiles/` 下的 profile，单选切换；上次选择会记住
- **新增环境…** — 创建新 profile，并尝试安装 `dshmarket`
- **检查更新…** — 手动检查 GitHub Releases
- **退出** — 真正退出应用

默认环境名为 `dsh-desktop`（目录 `~/.dsh/profiles/dsh-desktop`）。切换或新建环境只影响桌面端当前会话，不会改写用户自己的 `web` profile。

## 开发

推荐 [VS Code](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)。

```bash
pnpm install
pnpm dev
```

```bash
pnpm build          # 插件 + typecheck + electron-vite
pnpm build:win      # Windows NSIS（需在 Windows 上执行）
pnpm build:mac      # macOS dmg + zip（需在 macOS 上执行）
pnpm build:linux    # Linux AppImage/snap/deb（需在 Linux 上执行）
```

`electron-builder` 不能在非目标平台上交叉打包：Windows 上跑 `build:mac`/`build:linux` 会报错，macOS 产物由 CI（macOS runner）构建。

端到端验证脚本使用临时 `DSH_HOME`，不会污染真实用户数据：

```bash
node scripts/verify-plugin-injection.mjs
node scripts/verify-injection-timing.mjs
node scripts/verify-profile-setup.mjs
node scripts/verify-plugin-browser.mjs   # 需要 playwright chromium
```

`verify-plugin-browser.mjs` 会启动 headless chromium 验证窗口控制插件在浏览器端的渲染与 IPC 路由。首次运行前安装匹配的浏览器（`playwright-core` 的 chromium revision 由脚本自动解析）：

```bash
node node_modules/playwright-core/cli.js install chromium
```

细节与目录说明见 [INTEGRATION.md](INTEGRATION.md)。

## 架构

```
Electron 主进程          dsh web（独立 Node 子进程）
  环境检查 / 托盘          npx @deepseek-ai/dsh@0.1.1-rc.2
  专属 profile             --profile <当前环境> --no-open --port 0
  注入窗口操作栏插件  →    cordis 插件 → 内容栏右上角操作栏
  IPC 最小化/最大化/关闭   window.api.windowControls（Windows/Linux）
  macOS 红绿灯 + 应用菜单  trafficLightPosition / Menu roles（darwin 分支）
```

Harness 必须作为独立 Node 子进程运行：它的 bash/pwsh 工具依赖 `node-pty`，若打进 Electron，electron-builder 会按 Electron ABI 重建原生模块，导致 ABI 不匹配。桌面侧优化全部通过公开 cordis slot 完成，不修改 deepseek-harness。

实现细节（插件注入、布局、右键菜单、启动画面等）见 [INTEGRATION.md](INTEGRATION.md)。

## 发版

Windows NSIS 安装包与 macOS dmg/zip 在打版本标签时由 GitHub Actions 并行构建，发布到本仓库 GitHub Releases。推送或 PR 不会打包。已安装客户端通过 `electron-updater` 检查同一仓库的 Release（Windows 用 `latest.yml` + NSIS，macOS 用 `latest-mac.yml` + zip）。macOS job 在 Apple Silicon runner 上原生构建 `arm64`，并交叉编译 `x64`。

**发版步骤**：

1. 把 [`package.json`](package.json) 的 `version` 改成新版本（例如 `1.0.1`），提交到 `master`。
2. 打上与版本一致的标签并推送：

```bash
git tag v1.0.1
git push origin v1.0.1
```

3. [`.github/workflows/release.yml`](.github/workflows/release.yml) 的 Windows job 先建一条草稿 Release，Windows 与 macOS 两个 job 并行把各自产物上传到同一条 Release，最后由 Windows job 把草稿改为正式发布。

构建时设置了 `CSC_IDENTITY_AUTO_DISCOVERY=false`，避免 runner 因找不到证书而失败（产物未签名）。若要启用 macOS 签名与公证，需要配置 `CSC_LINK`/`CSC_KEY_PASSWORD` 与 `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` secrets，并把 `electron-builder.yml` 的 `mac.notarize` 改为 `true`。

## License

[MIT](LICENSE) © 2026 [0x2one](https://github.com/0x2one)
