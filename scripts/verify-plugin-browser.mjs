/**
 * Browser-side verification: boots dsh web (temp DSH_HOME, plugin injected),
 * opens the page in the installed chromium, and asserts the window-controls
 * plugin actually rendered into the shell.overlay seat.
 *
 * Run: node scripts/verify-plugin-browser.mjs
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
const HOME = mkdtempSync(join(tmpdir(), 'dsh-desktop-browser-'))
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
writeFileSync(join(PROFILE, 'cordis.patch.yml'), '[]\n')

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
if (!ensurePluginsInstalled(DSH_HOME)) {
  console.error('FAIL: injection failed')
  process.exit(1)
}

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

const { chromium } = await import('playwright-core')
const chromePath = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1217', 'chrome-win64', 'chrome.exe')

let boot = null
let browser = null
try {
  boot = await ready
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  // Simulate the dsh-desktop preload bridge: in a real Electron window the
  // preload exposes window.api.windowControls; here we stub it so the plugin
  // renders and we can exercise the control handlers.
  await page.addInitScript(() => {
    let maximized = false
    const listeners = []
    window.api = {
      windowControls: {
        minimize: () => { window.__wcCalls = [...(window.__wcCalls ?? []), 'minimize'] },
        toggleMaximize: async () => { maximized = !maximized; listeners.forEach((fn) => fn(maximized)); return maximized },
        close: () => { window.__wcCalls = [...(window.__wcCalls ?? []), 'close'] },
        isMaximized: async () => maximized,
        onMaximizedChange: (fn) => { listeners.push(fn); return () => {} },
      },
    }
  })
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

  await page.goto(boot.url, { waitUntil: 'load', timeout: 120_000 })

  // Wait for the window controls toolbar (our plugin's aria-label).
  const toolbar = page.getByRole('toolbar', { name: 'Window controls' })
  try {
    await toolbar.waitFor({ state: 'visible', timeout: 60_000 })
  } catch {
    // fall through to diagnostics below
  }

  const visible = await toolbar.count()
  const minimize = await page.getByRole('button', { name: 'Minimize' }).count()
  const maximize = await page.getByRole('button', { name: 'Maximize' }).count()
  const close = await page.getByRole('button', { name: 'Close' }).count()

  console.log(`toolbar visible: ${visible > 0}`)
  console.log(`minimize button: ${minimize > 0}`)
  console.log(`maximize button: ${maximize > 0}`)
  console.log(`close button: ${close > 0}`)

  // Exercise the handlers through the stubbed bridge. The dsh first-run
  // onboarding overlays a modal mask that intercepts pointer events, so
  // programmatic .click() on each button is used to verify bridge routing
  // (the mask itself is unrelated to the window controls).
  let minimizeCalled = false
  let closeCalled = false
  let maximizeToggled = false
  if (visible > 0) {
    await page.getByRole('button', { name: 'Minimize' }).evaluate((el) => el.click())
    await page.getByRole('button', { name: 'Close' }).evaluate((el) => el.click())
    await page.getByRole('button', { name: 'Maximize' }).evaluate((el) => el.click())
    minimizeCalled = (await page.evaluate(() => (window.__wcCalls ?? []).includes('minimize')))
    closeCalled = (await page.evaluate(() => (window.__wcCalls ?? []).includes('close')))
    // After toggling maximize, the button label flips to Restore.
    maximizeToggled = await page.getByRole('button', { name: 'Restore' }).count() > 0
  }
  console.log(`minimize routed to bridge: ${minimizeCalled}`)
  console.log(`close routed to bridge: ${closeCalled}`)
  console.log(`maximize toggled state: ${maximizeToggled}`)

  const relevantErrors = consoleErrors.filter((e) => e.includes('window-controls') || e.includes('shell.overlay'))
  console.log(`plugin-related console errors: ${relevantErrors.length}`)
  if (relevantErrors.length > 0) console.log(relevantErrors.join('\n'))

  if (visible === 0 || minimize === 0 || maximize === 0 || close === 0
    || !minimizeCalled || !closeCalled || !maximizeToggled) {
    console.error('FAIL: window controls did not render or route correctly')
    process.exitCode = 1
  } else {
    console.log('PASS: window controls rendered and routed to the bridge')
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`)
  process.exitCode = 1
} finally {
  await browser?.close()
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
