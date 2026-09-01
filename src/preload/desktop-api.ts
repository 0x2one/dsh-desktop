/**
 * Shared desktop-settings IPC contract (preload + main + settings plugin).
 *
 * The harness "Desktop" settings section drives the same actions as the tray
 * (hotkey, launch-at-login, profiles, check-for-updates) through this bridge.
 * Hotkey capture and new-profile creation are inlined in the plugin UI; this
 * module carries the data those forms send, not a request to open a dialog.
 *
 * @module dsh-desktop/desktop-api
 */

export const DESKTOP_CHANNELS = {
  getSnapshot: 'dsh-desktop:desktop:get-snapshot',
  beginHotkeyCapture: 'dsh-desktop:desktop:begin-hotkey-capture',
  previewHotkey: 'dsh-desktop:desktop:preview-hotkey',
  commitHotkey: 'dsh-desktop:desktop:commit-hotkey',
  cancelHotkeyCapture: 'dsh-desktop:desktop:cancel-hotkey-capture',
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
  /** Packaged app version (`app.getVersion()`), shown next to check-for-updates. */
  appVersion: string
}

/** KeyboardEvent fields the hotkey preview needs (mirrors `KeyEventParts`). */
export interface HotkeyKeyEvent {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  code: string
  key: string
}

/** Snapshot handed to the inline recorder when capture starts. */
export interface HotkeyCaptureState {
  /** Canonical current accelerator. */
  accelerator: string
  /** Current combo, already formatted for display. */
  label: string
  /** Canonical default accelerator (`Control+Alt+Space`). */
  defaultAccelerator: string
  /** Default combo formatted for display. */
  defaultLabel: string
}

/** A key chord that parsed into a valid accelerator. */
export interface HotkeyPreview {
  /** Canonical Electron accelerator string. */
  accelerator: string
  /** User-facing label. */
  label: string
}

/** Result of committing a captured shortcut. */
export type SetHotkeyResult = { ok: true } | { ok: false; error: string }

/** Result of creating a harness profile from a name the settings page collected. */
export type CreateProfileResult = { ok: true; warning?: string } | { ok: false; error: string }

/** Renderer-facing API exposed as `window.api.desktop`. */
export interface DesktopApi {
  getSnapshot: () => Promise<DesktopSnapshot>
  beginHotkeyCapture: () => Promise<HotkeyCaptureState>
  previewHotkey: (parts: HotkeyKeyEvent) => Promise<HotkeyPreview | null>
  commitHotkey: (accelerator: string) => Promise<SetHotkeyResult>
  cancelHotkeyCapture: () => Promise<void>
  setLaunchAtLogin: (enabled: boolean) => Promise<void>
  selectProfile: (name: string) => Promise<void>
  createProfile: (name: string) => Promise<CreateProfileResult>
  checkUpdate: () => void
  onChange: (callback: (snapshot: DesktopSnapshot) => void) => () => void
}
