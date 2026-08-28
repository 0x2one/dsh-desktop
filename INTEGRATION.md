# dsh-desktop — DeepSeek Harness 桌面集成

Electron 应用，将 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web 界面（`dsh web`）嵌入桌面窗口。

## 架构总览

```
┌─────────────────────────────────────────────────┐
│ Electron 主进程 (src/main)                        │
│  ├─ requirements.ts   检查 Node.js / pnpm         │
│  ├─ dsh-service.ts    spawn npx @deepseek-ai/dsh  │
│  │                    web --no-open --port 0      │
│  ├─ plugin-market.ts  启动时检查 dshmarket，缺失则  │
│  │                    dsh plugin add（阻塞装完）   │
│  ├─ plugin-install.ts 把窗口操作栏 cordis 插件      │
│  │                    注入 ~/.dsh/profiles/dsh-desktop │
│  ├─ window-controls.ts IPC：最小化/最大化/关闭      │
│  └─ index.ts          组装以上模块                 │
├─────────────────────────────────────────────────┤
│ dsh web（独立 Node 子进程）                        │
│  └─ @deepseek-ai/dsh@0.1.1-rc.2 --profile dsh-desktop │
│     ├─ 浏览器前端（vite 产物，__DSH_BOOT__ 注入）   │
│     └─ @dsh-desktop/window-controls（cordis 插件） │
│        浏览器端注册到 shell.overlay slot → 内容栏   │
│        右上方操作栏 → window.api.windowControls→IPC│
│        + 内容栏顶部 40px 拖拽条（app-region: drag）│
├─────────────────────────────────────────────────┤
│ preload (src/preload)  暴露 window.api.windowControls
└─────────────────────────────────────────────────┘
```

## 需求映射

| 需求 | 实现 |
|---|---|
| 1. 启动检查 Node/pnpm | `src/main/requirements.ts`：spawn `node --version` / `pnpm --version`，缺失或版本不满足（dsh engines `^22.19 || >=24`）时弹窗提示安装指引 |
| 2. `npx @deepseek-ai/dsh web` 集成，固定 0.1.1-rc.2 | `src/main/dsh-service.ts`：`npx --yes @deepseek-ai/dsh@0.1.1-rc.2 --profile dsh-desktop --no-open --port 0`，解析 `dsh web: http://...` 就绪行 |
| 3. 优化调整走 cordis 插件 | `plugins/dsh-desktop-window-controls/`：不改 deepseek-harness 源码，全部通过公开 slot 注册 |
| 4. profiles 默认路径 + 专属 app profile + 共享本地环境 | **专属 profile `~/.dsh/profiles/dsh-desktop`**（`src/main/profile-setup.ts` 程序化创建，不跑 pnpm）；与用户 `web` profile 隔离，通过 `profiles/node_modules` 共享层复用 dsh 已安装依赖（同一套环境）；插件构建产物、注入器、验证脚本都在本仓库 |
| 5. 隐藏原生操作栏 + 右上角自定义操作栏 | `frame: false` + cordis 插件渲染到 `shell.overlay`（右上角），经 IPC 驱动窗口 |
| 6. 最大化兼容、不改源码 | 插件通过 `dsh.client` 声明被发现，patch 层 `cordis.patch.yml` 注入 entry |
| 7. 启动时检查并安装 dshmarket | `src/main/plugin-market.ts`：检测 app profile 是否已声明/可解析 `dshmarket`，缺失则阻塞执行 `dsh plugin --profile dsh-desktop add dshmarket`（harness 自带 pnpm 转发 + bundle 层 reconcile），首次运行可能耗时数分钟；失败弹窗提示但不阻塞启动 |

## 目录结构

```
src/main/
  index.ts          主进程入口：环境检查 → 窗口 → dsh 服务 → 注入 → 加载
  dsh-service.ts    dsh web 子进程生命周期（spawn/ready/stop/进程树清理）
  requirements.ts   运行时要求检查（Node/pnpm）
  profile-setup.ts  专属 profile（dsh-desktop）程序化创建，复用共享依赖
  plugin-install.ts 插件注入（复制包 + patch 幂等追加 + 等待 boot 图就绪）
  window-controls.ts 窗口控制 IPC（minimize/toggleMaximize/close/isMaximized）
src/preload/
  index.ts          contextBridge 暴露 window.api.windowControls
  index.d.ts        类型声明
src/renderer/       本地兜底页（服务启动失败/开发期）
plugins/dsh-desktop-window-controls/
  package.json      声明 dsh.client（platform: web）
  src/index.ts      node half（空 apply，供 Loader 挂 entry）
  src/client/       浏览器端：注册 shell.overlay + WindowControls 组件
  build.mjs         esbuild 构建（node ESM + 浏览器 CJS 工厂格式）
scripts/
  verify-plugin-injection.mjs  注入 + 幂等 + 真实 dsh boot
  verify-plugin-graph.mjs      插件进入 __DSH_BOOT__ 图
  verify-plugin-browser.mjs    Playwright 验证渲染与桥接路由
  verify-injection-timing.mjs  live reload 后图更新的时序
  smoke-electron.mjs           （参考）Electron 冒烟
```

