/**
 * IPC surface for the dsh-desktop settings cordis plugin.
 *
 * The plugin's browser half lives in the harness web UI and drives the same
 * tray actions (hotkey, launch-at-login, profiles, check-for-updates) through
 * this module. Hotkey capture and profile creation collect UI in the plugin;
 * callbacks here apply those values in the app shell.
 *
 * @module dsh-desktop/desktop-settings
 */

import { BrowserWindow, ipcMain } from 'electron'
import {
  DESKTOP_CHANNELS,
  type BeginHotkeyCaptureResult,
  type CreateProfileResult,
  type DesktopSnapshot,
  type HotkeyKeyEvent,
  type HotkeyPreview,
  type SetHotkeyResult
} from '../preload/desktop-api'

/** Callbacks the settings page uses; the shell already owns these for the tray. */
export interface DesktopSettingsHandlers {
  /** Current snapshot (re-read on every get / broadcast). */
  getSnapshot: () => DesktopSnapshot
  /** Pause the global shortcut and return the current / default labels. */
  beginHotkeyCapture: () => BeginHotkeyCaptureResult
  /** Parse a key event into an accelerator, or null while still incomplete. */
  previewHotkey: (parts: HotkeyKeyEvent) => HotkeyPreview | null
  /** Register a captured accelerator. */
  commitHotkey: (accelerator: string) => SetHotkeyResult
  /** Resume the previous global shortcut without changing it. */
  cancelHotkeyCapture: () => void
  /** Enable or disable launch-at-login. */
  setLaunchAtLogin: (enabled: boolean) => void
  /** Switch the running harness profile. */
  selectProfile: (name: string) => Promise<void>
  /** Create a profile from a name the settings page collected. */
  createProfile: (name: string) => Promise<CreateProfileResult>
  /** Check for updates without opening the tray's dedicated window. */
  checkUpdate: () => void
}

/** Live handle: push a fresh snapshot to the renderer, dispose on window close. */
export interface DesktopSettingsIpc {
  /** Send the current snapshot to the window (tray and settings stay in sync). */
  broadcast: () => void
  /** Remove IPC handlers. */
  dispose: () => void
}

function isHotkeyKeyEvent(value: unknown): value is HotkeyKeyEvent {
  if (value === null || typeof value !== 'object') return false
  const event = value as Partial<HotkeyKeyEvent>
  return (
    typeof event.ctrlKey === 'boolean' &&
    typeof event.altKey === 'boolean' &&
    typeof event.shiftKey === 'boolean' &&
    typeof event.metaKey === 'boolean' &&
    typeof event.code === 'string' &&
    typeof event.key === 'string'
  )
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

  const handleBeginHotkeyCapture = (): BeginHotkeyCaptureResult => handlers.beginHotkeyCapture()

  const handlePreviewHotkey = (
    _event: Electron.IpcMainInvokeEvent,
    parts: unknown
  ): HotkeyPreview | null => {
    if (!isHotkeyKeyEvent(parts)) return null
    return handlers.previewHotkey(parts)
  }

  const handleCommitHotkey = (
    _event: Electron.IpcMainInvokeEvent,
    accelerator: unknown
  ): SetHotkeyResult => {
    if (typeof accelerator !== 'string' || accelerator.trim() === '') {
      return { ok: false, error: '请先按下要使用的快捷键。' }
    }
    return handlers.commitHotkey(accelerator)
  }

  const handleCancelHotkeyCapture = (): void => {
    handlers.cancelHotkeyCapture()
  }

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

  const handleCreateProfile = (
    _event: Electron.IpcMainInvokeEvent,
    name: unknown
  ): Promise<CreateProfileResult> => {
    if (typeof name !== 'string') {
      return Promise.resolve({ ok: false, error: '请输入环境名称' })
    }
    return handlers.createProfile(name)
  }

  const handleCheckUpdate = (): void => {
    handlers.checkUpdate()
  }

  ipcMain.handle(DESKTOP_CHANNELS.getSnapshot, handleGetSnapshot)
  ipcMain.handle(DESKTOP_CHANNELS.beginHotkeyCapture, handleBeginHotkeyCapture)
  ipcMain.handle(DESKTOP_CHANNELS.previewHotkey, handlePreviewHotkey)
  ipcMain.handle(DESKTOP_CHANNELS.commitHotkey, handleCommitHotkey)
  ipcMain.handle(DESKTOP_CHANNELS.cancelHotkeyCapture, handleCancelHotkeyCapture)
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
      ipcMain.removeHandler(DESKTOP_CHANNELS.beginHotkeyCapture)
      ipcMain.removeHandler(DESKTOP_CHANNELS.previewHotkey)
      ipcMain.removeHandler(DESKTOP_CHANNELS.commitHotkey)
      ipcMain.removeHandler(DESKTOP_CHANNELS.cancelHotkeyCapture)
      ipcMain.removeHandler(DESKTOP_CHANNELS.setLaunchAtLogin)
      ipcMain.removeHandler(DESKTOP_CHANNELS.selectProfile)
      ipcMain.removeHandler(DESKTOP_CHANNELS.createProfile)
      ipcMain.removeListener(DESKTOP_CHANNELS.checkUpdate, handleCheckUpdate)
    }
  }
}
