/**
 * Regression verification for DshService child-exit classification.
 *
 * A child that exits before the ready line is a startup failure. A child that
 * exits after readiness is an unexpected runtime exit and must clear the
 * served URL plus notify the UI callback.
 *
 * Run: node scripts/verify-dsh-service.mjs
 */

import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ROOT = new URL('..', import.meta.url)
const TEMP = mkdtempSync(join(tmpdir(), 'dsh-desktop-service-'))
const BUNDLED = join(TEMP, 'dsh-service.mjs')
const ELECTRON_STUB = join(TEMP, 'electron-stub.mjs')

writeFileSync(
  ELECTRON_STUB,
  `export const app = {
  isPackaged: false,
  getAppPath: () => process.cwd(),
  getPath: () => process.cwd()
}
`
)

await build({
  entryPoints: [fileURLToPath(new URL('src/main/dsh-service.ts', ROOT))],
  outfile: BUNDLED,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  alias: { electron: ELECTRON_STUB },
  logLevel: 'silent'
})

const { DshService } = await import(`${pathToFileURL(BUNDLED).href}?t=${Date.now()}`)

class FakeChild extends EventEmitter {
  constructor(pid) {
    super()
    this.pid = pid
    this.exitCode = null
    this.signalCode = null
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
  }

  kill(signal = 'SIGTERM') {
    this.signalCode = signal
    this.emit('exit', null, signal)
    return true
  }

  exit(code, signal = null) {
    this.exitCode = code
    this.signalCode = signal
    this.emit('exit', code, signal)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function verifyRuntimeExit() {
  const child = new FakeChild(41001)
  const readyUrls = []
  const unexpected = []
  const startFailures = []
  const service = new DshService(
    {
      onReady: (url) => readyUrls.push(url),
      onUnexpectedExit: (code, signal) => unexpected.push({ code, signal }),
      onStartFailure: (message) => startFailures.push(message)
    },
    'runtime-exit-test',
    () => child
  )

  const starting = service.start()
  child.stdout.write('dsh web: http://127.0.0.1:43123\n')
  const url = await starting
  assert(url === 'http://127.0.0.1:43123', `unexpected ready URL: ${url}`)
  assert(service.getState() === 'running', `expected running, got ${service.getState()}`)

  child.exit(17)
  assert(service.getState() === 'failed', `expected failed, got ${service.getState()}`)
  assert(service.getUrl() === undefined, 'runtime exit left a stale URL')
  assert(readyUrls.length === 1, `onReady called ${readyUrls.length} times`)
  assert(unexpected.length === 1, `onUnexpectedExit called ${unexpected.length} times`)
  assert(unexpected[0].code === 17, `unexpected exit code: ${unexpected[0].code}`)
  assert(startFailures.length === 0, 'runtime exit was misreported as a startup failure')
}

async function verifyStartupExit() {
  const child = new FakeChild(41002)
  const unexpected = []
  const startFailures = []
  const service = new DshService(
    {
      onReady: () => {},
      onUnexpectedExit: (code, signal) => unexpected.push({ code, signal }),
      onStartFailure: (message) => startFailures.push(message)
    },
    'startup-exit-test',
    () => child
  )

  const starting = service.start()
  child.exit(2)
  await starting.then(
    () => {
      throw new Error('startup unexpectedly resolved')
    },
    (error) => {
      assert(String(error).includes('exited before becoming ready'), `wrong startup error: ${error}`)
    }
  )
  assert(service.getState() === 'failed', `expected failed, got ${service.getState()}`)
  assert(unexpected.length === 0, 'startup exit was misreported as a runtime exit')
  assert(startFailures.length === 1, `onStartFailure called ${startFailures.length} times`)
}

try {
  await verifyRuntimeExit()
  await verifyStartupExit()
  console.log('PASS: DshService distinguishes startup failure from unexpected runtime exit')
} finally {
  rmSync(TEMP, { recursive: true, force: true })
}