## 专属 profile 与共享环境

应用启动 `dsh --profile dsh-desktop`（不是用户的 `web` profile）：

1. `profile-setup.ts` 程序化创建 `~/.dsh/profiles/dsh-desktop/`：
   - `package.json`：bundles = `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']`，`patchReload: live`
   - `cordis.patch.yml`（模板）、`pnpm-workspace.yaml`（hoisted 布局）
   - **不跑 pnpm**：依赖从共享 `profiles/node_modules` 解析
2. dsh boot 时 `healProfilesModuleFallback` 把安装的依赖 symlink 到 `~/.dsh/profiles/node_modules`（共享层）—— 与本地 `dsh web` 完全同一套依赖，无重复安装、无联网。
3. 插件注入只写 `dsh-desktop` profile，用户的 `web` profile 及其 MCP/插件配置不受影响。

## 关键实现细节

### dsh web 启动
- 用 `--port 0` 让 OS 分配空闲端口，规避冲突。
- 用 `--no-open` 避免 dsh 自己开浏览器。
- `DSH_TELEMETRY_DISABLED=1` 关闭遥测。
- Windows 上 npx 是 `.cmd`，spawn 需要 `shell: true`；退出用 `taskkill /T /F` 杀进程树。

### 插件注入（不碰 dsh 源码）
1. 构建插件 → `plugins/dsh-desktop-window-controls/lib/`（esbuild）。
2. 复制到 `~/.dsh/profiles/dsh-desktop/node_modules/@dsh-desktop/window-controls/`（profile 的 hoisted 扁平 node_modules 可被 Loader 按裸名解析）。
3. 在 `~/.dsh/profiles/dsh-desktop/cordis.patch.yml` 幂等追加 `- insert:` 块。
   - 模板文件结尾的 `[]` 必须替换（`[]` 是完整 YAML 文档，后面不能再跟行）。
   - 已有用户内容（MCP 配置等）保留。
4. `waitForPluginInGraph` 轮询服务页面直到 `__DSH_BOOT__` 含插件 id（live patch reload 自动重扫），窗口首屏即带操作栏。

### dshmarket 插件市场自动安装
- 应用跑在专属 `dsh-desktop` profile，市场插件只有装进该 profile 才会出现在桌面 UI 中——**不碰用户 `web` profile**（用户自己的 `web` profile 里若已装 dshmarket 也与本应用无关）。
- `plugin-market.ts` 的 `isMarketInstalled` 检查 profile 的 `package.json`（`dsh.profile.bundles` 或 `dependencies` 含 `dshmarket`）**且** `node_modules/dshmarket/package.json` 可解析；两者都满足才视为已安装（避免 manifest 残留/中断安装误判）。
- 缺失时阻塞执行 `dsh plugin --profile dsh-desktop add dshmarket`（Windows 下经 `dsh.cmd` + shell spawn），该命令由 harness 自带：初始化 profile → 转发 `pnpm add` → 按已安装状态 reconcile `dsh.profile.bundles` 层。
- 首次安装需联网拉 registry，可能耗时数分钟（超时 5 分钟）；安装期间窗口显示本地加载页，装完才开始 `dsh web`，本次启动即可用市场。失败弹窗提示、不阻塞启动，下次启动自动重试。
- `installMarket` 只在 `exit code === 0` 时成功；stdout/stderr 尾部并入错误信息便于排查。

### 浏览器端插件格式（关键契约）
- `package.json` 声明 `dsh.client: { platform: "web" }` + `exports["./client"]`。
- 浏览器 bundle 是 CJS 工厂：`window.__ModuleLoader__.load({ id, factory })`，`factory(require)` 返回 `module.exports`。
- 外部依赖（react、@deepseek-ai/cordis、ui-slots 等平台模块）用 esbuild external，运行时从模块表 require。
- 不 import 其它 `@deepseek-ai/*` 值（bundle purity 规则），仅用 platform 模块 + `window.api`。
- esbuild 的 CJS 输出有自己的 `__commonJS` scope，footer 拿不到 exports——用 `format: 'iife'` + `globalName` 捕获，footer 里 `module.exports = global`。

