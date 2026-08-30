/**
 * Packaged-app auto-update via GitHub Releases.
 *
 * Prompts live in a dedicated frameless window (Changelog + progress), not
 * native dialogs. Development (`app.isPackaged === false`) never contacts the
 * feed; the tray item still opens the window with an explanation.
 *
 * @module dsh-desktop/updater
 */

import { app, type BrowserWindow } from 'electron'
import { autoUpdater, type UpdateCheckResult, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '../preload/update-api'
import {
  closeUpdateWindow,
  pushUpdateState,
  setUpdateWindowHandlers,
  showUpdateWindow
} from './update-window'

/** Wait for first-launch work (profile, market) before hitting GitHub. */
const STARTUP_CHECK_DELAY_MS = 8_000

/** Callbacks the updater needs from the app shell. */
export interface AppUpdaterOptions {
  /** Window used as the update prompt parent; may be hidden in the tray. */
  getWindow: () => BrowserWindow | null
  /** Set quitRequested before `quitAndInstall` so close does not hide to tray. */
  onWillInstall: () => void
}

/** Handle returned to the tray "检查更新" item. */
export interface AppUpdater {
  /** Manual check: window even when already up to date or the check fails. */
  checkForUpdates: () => void
}

function updateIsAvailable(result: UpdateCheckResult): boolean {
  if (typeof result.isUpdateAvailable === 'boolean') return result.isUpdateAvailable
  return result.updateInfo.version !== app.getVersion()
}

function notesFromInfo(info: UpdateInfo): string {
  const notes = info.releaseNotes
  if (typeof notes === 'string' && notes.trim() !== '') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((item) => {
        const body = typeof item.note === 'string' ? item.note : ''
        return `### ${item.version}\n\n${body}`.trim()
      })
      .filter((block) => block !== '')
      .join('\n\n')
  }
  return ''
}

function baseState(): Pick<UpdateState, 'currentVersion'> {
  return { currentVersion: app.getVersion() }
}

function showDevNotice(getWindow: () => BrowserWindow | null): void {
  pushUpdateState({
    ...baseState(),
    phase: 'error',
    notes: '',
    error: '开发版不会检查更新。用安装好的应用再试。'
  })
  showUpdateWindow(getWindow)
}

/**
 * Start the updater. Always returns a handle so the tray item can open the
 * window; packaged builds check GitHub, development only shows a notice.
 */
export function startAutoUpdater(options: AppUpdaterOptions): AppUpdater {
  if (!app.isPackaged) {
    setUpdateWindowHandlers({
      download: (): void => {},
      installNow: (): void => {
        closeUpdateWindow()
      },
      installLater: (): void => {
        closeUpdateWindow()
      }
    })
    return {
      checkForUpdates: (): void => {
        showDevNotice(options.getWindow)
      }
    }
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  let checking = false
  let downloading = false
  let downloadedVersion: string | undefined
  let pendingNotes = ''
  let pendingVersion: string | undefined

  autoUpdater.on('error', (error) => {
    console.error('[dsh-desktop] auto-update error:', error)
  })

  autoUpdater.on('download-progress', (progress) => {
    pushUpdateState({
      ...baseState(),
      phase: 'downloading',
      nextVersion: pendingVersion,
      notes: pendingNotes,
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total
      }
    })
  })

  function present(state: UpdateState): void {
    pushUpdateState(state)
    showUpdateWindow(options.getWindow)
  }

  function showReady(version: string): void {
    present({
      ...baseState(),
      phase: 'ready',
      nextVersion: version,
      notes: pendingNotes
    })
  }

  async function downloadAndWatch(): Promise<void> {
    if (downloadedVersion !== undefined) {
      showReady(downloadedVersion)
      return
    }
    if (downloading) {
      showUpdateWindow(options.getWindow)
      return
    }
    downloading = true
    present({
      ...baseState(),
      phase: 'downloading',
      nextVersion: pendingVersion,
      notes: pendingNotes,
      progress: { percent: 0, transferred: 0, total: 0 }
    })
    try {
      await autoUpdater.downloadUpdate()
      downloadedVersion = pendingVersion
      if (downloadedVersion !== undefined) showReady(downloadedVersion)
    } catch (error) {
      console.error('[dsh-desktop] update download failed:', error)
      present({
        ...baseState(),
        phase: 'error',
        nextVersion: pendingVersion,
        notes: pendingNotes,
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      downloading = false
    }
  }

  async function runCheck(silent: boolean): Promise<void> {
    if (downloadedVersion !== undefined) {
      showReady(downloadedVersion)
      return
    }
    if (checking || downloading) {
      if (!silent) showUpdateWindow(options.getWindow)
      return
    }

    checking = true
    if (!silent) {
      present({ ...baseState(), phase: 'checking', notes: '' })
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      if (result === null || !updateIsAvailable(result)) {
        if (!silent) present({ ...baseState(), phase: 'latest', notes: '' })
        return
      }

      pendingVersion = result.updateInfo.version
      pendingNotes = notesFromInfo(result.updateInfo)
      present({
        ...baseState(),
        phase: 'available',
        nextVersion: pendingVersion,
        notes: pendingNotes
      })
    } catch (error) {
      console.error('[dsh-desktop] update check failed:', error)
      if (!silent) {
        present({
          ...baseState(),
          phase: 'error',
          notes: '',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    } finally {
      checking = false
    }
  }

  setUpdateWindowHandlers({
    download: (): void => {
      void downloadAndWatch()
    },
    installNow: (): void => {
      options.onWillInstall()
      closeUpdateWindow()
      autoUpdater.quitAndInstall()
    },
    installLater: (): void => {
      closeUpdateWindow()
    }
  })

  setTimeout(() => {
    void runCheck(true)
  }, STARTUP_CHECK_DELAY_MS)

  return {
    checkForUpdates: (): void => {
      void runCheck(false)
    }
  }
}
