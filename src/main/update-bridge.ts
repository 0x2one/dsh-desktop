/**
 * Broadcast update state to the main window and bind updater IPC.
 *
 * The Desktop settings page renders phases inline via `window.api.updater`.
 *
 * @module dsh-desktop/update-bridge
 */

import { BrowserWindow, ipcMain } from 'electron'
import { UPDATE_CHANNELS, type UpdateState } from '../preload/update-api'

export interface UpdateBridgeHandlers {
  download: () => void
  installNow: () => void
  installLater: () => void
}

let pendingState: UpdateState | null = null
let handlers: UpdateBridgeHandlers | null = null
let ipcBound = false

function bindIpc(): void {
  if (ipcBound) return
  ipcBound = true
  ipcMain.handle(UPDATE_CHANNELS.getState, () => pendingState)
  ipcMain.on(UPDATE_CHANNELS.download, () => handlers?.download())
  ipcMain.on(UPDATE_CHANNELS.installNow, () => handlers?.installNow())
  ipcMain.on(UPDATE_CHANNELS.installLater, () => handlers?.installLater())
  ipcMain.on(UPDATE_CHANNELS.dismiss, () => {})
}

function broadcastToAppWindows(): void {
  if (pendingState === null) return
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue
    w.webContents.send(UPDATE_CHANNELS.state, pendingState)
  }
}

/**
 * Register callbacks for download / install buttons in the settings page.
 */
export function setUpdateBridgeHandlers(next: UpdateBridgeHandlers): void {
  handlers = next
  bindIpc()
}

/** Push UI state to every renderer (settings page listens on this channel). */
export function pushUpdateState(state: UpdateState): void {
  pendingState = state
  broadcastToAppWindows()
}
