/**
 * Window control surface for the custom title bar.
 *
 * The native window frame is hidden (frame: false), so the dsh web UI's
 * window-controls cordis plugin drives minimize / maximize-toggle / close
 * through IPC. This module owns those handlers plus the maximize-state
 * broadcast to the renderer, and the right-click (context) menu for the
 * window's web contents.
 *
 * @module dsh-desktop/window-controls
 */

import { BrowserWindow, ipcMain, Menu, clipboard, shell } from 'electron'

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

  const disposeContextMenu = registerContextMenu(window)

  return () => {
    ipcMain.removeListener(IPC.minimize, handleMinimize)
    ipcMain.removeHandler(IPC.toggleMaximize)
    ipcMain.removeHandler(IPC.isMaximized)
    ipcMain.removeListener(IPC.close, handleClose)
    window.removeListener('maximize', onMaximize)
    window.removeListener('unmaximize', onUnmaximize)
    disposeContextMenu()
  }
}

/**
 * Enable the native right-click context menu for the window's web contents.
 *
 * Electron does not show a context menu unless the app builds one. This
 * installs a menu appropriate to the click target: text editing actions
 * (undo / redo / cut / copy / paste / select-all) when the right-click landed
 * on editable content, copy when text is selected, and navigation actions
 * (back / forward / reload) based on the history. The menu appears for both
 * the embedded dsh web UI and the local fallback page.
 * @param window - the window whose web contents get the menu.
 * @returns a disposer removing the listener.
 */
function registerContextMenu(window: BrowserWindow): () => void {
  const onContextMenu = (
    _event: Electron.Event,
    params: Electron.ContextMenuParams,
  ): void => {
    if (window.isDestroyed()) return

    const { editFlags, selectionText, isEditable, linkURL } = params
    const isEditableTarget = isEditable || editFlags.canEditRichly
    const template: Electron.MenuItemConstructorOptions[] = []

    // Editing block (only meaningful for editable targets / selections).
    if (isEditableTarget) {
      template.push(
        { label: '撤销', role: 'undo', enabled: editFlags.canUndo },
        { label: '重做', role: 'redo', enabled: editFlags.canRedo },
        { type: 'separator' },
        { label: '剪切', role: 'cut', enabled: editFlags.canCut },
        { label: '复制', role: 'copy', enabled: editFlags.canCopy },
        { label: '粘贴', role: 'paste', enabled: editFlags.canPaste },
        { label: '全选', role: 'selectAll', enabled: editFlags.canSelectAll },
      )
    } else if (selectionText !== '') {
      // Non-editable selection: copy / select-all only.
      template.push(
        { label: '复制', role: 'copy', enabled: editFlags.canCopy },
        { label: '全选', role: 'selectAll', enabled: editFlags.canSelectAll },
      )
    } else if (linkURL !== '') {
      // Right-click on a link: open externally + copy the address.
      template.push(
        {
          label: '在浏览器中打开链接',
          click: () => { void shell.openExternal(linkURL) },
        },
        {
          label: '复制链接地址',
          click: () => clipboard.writeText(linkURL),
        },
      )
    }

    if (template.length > 0) template.push({ type: 'separator' })

    // Navigation / view block (always present).
    const webContents = window.webContents
    template.push(
      {
        label: '后退',
        enabled: webContents.navigationHistory.canGoBack(),
        click: () => { webContents.navigationHistory.goBack() },
      },
      {
        label: '前进',
        enabled: webContents.navigationHistory.canGoForward(),
        click: () => { webContents.navigationHistory.goForward() },
      },
      { type: 'separator' },
      { label: '重新加载', role: 'reload' },
      { type: 'separator' },
      { label: '检查元素', click: () => { webContents.openDevTools({ mode: 'detach' }) } },
    )

    Menu.buildFromTemplate(template).popup({ window })

    // Development aid: DSH_DESKTOP_DEBUG_MENU=1 logs each popup to stdout so
    // the menu can be verified from the terminal without a display probe.
    if (process.env.DSH_DESKTOP_DEBUG_MENU === '1') {
      console.log(`[dsh-desktop] context menu: ${template.length} items (editable=${isEditableTarget}, selection=${selectionText.length > 0}, link=${linkURL !== ''})`)
    }
  }

  window.webContents.on('context-menu', onContextMenu)
  return () => {
    window.webContents.removeListener('context-menu', onContextMenu)
  }
}
