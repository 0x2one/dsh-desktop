/**
 * Harness Desktop preload contract (`window.dshDesktop`).
 *
 * The embedded harness treats a document whose `<html>` carries
 * `data-platform` as its own Electron host and expects `window.dshDesktop`
 * (see `@deepseek-ai/dsh-client-shortcuts`: on the desktop runtime it throws
 * `Desktop keyboard bridge unavailable` unless `keyboard` is present). The
 * dsh-desktop preload sets `data-platform` for the harness platform CSS, so it
 * must also provide this bridge — otherwise `dsh-client-shortcuts` fails to
 * activate and every plugin that injects the `shortcuts` service goes down
 * with it.
 *
 * The bridge mirrors the harness desktop host:
 * - `shortcuts` is an IPC facade over a main-process file store, so bindings
 *   survive launches (the served loopback origin changes every run, which
 *   rules out origin-local storage).
 * - `keyboard.subscribe` forwards renderer key events stamped with the store's
 *   accepted revision; the harness service dispatches configurable commands
 *   from this native path on Windows/macOS.
 *
 * Capabilities dsh-desktop does not implement (desktop browser guest, harness
 * self-update) stay absent; the harness gates those on
 * `dshDesktop.protocolVersion === 1`, which this bridge omits.
 *
 * @module dsh-desktop/dsh-desktop-bridge
 */

import { ipcRenderer } from 'electron'
import {
  SHORTCUTS_CHANNELS,
  type DshDesktopApi,
  type DshDesktopKeyboardInput,
  type ShortcutConfigSnapshot
} from './shortcuts-api'

export type { DshDesktopApi, DshDesktopKeyboardInput } from './shortcuts-api'

/**
 * Build the harness desktop bridge.
 * @returns the `window.dshDesktop` object to expose from the preload.
 */
export function createDshDesktopApi(): DshDesktopApi {
  // Accepted store revision, learned from get/edit/changed responses. Events
  // arriving before the first response are dropped (the service is not
  // configured yet either).
  let revision = ''
  // While the settings recorder owns keyboard input, native dispatch must not
  // run (the harness suppresses this in its main process).
  let recording = false

  return {
    keyboard: {
      subscribe(listener) {
        const onKeyDown = (event: KeyboardEvent): void => {
          if (revision === '' || recording) return
          const input: DshDesktopKeyboardInput = {
            revision,
            kind: 'keyboard',
            frameName: '',
            code: event.code,
            control: event.ctrlKey,
            alt: event.altKey,
            shift: event.shiftKey,
            meta: event.metaKey,
            repeat: event.repeat
          }
          listener(input)
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      },
      async closeWindow(expected) {
        await ipcRenderer.invoke(SHORTCUTS_CHANNELS.closeWindow, expected)
      }
    },
    shortcuts: {
      async get(definitions) {
        const snapshot = (await ipcRenderer.invoke(SHORTCUTS_CHANNELS.get, definitions)) as
          ShortcutConfigSnapshot | undefined
        if (snapshot === undefined) throw new Error('dsh-desktop: shortcut store unavailable')
        revision = snapshot.revision
        return snapshot
      },
      async edit(edit, expected) {
        const result = await ipcRenderer.invoke(SHORTCUTS_CHANNELS.edit, edit, expected)
        if (result?.snapshot?.revision !== undefined) revision = result.snapshot.revision
        return result
      },
      subscribe(listener) {
        const handle = (
          _event: Electron.IpcRendererEvent,
          snapshot: ShortcutConfigSnapshot
        ): void => {
          revision = snapshot.revision
          listener(snapshot)
        }
        ipcRenderer.on(SHORTCUTS_CHANNELS.changed, handle)
        return () => {
          ipcRenderer.removeListener(SHORTCUTS_CHANNELS.changed, handle)
        }
      },
      async recording(active) {
        recording = active
        await ipcRenderer.invoke(SHORTCUTS_CHANNELS.recording, active)
      }
    }
  }
}
