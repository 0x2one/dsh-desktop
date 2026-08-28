/**
 * Browser-graph verification: boots dsh web against a temp home with the
 * window-controls plugin injected, then fetches the served index.html and
 * asserts the plugin's client bundle appears in the `__DSH_BOOT__` graph
 * (i.e. client-modules scanned our plugin and composed it into the wire).
 *
 * Run: node scripts/verify-plugin-graph.mjs
 */

import { build } from 'esbuild'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOME = mkdtempSync(join(tmpdir(), 'dsh-desktop-graph-'))
const DSH_HOME = join(HOME, '.dsh')
const PROFILE = join(DSH_HOME, 'profiles', 'dsh-desktop')
const BUNDLED = join(HOME, 'plugin-install.mjs')

// Seed the web profile exactly as the harness auto-init would.
mkdirSync(PROFILE, { recursive: true })
writeFileSync(join(PROFILE, 'package.json'), JSON.stringify({
  name: 'dsh-profile-web',
  private: true,
  dependencies: {},
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], patchReload: 'live' } },
}, null, 2))
writeFileSync(join(PROFILE, 'cordis.patch.yml'), '[]\n')

// Bundle the injection logic and run it.
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
const ok = ensurePluginsInstalled(DSH_HOME)
if (!ok) {
  console.error('FAIL: injection failed')
  process.exit(1)
}

// Boot dsh web.
const { spawn } = await import('node:child_process')
const { createInterface } = await import('node:readline')
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

let boot = null
try {
  boot = await ready
  const html = await (await fetch(boot.url)).text()
  const found = html.includes('@dsh-desktop/window-controls')
  const graph = /globalThis\["__DSH_BOOT__"\] = (.+?)(?:<\/script>|$)/s.exec(html)?.[1]
  const windowControlsRows = graph !== undefined
    ? (graph.match(/@dsh-desktop\/window-controls/g) ?? [])
    : []
  console.log(`plugin id in served HTML: ${found}`)
  console.log(`__DSH_BOOT__ occurrences of the plugin id: ${windowControlsRows.length}`)
  if (!found || windowControlsRows.length === 0) {
    console.error('FAIL: window-controls plugin is not in the browser boot graph')
    process.exitCode = 1
  } else {
    console.log('PASS: plugin composed into the browser boot graph')
  }
} finally {
  if (boot?.child) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(boot.child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } else {
      boot.child.kill('SIGTERM')
    }
  }
  await new Promise((r) => setTimeout(r, 500))
  rmSync(HOME, { recursive: true, force: true })
}
