/**
 * Packaged-app auto-update via GitHub Releases.
 *
 * The main window loads the embedded dsh web UI, so update prompts live in
 * native dialogs (and the tray "检查更新" item), not the React renderer.
 * Development (`app.isPackaged === false`) never contacts the feed.
 *
 * @module dsh-desktop/updater
 */

import { app, dialog, type BrowserWindow } from 'electron'
import { autoUpdater, type UpdateCheckResult } from 'electron-updater'

/** Wait for first-launch work (profile, market) before hitting GitHub. */
const STARTUP_CHECK_DELAY_MS = 8_000

/** Callbacks the updater needs from the app shell. */
export interface AppUpdaterOptions {
  /** Window used as dialog parent; may be hidden in the tray. */
  getWindow: () => BrowserWindow | null
  /** Set quitRequested before `quitAndInstall` so close does not hide to tray. */
  onWillInstall: () => void
}

/** Handle returned to the tray "检查更新" item. */
export interface AppUpdater {
  /** Manual check: dialog even when already up to date or the check fails. */
  checkForUpdates: () => void
}

function dialogParent(getWindow: () => BrowserWindow | null): BrowserWindow | undefined {
  const window = getWindow()
  if (window === null || window.isDestroyed()) return undefined
  return window
}

function showBox(
  getWindow: () => BrowserWindow | null,
  options: Electron.MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> {
  const parent = dialogParent(getWindow)
  if (parent === undefined) return dialog.showMessageBox(options)
  return dialog.showMessageBox(parent, options)
}

function updateIsAvailable(result: UpdateCheckResult): boolean {
  if (typeof result.isUpdateAvailable === 'boolean') return result.isUpdateAvailable
  return result.updateInfo.version !== app.getVersion()
}

/**
 * Start the updater. Returns `null` in development so callers can skip checks.
 * Must run after `app.whenReady`.
 */
export function startAutoUpdater(options: AppUpdaterOptions): AppUpdater | null {
  if (!app.isPackaged) return null

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  let inFlight = false
  let downloadedVersion: string | undefined

  autoUpdater.on('error', (error) => {
    console.error('[dsh-desktop] auto-update error:', error)
  })

  async function promptInstall(version: string): Promise<void> {
    const { response } = await showBox(options.getWindow, {
      type: 'info',
      title: '更新已就绪',
      message: `版本 ${version} 已下载完成`,
      detail: '立即重启以安装更新，或在退出应用时自动安装。',
      buttons: ['立即重启安装', '退出时安装'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })
    if (response !== 0) return
    options.onWillInstall()
    autoUpdater.quitAndInstall()
  }

  async function runCheck(silent: boolean): Promise<void> {
    if (inFlight) return
    if (downloadedVersion !== undefined) {
      if (!silent) await promptInstall(downloadedVersion)
      return
    }

    inFlight = true
    try {
      const result = await autoUpdater.checkForUpdates()
      if (result === null || !updateIsAvailable(result)) {
        if (!silent) {
          await showBox(options.getWindow, {
            type: 'info',
            title: '检查更新',
            message: '当前已是最新版本',
            detail: `当前版本：${app.getVersion()}`,
            buttons: ['OK'],
            noLink: true
          })
        }
        return
      }

      const version = result.updateInfo.version
      const { response } = await showBox(options.getWindow, {
        type: 'info',
        title: '发现新版本',
        message: `发现新版本 ${version}`,
        detail: `当前版本：${app.getVersion()}\n新版本：${version}\n\n是否下载更新？`,
        buttons: ['下载', '稍后'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      })
      if (response !== 0) return

      await autoUpdater.downloadUpdate()
      downloadedVersion = version
      await promptInstall(version)
    } catch (error) {
      console.error('[dsh-desktop] update check failed:', error)
      if (!silent) {
        const detail = error instanceof Error ? error.message : String(error)
        await showBox(options.getWindow, {
          type: 'error',
          title: '检查更新失败',
          message: '无法检查或下载更新',
          detail,
          buttons: ['OK'],
          noLink: true
        })
      }
    } finally {
      inFlight = false
    }
  }

  setTimeout(() => {
    void runCheck(true)
  }, STARTUP_CHECK_DELAY_MS)

  return {
    checkForUpdates: (): void => {
      void runCheck(false)
    }
  }
}
