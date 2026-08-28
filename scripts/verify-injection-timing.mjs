/**
 * Timing verification: does the harness client-modules graph pick up a plugin
 * injected AFTER the web service is ready?
 *
 * Sequence:
 *   1. Boot dsh web against a temp home (empty profile).
 *   2. Wait for ready; fetch the index page — the graph must NOT contain the
 *      plugin yet.
 *   3. Run the injection (patch + package copy).
 *   4. Poll the index page until the plugin id appears in __DSH_BOOT__ (or
 *      timeout) — proving live patch reload re-scans the loader entries and
 *      client-modules re-composes the browser graph without a restart.
 *
 * Run: node scripts/verify-injection-timing.mjs
 */

import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOME = mkdtempSync(join(tmpdir(), 'dsh-desktop-timing-'))
const DSH_HOME = join(HOME, '.dsh')
const PROFILE = join(DSH_HOME, 'profiles', 'dsh-desktop')
const BUNDLED = join(HOME, 'plugin-install.mjs')

mkdirSync(PROFILE, { recursive: true })
writeFileSync(join(PROFILE, 'package.json'), JSON.stringify({
  name: 'dsh-profile-web',
  private: true,
  dependencies: {},
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], patchReload: 'live' } },
}, null, 2))
writeFileSync(join(PROFILE, 'cordis.patch.yml'), `# template
[]
`)

await build({
  entryPoints: [join(ROOT, 'src', 'main', 'plugin-install.ts')],
  outfile: BUNDLED,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  logLevel: 'silent',
})
const { ensurePluginsInstalled } = await import(`${pathToFileURL(BUNDLED).href}?t=${Date.now()}`)
process.env.DSH_DESKTOP_PLUGINS_ROOT = join(ROOT, 'plugins')
process.env.DSH_HOME = DSH_HOME

const PLUGIN_ID = '@dsh-desktop/window-controls'

const ready = new Promise((resolve, reject) => {
  const child = spawn('npx', ['--yes', '@deepseek-ai/dsh@0.1.1-rc.2', '--profile', 'dsh-desktop', '--no-open', '--port', '0'], {
    cwd: ROOT,
    env: { ...process.env, DSH_HOME, DSH_TELEMETRY_DISABLED: '1' },
    shell: process.platform === 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const timer = setTimeout(() => {
    child.kill()
    reject(new Error('dsh web did not become ready in 120s'))
  }, 120_000)
  const errLines = createInterface({ input: child.stderr })
  errLines.on('line', (line) => { process.stderr.write(`  [stderr] ${line}\n`) })
  const outLines = createInterface({ input: child.stdout })
  outLines.on('line', (line) => {
    const m = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/.exec(line)
    if (m) {
      clearTimeout(timer)
      resolve({ child, url: m[1] })
    }
  })
  child.once('exit', (code) => {
    clearTimeout(timer)
    reject(new Error(`dsh web exited early (code ${String(code)})`))
  })
})

const fetchHasPlugin = async (url) => {
  try {
    const html = await (await fetch(url)).text()
    return html.includes(PLUGIN_ID)
  } catch {
    return false
  }
}

let boot = null
try {
  boot = await ready
  const before = await fetchHasPlugin(boot.url)
  console.log(`before injection, plugin in graph: ${before}`)

  const injected = ensurePluginsInstalled(DSH_HOME)
  console.log(`injection ran: ${injected}`)

  // Poll for up to 30s: live patch reload should re-scan and re-compose.
  let after = false
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    after = await fetchHasPlugin(boot.url)
    if (after) break
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.log(`after injection (polled up to 30s), plugin in graph: ${after}`)
  console.log(after ? 'PASS: live reload picks up the injected plugin' : 'FAIL: graph never updated')
  if (!after) process.exitCode = 1
} finally {
  if (boot?.child) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(boot.child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } else {
      boot.child.kill('SIGTERM')
    }
  }
  await new Promise((r) => setTimeout(r, 800))
  rmSync(HOME, { recursive: true, force: true })
}
