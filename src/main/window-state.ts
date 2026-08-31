/**
 * Remember the main window's size, position and maximize state across runs.
 *
 * The window is created with `frame: false` and a fixed default size, so
 * every launch reset the layout. This module restores the last saved bounds
 * (validated against the current display topology — a monitor that was
 * unplugged must not strand the window off-screen) and the maximize flag,
 * and persists changes on resize / move / maximize / close.
 *
 * Geometry is stored under `settings.json` (see settings.ts) as
 * `windowState.bounds` (normal bounds) + `windowState.isMaximized`. Normal
 * bounds come from `getNormalBounds()` so maximizing never saves the
 * fullscreen-ish maximized rectangle.
 *
 * `win.maximize()` also shows a hidden window, so restore never calls it.
 * The caller applies the flag via {@link applyDeferredMaximize} at the same
 * moment it first shows the window (`ready-to-show` or tray restore).
 *
 * @module dsh-desktop/window-state
 */

import { screen, type BrowserWindow, type Rectangle } from 'electron'
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  readAppSettings,
  resolveWindowState,
  updateAppSettings
} from './settings'

/** Throttle for resize/move persistence (ms). */
const SAVE_DEBOUNCE_MS = 500

/** Window whose geometry we persist; null once destroyed. */
let trackedWindow: BrowserWindow | null = null
let debounceTimer: NodeJS.Timeout | undefined
let pendingBounds: Rectangle | undefined
/** Saved maximize was skipped because maximize() would show a hidden window. */
let deferredMaximize = false

/** Bounds to use when there is no (valid) saved state: default size, centered. */
function defaultBounds(): Rectangle {
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(DEFAULT_WINDOW_WIDTH, workArea.width)
  const height = Math.min(DEFAULT_WINDOW_HEIGHT, workArea.height)
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height
  }
}

function scheduleSave(): void {
  if (trackedWindow === null || trackedWindow.isDestroyed()) return
  pendingBounds = trackedWindow.getNormalBounds()
  if (debounceTimer !== undefined) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(flushWindowState, SAVE_DEBOUNCE_MS)
}

/** Persist the latest pending geometry immediately (close, quit, blur). */
export function flushWindowState(): void {
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
  }
  if (trackedWindow === null || trackedWindow.isDestroyed()) return
  const bounds = pendingBounds ?? trackedWindow.getNormalBounds()
  updateAppSettings({
    windowState: {
      bounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      },
      // Restore defers maximize(), so isMaximized() is still false until show.
      isMaximized: deferredMaximize || trackedWindow.isMaximized()
    }
  })
  pendingBounds = undefined
}

/**
 * Apply a maximize that was skipped during restore. No-op when the saved
 * state was not maximized, or after it has already been applied.
 * `maximize()` shows the window; the caller should then `show()`/`focus()`
 * as needed.
 */
export function applyDeferredMaximize(): void {
  if (!deferredMaximize) return
  deferredMaximize = false
  if (trackedWindow === null || trackedWindow.isDestroyed()) return
  if (!trackedWindow.isMaximized()) trackedWindow.maximize()
}

/**
 * Apply the saved window state to a fresh BrowserWindow. Must be called
 * before the window is shown. Restores normal bounds only — maximize is
 * deferred because `maximize()` would show the window. Call
 * {@link applyDeferredMaximize} at first paint. Returns the window so
 * callers can chain.
 */
export function applyWindowState(window: BrowserWindow): BrowserWindow {
  trackedWindow = window
  deferredMaximize = false
  const displays = screen.getAllDisplays()
  const state = resolveWindowState(readAppSettings(), displays)

  if (state !== null) {
    window.setBounds(state.bounds)
    deferredMaximize = state.isMaximized === true
  } else {
    window.setBounds(defaultBounds())
  }

  // Persist on geometry changes (throttled) and on maximize toggles.
  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)
  window.on('close', () => {
    // Save before the window hides to the tray so a tray-quit restores it.
    flushWindowState()
  })
  return window
}

/** Stop tracking the window (used on destroy / app quit) after a final flush. */
export function flushAndStopWindowState(): void {
  flushWindowState()
  trackedWindow = null
  deferredMaximize = false
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
  }
  pendingBounds = undefined
}
