/**
 * Global shortcut that shows or hides the main window.
 *
 * The accelerator is stored in the Electron userData folder so the next
 * launch registers the same combo. Registration is system-wide
 * (`globalShortcut`), so the key works while the window is hidden to the tray.
 *
 * @module dsh-desktop/global-hotkey
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, globalShortcut } from 'electron'

/** Default summon shortcut: Ctrl+Alt+Space on every platform. */
export const DEFAULT_TOGGLE_ACCELERATOR = 'Control+Alt+Space'

const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Super'] as const

const MODIFIER_ALIASES: Record<string, (typeof MODIFIER_ORDER)[number]> = {
  control: 'Control',
  ctrl: 'Control',
  commandorcontrol: 'Control',
  cmdorctrl: 'Control',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  super: 'Super',
  meta: 'Super',
  command: 'Super',
  cmd: 'Super',
  win: 'Super',
  windows: 'Super'
}

const KEY_ALIASES: Record<string, string> = {
  return: 'Enter',
  enter: 'Enter',
  escape: 'Esc',
  esc: 'Esc',
  space: 'Space',
  plus: 'Plus'
}

const CODE_TO_KEY: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  CapsLock: 'Capslock',
  NumLock: 'Numlock',
  ScrollLock: 'Scrolllock',
  PrintScreen: 'PrintScreen',
  NumpadDecimal: 'numdec',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv'
}

const MODIFIER_ONLY_KEYS = new Set([
  'Control',
  'Shift',
  'Alt',
  'Meta',
  'OS',
  'AltGraph',
  'CapsLock'
])

export interface KeyEventParts {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  code: string
  key: string
}

export type SetAcceleratorResult = { ok: true } | { ok: false; error: string }

interface SettingsFile {
  toggleWindowShortcut?: unknown
}

let onToggle: (() => void) | null = null
let desiredAccelerator = DEFAULT_TOGGLE_ACCELERATOR
let registeredAccelerator: string | null = null
let paused = false

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function keyFromEvent(code: string, key: string): string | null {
  if (code in CODE_TO_KEY) return CODE_TO_KEY[code]
  const fn = /^F(\d{1,2})$/.exec(code)
  if (fn !== null) {
    const n = Number(fn[1])
    if (n >= 1 && n <= 24) return `F${String(n)}`
  }
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  const num = /^Numpad([0-9])$/.exec(code)
  if (num !== null) return `num${num[1]}`
  if (key.length === 1 && key !== ' ') return key.toUpperCase()
  return null
}

/**
 * Turn a renderer KeyboardEvent into a canonical Electron accelerator.
 * Returns null for modifier-only presses (still waiting for a key).
 */
export function acceleratorFromKeyEvent(event: KeyEventParts): string | null {
  if (MODIFIER_ONLY_KEYS.has(event.key)) return null
  const key = keyFromEvent(event.code, event.key)
  if (key === null) return null
  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Control')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Super')
  if (modifiers.length === 0) return null
  return `${modifiers.join('+')}+${key}`
}

/**
 * Canonicalize an accelerator string. Null when it has no modifier, no key,
 * or unknown tokens.
 */
export function normalizeAccelerator(raw: string): string | null {
  const tokens = raw
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (tokens.length < 2) return null
  const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>()
  let key: string | null = null
  for (const token of tokens) {
    const alias = MODIFIER_ALIASES[token.toLowerCase()]
    if (alias !== undefined) {
      modifiers.add(alias)
      continue
    }
    if (key !== null) return null
    const mapped = KEY_ALIASES[token.toLowerCase()]
    if (mapped !== undefined) {
      key = mapped
      continue
    }
    if (/^F([1-9]|1\d|2[0-4])$/i.test(token)) {
      key = token.toUpperCase()
      continue
    }
    if (/^[A-Z0-9]$/i.test(token) || token.length > 0) {
      key = token.length === 1 ? token.toUpperCase() : token
      continue
    }
    return null
  }
  if (key === null || modifiers.size === 0) return null
  if (MODIFIER_ALIASES[key.toLowerCase()] !== undefined) return null
  const ordered = MODIFIER_ORDER.filter((name) => modifiers.has(name))
  return `${ordered.join('+')}+${key}`
}

