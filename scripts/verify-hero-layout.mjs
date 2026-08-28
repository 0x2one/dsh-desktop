/**
 * Layout smoke test for the hero-state window controls:
 *
 * 1. In the hero (no open conversation) state, the center column must reach
 *    the very top of the window (computed padding-top === 0px), i.e. the
 *    content area starts at the top edge.
 * 2. The window-controls toolbar and its buttons must be transparent by
 *    default (background: transparent / rgba(0,0,0,0)).
 * 3. Hovering a button must paint a background (the hover rule must actually
 *    win over the default transparent state — no inline background may block
 *    it).
 *
 * Boots dsh web (temp DSH_HOME + injected plugin), opens it in the installed
 * chromium, and asserts the invariants.
 *
 * Run: node scripts/verify-hero-layout.mjs
 */

import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOME = mkdtempSync(join(tmpdir(), 'dsh-desktop-hero-'))
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  // Stub the preload bridge so the plugin renders.
  await page.addInitScript(() => {
    let maximized = false
    const listeners = []
    window.api = {
      windowControls: {
        minimize: () => {},
        toggleMaximize: async () => { maximized = !maximized; listeners.forEach((fn) => fn(maximized)); return maximized },
        close: () => {},
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

  const toolbar = page.getByRole('toolbar', { name: 'Window controls' })
  try {
    await toolbar.waitFor({ state: 'visible', timeout: 60_000 })
  } catch {
    // fall through to diagnostics below
  }
  const visible = await toolbar.count()
  console.log(`toolbar visible: ${visible > 0}`)

  let heroTop = null
  let toolbarBg = null
  let buttonBg = null
  let hoverBg = null
  if (visible > 0) {
    // Wait for the injected stylesheet to apply (plugin body runs async).
    await page.waitForTimeout(1500)

    // 1. Center column top: computed padding-top must be 0px in hero state.
    heroTop = await page.evaluate(() => {
      const frame = document.querySelector('div:has(> [data-shell-overlay])')
      if (frame === null) return null
      const center = [...frame.children].find(
        (el) => el instanceof HTMLElement && el.className.includes('centerCol'),
      )
      if (center === null) return null
      const style = getComputedStyle(center)
      return { paddingTop: style.paddingTop, top: center.getBoundingClientRect().top }
    })
    console.log(`centerCol padding-top: ${heroTop?.paddingTop ?? 'n/a'} (top=${heroTop?.top ?? 'n/a'})`)

    // 2. Toolbar + button backgrounds must be transparent by default.
    toolbarBg = await toolbar.evaluate((el) => getComputedStyle(el).backgroundColor)
    buttonBg = await page.getByRole('button', { name: 'Minimize' })
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    console.log(`toolbar background: ${toolbarBg}`)
    console.log(`minimize button background: ${buttonBg}`)

    // 3. Hovering the minimize button must paint a background. The dsh
    // first-run onboarding overlays a modal mask that intercepts pointer
    // events, so real mouse hover cannot reach the button; force the :hover
    // pseudo-state via CDP instead, which verifies the injected CSS rule
    // (and its priority over the default transparent state) end to end.
    const minimizeBtn = page.getByRole('button', { name: 'Minimize' })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const doc = await cdp.send('DOM.getDocument')
    const btnNode = await cdp.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '[data-dsh-window-controls] [data-dsh-wc-button]',
    })
    if (btnNode.nodeId > 0) {
      await cdp.send('CSS.forcePseudoState', {
        nodeId: btnNode.nodeId,
        forcedPseudoClasses: ['hover'],
      })
      await page.waitForTimeout(200)
      hoverBg = await minimizeBtn.evaluate((el) => getComputedStyle(el).backgroundColor)
      console.log(`minimize button background on hover (forced): ${hoverBg}`)
      await cdp.send('CSS.forcePseudoState', {
        nodeId: btnNode.nodeId,
        forcedPseudoClasses: [],
      })
    } else {
      console.log('button node not found via CDP; hover check skipped')
    }
    await cdp.detach()

    // Also check the injected stylesheet actually carries the new rules.
    const cssText = await page.evaluate(() => {
      const tag = document.querySelector('style[data-dsh-css="dsh-desktop-title-bar"]')
      return tag === null ? '' : tag.textContent
    })
    console.log(`injected css has padding-top 0px: ${cssText.includes('padding-top:0px') || cssText.includes('padding-top: 0px')}`)
    console.log(`injected css has wc-button rules: ${cssText.includes('data-dsh-wc-button')}`)
    console.log(`injected css has hover rule: ${cssText.includes(':hover')}`)
  }

  const isTransparent = (color) => color === 'rgba(0, 0, 0, 0)' || color === 'transparent'
  const heroOk = heroTop !== null && parseFloat(heroTop.paddingTop) === 0 && heroTop.top <= 1
  const toolbarTransparent = toolbarBg !== null && isTransparent(toolbarBg)
  const buttonTransparent = buttonBg !== null && isTransparent(buttonBg)
  const hoverPaints = hoverBg !== null && !isTransparent(hoverBg)
  console.log(`hero content reaches top: ${heroOk}`)
  console.log(`toolbar transparent: ${toolbarTransparent}`)
  console.log(`button transparent: ${buttonTransparent}`)
  console.log(`hover paints background: ${hoverPaints}`)

  const relevantErrors = consoleErrors.filter((e) => e.includes('window-controls') || e.includes('shell.overlay'))
  console.log(`plugin-related console errors: ${relevantErrors.length}`)
  if (relevantErrors.length > 0) console.log(relevantErrors.join('\n'))

  if (visible === 0 || !heroOk || !toolbarTransparent || !buttonTransparent || !hoverPaints) {
    console.error('FAIL: hero layout invariants not met')
    process.exitCode = 1
  } else {
    console.log('PASS: hero content reaches the top, controls are transparent, and hover paints a background')
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
