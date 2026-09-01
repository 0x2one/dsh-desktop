/**
 * Shared desktop-settings IPC contract (preload + main + settings plugin).
 *
 * The harness "Desktop" settings section drives the same actions as the tray
 * (hotkey, launch-at-login, profiles, check-for-updates) through this bridge.
 *
 * @module dsh-desktop/desktop-api
 */

export const DESKTOP_CHANNELS = {
  getSnapshot: 'dsh-desktop:desktop:get-snapshot',
  editHotkey: 'dsh-desktop:desktop:edit-hotkey',
  setLaunchAtLogin: 'dsh-desktop:desktop:set-launch-at-login',
  selectProfile: 'dsh-desktop:desktop:select-profile',
  createProfile: 'dsh-desktop:desktop:create-profile',
  checkUpdate: 'dsh-desktop:desktop:check-update',
  changed: 'dsh-desktop:desktop:changed'
} as const

/** Live desktop-shell state the settings page and tray both reflect. */
export interface DesktopSnapshot {
  /** Current show/hide shortcut, already formatted for display. */
  hotkeyLabel: string
  /** Whether launch-at-login is on. */
  launchAtLogin: boolean
  /** Profile names under `~/.dsh/profiles/` (`dsh-desktop` first). */
  profiles: string[]
  /** Harness profile currently running. */
  currentProfile: string
}

/** Renderer-facing API exposed as `window.api.desktop`. */
export interface DesktopApi {
  getSnapshot: () => Promise<DesktopSnapshot>
  editHotkey: () => Promise<boolean>
  setLaunchAtLogin: (enabled: boolean) => Promise<void>
  selectProfile: (name: string) => Promise<void>
  createProfile: () => Promise<void>
  checkUpdate: () => void
  onChange: (callback: (snapshot: DesktopSnapshot) => void) => () => void
}
