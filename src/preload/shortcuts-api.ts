/**
 * Shared shortcut-bridge contract (preload + main).
 *
 * The harness desktop stores user key bindings in the main process and stamps
 * native key input with the accepted revision (see the harness
 * `apps/desktop/src/keyboard.ts` / `keybindings.ts`). dsh-desktop mirrors that:
 * `window.dshDesktop.shortcuts` is an IPC facade over a file-backed store, and
 * `keyboard.subscribe` forwards renderer key events stamped with that store's
 * current revision so the harness `shortcuts` service can dispatch them.
 *
 * Kept electron-free so main and preload can both import it at build time.
 *
 * @module dsh-desktop/shortcuts-api
 */

/** IPC channels of the desktop shortcut bridge. */
export const SHORTCUTS_CHANNELS = {
  get: 'dsh-desktop:shortcuts:get',
  edit: 'dsh-desktop:shortcuts:edit',
  recording: 'dsh-desktop:shortcuts:recording',
  closeWindow: 'dsh-desktop:shortcuts:close-window',
  changed: 'dsh-desktop:shortcuts:changed'
} as const

/** Stored shortcut document (overrides are platform-local). */
export interface ShortcutDocument {
  schemaVersion: 1 | 2
  profiles: Record<string, Record<string, unknown>>
}

/** Accepted key-binding configuration handed to the renderer. */
export interface ShortcutConfigSnapshot {
  revision: string
  sequence: number
  document: ShortcutDocument
  status: 'loading' | 'ready' | 'unreadable'
  error: 'read' | 'invalid' | 'future' | null
  usingDefaults: boolean
}

/** One revision-checked preference edit. */
export type ShortcutEdit =
  | { type: 'set'; id: string; binding: unknown }
  | { type: 'reset'; id: string }
  | { type: 'reset-all' }

/** Classified persistence outcome. */
export interface ShortcutSaveResult {
  status: 'saved' | 'stale' | 'unreadable' | 'write-failed' | 'not-ready' | 'conflict'
  snapshot: ShortcutConfigSnapshot
}

/** Native-style keyboard input the harness shortcuts service consumes. */
export interface DshDesktopKeyboardInput {
  revision: string
  kind: 'keyboard'
  frameName: string
  code: string
  secondCode?: string
  control: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  repeat: boolean
}

/** `window.dshDesktop` as consumed by the harness client plugins. */
export interface DshDesktopApi {
  keyboard: {
    subscribe: (listener: (input: DshDesktopKeyboardInput) => void) => () => void
    closeWindow: (revision: string) => Promise<void>
  }
  shortcuts: {
    get: (definitions: readonly unknown[]) => Promise<ShortcutConfigSnapshot>
    edit: (edit: ShortcutEdit, revision: string) => Promise<ShortcutSaveResult>
    subscribe: (listener: (snapshot: ShortcutConfigSnapshot) => void) => () => void
    recording: (active: boolean) => Promise<void>
  }
}
