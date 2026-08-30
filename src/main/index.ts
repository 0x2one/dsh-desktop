import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { PRODUCT_NAME } from './app-name'
import { checkRuntimeRequirements } from './requirements'
import { DshService } from './dsh-service'
import { registerWindowControls } from './window-controls'
import { ensurePluginsInstalled, waitForPluginInGraph, defaultDshHome } from './plugin-install'
import {
  prepareAppProfile,
  appProfileDir,
  APP_PROFILE,
  createHarnessProfile,
  normalizeProfileName
} from './profile-setup'
import { ensureMarketInstalled } from './plugin-market'
import { createAppTray, type AppTray } from './tray'
import { loadPreferredProfile, savePreferredProfile } from './profile-pref'
import { promptProfileName } from './profile-prompt'
import { startAutoUpdater, type AppUpdater } from './updater'
import { closeUpdateWindow } from './update-window'
import { installAppMenu } from './menu'

// Point the plugin installer at the built plugin tree. In development this is
// the repository checkout; packaged builds set resourcesPath and the installer
// falls back to resources/plugins automatically.
if (process.env.DSH_DESKTOP_PLUGINS_ROOT === undefined && process.resourcesPath === undefined) {
  process.env.DSH_DESKTOP_PLUGINS_ROOT = join(__dirname, '../../plugins')
}

