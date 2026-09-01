/**
 * IPC surface for the dsh-desktop settings cordis plugin.
 *
 * The plugin's browser half lives in the harness web UI and drives the same
 * tray actions (hotkey, launch-at-login, profiles, check-for-updates) through
 * this module. Callbacks are supplied by the app shell so there is one
 * implementation of each action.
 *
 * @module dsh-desktop/desktop-settings
 */

import { BrowserWindow, ipcMain } from 'electron'
import { DESKTOP_CHANNELS, type DesktopSnapshot } from '../preload/desktop-api'

/** Callbacks the settings page uses; the shell already owns these for the tray. */
export interface DesktopSettingsHandlers {
  /** Current snapshot (re-read on every get / broadcast). */
  getSnapshot: () => DesktopSnapshot
  /** Open the existing hotkey recorder; true when the combo changed. */
  editHotkey: () => Promise<boolean>
  /** Enable or disable launch-at-login. */
  setLaunchAtLogin: (enabled: boolean) => void
  /** Switch the running harness profile. */
  selectProfile: (name: string) => Promise<void>
  /** Prompt for a name and create a new profile. */
  createProfile: () => Promise<void>
  /** Open the existing updater window / check. */
  checkUpdate: () => void
}

/** Live handle: push a fresh snapshot to the renderer, dispose on window close. */
export interface DesktopSettingsIpc {
  /** Send the current snapshot to the window (tray and settings stay in sync). */
  broadcast: () => void
  /** Remove IPC handlers. */
  dispose: () => void
}

/**
 * Register desktop-settings IPC for one window.
 * @param window - the window whose renderer hosts the harness UI.
 * @param handlers - tray-equivalent actions owned by the app shell.
 */
export function registerDesktopSettings(
  window: BrowserWindow,
  handlers: DesktopSettingsHandlers
): DesktopSettingsIpc {
  const webContents = window.webContents

  const handleGetSnapshot = (): DesktopSnapshot => handlers.getSnapshot()

  const handleEditHotkey = (): Promise<boolean> => handlers.editHotkey()

  const handleSetLaunchAtLogin = (_event: Electron.IpcMainInvokeEvent, enabled: unknown): void => {
    if (typeof enabled !== 'boolean') return
    handlers.setLaunchAtLogin(enabled)
  }

  const handleSelectProfile = (
    _event: Electron.IpcMainInvokeEvent,
    name: unknown
  ): Promise<void> => {
    if (typeof name !== 'string' || name.trim() === '') return Promise.resolve()
    return handlers.selectProfile(name)
  }

  const handleCreateProfile = (): Promise<void> => handlers.createProfile()

  const handleCheckUpdate = (): void => {
    handlers.checkUpdate()
  }

  ipcMain.handle(DESKTOP_CHANNELS.getSnapshot, handleGetSnapshot)
  ipcMain.handle(DESKTOP_CHANNELS.editHotkey, handleEditHotkey)
  ipcMain.handle(DESKTOP_CHANNELS.setLaunchAtLogin, handleSetLaunchAtLogin)
  ipcMain.handle(DESKTOP_CHANNELS.selectProfile, handleSelectProfile)
  ipcMain.handle(DESKTOP_CHANNELS.createProfile, handleCreateProfile)
  ipcMain.on(DESKTOP_CHANNELS.checkUpdate, handleCheckUpdate)

  const broadcast = (): void => {
    if (window.isDestroyed() || webContents.isDestroyed()) return
    webContents.send(DESKTOP_CHANNELS.changed, handlers.getSnapshot())
  }

  return {
    broadcast,
    dispose: (): void => {
      ipcMain.removeHandler(DESKTOP_CHANNELS.getSnapshot)
      ipcMain.removeHandler(DESKTOP_CHANNELS.editHotkey)
      ipcMain.removeHandler(DESKTOP_CHANNELS.setLaunchAtLogin)
      ipcMain.removeHandler(DESKTOP_CHANNELS.selectProfile)
      ipcMain.removeHandler(DESKTOP_CHANNELS.createProfile)
      ipcMain.removeListener(DESKTOP_CHANNELS.checkUpdate, handleCheckUpdate)
    }
  }
}
