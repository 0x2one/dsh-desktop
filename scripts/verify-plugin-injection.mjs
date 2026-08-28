/**
 * End-to-end verification of the plugin injection flow, run against a
 * throwaway DSH_HOME so real user data is never touched.
 *
 * Steps:
 *   1. Build the plugin (lib/ must exist).
 *   2. Create a temp harness home with a pre-existing web profile that has
 *      realistic user patch content (MCP servers, disabled rows).
 *   3. Run the injection logic (the same functions the main process calls).
 *   4. Assert the patch file is valid and the plugin package is in place.
 *   5. Boot the real `dsh web` against that home and confirm the plugin entry
 *      mounts without a loader failure (the harness prints the ready line).
 *
 * Run: node scripts/verify-plugin-injection.mjs
 */

import { build } from 'esbuild'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOME = mkdtempSync(join(tmpdir(), 'dsh-desktop-verify-'))
const DSH_HOME = join(HOME, '.dsh')
const PROFILE = join(DSH_HOME, 'profiles', 'dsh-desktop')
const BUNDLED = join(HOME, 'plugin-install.mjs')

// The harness's own template patch layer: comment header then an empty
// `[]` array document. The injector must replace the trailing `[]` (a `[]`
// closes the YAML document, so `- insert:` cannot follow it) while keeping
// the comment header.
const USER_PATCH = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`

const REPORT = {
  steps: [],
}

function step(name, fn) {
  try {
    fn()
    REPORT.steps.push(`[ok]   ${name}`)
  } catch (error) {
    REPORT.steps.push(`[FAIL] ${name}: ${error.message}`)
    throw error
  }
}

// 2. Seed a realistic web profile.
mkdirSync(PROFILE, { recursive: true })
writeFileSync(join(PROFILE, 'package.json'), JSON.stringify({
  name: 'dsh-profile-web',
  private: true,
  dependencies: {},
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], patchReload: 'live' } },
}, null, 2))
writeFileSync(join(PROFILE, 'cordis.patch.yml'), USER_PATCH)

// 3. Bundle the injection logic (electron external — not needed for the fs work).
await build({
  entryPoints: [join(ROOT, 'src', 'main', 'plugin-install.ts')],
  outfile: BUNDLED,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  external: ['electron'],
  logLevel: 'silent',
})
const { ensurePluginsInstalled, WINDOW_CONTROLS_ENTRY_ID } = await import(`${pathToFileURL(BUNDLED).href}?t=${Date.now()}`)

process.env.DSH_DESKTOP_PLUGINS_ROOT = join(ROOT, 'plugins')
process.env.DSH_HOME = DSH_HOME

step('plugin build artifacts exist', () => {
  const client = join(ROOT, 'plugins', 'dsh-desktop-window-controls', 'lib', 'client.js')
  const node = join(ROOT, 'plugins', 'dsh-desktop-window-controls', 'lib', 'index.js')
  if (!existsSync(client) || !existsSync(node)) {
    throw new Error('run `pnpm run build:plugin` first')
  }
})

let injected = false
step('injection runs', () => {
  injected = ensurePluginsInstalled(DSH_HOME)
  if (!injected) throw new Error('ensurePluginsInstalled returned false')
})

step('plugin package copied into profile node_modules', () => {
  const target = join(PROFILE, 'node_modules', '@dsh-desktop', 'window-controls', 'package.json')
  if (!existsSync(target)) throw new Error(`missing ${target}`)
  const manifest = JSON.parse(readFileSync(target, 'utf8'))
  if (manifest.name !== '@dsh-desktop/window-controls') throw new Error('wrong package copied')
})

step('template [] replaced, comment header kept', () => {
  const patch = readFileSync(join(PROFILE, 'cordis.patch.yml'), 'utf8')
  if (!patch.includes('Your patch layer')) throw new Error('comment header was removed')
  if (patch.includes('[]')) throw new Error('empty [] array still present — invalid YAML with following rows')
  if (!patch.includes(WINDOW_CONTROLS_ENTRY_ID)) throw new Error('window-controls entry missing')
  if (!patch.includes('- insert:')) throw new Error('insert block missing')
})

step('user rows appended later are preserved across injection', () => {
  // Simulate the user adding MCP rows after our first injection, then run
  // injection again: user content must stay, no duplicate entry.
  const before = readFileSync(join(PROFILE, 'cordis.patch.yml'), 'utf8')
  const withUser = `${before.replace(/\s+$/, '')}

# dsh-mcp-panel: add server
- insert:
    - id: mcp-context7
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: context7
        transport: streamable-http
        url: https://mcp.context7.com/mcp

- id: dsh-any-background
  disabled: true
`
  writeFileSync(join(PROFILE, 'cordis.patch.yml'), withUser)
  const again = ensurePluginsInstalled(DSH_HOME)
  if (!again) throw new Error('re-injection returned false')
  const after = readFileSync(join(PROFILE, 'cordis.patch.yml'), 'utf8')
  if (!after.includes('mcp-context7')) throw new Error('user MCP entry was removed')
  if (!after.includes('dsh-any-background')) throw new Error('user disabled row was removed')
  const count = after.split(WINDOW_CONTROLS_ENTRY_ID).length - 1
  if (count !== 1) throw new Error(`entry appears ${count} times, expected 1`)
})

step('injection is idempotent (third run appends nothing)', () => {
  const before = readFileSync(join(PROFILE, 'cordis.patch.yml'), 'utf8')
  const again = ensurePluginsInstalled(DSH_HOME)
  if (!again) throw new Error('third run returned false')
  const after = readFileSync(join(PROFILE, 'cordis.patch.yml'), 'utf8')
  if (before !== after) throw new Error('patch changed on third run')
})

// 5. Boot the real dsh web against the temp home.
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
  let stderr = ''
  const errLines = createInterface({ input: child.stderr })
  errLines.on('line', (line) => { stderr = `${stderr}${line}\n`.slice(-4000) })
  const outLines = createInterface({ input: child.stdout })
  outLines.on('line', (line) => {
    process.stdout.write(`  [dsh web] ${line}\n`)
    if (/dsh web: http:\/\/127\.0\.0\.1:\d+/.test(line)) {
      clearTimeout(timer)
      resolve({ child, stderr })
    }
  })
  child.once('exit', (code) => {
    clearTimeout(timer)
    reject(new Error(`dsh web exited early (code ${String(code)})\n${stderr}`))
  })
})

let boot = null
try {
  boot = await ready
  step('dsh web boots with the injected plugin present', () => {
    if (boot.stderr.includes('window-controls') && boot.stderr.includes('failed')) {
      throw new Error(`loader reported a window-controls failure:\n${boot.stderr}`)
    }
  })
} finally {
  if (boot?.child) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(boot.child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } else {
      boot.child.kill('SIGTERM')
    }
  }
  // Cleanup.
  await new Promise((r) => setTimeout(r, 500))
  rmSync(HOME, { recursive: true, force: true })
}

console.log('\n--- verification report ---')
console.log(REPORT.steps.join('\n'))
console.log(`\n${REPORT.steps.every((s) => s.startsWith('[ok]')) ? 'PASS' : 'FAIL'}`)
