/**
 * Launch-at-login (auto-start) and hidden (quiet) startup.
 *
 * The tray exposes a "开机自启" checkbox; toggling it registers the app with
 * the OS (Windows registry / macOS login items via
 * `app.setLoginItemSettings`) and persists the intent in settings.json.
 *
 * Quiet-boot detection is platform-specific:
 * - Windows: the login item is registered with `--hidden`, which shows up in
 *   `process.argv`.
 * - macOS: `args` is not supported on login items; `wasOpenedAtLogin` is the
 *   signal that this process was started by the login item.
 * Manual launches never look like a login launch, so the window still shows.
 *
 * @module dsh-desktop/launch-at-login
 */

import { app } from 'electron'
import { readAppSettings, updateAppSettings } from './settings'

/** Argument appended to the Windows login item so the app knows it was auto-started. */
export const HIDDEN_START_ARG = '--hidden'

/**
 * Whether this process should boot straight to the tray.
 * Must be called after `app.whenReady` (macOS reads login-item state).
 */
export function shouldStartHidden(): boolean {
  if (process.argv.includes(HIDDEN_START_ARG)) return true
  if (process.platform === 'darwin') {
    try {
      return app.getLoginItemSettings().wasOpenedAtLogin === true
    } catch {
      return false
    }
  }
  return false
}

/**
 * Options that must match {@link setLaunchAtLogin} on Windows. Electron
 * compares `path` + `args` when reading `openAtLogin`; querying without
 * `--hidden` reports the app as not registered.
 */
function windowsLoginItemQuery(): { args: string[] } {
  return { args: [HIDDEN_START_ARG] }
}

/**
 * Whether launch-at-login is enabled. The persisted intent is the source of
 * truth; on Windows/macOS the OS-reported state is a cross-check so a manual
 * system change (Task Manager / Login Items) is reflected. Linux has no
 * reliable `setLoginItemSettings`, so the checkbox follows the intent only.
 */
export function isLaunchAtLoginEnabled(): boolean {
  const intent = readAppSettings().launchAtLogin === true
  if (!intent) return false
  if (process.platform === 'linux') return true
  try {
    if (process.platform === 'win32') {
      const settings = app.getLoginItemSettings(windowsLoginItemQuery())
      // `executableWillLaunchAtLogin` is false when the user disabled the
      // entry in Task Manager even if the Run key still exists.
      return settings.executableWillLaunchAtLogin
    }
    return app.getLoginItemSettings().openAtLogin
  } catch {
    return true // OS probe failed; trust the persisted intent.
  }
}

/**
 * Enable or disable launch-at-login. Persists the intent and registers the
 * login item. Windows gets `--hidden` so the auto-started session boots
 * straight to the tray; macOS uses `wasOpenedAtLogin` instead.
 */
export function setLaunchAtLogin(enabled: boolean): void {
  updateAppSettings({ launchAtLogin: enabled })
  if (process.platform === 'linux') return
  try {
    if (process.platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        enabled,
        args: enabled ? [HIDDEN_START_ARG] : []
      })
    } else {
      app.setLoginItemSettings({ openAtLogin: enabled })
    }
  } catch (error) {
    // Registration failed (e.g. macOS permission denied): roll back the flag
    // so the tray checkbox does not lie about the OS state.
    console.error(`[dsh-desktop] failed to set launch-at-login=${enabled}:`, error)
    updateAppSettings({ launchAtLogin: !enabled })
  }
}

/**
 * Toggle helper for the tray checkbox: returns the new state (true = on).
 */
export function toggleLaunchAtLogin(): boolean {
  const next = !isLaunchAtLoginEnabled()
  setLaunchAtLogin(next)
  return next
}
