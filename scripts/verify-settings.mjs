/**
 * Verification of the shared settings store and the pure window-state helpers
 * (`src/main/settings.ts`).
 *
 * The module imports `app` from 'electron' only for path resolution; the
 * verification injects a scratch `userData` directory via
 * `setSettingsUserDataPath` and stubs the electron import so the pure logic
 * (merge-write, bounds validation, state resolution) can run under plain
 * Node.js.
 *
 * Run: node scripts/verify-settings.mjs
 */

import { build } from 'esbuild'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOME = mkdtempSync(join(tmpdir(), 'dsh-desktop-settings-'))
const USER_DATA = join(HOME, 'userData')
const BUNDLED = join(HOME, 'settings.mjs')
const STUB = join(HOME, 'electron-stub.mjs')

const REPORT = []
function step(name, fn) {
  try {
    fn()
    REPORT.push(`[ok]   ${name}`)
  } catch (error) {
    REPORT.push(`[FAIL] ${name}: ${error.message}`)
    throw error
  }
}

// Stub the electron import: with the userData override set, settings.ts never
// touches app.getPath, so the stub only has to satisfy the named import.
writeFileSync(
  STUB,
  `export const app = {
  getPath() {
    throw new Error('app.getPath must not be called when setSettingsUserDataPath is set')
  }
}
`
)

// Bundle settings.ts with electron aliased to the stub.
await build({
  entryPoints: [join(ROOT, 'src', 'main', 'settings.ts')],
  outfile: BUNDLED,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  alias: { electron: STUB },
  logLevel: 'silent'
})
const mod = await import(`${pathToFileURL(BUNDLED).href}?t=${Date.now()}`)
mod.setSettingsUserDataPath(USER_DATA)

// ---- Settings file read/write ----
step('readAppSettings on a missing file returns {}', () => {
  const settings = mod.readAppSettings()
  if (Object.keys(settings).length !== 0) {
    throw new Error(`expected {}, got ${JSON.stringify(settings)}`)
  }
})

step('updateAppSettings merge-writes and preserves unknown keys', () => {
  mod.updateAppSettings({ toggleWindowShortcut: 'Control+Alt+Space' })
  mod.updateAppSettings({ launchAtLogin: true })
  const settings = mod.readAppSettings()
  if (settings.toggleWindowShortcut !== 'Control+Alt+Space') {
    throw new Error(`toggleWindowShortcut lost: ${JSON.stringify(settings)}`)
  }
  if (settings.launchAtLogin !== true) {
    throw new Error(`launchAtLogin lost: ${JSON.stringify(settings)}`)
  }
})

step('updateAppSettings keeps windowState intact across unrelated writes', () => {
  mod.updateAppSettings({
    windowState: { bounds: { x: 10, y: 10, width: 1280, height: 800 }, isMaximized: false }
  })
  mod.updateAppSettings({ closeToTrayHintShown: true })
  const settings = mod.readAppSettings()
  const state = settings.windowState
  if (state === undefined || state.bounds.x !== 10 || state.bounds.width !== 1280) {
    throw new Error(`windowState clobbered: ${JSON.stringify(settings)}`)
  }
  if (settings.closeToTrayHintShown !== true) {
    throw new Error(`closeToTrayHintShown lost: ${JSON.stringify(settings)}`)
  }
})

// ---- isUsableWindowBounds ----
const display = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }

step('valid bounds inside the work area are accepted', () => {
  if (!mod.isUsableWindowBounds({ x: 100, y: 100, width: 1280, height: 800 }, [display])) {
    throw new Error('in-bounds window rejected')
  }
})

step('bounds fully off-screen are rejected', () => {
  if (mod.isUsableWindowBounds({ x: 5000, y: 5000, width: 1280, height: 800 }, [display])) {
    throw new Error('offscreen window accepted')
  }
})

step('bounds smaller than the minimum are rejected', () => {
  if (mod.isUsableWindowBounds({ x: 0, y: 0, width: 100, height: 100 }, [display])) {
    throw new Error('undersized window accepted')
  }
})

step('negative bounds on a left/up monitor are accepted', () => {
  const left = { workArea: { x: -1920, y: 0, width: 1920, height: 1080 } }
  if (!mod.isUsableWindowBounds({ x: -1800, y: 100, width: 1280, height: 800 }, [left, display])) {
    throw new Error('left-monitor window rejected')
  }
})

step('partial overlap with any display is accepted', () => {
  if (!mod.isUsableWindowBounds({ x: 1900, y: 100, width: 1280, height: 800 }, [display])) {
    throw new Error('overlapping window rejected')
  }
})

step('no display info trusts the saved bounds', () => {
  if (!mod.isUsableWindowBounds({ x: -9999, y: -9999, width: 1280, height: 800 }, [])) {
    throw new Error('bounds rejected without display info')
  }
})

step('null bounds are rejected without throwing', () => {
  if (mod.isUsableWindowBounds(null, [display])) {
    throw new Error('null bounds accepted')
  }
})

step('non-object bounds are rejected without throwing', () => {
  if (mod.isUsableWindowBounds('nope', [display])) {
    throw new Error('string bounds accepted')
  }
})

// ---- resolveWindowState ----
step('resolveWindowState returns a valid saved state', () => {
  const state = mod.resolveWindowState(
    { windowState: { bounds: { x: 10, y: 10, width: 1280, height: 800 }, isMaximized: true } },
    [display]
  )
  if (state === null || !state.isMaximized || state.bounds.width !== 1280) {
    throw new Error(`unexpected state: ${JSON.stringify(state)}`)
  }
})

step('resolveWindowState falls back to null when the saved state is unusable', () => {
  const state = mod.resolveWindowState(
    { windowState: { bounds: { x: 9999, y: 9999, width: 1280, height: 800 }, isMaximized: false } },
    [display]
  )
  if (state !== null) throw new Error(`offscreen state resolved: ${JSON.stringify(state)}`)
})

step('resolveWindowState ignores a missing windowState key', () => {
  const state = mod.resolveWindowState({ launchAtLogin: true }, [display])
  if (state !== null) throw new Error(`missing state resolved: ${JSON.stringify(state)}`)
})

step('resolveWindowState ignores null bounds without throwing', () => {
  const state = mod.resolveWindowState(
    { windowState: { bounds: null, isMaximized: true } },
    [display]
  )
  if (state !== null) throw new Error(`null bounds resolved: ${JSON.stringify(state)}`)
})

console.log('\n--- settings verification report ---')
console.log(REPORT.join('\n'))
console.log(`\n${REPORT.every((s) => s.startsWith('[ok]')) ? 'PASS' : 'FAIL'}`)

rmSync(HOME, { recursive: true, force: true })
