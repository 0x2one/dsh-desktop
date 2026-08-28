/**
 * Capture the built boot screen to a PNG for visual review.
 * Run: node scripts/screenshot-boot.mjs
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
const base = `http://127.0.0.1:${server.address().port}`

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
await page.goto(base, { waitUntil: 'load' })
await page.waitForTimeout(1500)
const out = join(ROOT, 'scripts', 'boot-screen.png')
await page.screenshot({ path: out })
console.log(`screenshot saved: ${out}`)

await page.goto(`${base}/?init-error=${encodeURIComponent('node: not found on PATH')}`, {
  waitUntil: 'load'
})
await page.waitForTimeout(400)
const errorOut = join(ROOT, 'scripts', 'boot-screen-error.png')
await page.screenshot({ path: errorOut })
console.log(`screenshot saved: ${errorOut}`)
await browser.close()
server.close()
