import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { checkRuntimeRequirements } from './requirements'
import { DshService } from './dsh-service'
import { registerWindowControls } from './window-controls'
import { ensurePluginsInstalled, waitForPluginInGraph } from './plugin-install'
import { prepareAppProfile, appProfileDir } from './profile-setup'
import { ensureMarketInstalled } from './plugin-market'

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
  // Set during app.whenReady before any window/service starts; a false value
  // means the app profile could not be initialized, so dsh must not boot.
  let profileReady = true

  app.on('second-instance', () => {
    if (mainWindow === null) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
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
      ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const } : {}),
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
    const loadLocalRenderer = (error?: string): void => {
      const url = process.env['ELECTRON_RENDERER_URL']
      const target = url ?? join(__dirname, '../renderer/index.html')
      const query = error === undefined ? '' : `?init-error=${encodeURIComponent(error)}`
      if (url !== undefined) window.loadURL(`${url}${query}`)
      else window.loadFile(target, query === '' ? undefined : { search: query.slice(1) })
    }

    // Show something immediately while the service starts.
    void loadLocalRenderer()

    // Market install outcome, set by the startup task below; the window shows
    // the loading page during a first-run install, and the harness boot waits
    // for the install to finish.
    let marketError: string | undefined

    void (async () => {
      // The app profile must exist before the harness can boot on it.
      if (!profileReady) {
        void loadLocalRenderer(
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
        dshService = new DshService({
          onReady: (url) => {
            // Inject the window-controls plugin into the harness profile, then
            // wait for the harness's live patch reload to fold the plugin into
            // the browser boot graph before loading the window — the first paint
            // then already shows the window controls. On timeout (or when the
            // injection is skipped because the plugin is already installed) the
            // window still loads; the plugin appears after the next reload.
            void (async () => {
              try {
                const injected = ensurePluginsInstalled()
                if (injected) await waitForPluginInGraph(url)
              } catch (error) {
                console.error('[dsh-desktop] plugin injection failed:', error)
              }
              if (!window.isDestroyed()) void window.loadURL(url)
            })()
          },
          onUnexpectedExit: (code, signal) => {
            if (quitRequested || window.isDestroyed()) return
            void loadLocalRenderer(
              `dsh web exited unexpectedly (code ${String(code)}, signal ${String(signal)})`
            )
          },
          onStartFailure: (message) => {
            if (quitRequested || window.isDestroyed()) return
            void loadLocalRenderer(message)
          }
        })
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
        message: 'dsh-desktop could not start the DeepSeek Harness service',
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
    } catch (error) {
      profileReady = false
      profileError = error instanceof Error ? error.message : String(error)
      console.error('[dsh-desktop] profile initialization failed:', error)
    }

    createWindow()

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
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  // Stop the embedded dsh service before quitting.
  app.on('before-quit', () => {
    quitRequested = true
    void dshService?.stop()
  })

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
