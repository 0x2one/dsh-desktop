/**
 * Desktop notifications for tray-related behaviors.
 *
 * Frameless apps that close to the tray are a classic confusion point: the
 * window disappears but the app keeps running, and nothing tells the user.
 * This module shows a one-time system notification the first time the window
 * is closed-to-tray, explaining how to bring it back and how to actually
 * quit. The "shown once" flag lives in settings.json so the hint never
 * nags again.
 *
 * @module dsh-desktop/app-notify
 */

import { Notification } from 'electron'
import { readAppSettings, updateAppSettings } from './settings'

/**
 * Whether the one-time close-to-tray hint has already been shown.
 */
export function hasShownCloseToTrayHint(): boolean {
  return readAppSettings().closeToTrayHintShown === true
}

/**
 * Show the close-to-tray hint once (system notification). No-op when the
 * platform has no notification support, or when the hint was already shown.
 * @param onClick - invoked when the user clicks the notification (restore the
 * window); may be null to just show the toast.
 */
export function showCloseToTrayHint(onClick?: () => void): void {
  if (hasShownCloseToTrayHint()) return
  if (!Notification.isSupported()) {
    // Mark it shown anyway: without notification support there is no point
    // retrying on every launch.
    updateAppSettings({ closeToTrayHintShown: true })
    return
  }

  const notification = new Notification({
    title: 'DeepSeek Harness Desktop',
    body: '应用仍在后台运行，点击托盘图标可恢复窗口。如需退出，请使用托盘菜单中的「退出」。'
  })
  if (onClick !== undefined) notification.on('click', onClick)
  notification.show()
  updateAppSettings({ closeToTrayHintShown: true })
}
