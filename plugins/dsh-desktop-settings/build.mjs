/**
 * Build script for the @dsh-desktop/settings cordis plugin.
 *
 * Produces the two halves the DeepSeek Harness plugin system consumes:
 *
 * - lib/index.js   — node half (ESM). Loaded by the host Loader as an
 *                    ordinary entry; the browser half is discovered from the
 *                    package's `dsh.client` declaration.
 * - lib/client.js  — browser half (CJS factory). Bundled with esbuild into
 *                    the exact shape the client-modules scanner expects:
 *                    `window.__ModuleLoader__.load({ id, factory })` where
 *                    factory(require) returns module.exports. Platform
 *                    modules (react, cordis, ui-slots, ...) stay external and
 *                    resolve through the loader's module table at runtime.
 *
 * @module @dsh-desktop/settings/build
 */

import { build, context } from 'esbuild'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const SRC = join(ROOT, 'src')
const OUT = join(ROOT, 'lib')

/** Platform modules shared by the harness shell (packages/client/web/src/platform.ts). */
const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives'
]

/** Browser half bundle id (the package name, stamped into the loader handoff). */
const PLUGIN_ID = '@dsh-desktop/settings'

/** Node-half ESM library config. */
const nodeHalf = {
  entryPoints: [join(SRC, 'index.ts')],
  outfile: join(OUT, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  external: [],
  sourcemap: false
}

/** Browser-half factory config with the loader banner/footer contract. */
const clientHalf = {
  entryPoints: [join(SRC, 'client', 'index.ts')],
  outfile: join(OUT, 'client.js'),
  bundle: true,
  format: 'iife',
  globalName: '__DSH_DESKTOP_SETTINGS_EXPORTS',
  platform: 'browser',
  target: 'es2020',
  external: PLATFORM_EXTERNALS,
  jsx: 'automatic',
  sourcemap: false,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {
var module = { exports: {} }; var exports = module.exports;`
  },
  footer: {
    js: '\nmodule.exports = typeof __DSH_DESKTOP_SETTINGS_EXPORTS !== "undefined" ? __DSH_DESKTOP_SETTINGS_EXPORTS : module.exports; return module.exports; } });'
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production')
  }
}

/** Build both halves once. */
export async function buildOnce() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  await Promise.all([build(nodeHalf), build(clientHalf)])
}

/** Watch mode for development. */
export async function watch() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const nodeCtx = await context(nodeHalf)
  const clientCtx = await context(clientHalf)
  await Promise.all([nodeCtx.watch(), clientCtx.watch()])
  process.stdout.write(`[desktop-settings] watching ${SRC} → ${OUT}\n`)
}

const watchFlag = process.argv.includes('--watch')
if (watchFlag) {
  await watch()
} else {
  await buildOnce()
  process.stdout.write(
    `[desktop-settings] built ${join(OUT, 'index.js')} + ${join(OUT, 'client.js')}\n`
  )
}
