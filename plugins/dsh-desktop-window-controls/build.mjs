/**
 * Build script for the @dsh-desktop/window-controls cordis plugin.
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
 * The browser bundle purity rule is respected: the only imports that survive
 * bundling are the platform module externals; every other @deepseek-ai
 * import is type-only and erased.
 *
 * @module @dsh-desktop/window-controls/build
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
  '@deepseek-ai/dsh-client-ui-primitives',
]

/** Browser half bundle id (the package name, stamped into the loader handoff). */
const PLUGIN_ID = '@dsh-desktop/window-controls'

/** Node-half ESM library config. */
const nodeHalf = {
  entryPoints: [join(SRC, 'index.ts')],
  outfile: join(OUT, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  // The node half has no runtime dependencies (apply is empty).
  external: [],
  sourcemap: false,
}

/** Browser-half factory config with the loader banner/footer contract. */
const clientHalf = {
  entryPoints: [join(SRC, 'client', 'index.ts')],
  outfile: join(OUT, 'client.js'),
  bundle: true,
  // The harness loader evaluates the bundle as a CJS factory:
  // `factory(require) => module.exports`. esbuild's CJS output keeps exports
  // inside its own __commonJS scope the footer cannot reach, so we emit an
  // IIFE captured into a global and hand that object to module.exports in the
  // footer (mirroring tsdown's intro/banner/footer contract exactly).
  format: 'iife',
  globalName: '__DSH_WINDOW_CONTROLS_EXPORTS',
  platform: 'browser',
  target: 'es2020',
  external: PLATFORM_EXTERNALS,
  jsx: 'automatic',
  sourcemap: false,
  banner: {
    // The loader's module table evaluates the factory with a `require` that
    // answers platform modules; `module`/`exports` mirror tsdown's intro so
    // the factory can assign its exports. Banner text runs before the
    // bundle body, which is the intro position here.
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {
var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: '\nmodule.exports = typeof __DSH_WINDOW_CONTROLS_EXPORTS !== "undefined" ? __DSH_WINDOW_CONTROLS_EXPORTS : module.exports; return module.exports; } });',
  },
  // Define the same env substitutes tsdown applies so inlined libs behave.
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
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
  process.stdout.write(`[window-controls] watching ${SRC} → ${OUT}\n`)
}

const watchFlag = process.argv.includes('--watch')
if (watchFlag) {
  await watch()
} else {
  await buildOnce()
  process.stdout.write(`[window-controls] built ${join(OUT, 'index.js')} + ${join(OUT, 'client.js')}\n`)
}
