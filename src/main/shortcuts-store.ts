/**
 * File-backed store for harness key bindings (`window.dshDesktop.shortcuts`).
 *
 * Mirrors the harness desktop host (`apps/desktop/src/keybindings.ts`): the
 * main process owns the accepted document and its revision/sequence, persists
 * it under the Electron user-data directory, and broadcasts accepted changes
 * to the renderer. The renderer's native keyboard bridge stamps inputs with
 * this revision, so dispatching stays consistent with the accepted snapshot.
 *
 * @module dsh-desktop/shortcuts-store
 */

import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  SHORTCUTS_CHANNELS,
  type ShortcutConfigSnapshot,
  type ShortcutDocument,
  type ShortcutEdit,
  type ShortcutSaveResult
} from '../preload/shortcuts-api'

/** Harness shortcut platform for the current process. */
function shortcutPlatform(): 'macos' | 'windows' | 'linux' {
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'win32') return 'windows'
  return 'linux'
}

/** Handle returned to the window owner. */
export interface ShortcutsStore {
  /** Remove the IPC handlers. */
  dispose(): void
  /** Re-send the accepted snapshot to the renderer. */
  broadcast(): void
}

/**
 * Register the shortcut IPC handlers for a window.
 * @param window - the product window that owns the renderer.
 * @returns the store handle; dispose it when the window closes.
 */
export function registerShortcutsStore(window: BrowserWindow): ShortcutsStore {
  const platform = shortcutPlatform()
  const profile = `desktop:${platform}`
  const schemaVersion: 1 | 2 = platform === 'macos' || platform === 'windows' ? 2 : 1
  const file = join(app.getPath('userData'), 'shortcuts.json')

  let revision = randomUUID()
  let sequence = 0
  let document: ShortcutDocument = { schemaVersion: 1, profiles: {} }
  let status: ShortcutConfigSnapshot['status'] = 'ready'
  let error: ShortcutConfigSnapshot['error'] = null
  let usingDefaults = true

  const load = (): void => {
    let raw: string | null
    try {
      raw = existsSync(file) ? readFileSync(file, 'utf8') : null
    } catch {
      status = 'unreadable'
      error = 'read'
      return
    }
    if (raw === null) {
      document = { schemaVersion: 1, profiles: {} }
      status = 'ready'
      error = null
      usingDefaults = true
      return
    }
    try {
      const value = JSON.parse(raw) as unknown
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('invalid shortcut document')
      }
      const candidate = value as { schemaVersion?: unknown; profiles?: unknown }
      if (typeof candidate.schemaVersion === 'number' && candidate.schemaVersion > 2) {
        status = 'unreadable'
        error = 'future'
        return
      }
      if (
        (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) ||
        typeof candidate.profiles !== 'object' ||
        candidate.profiles === null ||
        Array.isArray(candidate.profiles)
      ) {
        throw new Error('invalid shortcut document')
      }
      document = {
        schemaVersion: candidate.schemaVersion,
        profiles: candidate.profiles as ShortcutDocument['profiles']
      }
      status = 'ready'
      error = null
      usingDefaults = false
    } catch {
      status = 'unreadable'
      error = 'invalid'
    }
  }

  const snapshot = (): ShortcutConfigSnapshot => ({
    revision,
    sequence,
    document,
    status,
    error,
    usingDefaults
  })

  const applyEdit = (edit: ShortcutEdit): ShortcutDocument => {
    const overrides = { ...(document.profiles[profile] ?? {}) }
    if (edit.type === 'reset-all') {
      return { schemaVersion, profiles: { ...document.profiles, [profile]: {} } }
    }
    if (edit.type === 'reset') delete overrides[edit.id]
    else overrides[edit.id] = edit.binding
    return { schemaVersion, profiles: { ...document.profiles, [profile]: overrides } }
  }

  const persist = (next: ShortcutDocument): void => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(next, undefined, 2)}\n`, 'utf8')
  }

  /** Only the product window's main frame may use the bridge. */
  const assertSender = (event: IpcMainInvokeEvent): boolean => {
    if (window.isDestroyed()) return false
    return event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame
  }

  const handleGet = (event: IpcMainInvokeEvent): ShortcutConfigSnapshot | undefined => {
    if (!assertSender(event)) return undefined
    return snapshot()
  }

  const handleEdit = (
    event: IpcMainInvokeEvent,
    edit: ShortcutEdit,
    expected: unknown
  ): ShortcutSaveResult | undefined => {
    if (!assertSender(event)) return undefined
    if (typeof expected !== 'string' || expected !== revision) {
      return { status: 'stale', snapshot: snapshot() }
    }
    if (status === 'unreadable') return { status: 'unreadable', snapshot: snapshot() }
    const next = applyEdit(edit)
    try {
      persist(next)
    } catch {
      return { status: 'write-failed', snapshot: snapshot() }
    }
    document = next
    status = 'ready'
    error = null
    usingDefaults = false
    sequence += 1
    revision = randomUUID()
    const result = snapshot()
    if (!window.isDestroyed()) window.webContents.send(SHORTCUTS_CHANNELS.changed, result)
    return { status: 'saved', snapshot: result }
  }

  const handleRecording = (event: IpcMainInvokeEvent): void => {
    // The desktop shell owns no native menu accelerators to suppress while the
    // settings recorder is active, so acknowledging the request is sufficient.
    if (!assertSender(event)) return
  }

  const handleCloseWindow = (event: IpcMainInvokeEvent, expected: unknown): void => {
    if (!assertSender(event)) return
    if (typeof expected !== 'string' || expected !== revision) return
    if (!window.isDestroyed()) window.close()
  }

  load()
  ipcMain.removeHandler(SHORTCUTS_CHANNELS.get)
  ipcMain.removeHandler(SHORTCUTS_CHANNELS.edit)
  ipcMain.removeHandler(SHORTCUTS_CHANNELS.recording)
  ipcMain.removeHandler(SHORTCUTS_CHANNELS.closeWindow)
  ipcMain.handle(SHORTCUTS_CHANNELS.get, handleGet)
  ipcMain.handle(SHORTCUTS_CHANNELS.edit, handleEdit)
  ipcMain.handle(SHORTCUTS_CHANNELS.recording, handleRecording)
  ipcMain.handle(SHORTCUTS_CHANNELS.closeWindow, handleCloseWindow)

  return {
    dispose() {
      ipcMain.removeHandler(SHORTCUTS_CHANNELS.get)
      ipcMain.removeHandler(SHORTCUTS_CHANNELS.edit)
      ipcMain.removeHandler(SHORTCUTS_CHANNELS.recording)
      ipcMain.removeHandler(SHORTCUTS_CHANNELS.closeWindow)
    },
    broadcast() {
      if (!window.isDestroyed()) window.webContents.send(SHORTCUTS_CHANNELS.changed, snapshot())
    }
  }
}
