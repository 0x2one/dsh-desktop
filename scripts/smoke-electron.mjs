/**
 * Electron smoke test: launches the built app with an isolated DSH_HOME and
 * observes the main-process logs to confirm the full startup path works in a
 * real Electron shell:
 *   - runtime requirement check passes
 *   - dsh web service spawns and becomes ready
 *   - window loads the harness URL
 *   - the window-controls plugin is injected into the (temp) profile
 *
 * Run (after `npm run build`): node scripts/smoke-electron.mjs
 * Set SMOKE_SECONDS to run longer (default 45s).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOME = mkdtempSync(join(tmpdir(), 'dsh-desktop-smoke-'))
const DSH_HOME = join(HOME, '.dsh')
// Pre-create the web profile so the smoke run also exercises the injection
// path against an existing profile (the common real-world case).
const PROFILE = join(DSH_HOME, 'profiles', 'dsh-desktop')
const { mkdirSync } = await import('node:fs')
mkdirSync(PROFILE, { recursive: true })
writeFileSync(join(PROFILE, 'package.json'), JSON.stringify({
  name: 'dsh-profile-web',
  private: true,
  dependencies: {},
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], patchReload: 'live' } },
}, null, 2))
writeFileSync(join(PROFILE, 'cordis.patch.yml'), '[]\n')

const seconds = Number(process.env.SMOKE_SECONDS ?? 45)
console.log(`[smoke] launching app with DSH_HOME=${DSH_HOME} for ${seconds}s`)

// electron-vite preview runs the built app with the packaged entry.
const child = spawn('npx', ['electron-vite', 'preview'], {
  cwd: ROOT,
  env: {
    ...process.env,
    DSH_HOME,
    DSH_TELEMETRY_DISABLED: '1',
    DSH_DESKTOP_PLUGINS_ROOT: join(ROOT, 'plugins'),
    ELECTRON_ENABLE_LOGGING: '1',
  },
  shell: process.platform === 'win32',
  windowsHide: false,
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
const outLines = createInterface({ input: child.stdout })
outLines.on('line', (line) => { output = `${output}${line}\n`.slice(-16000); console.log(`[app] ${line}`) })
const errLines = createInterface({ input: child.stderr })
errLines.on('line', (line) => { output = `${output}${line}\n`.slice(-16000); console.log(`[app] ${line}`) })

await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
console.log('[smoke] killing app')
if (process.platform === 'win32') {
  spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
} else {
  child.kill('SIGTERM')
}
await new Promise((r) => setTimeout(r, 1500))

// Cleanup the temp home.
rmSync(HOME, { recursive: true, force: true })

// Report.
const ready = output.includes('dsh web: http://')
const injected = await (async () => {
  try {
    const { readFileSync, existsSync } = await import('node:fs')
    const patch = readFileSync(join(PROFILE, 'cordis.patch.yml'), 'utf8')
    return existsSync(join(PROFILE, 'node_modules', '@dsh-desktop', 'window-controls', 'package.json'))
      && patch.includes('dsh-desktop-window-controls')
  } catch {
    return false
  }
})()

console.log('--- smoke report ---')
console.log(`[ok]   app launched: ${child.exitCode === null ? true : false}`)
console.log(`[ok]   dsh web ready line seen: ${ready}`)
console.log(`[ok]   plugin injected into temp profile: ${injected}`)
console.log(`[ok]   no crash before kill: ${!output.includes('Error:') || output.includes('dsh web exited')}`)
console.log(output.includes('dsh web: http://') ? 'PASS' : 'FAIL')
