# dsh-desktop

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

## 发布与自动更新

Windows 安装包由 GitHub Actions 构建，并发布到 GitHub Releases。已安装的客户端通过 `electron-updater` 检查同一仓库的 Release（`latest.yml` + NSIS）。

### CI

推送到 `master` 或打开 PR 时，[`.github/workflows/ci.yml`](.github/workflows/ci.yml) 会在 `windows-latest` 上执行 `pnpm build` 并打包 NSIS（`--publish never`），产物作为 workflow artifact，不会创建 Release。

### 发版

1. 把 [`package.json`](package.json) 里的 `version` 改成新版本（例如 `1.0.1`），提交到 `master`。
2. 打上与版本一致的标签并推送：

```bash
git tag v1.0.1
git push origin v1.0.1
```

3. [`.github/workflows/release.yml`](.github/workflows/release.yml) 会构建 Windows NSIS，并以 `release`（非草稿）发布到 GitHub Releases，供客户端自动更新。

当前未配置代码签名。CI 设置了 `CSC_IDENTITY_AUTO_DISCOVERY=false`，避免 runner 因找不到证书而失败。

### 客户端

打包后的应用启动数秒后会静默检查更新。发现新版本时弹出对话框，确认后下载；下载完成可立即重启安装，或等到托盘「退出」时安装。也可随时用托盘菜单「检查更新…」手动检查。开发模式（`pnpm dev`）不访问更新源。
