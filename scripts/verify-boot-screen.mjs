/**
 * Boot-screen structure smoke test: verifies the product-hero startup page
 * (centered whale, title, status, glow) with the expected computed styles.
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
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  colorScheme: 'light'
})
await page.addInitScript(() => {
  window.api = { windowControls: {} }
})
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
await page.goto(base, { waitUntil: 'load' })
await page.waitForTimeout(800)
console.log('console errors:', errors)

const checks = {}

checks.logoVisible = await page.locator('.boot-logo').isVisible()
checks.logoSvg = (await page.locator('.boot-logo svg').count()) === 1
checks.glow = (await page.locator('.boot-glow').count()) === 1
checks.noHorizon = (await page.locator('.boot-horizon').count()) === 0

const creatureBox = await page.locator('.boot-logo').boundingBox()
checks.markModest = creatureBox !== null && creatureBox.width >= 48 && creatureBox.width <= 80

const stackBox = await page.locator('.boot-stack').boundingBox()
checks.stackCentered = Boolean(
  stackBox && stackBox.x > 200 && stackBox.x + stackBox.width < 1080 && Math.abs(stackBox.x + stackBox.width / 2 - 640) < 40
)

const title = await page.locator('h1.boot-title').textContent()
checks.titleText = (title ?? '').replace(/\s+/g, ' ').trim() === 'DeepSeek Harness'
checks.titleVisible = await page.locator('h1.boot-title').isVisible()

checks.statusLine = await page.locator('.boot-line').first().isVisible()
const statusText = await page.locator('.boot-line').first().textContent()
checks.statusCopy = (statusText ?? '').includes('Opening Your Workspace')
checks.waitBar = (await page.locator('.boot-wait').count()) === 1
checks.waitBarVisible = await page.locator('.boot-wait').isVisible()
checks.waitDots = (await page.locator('.boot-wait span').count()) === 3

const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
checks.lightPaper = bodyBg === 'rgb(249, 250, 251)'

checks.booting = (await page.locator('.boot').getAttribute('data-state')) === 'booting'

const hint = await page.locator('.boot-hint').textContent()
checks.hint = (hint ?? '').includes('workspace')
checks.noVersions = (await page.locator('.versions').count()) === 0

console.log(JSON.stringify({ bodyBg, checks, creatureBox, stackBox }, null, 2))

const pass = Object.entries(checks).every(([, v]) => v === true)
console.log(pass ? 'PASS: boot screen structure verified' : 'FAIL: boot screen structure broken')
process.exitCode = pass ? 0 : 1
await browser.close()
server.close()
