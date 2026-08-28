/**
 * Rasterize the DeepSeek whale mark into the window / installer PNG icon.
 *
 * The mark is the harness favicon (`src/renderer/src/assets/logo.svg`) drawn
 * in white on a transparent canvas, with padding so it reads at taskbar size
 * without a black square behind it. Writes `resources/icon.png`
 * (BrowserWindow) and `build/icon.png` (electron-builder).
 *
 * Run: node scripts/rasterize-icon.mjs
 */
import { chromium } from 'playwright-core'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync as existsSyncSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIZE = 512
const chromePath = [
  join(
    process.env.LOCALAPPDATA ?? '',
    'ms-playwright',
    'chromium-1217',
    'chrome-win64',
    'chrome.exe'
  ),
  join('C:/Program Files/Google/Chrome/Application/chrome.exe')
].find(existsSyncSync)
if (chromePath === undefined) throw new Error('Chrome/Chromium executable not found')

const svg = await readFile(join(ROOT, 'src', 'renderer', 'src', 'assets', 'logo.svg'), 'utf8')
const mark = svg
  .replace(/<style>[\s\S]*?<\/style>\s*/u, '')
  .replace('width="50.000000"', `width="${SIZE}"`)
  .replace('height="50.000000"', `height="${SIZE}"`)
  .replace('viewBox="0 0 50 50"', 'viewBox="-6 -6 62 62"')
  .replace('fill="#000"', 'fill="#eef1f6"')

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox']
})
const page = await browser.newPage({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1
})
await page.setContent(
  `<!doctype html><html><head><style>
    html, body { margin: 0; background: transparent; }
  </style></head><body>${mark}</body></html>`
)
await page.waitForTimeout(100)

const resourcesDir = join(ROOT, 'resources')
const buildDir = join(ROOT, 'build')
await mkdir(resourcesDir, { recursive: true })
await mkdir(buildDir, { recursive: true })
const dest = join(resourcesDir, 'icon.png')
await page.screenshot({ path: dest, type: 'png', omitBackground: true })
await copyFile(dest, join(buildDir, 'icon.png'))
console.log(`icon written: ${dest}`)
await browser.close()
