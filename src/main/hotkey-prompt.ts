/**
 * Modal dialog that records a new show/hide global shortcut.
 *
 * @module dsh-desktop/hotkey-prompt
 */

import { BrowserWindow, ipcMain } from 'electron'
import hotkeyHtml from '../../resources/hotkey.html?asset'
import icon from '../../resources/icon.png?asset'
import {
  DEFAULT_TOGGLE_ACCELERATOR,
  acceleratorFromKeyEvent,
  getToggleAccelerator,
  pauseToggleHotkey,
  resumeToggleHotkey,
  setToggleAccelerator,
  toDisplayLabel,
  type KeyEventParts
} from './global-hotkey'

const CHANNEL = {
  init: 'dsh-desktop:hotkey-prompt:init',
  preview: 'dsh-desktop:hotkey-prompt:preview',
  save: 'dsh-desktop:hotkey-prompt:save',
  error: 'dsh-desktop:hotkey-prompt:error',
  cancel: 'dsh-desktop:hotkey-prompt:cancel'
} as const

let open = false

function isKeyEventParts(value: unknown): value is KeyEventParts {
  if (value === null || typeof value !== 'object') return false
  const event = value as Partial<KeyEventParts>
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
 * Open a small window to capture a new toggle shortcut.
 * Pauses the current global hotkey while the dialog is up.
 * @returns true when the registered shortcut changed.
 */
export function promptToggleHotkey(parent: BrowserWindow | null): Promise<boolean> {
  if (open) return Promise.resolve(false)
  open = true
  pauseToggleHotkey()

  return new Promise((resolve) => {
    let settled = false
    let changed = false

    const finish = (): void => {
      if (settled) return
      settled = true
      ipcMain.removeHandler(CHANNEL.preview)
      ipcMain.removeListener(CHANNEL.save, onSave)
      ipcMain.removeListener(CHANNEL.cancel, onCancel)
      if (!win.isDestroyed()) win.close()
      if (!changed) resumeToggleHotkey()
      open = false
      resolve(changed)
    }

    const parentOk = parent !== null && !parent.isDestroyed() && parent.isVisible()
    const win = new BrowserWindow({
      width: 420,
      height: 250,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      title: '快捷键',
      icon,
      parent: parentOk ? parent : undefined,
      modal: parentOk,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    })

    const onSave = (event: Electron.IpcMainEvent, value: unknown): void => {
      if (typeof value !== 'string') return
      const result = setToggleAccelerator(value)
      if (!result.ok) {
        event.sender.send(CHANNEL.error, result.error)
        return
      }
      changed = true
      finish()
    }

    const onCancel = (): void => {
      finish()
    }

    ipcMain.handle(CHANNEL.preview, (_event, parts: unknown) => {
      if (!isKeyEventParts(parts)) return null
      const accelerator = acceleratorFromKeyEvent(parts)
      if (accelerator === null) return null
      return { accelerator, label: toDisplayLabel(accelerator) }
    })
    ipcMain.on(CHANNEL.save, onSave)
    ipcMain.on(CHANNEL.cancel, onCancel)
    win.on('closed', () => {
      finish()
    })
    win.webContents.on('did-finish-load', () => {
      if (win.isDestroyed()) return
      const accelerator = getToggleAccelerator()
      win.webContents.send(CHANNEL.init, {
        accelerator,
        label: toDisplayLabel(accelerator),
        defaultAccelerator: DEFAULT_TOGGLE_ACCELERATOR,
        defaultLabel: toDisplayLabel(DEFAULT_TOGGLE_ACCELERATOR)
      })
    })
    win.once('ready-to-show', () => {
      win.show()
    })
    void win.loadFile(hotkeyHtml)
  })
}
