/**
 * System tray for close-to-tray behavior and profile switching.
 *
 * The tray keeps the app alive after the main window is hidden. Close-vs-hide
 * lives on the BrowserWindow `close` handler; this module owns the icon, the
 * context menu (show / hotkey / profile list / 检查更新 / quit), and a refresh
 * hook so the menu can rescan `~/.dsh/profiles/` on each right-click.
 *
 * @module dsh-desktop/tray
 */

import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import { PRODUCT_NAME } from './app-name'
import { listProfiles } from './profile-pref'

/** Callbacks and initial state the tray menu uses. */
export interface AppTrayOptions {
  /** Tray icon. Path string (electron-vite `?asset`) or NativeImage. */
  icon: string | NativeImage
  /** Restore and focus the main window. */
  onShow: () => void
  /** Current show/hide shortcut, already formatted for the menu label. */
  getHotkeyLabel: () => string
  /** User chose 快捷键… to record a new global shortcut. */
  onEditHotkey: () => void
  /** Quit the application (tray "退出"). */
  onQuit: () => void
  /** Harness profile currently running (or about to run). */
  currentProfile: string
  /** User picked a different profile in the 启动环境 submenu. */
  onSelectProfile: (name: string) => void
  /** User chose 新增环境. */
  onCreateProfile: () => void
  /** Current launch-at-login state (re-read per menu build). */
  launchAtLogin: () => boolean
  /** User picked 开启 or 关闭 in the 开机自启 submenu. */
  onToggleLaunchAtLogin: (enabled: boolean) => void
  /** User chose 检查更新. */
  onCheckUpdate: () => void
}

/** Live tray handle: refresh the menu after a profile switch, destroy on quit. */
export interface AppTray {
  /** Rebuild the menu; pass a name to update the checked radio item. */
  refresh: (currentProfile?: string) => void
  /** Destroy the tray icon. */
  destroy: () => void
}

/**
 * Create the application tray icon.
 * Must be called after `app.whenReady`.
 */
export function createAppTray(options: AppTrayOptions): AppTray {
  // On macOS the menu-bar item must be a template image (monochrome, drawn
  // with the current menu-bar appearance) or it looks wrong in both light
  // and dark mode. The app icon's alpha shape works as a template.
  let icon: string | NativeImage = options.icon
  if (process.platform === 'darwin' && typeof options.icon === 'string') {
    const image = nativeImage.createFromPath(options.icon)
    image.setTemplateImage(true)
    icon = image
  }
  const tray = new Tray(icon)
  let current = options.currentProfile

  const applyMenu = (): void => {
    const profiles = listProfiles()
    tray.setToolTip(PRODUCT_NAME)
    const profileItems: Electron.MenuItemConstructorOptions[] = [
      ...profiles.map((name) => ({
        label: name,
        type: 'radio' as const,
        checked: name === current,
        click: (): void => {
          if (name === current) return
          options.onSelectProfile(name)
        }
      })),
      { type: 'separator' },
      { label: '新增环境…', click: (): void => options.onCreateProfile() }
    ]
    const launchAtLogin = options.launchAtLogin()
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示窗口', click: options.onShow },
        { label: `快捷键：${options.getHotkeyLabel()}`, click: options.onEditHotkey },
        { type: 'separator' },
        {
          label: '开机自启',
          submenu: [
            {
              label: '开启',
              type: 'radio',
              checked: launchAtLogin,
              click: (): void => {
                if (launchAtLogin) return
                options.onToggleLaunchAtLogin(true)
              }
            },
            {
              label: '关闭',
              type: 'radio',
              checked: !launchAtLogin,
              click: (): void => {
                if (!launchAtLogin) return
                options.onToggleLaunchAtLogin(false)
              }
            }
          ]
        },
        { type: 'separator' },
        { label: '启动环境', submenu: profileItems },
        { type: 'separator' },
        { label: '检查更新…', click: options.onCheckUpdate },
        { type: 'separator' },
        { label: '退出', click: options.onQuit }
      ])
    )
  }

  applyMenu()

  // Windows / Linux: left-click shows the window. Right-click rebuilds the
  // profile list (so a newly created profile appears) then uses the updated
  // context menu. On macOS click is typically consumed by the menu.
  if (process.platform !== 'darwin') {
    tray.on('click', options.onShow)
    tray.on('right-click', () => {
      applyMenu()
    })
  }

  return {
    refresh: (currentProfile?: string): void => {
      if (currentProfile !== undefined) current = currentProfile
      applyMenu()
    },
    destroy: (): void => {
      tray.destroy()
    }
  }
}