// ---- single-instance lock: a second launch focuses the existing window ----
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  let dshService: DshService | null = null
  let quitRequested = false
  let appTray: AppTray | null = null
  let appUpdater: AppUpdater | null = null
  let activeProfile = APP_PROFILE
  let switchingProfile = false
  // Set during app.whenReady before any window/service starts; a false value
  // means the app profile could not be initialized, so dsh must not boot.
  let profileReady = true

  function showMainWindow(): void {
    if (mainWindow === null || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }

  function loadLocalRenderer(error?: string): void {
    if (mainWindow === null || mainWindow.isDestroyed()) return
    const window = mainWindow
    const url = process.env['ELECTRON_RENDERER_URL']
    const target = url ?? join(__dirname, '../renderer/index.html')
    const query = error === undefined ? '' : `?init-error=${encodeURIComponent(error)}`
    if (url !== undefined) void window.loadURL(`${url}${query}`)
    else void window.loadFile(target, query === '' ? undefined : { search: query.slice(1) })
  }

  async function switchProfile(name: string): Promise<void> {
    if (dshService === null || switchingProfile || quitRequested) return
    const previous = dshService.getProfile()
    if (name === previous) return
    switchingProfile = true
    loadLocalRenderer()
    try {
      await dshService.restart(name)
      savePreferredProfile(name)
      activeProfile = name
      appTray?.refresh(name)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error('[dsh-desktop] profile switch failed:', error)
      void dialog.showMessageBox({
        type: 'error',
        title: 'Failed to switch profile',
        message: `Could not start profile "${name}"`,
        detail,
        buttons: ['OK']
      })
      try {
        await dshService.restart(previous)
        savePreferredProfile(previous)
        activeProfile = previous
        appTray?.refresh(previous)
      } catch (restartError) {
        console.error('[dsh-desktop] failed to restore previous profile:', restartError)
        loadLocalRenderer(`Failed to switch to "${name}" and could not restore "${previous}".`)
        appTray?.refresh(dshService.getProfile())
      }
    } finally {
      switchingProfile = false
    }
  }

  async function createNewProfile(): Promise<void> {
    if (switchingProfile || quitRequested) return
    showMainWindow()
    const raw = await promptProfileName(mainWindow)
    if (raw === null || raw.trim() === '') return
    try {
      const name = normalizeProfileName(raw)
      createHarnessProfile(name)
      appTray?.refresh()

      // Same bootstrap as first-launch `dsh-desktop`: install dshmarket so the
      // plugin market is present when this profile boots. pnpm may take minutes.
      loadLocalRenderer()
      switchingProfile = true
      try {
        const market = await ensureMarketInstalled(undefined, name)
        if (!market.installed && market.error !== undefined) {
          void dialog.showMessageBox({
            type: 'warning',
            title: '插件市场安装失败',
            message: `未能在环境「${name}」中安装 dshmarket`,
            detail: `${market.error}\n\n环境已创建，可稍后重试安装。`,
            buttons: ['OK']
          })
        }
      } finally {
        switchingProfile = false
      }

      await switchProfile(name)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      void dialog.showMessageBox({
        type: 'error',
        title: '无法创建环境',
        message: '新环境没有创建成功',
        detail,
        buttons: ['OK']
      })
    }
  }

  app.on('second-instance', () => {
    showMainWindow()
  })

  function createWindow(): void {
    // Native frame is hidden: the dsh web UI renders the window controls in
    // its top-right corner (window-controls cordis plugin) and drives them
    // over IPC. On macOS the traffic lights stay (titleBarStyle hidden).
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      frame: false,
      ...(process.platform === 'darwin'
        ? {
            // Keep the native traffic lights and pin them where the injected
            // sidebar drag strip expects them (see the window-controls plugin:
            // MAC_TRAFFIC_LIGHTS_WIDTH/HEIGHT).
            titleBarStyle: 'hidden' as const,
            trafficLightPosition: { x: 12, y: 12 }
          }
        : {}),
      title: PRODUCT_NAME,
      icon,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    const window = mainWindow
    window.on('ready-to-show', () => {
      window.show()
    })

    // Close hides to the tray unless the user chose 退出 (app.quit), or the
    // window is already hidden — a second close (NSIS WM_CLOSE / Stop-Process
    // while the app is in the tray) must actually quit or the installer keeps
    // seeing DeepSeek Harness Desktop.exe and shows "无法关闭".
    window.on('close', (event) => {
      if (quitRequested) return
      if (!window.isVisible()) {
        quitRequested = true
        app.quit()
        return
      }
      event.preventDefault()
      window.hide()
    })

    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // Register window-control IPC before any page can call it.
    const disposeControls = registerWindowControls(window)
    window.on('closed', () => {
      disposeControls()
      mainWindow = null
    })

    // In development the renderer is served by electron-vite; in production it
    // is a file. The dsh UI takes over the window once the service is ready,
    // so the local renderer only appears for init failures and development.

    // Show something immediately while the service starts.
    loadLocalRenderer()

    // Market install outcome, set by the startup task below; the window shows
    // the loading page during a first-run install, and the harness boot waits
    // for the install to finish.
    let marketError: string | undefined

    void (async () => {
      // The app profile must exist before the harness can boot on it.
      if (!profileReady) {
        loadLocalRenderer(
          'The dsh-desktop profile could not be initialized. See the error dialog for details.'
        )
        return
      }

      // ---- dshmarket bootstrap ----
      // The harness boots on the app's dedicated `dsh-desktop` profile, so the
      // plugin market only appears in the desktop UI when it is installed into
      // that profile. Check for it on every launch and, when missing, install
      // it through the harness's own plugin manager
      // (`dsh plugin --profile dsh-desktop add dshmarket`) before the service
      // starts. The install blocks startup (first run can take minutes while
      // pnpm fetches the registry) so the market is present on this launch; a
      // failure is reported but does not block the app — the market simply
      // stays absent until the next launch.
      try {
        const market = await ensureMarketInstalled()
        if (!market.installed && market.error !== undefined) marketError = market.error
      } catch (error) {
        marketError = error instanceof Error ? error.message : String(error)
        console.error('[dsh-desktop] dshmarket bootstrap failed:', error)
      }

      if (marketError !== undefined) {
        void dialog.showMessageBox({
          type: 'warning',
          title: 'Plugin market unavailable',
          message: 'dshmarket could not be installed on first launch',
          detail: `The plugin market was not found in the dsh-desktop profile and the automatic install failed.\n\n${marketError}\n\nIt will be retried on the next launch.`,
          buttons: ['OK']
        })
      }

      if (dshService === null)
        dshService = new DshService(
          {
            onReady: (url) => {
              // Inject the window-controls plugin into the active harness
              // profile, then wait for the harness's live patch reload to fold
              // the plugin into the browser boot graph before loading the
              // window — the first paint then already shows the window
              // controls. On timeout (or when the injection is skipped because
              // the plugin is already installed) the window still loads; the
              // plugin appears after the next reload.
              void (async () => {
                try {
                  const profile = dshService?.getProfile() ?? activeProfile
                  const injected = ensurePluginsInstalled(defaultDshHome(), profile)
                  if (injected) await waitForPluginInGraph(url)
                } catch (error) {
                  console.error('[dsh-desktop] plugin injection failed:', error)
                }
                if (window.isDestroyed()) return
                // A profile switch may have started a newer process; ignore this URL.
                if (dshService?.getUrl() !== url) return
                void window.loadURL(url)
              })()
            },
            onUnexpectedExit: (code, signal) => {
              if (quitRequested || window.isDestroyed()) return
              loadLocalRenderer(
                `dsh web exited unexpectedly (code ${String(code)}, signal ${String(signal)})`
              )
            },
            onStartFailure: (message) => {
              if (quitRequested || window.isDestroyed()) return
              loadLocalRenderer(message)
            }
          },
          activeProfile
        )
      try {
        await dshService.start()
      } catch (error) {
        // Start failure already routed to onStartFailure; keep the window alive.
        console.error('[dsh-desktop] dsh web failed to start:', error)
      }
    })()
  }

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.dsh.desktop')
    app.setName(PRODUCT_NAME)

    // macOS application menu (roles for Cmd+Q / Cmd+C/V/X/A / window ops).
    installAppMenu()

    // In development the app runs from the electron binary, which shows the
    // Electron default Dock icon; use our icon so the dev dock matches.
    if (!app.isPackaged && process.platform === 'darwin') {
      app.dock?.setIcon(icon)
    }

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // ---- runtime requirements (Node.js + pnpm) ----
    const requirements = checkRuntimeRequirements()
    if (!requirements.ok) {
      const detail = requirements.missing
        .map((name, index) => `${requirements.guidance[index] ?? name}`)
        .join('\n\n')
      void dialog.showMessageBox({
        type: 'warning',
        title: 'Missing runtime requirements',
        message: `${PRODUCT_NAME} could not start the DeepSeek Harness service`,
        detail,
        buttons: ['OK']
      })
    }

    // ---- app profile detection & initialization ----
    // Create `~/.dsh/profiles/dsh-desktop` on first launch (or repair a stale
    // manifest missing the web bundles) so the harness boots on its own
    // profile and shares the locally installed dependency tree through the
    // `profiles/node_modules` fallback — no pnpm, no network. A failure here
    // is reported before any window or service starts.
    let profileError: string | undefined
    try {
      prepareAppProfile()
      activeProfile = loadPreferredProfile()
    } catch (error) {
      profileReady = false
      profileError = error instanceof Error ? error.message : String(error)
      console.error('[dsh-desktop] profile initialization failed:', error)
    }

    appTray = createAppTray({
      icon,
      currentProfile: activeProfile,
      onShow: showMainWindow,
      onSelectProfile: (name) => {
        void switchProfile(name)
      },
      onCreateProfile: () => {
        void createNewProfile()
      },
      onCheckUpdate: () => {
        appUpdater?.checkForUpdates()
      },
      onQuit: () => {
        app.quit()
      }
    })

    createWindow()

    appUpdater = startAutoUpdater({
      getWindow: () => mainWindow,
      onWillInstall: () => {
        quitRequested = true
      }
    })

    if (!profileReady) {
      void dialog.showMessageBox({
        type: 'error',
        title: 'Profile initialization failed',
        message: 'Could not initialize the dsh-desktop profile',
        detail: `Expected profile: ${appProfileDir()}\n\n${profileError ?? ''}`,
        buttons: ['OK']
      })
    }

    app.on('activate', function () {
      // On macOS, dock click should restore a hidden window rather than
      // spawning a second one. Recreate only when the window is gone.
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        showMainWindow()
      } else if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  // Stop the embedded dsh service before quitting. Must await the tree kill —
  // otherwise Electron exits while npx/node is still alive, or the event
  // loop stays up on the child's handles, and NSIS still sees the app.
  let serviceStopping = false
  app.on('before-quit', (event) => {
    quitRequested = true
    appTray?.destroy()
    appTray = null
    closeUpdateWindow()
    if (serviceStopping || dshService === null) return
    event.preventDefault()
    serviceStopping = true
    const service = dshService
    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, 5000)
    })
    void Promise.race([service.stop(), timeout]).finally(() => {
      app.quit()
    })
  })

  // Keep the process (and tray) alive when windows are closed. Actual quit is
  // driven by the tray "退出" item via app.quit().
  app.on('window-all-closed', () => {})
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
