/**
 * macOS application menu.
 *
 * Windows/Linux hide the native frame (`frame: false`) and use the injected
 * window-controls plugin plus a per-window context menu, so no application
 * menu is installed there. On macOS the traffic lights and the global menu
 * bar are part of the platform convention: without a menu, keyboard
 * shortcuts like Cmd+Q, Cmd+C/V/X/A and Cmd+W do not work and the app shows
 * only the default Electron menu. This module installs a proper app menu
 * (roles only — labels come from the OS locale).
 *
 * @module dsh-desktop/menu
 */

import { Menu, app } from 'electron'
import { PRODUCT_NAME } from './app-name'

/**
 * Install the macOS application menu. No-op on other platforms.
 * Must be called after `app.whenReady`.
 */
export function installAppMenu(): void {
  if (process.platform !== 'darwin') return

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      // First menu is the app menu (labeled with the app name by macOS).
      label: PRODUCT_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  // Keep the app name in the about panel correct.
  app.setAboutPanelOptions({
    applicationName: PRODUCT_NAME,
    applicationVersion: app.getVersion()
  })
}
