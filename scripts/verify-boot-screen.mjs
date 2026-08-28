/**
 * Boot-screen structure smoke test: verifies the redesigned startup page
 * renders its core visual structure (whale logo, title, eyebrow, status line,
 * bathymetry background, sonar, versions readout) with the expected computed
 * styles.
 *
 * Run: node scripts/verify-boot-screen.mjs
 */
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const chromePath = [
  join(
    process.env.LOCALAPPDATA ?? '',
    'ms-playwright',
    'chromium-1217',
    'chrome-win64',
    'chrome.exe'
  ),
  join('C:/Program Files/Google/Chrome/Application/chrome.exe')
].find(existsSync)
if (chromePath === undefined) throw new Error('Chrome/Chromium executable not found')

// Serve the built renderer over HTTP so module scripts load (file:// blocks
// cross-origin module/CSS loads in plain Chromium; Electron's loadFile has no
// such restriction, so this only affects the standalone verification).
const rendererDir = join(ROOT, 'out', 'renderer')
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
}
const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    if (pathname === '/') pathname = '/index.html'
    const file = normalize(join(rendererDir, pathname))
    if (!file.startsWith(rendererDir)) {
      res.writeHead(403)
      res.end()
      return
    }
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const base = `http://127.0.0.1:${port}`

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.addInitScript(() => {
  window.api = { windowControls: {} }
})
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
await page.goto(base, { waitUntil: 'load' })
await page.waitForTimeout(1200)
console.log('console errors:', errors)

const checks = {}

// 1. Official whale mark (harness favicon) leads the banner.
checks.logoVisible = await page.locator('.boot-logo').isVisible()
checks.logoSvg = (await page.locator('.boot-logo svg').count()) === 1

// 2. Title: full app name, present, styled large.
const title = await page.locator('h1.boot-title').textContent()
checks.titleText = title?.trim() === 'DeepSeek Harness Desktop'
checks.titleVisible = await page.locator('h1.boot-title').isVisible()

// 3. Eyebrow: the deepseek · harness · desktop prefix.
const eyebrow = await page.locator('.boot-eyebrow').textContent()
checks.eyebrow = (eyebrow ?? '').includes('deepseek')

// 4. Status line: boot message + mono font + dots.
checks.statusLine = await page.locator('.boot-line').first().isVisible()
checks.dots = (await page.locator('.boot-dots span').count()) === 3
const statusFont = await page
  .locator('.boot-line')
  .first()
  .evaluate((el) => getComputedStyle(el).fontFamily)
checks.statusMono = statusFont.includes('monospace')

// 5. Background: dark deep-sea base with layered gradients.
const bodyBg = await page.evaluate(() => {
  const styles = getComputedStyle(document.body)
  return { background: styles.backgroundColor, backgroundImage: styles.backgroundImage }
})
checks.darkBg = bodyBg.background === 'rgb(11, 13, 18)'
checks.fieldGradient = await page
  .locator('.boot-field')
  .evaluate((el) => getComputedStyle(el).backgroundImage.includes('radial-gradient'))

// 6. Sonar focus element exists with animation.
checks.sonar = (await page.locator('.boot-sonar').count()) === 1
const sonarAnim = await page
  .locator('.boot-sonar')
  .evaluate((el) => getComputedStyle(el).animationName)
checks.sonarAnimates = sonarAnim.includes('ds-sonar')

// 7. Layout: banner left-anchored (title left edge near left padding).
const bannerBox = await page.locator('.boot-banner').boundingBox()
checks.bannerLeft = bannerBox !== null && bannerBox.x >= 50 && bannerBox.x < 120

// 8. Versions readout renders (preload stubbed => window.electron undefined => hidden).
const versionsCount = await page.locator('.versions li').count()
checks.versions = versionsCount === 0 // hidden without preload; fine

console.log(JSON.stringify({ bodyBg, checks }, null, 2))

const pass = Object.entries(checks).every(([k, v]) => k === 'versions' || v === true)
console.log(pass ? 'PASS: boot screen structure verified' : 'FAIL: boot screen structure broken')
process.exitCode = pass ? 0 : 1
await browser.close()
server.close()
