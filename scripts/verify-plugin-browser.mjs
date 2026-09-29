/**
 * Browser-side verification: boots dsh web (temp DSH_HOME, plugin injected),
 * opens the page in the installed chromium, and asserts:
 *
 * 1. Without the dsh-desktop preload bridge, the plugin is a no-op (no
 *    toolbar, no title-bar stylesheet) — the console `dsh --profile
 *    dsh-desktop` case.
 * 2. With a stubbed preload, the window-controls plugin renders into the
 *    shell.overlay seat and routes button clicks to the bridge.
 * 3. In a blank Session ("新会话"), the injected title-row clearance keeps the
 *    right-sidebar expand control clear of the window-control row, and the
 *    button stays clickable (the drag strip does not sit over it).
 *
 * Run: node scripts/verify-plugin-browser.mjs
 */

import { build } from 'esbuild'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { DSH_WEB_READY } from './dsh-web-ready.mjs'

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
  const child = spawn('npx', ['--yes', '@deepseek-ai/dsh@0.2.0-rc.1', '--profile', 'dsh-desktop', '--no-open', '--port', '0'], {
    cwd: ROOT,
    env: { ...process.env, DSH_HOME, DSH_TELEMETRY_DISABLED: '1', DSH_DESKTOP: '1' },
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
    const m = DSH_WEB_READY.exec(line)
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
// Resolve the installed chromium: prefer the path playwright's own registry
// reports, but only when that revision is actually installed — it tracks the
// installed playwright-core, while the browsers on disk may be older. Fall
// back to the legacy hard-coded revision otherwise.
const chromePath =
  (() => {
    const candidates = []
    try {
      candidates.push(chromium.executablePath())
    } catch {
      // registry lookup failed; fall through to the hard-coded revision
    }
    candidates.push(join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium-1217', 'chrome-win64', 'chrome.exe'))
    return candidates.find((candidate) => existsSync(candidate)) ?? candidates.at(-1)
  })()

let boot = null
let browser = null
try {
  boot = await ready
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox'],
  })

  // --- CLI host: no preload bridge, plugin must no-op ---
  const cliPage = await browser.newPage()
  await cliPage.goto(boot.url, { waitUntil: 'load', timeout: 120_000 })
  try {
    await cliPage.locator('div:has(> [data-shell-overlay])').waitFor({ state: 'attached', timeout: 60_000 })
  } catch {
    // fall through to the assertions below
  }
  await cliPage.waitForTimeout(1500)
  const cliToolbar = await cliPage.getByRole('toolbar', { name: 'Window controls' }).count()
  const cliCss = await cliPage.locator('style[data-dsh-css="dsh-desktop-title-bar"]').count()
  console.log(`cli toolbar visible: ${cliToolbar > 0}`)
  console.log(`cli title-bar css: ${cliCss > 0}`)
  await cliPage.close()

  // --- desktop host: stub the preload bridge so the plugin renders ---
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

  // --- blank Session ("新会话") header geometry ---
  // A brand-new Session shows the conversation header with only the
  // right-sidebar expand control in its title row. The injected title-row
  // clearance must push that control left of the window-control row, and the
  // drag strip must not sit over it (the strip is above header content, so an
  // overlap would swallow the button's clicks). Regression guard: the
  // original rule assumed the title row was a direct child of the header, but
  // the harness slot runtime wraps it in a `display: contents` element, so a
  // child combinator silently stopped matching in 0.2.0.
  await page.evaluate(() => { document.querySelector('button[class*="newSession"]')?.click() })
  await page.waitForTimeout(2000)
  // First-run modals can appear after their async state loads and cover the
  // page; dismiss them so the hit test reads the title row, not a modal mask.
  for (let i = 0; i < 8; i += 1) {
    const dismissed = await page.evaluate(() => {
      const labels = ['继续', '稍后配置', '稍后', '暂不设置', 'Continue', 'Set up later', 'Later']
      let clicked = 0
      for (let round = 0; round < 4; round += 1) {
        const button = [...document.querySelectorAll('button')]
          .find((candidate) => labels.includes((candidate.textContent ?? '').trim()))
        if (button === undefined) break
        button.click()
        clicked += 1
      }
      return clicked
    })
    await page.waitForTimeout(500)
    if (dismissed === 0 && await page.locator('[role="presentation"] [class*="_mask"]').count() === 0) break
  }
  const blankLayout = await page.evaluate(() => {
    const expand = document.querySelector('[data-sidebar-right-expand]')
    const controls = document.querySelector('[data-dsh-window-controls]')
    const titleRow = document.querySelector(
      'div:has(> [data-shell-overlay]) > [class*="centerCol"] [class*="_header"] [class*="titleRow"]',
    )
    if (expand === null || controls === null || titleRow === null) return null
    const expandRect = expand.getBoundingClientRect()
    const controlsRect = controls.getBoundingClientRect()
    const hit = document.elementFromPoint(
      expandRect.left + expandRect.width / 2,
      expandRect.top + expandRect.height / 2,
    )
    return {
      marginRight: getComputedStyle(titleRow).marginRight,
      overlap: expandRect.left < controlsRect.right && controlsRect.left < expandRect.right
        && expandRect.top < controlsRect.bottom && controlsRect.top < expandRect.bottom,
      clickable: hit !== null && expand.contains(hit),
      expandRight: Math.round(expandRect.right),
      controlsLeft: Math.round(controlsRect.left),
    }
  })
  const blankCleared = blankLayout !== null
    && blankLayout.marginRight === '130px'
    && !blankLayout.overlap
    && blankLayout.clickable
  console.log(`blank titleRow margin-right: ${blankLayout?.marginRight ?? 'n/a'}`)
  console.log(`blank expand control right edge ${blankLayout?.expandRight ?? 'n/a'} vs controls left edge ${blankLayout?.controlsLeft ?? 'n/a'}`)
  console.log(`blank expand control overlapped by controls: ${blankLayout?.overlap ?? 'n/a'}`)
  console.log(`blank expand control clickable: ${blankLayout?.clickable ?? 'n/a'}`)

  const relevantErrors = consoleErrors.filter((e) => e.includes('window-controls') || e.includes('shell.overlay'))
  console.log(`plugin-related console errors: ${relevantErrors.length}`)
  if (relevantErrors.length > 0) console.log(relevantErrors.join('\n'))

  if (cliToolbar > 0 || cliCss > 0) {
    console.error('FAIL: window controls took effect without the desktop preload')
    process.exitCode = 1
  } else if (visible === 0 || minimize === 0 || maximize === 0 || close === 0
    || !minimizeCalled || !closeCalled || !maximizeToggled || !blankCleared) {
    console.error('FAIL: window controls did not render or route correctly')
    process.exitCode = 1
  } else {
    console.log('PASS: CLI no-op; desktop host rendered and routed to the bridge; blank-Session clearance holds')
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