### 窗口控制
- BrowserWindow `frame: false`（Windows/Linux 隐藏原生标题栏；macOS `titleBarStyle: 'hidden'`）。
- IPC：`window:minimize`（send）、`window:toggle-maximize` / `window:is-maximized`（invoke）、`window:close`（send）、`window:maximized-changed`（主进程广播）。
- 浏览器插件组件用 dsh 主题 CSS 变量（`var(--dsw-alias-*)`）适配明暗主题。
- **窗口拖动**：无边框窗口没有原生标题栏，插件在**中间内容栏（会话区）顶部 40px 条带**注入 `-webkit-app-region: drag` 拖拽条（`data-dsh-drag-strip`），按下该条带即可移动窗口；操作栏保持 `no-drag`，按钮点击不受影响。
- **布局占位**：插件注入样式表（`data-dsh-css="dsh-desktop-title-bar"`）：
  - **hero（未打开会话）**：内容栏**无顶部 padding**（`padding-top: 0`），hero 内容区直接顶到窗口最顶端；hero 卡片本身在可视区垂直居中，顶部 40px 空白带由拖拽条覆盖用于拖动窗口；
  - **active（打开会话）**：会话标题栏从窗口最顶端开始，标题、模式、Session log 与操作栏**同一行**；只给标题行（`[class*="titleRow"]`）加 `margin-right: 110px` 为右侧操作栏让位（Session log 紧贴操作栏左侧、不重叠），**tabs 行保持全宽**（header 不再整体加右边距）。
  - 注意：header 用「去掉 padding 自然上移」而非 `margin-top: -40px`——负 margin 上移会让 Chromium 命中测试失效（内容视觉在 y=0 但点击区域仍在下移处），导致操作栏看似盖住标题区内容。
- **操作栏（窗口控制）**：渲染在内容栏右上角，**操作栏整条与按钮背景均透明**（`background: transparent`，由注入样式表 `[data-dsh-window-controls]` / `[data-dsh-wc-button]` 规则驱动），不绘制任何色块、与页面完全融合；图标用 `--dsw-alias-label-secondary` + 85% 透明度。**hover 背景完全由注入 CSS 驱动**（内联样式不设 background/opacity，避免内联优先级压过 `:hover` 规则）：普通按钮 hover 用 `color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)`（主题感知、清晰可见——dsh 自带 `interactive-bg-hover` 只有 ~6% alpha 几乎不可见），关闭按钮 hover 用 `--dsw-alias-state-error-primary` 变红。验证脚本通过 CDP `CSS.forcePseudoState` 强制 hover 断言背景生效。
- **拖拽条范围自适应**：hero（未打开会话）时拖拽条覆盖内容栏整个顶部 40px；打开会话后拆成**两段**覆盖标题行的非交互区域——段 1 为标题 crumbs 区（列左缘 → 模式切换左缘），段 2 为模式切换与 Session log 之间的空白弹性区，总宽度从 ~148px 扩大到 ~680px（1280 窗口）。模式切换、Session log 按钮不被拖拽条覆盖，保持可点击。操作栏与拖拽条通过 ResizeObserver/MutationObserver 锚定内容栏与标题栏几何，窗口缩放、侧栏折叠/展开、面板拖动时跟随移动。
- **本地兜底页**（启动中/出错时）：`src/renderer/src/assets/main.css` 给 `body` 设置 `-webkit-app-region: drag`，该页面无交互控件，整页可拖动。
- **右键菜单**：Electron 默认不提供原生右键菜单，主进程 `registerContextMenu`（`src/main/window-controls.ts`）监听 `webContents` 的 `context-menu` 事件并按点击上下文动态构建菜单：
  - 可编辑区域（输入框/composer）：撤销/重做/剪切/复制/粘贴/全选（按 `editFlags` 启用/禁用）；
  - 选中文本（非编辑区）：复制/全选；
  - 链接：在浏览器中打开 / 复制链接地址；
  - 底部固定导航块：后退/前进（按 `navigationHistory` 启用）/ 重新加载 / 检查元素。
  - 调试：设置 `DSH_DESKTOP_DEBUG_MENU=1` 会在每次菜单弹出时向 stdout 打印菜单项数与上下文。

## 验证

```bash
pnpm install
npm run build:plugin   # 构建 cordis 插件
npm run build          # typecheck + plugin + electron-vite build
npm run dev            # 开发模式

# 端到端验证（需本机 Node/pnpm + 可访问 npm registry）
node scripts/verify-plugin-injection.mjs
node scripts/verify-plugin-graph.mjs
node scripts/verify-plugin-browser.mjs   # 需要已安装的 playwright chromium
node scripts/verify-injection-timing.mjs
node scripts/verify-hero-layout.mjs      # hero 内容顶到顶部 + 操作栏/按钮透明
```

验证脚本全部使用临时 `DSH_HOME`，不污染真实用户数据。

## 已知边界
- 首次启动需联网下载 `@deepseek-ai/dsh@0.1.1-rc.2`（180s 超时，失败显示错误页）。
- 用户机器需 Node 22.19+/24+ 与 pnpm（启动时检查并提示）。
- Windows 为主目标；macOS 保留红绿灯但未完整打磨。
- dsh 的 bash/pwsh 工具依赖 node-pty（Node ABI），因此 dsh 必须作为独立 Node 子进程运行，不能直接打包进 Electron（electron-builder 会按 Electron ABI rebuild 原生模块导致 ABI 不匹配）。
