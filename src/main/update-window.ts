/**
 * Singleton frameless window that hosts the update UI.
 *
 * The main window loads dsh web, so the prompt cannot live in that renderer.
 * This window is parented when the main window is visible; from the tray it
 * stands alone.
 *
 * @module dsh-desktop/update-window
 */

import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { UPDATE_CHANNELS, type UpdateState } from '../preload/update-api'

export interface UpdateWindowHandlers {
  download: () => void
  installNow: () => void
  installLater: () => void
}

let win: BrowserWindow | null = null
let pendingState: UpdateState | null = null
let handlers: UpdateWindowHandlers | null = null
let ipcBound = false

function bindIpc(): void {
  if (ipcBound) return
  ipcBound = true
  ipcMain.handle(UPDATE_CHANNELS.getState, () => pendingState)
  ipcMain.on(UPDATE_CHANNELS.download, () => handlers?.download())
  ipcMain.on(UPDATE_CHANNELS.installNow, () => handlers?.installNow())
  ipcMain.on(UPDATE_CHANNELS.installLater, () => handlers?.installLater())
  ipcMain.on(UPDATE_CHANNELS.dismiss, () => {
    closeUpdateWindow()
  })
}

function loadUpdatePage(window: BrowserWindow): void {
  const url = process.env['ELECTRON_RENDERER_URL']
  if (url !== undefined) void window.loadURL(`${url}/update.html`)
  else void window.loadFile(join(__dirname, '../renderer/update.html'))
}

function pushToWindow(): void {
  if (pendingState === null || win === null || win.isDestroyed()) return
  win.webContents.send(UPDATE_CHANNELS.state, pendingState)
}

/**
 * Register callbacks for buttons in the update window.
 */
export function setUpdateWindowHandlers(next: UpdateWindowHandlers): void {
  handlers = next
  bindIpc()
}

/** Push UI state; creates nothing. Call {@link showUpdateWindow} to present. */
export function pushUpdateState(state: UpdateState): void {
  pendingState = state
  pushToWindow()
}

export function closeUpdateWindow(): void {
  if (win === null || win.isDestroyed()) return
  win.close()
}

/**
 * Show or focus the update window. Parent it to the main window when that
 * window is on screen so the prompt stays nearby; otherwise open independently.
 */
export function showUpdateWindow(getParent: () => BrowserWindow | null): void {
  bindIpc()
  if (win !== null && !win.isDestroyed()) {
    win.show()
    win.focus()
    pushToWindow()
    return
  }

  const parent = getParent()
  const parentOk = parent !== null && !parent.isDestroyed() && parent.isVisible()

  win = new BrowserWindow({
    width: 480,
    height: 600,
    minWidth: 400,
    minHeight: 480,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    autoHideMenuBar: true,
    title: '更新',
    icon,
    parent: parentOk ? parent : undefined,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('closed', () => {
    win = null
  })
  win.once('ready-to-show', () => {
    if (win === null || win.isDestroyed()) return
    win.show()
    win.focus()
    pushToWindow()
  })
  loadUpdatePage(win)
}
