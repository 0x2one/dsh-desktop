/**
 * Window control surface for the custom title bar.
 *
 * The native window frame is hidden (frame: false), so the dsh web UI's
 * window-controls cordis plugin drives minimize / maximize-toggle / close
 * through IPC. This module owns those handlers plus the maximize-state
 * broadcast to the renderer.
 *
 * @module dsh-desktop/window-controls
 */

import { BrowserWindow, ipcMain } from 'electron'

/** IPC channel names shared with the preload bridge. */
export const IPC = {
  minimize: 'window:minimize',
  toggleMaximize: 'window:toggle-maximize',
  close: 'window:close',
  isMaximized: 'window:is-maximized',
  maximizedChanged: 'window:maximized-changed',
} as const

/**
 * Register all window-control IPC handlers for one window.
 * @param window - the window whose controls the renderer drives.
 * @returns a disposer removing the handlers and the maximize-state listeners.
 */
export function registerWindowControls(window: BrowserWindow): () => void {
  const handleMinimize = (): void => {
    if (!window.isDestroyed() && window.isMinimizable()) window.minimize()
  }

  const handleToggleMaximize = (event: Electron.IpcMainInvokeEvent): boolean => {
    const target = BrowserWindow.fromWebContents(event.sender) ?? window
    if (target.isDestroyed()) return false
    if (target.isMaximized()) {
      target.unmaximize()
      return false
    }
    target.maximize()
    return true
  }

  const handleIsMaximized = (event: Electron.IpcMainInvokeEvent): boolean => {
    const target = BrowserWindow.fromWebContents(event.sender) ?? window
    return !target.isDestroyed() && target.isMaximized()
  }

  const handleClose = (): void => {
    if (!window.isDestroyed()) window.close()
  }

  ipcMain.on(IPC.minimize, handleMinimize)
  ipcMain.handle(IPC.toggleMaximize, handleToggleMaximize)
  ipcMain.handle(IPC.isMaximized, handleIsMaximized)
  ipcMain.on(IPC.close, handleClose)

  const onMaximize = (): void => {
    if (!window.isDestroyed()) window.webContents.send(IPC.maximizedChanged, true)
  }
  const onUnmaximize = (): void => {
    if (!window.isDestroyed()) window.webContents.send(IPC.maximizedChanged, false)
  }

  window.on('maximize', onMaximize)
  window.on('unmaximize', onUnmaximize)

  return () => {
    ipcMain.removeListener(IPC.minimize, handleMinimize)
    ipcMain.removeHandler(IPC.toggleMaximize)
    ipcMain.removeHandler(IPC.isMaximized)
    ipcMain.removeListener(IPC.close, handleClose)
    window.removeListener('maximize', onMaximize)
    window.removeListener('unmaximize', onUnmaximize)
  }
}
