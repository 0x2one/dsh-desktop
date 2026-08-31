/**
 * Shared app settings persisted in the Electron userData folder.
 *
 * Desktop-shell preferences (window state, close-to-tray hint, launch at
 * login) plus the existing global-hotkey accelerator all live in one
 * `settings.json` so the tray, the window-state module and the hotkey module
 * cooperate without clobbering each other. Every writer uses a merge-write
 * (`updateAppSettings`) that preserves unknown keys, so a future feature can
 * add its own key without migrating the file.
 *
 * The pure helpers (`isUsableWindowBounds`, `resolveWindowState`) have no
 * Electron value imports and are covered by `scripts/verify-settings.mjs`;
 * the path resolution falls back to `app.getPath('userData')` unless a test
 * injects a scratch directory via {@link setSettingsUserDataPath}.
 *
 * @module dsh-desktop/settings
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, type Display } from 'electron'

/** Saved geometry of the main window (see window-state.ts). */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Persisted window state: normal bounds plus the maximize flag. */
export interface WindowStateSettings {
  bounds: WindowBounds
  isMaximized: boolean
}

/** Default window size when no (valid) saved state exists. */
export const DEFAULT_WINDOW_WIDTH = 1280
export const DEFAULT_WINDOW_HEIGHT = 800

/** Minimum window size (must match the BrowserWindow minWidth/minHeight). */
export const MIN_WINDOW_WIDTH = 900
export const MIN_WINDOW_HEIGHT = 600

/** All keys the desktop shell persists in settings.json. */
export interface AppSettings {
  /** Global show/hide accelerator, owned by global-hotkey.ts. */
  toggleWindowShortcut?: string
  /** Window geometry, owned by window-state.ts. */
  windowState?: WindowStateSettings
  /** Set once the close-to-tray hint has been shown (app-notify / index.ts). */
  closeToTrayHintShown?: boolean
  /** Intent flag for launch at login, owned by launch-at-login.ts. */
  launchAtLogin?: boolean
}

/** Scratch directory injected by verification scripts; null = use Electron. */
let userDataPathOverride: string | null = null

/**
 * Point the settings store at a scratch directory (verification scripts).
 * Must be called before any read/write.
 */
export function setSettingsUserDataPath(path: string): void {
  userDataPathOverride = path
}

/** Absolute settings.json path under the Electron userData folder. */
export function settingsPath(): string {
  const base = userDataPathOverride ?? app.getPath('userData')
  return join(base, 'settings.json')
}

/**
 * Read the current settings. Missing or malformed files yield an empty
 * object; unknown keys are preserved verbatim.
 */
export function readAppSettings(): AppSettings {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), 'utf8')) as AppSettings
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    // Missing or malformed file — fall through to an empty settings object.
  }
  return {}
}

/**
 * Merge-write settings: read the current file, apply the patch, write back.
 * Unknown keys survive, so each feature only owns its own keys.
 */
export function updateAppSettings(patch: Partial<AppSettings>): void {
  const path = settingsPath()
  const merged = { ...readAppSettings(), ...patch }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(merged, undefined, 2)}\n`)
}

/**
 * Whether saved bounds still make sense on the current display topology.
 * The bounds must intersect at least one display work area (they may be
 * negative for a window on a left/top monitor) and be at least the minimum
 * size. With no display info the saved value is trusted.
 * @returns true when the bounds are usable.
 */
export function isUsableWindowBounds(
  bounds: WindowBounds | undefined | null,
  displays: readonly Display[]
): bounds is WindowBounds {
  if (bounds == null || typeof bounds !== 'object') return false
  const { x, y, width, height } = bounds
  if (![x, y, width, height].every((value) => Number.isFinite(value))) return false
  if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) return false
  if (displays.length === 0) return true
  return displays.some((display) => {
    const area = display.workArea
    return (
      x < area.x + area.width &&
      x + width > area.x &&
      y < area.y + area.height &&
      y + height > area.y
    )
  })
}

/**
 * Resolve the persisted window state against the current display topology.
 * @returns the saved state when present and usable, else null (caller falls
 * back to the default window size, centered).
 */
export function resolveWindowState(
  state: AppSettings,
  displays: readonly Display[]
): WindowStateSettings | null {
  const windowState = state.windowState
  if (windowState == null || typeof windowState !== 'object') return null
  if (!isUsableWindowBounds(windowState.bounds, displays)) return null
  return windowState
}
