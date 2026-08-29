/**
 * Modal dialog that asks for a new harness profile name.
 *
 * @module dsh-desktop/profile-prompt
 */

import { BrowserWindow, ipcMain } from 'electron'
import createProfileHtml from '../../resources/create-profile.html?asset'
import icon from '../../resources/icon.png?asset'

const CHANNEL = 'dsh-desktop:profile-prompt'

/**
 * Open a small modal asking for a profile name.
 * @returns the raw input string, or null if cancelled.
 */
export function promptProfileName(parent: BrowserWindow | null): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: string | null): void => {
      if (settled) return
      settled = true
      ipcMain.removeListener(CHANNEL, onResult)
      if (!win.isDestroyed()) win.close()
      resolve(value)
    }

    const win = new BrowserWindow({
      width: 420,
      height: 220,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      title: '新增环境',
      icon,
      parent: parent === null || parent.isDestroyed() ? undefined : parent,
      modal: parent !== null && !parent.isDestroyed(),
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    })

    const onResult = (_event: Electron.IpcMainEvent, value: unknown): void => {
      if (value === null || value === undefined) {
        finish(null)
        return
      }
      if (typeof value === 'string') finish(value)
    }

    ipcMain.on(CHANNEL, onResult)
    win.on('closed', () => {
      finish(null)
    })
    win.once('ready-to-show', () => {
      win.show()
    })
    void win.loadFile(createProfileHtml)
  })
}
