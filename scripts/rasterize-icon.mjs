/**
 * Rasterize the DeepSeek whale mark into window / installer icons.
 *
 * The mark is the harness favicon (`src/renderer/src/assets/logo.svg`):
 * - White on transparent → `resources/icon.png` / `build/icon.png`
 *   (BrowserWindow, taskbar, electron-builder app icon).
 * - Black on transparent → `build/installerHeaderIcon.ico`
 *   (NSIS one-click wizard is always white; a white mark would vanish).
 *
 * Run: node scripts/rasterize-icon.mjs
 */
import { chromium } from 'playwright-core'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync as existsSyncSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_ICON_SIZE = 512
const INSTALLER_ICO_SIZES = [16, 32, 48, 256]
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

function markMarkup(fill, size) {
  return svg
    .replace(/<style>[\s\S]*?<\/style>\s*/u, '')
    .replace('width="50.000000"', `width="${String(size)}"`)
    .replace('height="50.000000"', `height="${String(size)}"`)
    .replace('viewBox="0 0 50 50"', 'viewBox="-2 -2 54 54"')
    .replace('fill="#000"', `fill="${fill}"`)
}

function pageHtml(mark, size) {
  return `<!doctype html><html><head><style>
    html, body { margin: 0; background: transparent; width: ${String(size)}px; height: ${String(size)}px; }
  </style></head><body>${mark}</body></html>`
}

/** BMP-in-ICO (32-bit BGRA + AND mask) so NSIS LoadImage can pick a sharp size. */
function encodeIco(images) {
  const count = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)

  const entries = []
  const payloads = []
  let offset = 6 + 16 * count

  for (const { width, height, rgba } of images) {
    const headerSize = 40
    const xorStride = width * 4
    const xorSize = xorStride * height
    const andStride = Math.ceil(width / 32) * 4
    const andSize = andStride * height
    const dib = Buffer.alloc(headerSize + xorSize + andSize)

    dib.writeUInt32LE(40, 0)
    dib.writeInt32LE(width, 4)
    dib.writeInt32LE(height * 2, 8)
    dib.writeUInt16LE(1, 12)
    dib.writeUInt16LE(32, 14)
    dib.writeUInt32LE(xorSize + andSize, 20)

    for (let y = 0; y < height; y++) {
      const srcY = height - 1 - y
      for (let x = 0; x < width; x++) {
        const si = (srcY * width + x) * 4
        const di = headerSize + y * xorStride + x * 4
        dib[di] = rgba[si + 2]
        dib[di + 1] = rgba[si + 1]
        dib[di + 2] = rgba[si]
        dib[di + 3] = rgba[si + 3]
      }
    }

    const andOffset = headerSize + xorSize
    for (let y = 0; y < height; y++) {
      const srcY = height - 1 - y
      for (let x = 0; x < width; x++) {
        if (rgba[(srcY * width + x) * 4 + 3] >= 128) continue
        const byteIndex = andOffset + y * andStride + Math.floor(x / 8)
        dib[byteIndex] |= 1 << (7 - (x % 8))
      }
    }

    const entry = Buffer.alloc(16)
    entry.writeUInt8(width >= 256 ? 0 : width, 0)
    entry.writeUInt8(height >= 256 ? 0 : height, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(dib.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += dib.length
    entries.push(entry)
    payloads.push(dib)
  }

  return Buffer.concat([header, ...entries, ...payloads])
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox']
})
const page = await browser.newPage({ deviceScaleFactor: 1 })

async function rasterizePng(fill, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(pageHtml(markMarkup(fill, size), size))
  await page.waitForTimeout(100)
  return page.screenshot({ type: 'png', omitBackground: true })
}

async function rasterizeRgba(fill, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(pageHtml(markMarkup(fill, size), size))
  await page.waitForTimeout(100)
  const data = await page.evaluate(async (s) => {
    const svgEl = document.querySelector('svg')
    if (svgEl === null) throw new Error('svg missing')
    const xml = new XMLSerializer().serializeToString(svgEl)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('svg rasterize failed'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = s
    canvas.height = s
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('2d context missing')
    ctx.drawImage(img, 0, 0, s, s)
    URL.revokeObjectURL(url)
    return Array.from(ctx.getImageData(0, 0, s, s).data)
  }, size)
  return { width: size, height: size, rgba: Uint8Array.from(data) }
}

const resourcesDir = join(ROOT, 'resources')
const buildDir = join(ROOT, 'build')
await mkdir(resourcesDir, { recursive: true })
await mkdir(buildDir, { recursive: true })

const appPng = await rasterizePng('#eef1f6', APP_ICON_SIZE)
const dest = join(resourcesDir, 'icon.png')
await writeFile(dest, appPng)
await copyFile(dest, join(buildDir, 'icon.png'))
console.log(`icon written: ${dest}`)

const installerImages = []
for (const size of INSTALLER_ICO_SIZES) {
  installerImages.push(await rasterizeRgba('#0f1115', size))
}
const installerPng = await rasterizePng('#0f1115', 256)
await writeFile(join(buildDir, 'installerHeaderIcon.png'), installerPng)

const installerIco = encodeIco(installerImages)
const headerIco = join(buildDir, 'installerHeaderIcon.ico')
await writeFile(headerIco, installerIco)
console.log(`installer icon written: ${headerIco}`)

await browser.close()
