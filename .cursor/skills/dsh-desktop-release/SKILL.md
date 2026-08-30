---
name: dsh-desktop-release
description: Ships a dsh-desktop GitHub Release (CHANGELOG, version bump, tag, Actions draft build, then manual publish with release notes). Use when the user asks to 发版, 发布, create a version like v1.0.3, 打 tag, or update GitHub Release notes.
---

# dsh-desktop 发版

CI 只上传**草稿**。`electron-updater` 只读已发布的 Release。正式发布必须人工（或本 skill 在构建成功后执行 `gh release edit --draft=false`）。

## 流程

复制并勾选：

```
- [ ] CHANGELOG Unreleased 挪到新版本小节
- [ ] package.json version 与标签一致（如 1.0.3 / v1.0.3）
- [ ] 提交并 push origin master
- [ ] annotated tag 推到 origin（触发 Release workflow）
- [ ] Actions：create-release + Windows + macOS Intel + macOS Apple Silicon 全绿
- [ ] 核对产物文件名（见下方清单）
- [ ] gh release edit --draft=false，notes 来自 CHANGELOG 该版本
```

**1. CHANGELOG** — [`CHANGELOG.md`](CHANGELOG.md)

- 把 `## Unreleased` 下条目移到 `## vX.Y.Z`，保留空的 Unreleased。
- 结构对齐已有版本：一句话摘要，然后 `### Features` / `### Fixes`（中文条目）。
- GitHub Release body **不要**带 `## vX.Y.Z` 标题（Release 名已有）。

**2. 版本号** — 只改根目录 [`package.json`](package.json) 的 `version`。不要为发版去改 `plugins/` 里的版本。

**3. 提交** — 一条 commit，例如 `Bump version to 1.0.3`。先 `git status` / `diff` / `log`。

**4. 推送** — 用户说「发版 / 发布 vX.Y.Z」即授权 push master + 新 tag：

```bash
git push origin master
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

不要重写已有 tag，除非用户明确说清空旧 Release 并重打同一版本。

**5. 等 CI** — `gh run watch` 对应 Release workflow。三个平台都成功再发布。

**6. 发布草稿** — 用 notes 文件（PowerShell 下 `--notes` 中文易乱码）：

```bash
gh release edit vX.Y.Z --draft=false --notes-file <notes.md> -R 0x2one/dsh-desktop
```

发完删掉临时 notes 文件。核对 `isDraft=false` 且产物齐全。

## 期望产物

| 文件 | 说明 |
|------|------|
| `dsh-desktop-<ver>-setup.exe` | Windows NSIS |
| `dsh-desktop-<ver>-mac-x64.dmg` / `.zip` | Intel，`macos-15-intel` 原生 |
| `dsh-desktop-<ver>-mac-arm64.dmg` / `.zip` | Apple Silicon，`macos-15` 原生 |
| `latest.yml` | Windows 自动更新 |
| `latest-mac.yml` | macOS 自动更新 |

缺 Intel dmg 或两个 dmg 同名，视为失败，不要发布。

## 禁止

- 不要把 [`electron-builder.yml`](electron-builder.yml) 的 `publish.releaseType` 改成 `release`（并发上传会拆成多条同 tag Release）。
- 不要在 workflow 里自动 `gh release edit --draft=false`。
- 不要在单个 `macos-latest` job 里跑 `--mac --x64 --arm64`（交叉编译且 dmg 无 arch 会互相覆盖）。
- 不要在 `pnpm/action-setup` 里再写 `version:`（与 `packageManager` 冲突）。
- `gh` 无 checkout 时必须设 `GH_REPO`（本仓库 workflow 的 create-release 已设）。

## 配置锚点

- Workflow：[`.github/workflows/release.yml`](.github/workflows/release.yml) — 先草稿，再 matrix 上传，不自动发布。
- 产物名：`mac` / `dmg` 的 `artifactName` 为 `${name}-${version}-mac-${arch}.${ext}`。
- 依赖：[`pnpm-workspace.yaml`](pnpm-workspace.yaml) 覆盖 `@electron/get` 为 `5.0.0`（builder 26 需要 `ElectronDownloadCacheMode`）。
