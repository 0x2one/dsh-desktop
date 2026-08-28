/**
 * Verification of launch-time profile detection & initialization
 * (`profile-setup.ts`), mirroring exactly what the main process runs in
 * `app.whenReady` before creating the window:
 *
 *   1. Fresh environment (no harness home at all) → initialization creates a
 *      complete `profiles/dsh-desktop` (manifest + patch + pnpm-workspace).
 *   2. Stale profile (manifest missing the web bundles, e.g. created by an
 *      older build) → launch-time init repairs it.
 *   3. Already-complete profile → launch-time init is a no-op (idempotent).
 *
 * Run: node scripts/verify-profile-setup.mjs
 */

import { build } from 'esbuild'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOME = mkdtempSync(join(tmpdir(), 'dsh-desktop-profile-'))
const DSH_HOME = join(HOME, '.dsh')
const PROFILE = join(DSH_HOME, 'profiles', 'dsh-desktop')
const BUNDLED = join(HOME, 'profile-setup.mjs')

const REPORT = []
function step(name, fn) {
  try {
    fn()
    REPORT.push(`[ok]   ${name}`)
  } catch (error) {
    REPORT.push(`[FAIL] ${name}: ${error.message}`)
    throw error
  }
}

// Bundle the profile-setup logic (no electron dependency) and load it with
// the temp DSH_HOME.
await build({
  entryPoints: [join(ROOT, 'src', 'main', 'profile-setup.ts')],
  outfile: BUNDLED,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  logLevel: 'silent',
})
const mod = await import(`${pathToFileURL(BUNDLED).href}?t=${Date.now()}`)
process.env.DSH_HOME = DSH_HOME

// ---- Scenario 1: fresh environment ----
step('scenario 1: fresh home — prepareAppProfile creates the profile', () => {
  const dir = mod.prepareAppProfile()
  if (!existsSync(join(dir, 'package.json'))) throw new Error('package.json missing')
  if (!existsSync(join(dir, 'cordis.patch.yml'))) throw new Error('cordis.patch.yml missing')
  if (!existsSync(join(dir, 'pnpm-workspace.yaml'))) throw new Error('pnpm-workspace.yaml missing')
})

step('scenario 1: manifest lists base + web-app bundles with live reload', () => {
  const manifest = JSON.parse(readFileSync(join(PROFILE, 'package.json'), 'utf8'))
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles) || !bundles.includes('@deepseek-ai/dsh-base')) {
    throw new Error(`missing dsh-base: ${JSON.stringify(bundles)}`)
  }
  if (!Array.isArray(bundles) || !bundles.includes('@deepseek-ai/dsh-web-app')) {
    throw new Error(`missing dsh-web-app: ${JSON.stringify(bundles)}`)
  }
  if (manifest.dsh?.profile?.patchReload !== 'live') {
    throw new Error(`patchReload is ${manifest.dsh?.profile?.patchReload}, expected live`)
  }
})

step('scenario 1: patch layer is the harness template (empty [])', () => {
  const patch = readFileSync(join(PROFILE, 'cordis.patch.yml'), 'utf8')
  if (!patch.includes('[]')) throw new Error('template [] missing from patch')
})

// ---- Scenario 2: stale manifest missing web bundles ----
step('scenario 2: stale manifest — init repairs missing web bundles', () => {
  // Simulate an old build that created the profile with only dsh-base.
  writeFileSync(join(PROFILE, 'package.json'), JSON.stringify({
    name: 'dsh-profile-dsh-desktop',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'], patchReload: 'live' } },
  }, null, 2))
  const dir = mod.prepareAppProfile()
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const bundles = manifest.dsh?.profile?.bundles ?? []
  if (!bundles.includes('@deepseek-ai/dsh-web-app')) {
    throw new Error(`repair failed to add dsh-web-app: ${JSON.stringify(bundles)}`)
  }
  if (!bundles.includes('@deepseek-ai/dsh-base')) {
    throw new Error(`repair dropped dsh-base: ${JSON.stringify(bundles)}`)
  }
})

// ---- Scenario 3: already-complete profile is untouched ----
step('scenario 3: complete profile — init is a no-op (idempotent)', () => {
  const before = readFileSync(join(PROFILE, 'package.json'), 'utf8')
  mod.prepareAppProfile()
  const after = readFileSync(join(PROFILE, 'package.json'), 'utf8')
  if (before !== after) throw new Error('profile manifest changed despite being complete')
})

console.log('\n--- profile-setup verification report ---')
console.log(REPORT.join('\n'))
console.log(`\n${REPORT.every((s) => s.startsWith('[ok]')) ? 'PASS' : 'FAIL'}`)

rmSync(HOME, { recursive: true, force: true })
