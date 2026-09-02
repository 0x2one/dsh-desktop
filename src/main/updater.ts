/**
 * Packaged-app auto-update via GitHub Releases.
 *
 * Startup runs a silent check after a short delay and only broadcasts state
 * (no dedicated window). The Desktop settings page inlines the same phases
 * via `window.api.updater`. Development (`app.isPackaged === false`) never
 * contacts the feed; the settings page shows an explanation instead.
 *
 * @module dsh-desktop/updater
 */

import { app } from 'electron'
import { autoUpdater, type UpdateCheckResult, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '../preload/update-api'
import { pushUpdateState, setUpdateBridgeHandlers } from './update-bridge'

/** Wait for first-launch work (profile, market) before hitting GitHub. */
const STARTUP_CHECK_DELAY_MS = 8_000

/** Callbacks the updater needs from the app shell. */
export interface AppUpdaterOptions {
  /** Set quitRequested before `quitAndInstall` so close does not hide to tray. */
  onWillInstall: () => void
}

/** Handle returned to the settings page. */
export interface AppUpdater {
  /** Manual check from settings. Always broadcasts; never opens a window. */
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

function showDevNotice(): void {
  pushUpdateState({
    ...baseState(),
    phase: 'error',
    notes: '',
    error: '开发版不会检查更新。用安装好的应用再试。'
  })
}

/**
 * Start the updater. Packaged builds check GitHub after a delay; development
 * only shows a notice when the settings page asks.
 */
export function startAutoUpdater(options: AppUpdaterOptions): AppUpdater {
  if (!app.isPackaged) {
    setUpdateBridgeHandlers({
      download: (): void => {},
      installNow: (): void => {},
      installLater: (): void => {}
    })
    return {
      checkForUpdates: (): void => {
        showDevNotice()
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
  /**
   * Manual check that arrived while a check was already in flight.
   * The in-flight run presents its result for this waiter (so the settings
   * page is not left on an optimistic "checking" after a silent startup check).
   */
  let pendingManual = false

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

  function showReady(version: string): void {
    pushUpdateState({
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
    if (downloading) return
    downloading = true
    pushUpdateState({
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
      pushUpdateState({
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
      if (!silent && checking) pendingManual = true
      return
    }

    checking = true
    if (!silent) {
      pushUpdateState({ ...baseState(), phase: 'checking', notes: '' })
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      const waiting = pendingManual
      if (result === null || !updateIsAvailable(result)) {
        if (!silent || waiting) {
          pushUpdateState({ ...baseState(), phase: 'latest', notes: '' })
        }
        return
      }

      pendingVersion = result.updateInfo.version
      pendingNotes = notesFromInfo(result.updateInfo)
      pushUpdateState({
        ...baseState(),
        phase: 'available',
        nextVersion: pendingVersion,
        notes: pendingNotes
      })
    } catch (error) {
      console.error('[dsh-desktop] update check failed:', error)
      const waiting = pendingManual
      if (!silent || waiting) {
        pushUpdateState({
          ...baseState(),
          phase: 'error',
          notes: '',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    } finally {
      checking = false
      pendingManual = false
    }
  }

  setUpdateBridgeHandlers({
    download: (): void => {
      void downloadAndWatch()
    },
    installNow: (): void => {
      options.onWillInstall()
      autoUpdater.quitAndInstall()
    },
    installLater: (): void => {}
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