/** User-facing label, e.g. `Ctrl + Alt + 空格`. */
export function toDisplayLabel(accelerator: string): string {
  const normalized = normalizeAccelerator(accelerator) ?? accelerator
  return normalized
    .split('+')
    .map((token) => {
      if (token === 'Control') return 'Ctrl'
      if (token === 'Super') {
        if (process.platform === 'darwin') return '⌘'
        if (process.platform === 'win32') return 'Win'
        return 'Super'
      }
      if (token === 'Space') return '空格'
      return token
    })
    .join(' + ')
}

function loadSavedAccelerator(): string {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), 'utf8')) as SettingsFile
    if (typeof parsed.toggleWindowShortcut === 'string') {
      const normalized = normalizeAccelerator(parsed.toggleWindowShortcut)
      if (normalized !== null) return normalized
    }
  } catch {
    // Missing or malformed file — fall through to the default.
  }
  return DEFAULT_TOGGLE_ACCELERATOR
}

function saveAccelerator(accelerator: string): void {
  const path = settingsPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ toggleWindowShortcut: accelerator }, undefined, 2)}\n`)
}

function fireToggle(): void {
  onToggle?.()
}

function unregisterCurrent(): void {
  if (registeredAccelerator === null) return
  globalShortcut.unregister(registeredAccelerator)
  registeredAccelerator = null
}

function tryRegister(accelerator: string): boolean {
  const ok = globalShortcut.register(accelerator, fireToggle)
  if (!ok) return false
  registeredAccelerator = accelerator
  return true
}

function loadAndRegister(): void {
  desiredAccelerator = loadSavedAccelerator()
  if (tryRegister(desiredAccelerator)) return
  if (
    desiredAccelerator !== DEFAULT_TOGGLE_ACCELERATOR &&
    tryRegister(DEFAULT_TOGGLE_ACCELERATOR)
  ) {
    console.warn(
      `[dsh-desktop] toggle hotkey "${desiredAccelerator}" is unavailable; using default`
    )
    desiredAccelerator = DEFAULT_TOGGLE_ACCELERATOR
    saveAccelerator(DEFAULT_TOGGLE_ACCELERATOR)
    return
  }
  console.error(`[dsh-desktop] failed to register toggle hotkey: ${desiredAccelerator}`)
}

/**
 * Load the saved accelerator (or the default) and register it.
 * Must be called after `app.whenReady`.
 */
export function startToggleHotkey(toggle: () => void): void {
  onToggle = toggle
  paused = false
  loadAndRegister()
}

/** Unregister every global shortcut. Call from `will-quit`. */
export function stopToggleHotkey(): void {
  unregisterCurrent()
  globalShortcut.unregisterAll()
  onToggle = null
  paused = false
}

/**
 * Temporarily drop the OS registration so a recorder can capture the same
 * combo without hiding the window.
 */
export function pauseToggleHotkey(): void {
  if (paused) return
  paused = true
  unregisterCurrent()
}

/** Re-register after {@link pauseToggleHotkey}, unless a new combo was saved. */
export function resumeToggleHotkey(): void {
  if (!paused) return
  paused = false
  if (registeredAccelerator === desiredAccelerator) return
  if (!tryRegister(desiredAccelerator)) {
    console.error(`[dsh-desktop] failed to restore toggle hotkey: ${desiredAccelerator}`)
  }
}

export function getToggleAccelerator(): string {
  return desiredAccelerator
}

export function getToggleAcceleratorLabel(): string {
  return toDisplayLabel(desiredAccelerator)
}

/**
 * Replace the registered shortcut. On failure the previous combo stays
 * (or stays paused if recording).
 */
export function setToggleAccelerator(raw: string): SetAcceleratorResult {
  const normalized = normalizeAccelerator(raw)
  if (normalized === null) {
    return { ok: false, error: '无效的快捷键。请同时按下修饰键和主键。' }
  }

  if (normalized === desiredAccelerator && registeredAccelerator === normalized) {
    paused = false
    return { ok: true }
  }

  const previous = desiredAccelerator
  const wasPaused = paused
  unregisterCurrent()

  if (!tryRegister(normalized)) {
    if (!wasPaused && !tryRegister(previous)) {
      console.error(`[dsh-desktop] failed to restore toggle hotkey: ${previous}`)
    }
    return { ok: false, error: '快捷键已被占用' }
  }

  desiredAccelerator = normalized
  paused = false
  saveAccelerator(normalized)
  return { ok: true }
}
