/**
 * System tray for close-to-tray behavior.
 *
 * The tray keeps the app alive after the main window is hidden. Showing the
 * window and actually quitting are the only actions the tray exposes; the
 * close-vs-hide policy lives on the BrowserWindow `close` handler.
 *
 * @module dsh-desktop/tray
 */

import { Menu, Tray, type NativeImage } from 'electron'

/** Callbacks the tray menu and click handler invoke. */
export interface AppTrayOptions {
  /** Tray icon. Path string (electron-vite `?asset`) or NativeImage. */
  icon: string | NativeImage
  /** Restore and focus the main window. */
  onShow: () => void
  /** Quit the application (tray "退出"). */
  onQuit: () => void
}

/**
 * Create the application tray icon.
 * Must be called after `app.whenReady`.
 * @returns a disposer that destroys the tray.
 */
export function createAppTray(options: AppTrayOptions): () => void {
  const tray = new Tray(options.icon)
  tray.setToolTip('dsh-desktop')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示窗口', click: options.onShow },
      { type: 'separator' },
      { label: '退出', click: options.onQuit }
    ])
  )

  // Windows / Linux: left-click shows the window. Right-click still opens the
  // context menu from setContextMenu. On macOS click is typically consumed by
  // the menu, which is the expected menu-bar extra behavior.
  if (process.platform !== 'darwin') {
    tray.on('click', options.onShow)
  }

  return () => {
    tray.destroy()
  }
}
