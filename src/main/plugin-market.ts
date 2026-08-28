/**
 * Bootstrap of the dshmarket plugin into the app's harness profile.
 *
 * The desktop app boots the harness on its own profile (`dsh-desktop`, see
 * `profile-setup.ts`), so the plugin market shipped by the `dshmarket` npm
 * package only appears in the desktop UI when it is installed into that
 * profile — the user's `web` profile is never touched.
 *
 * On launch we check whether the profile already has dshmarket; if not, we run
 * the harness's own plugin manager (`dsh plugin --profile dsh-desktop add
 * dshmarket`, which initializes the profile, forwards to pnpm, and reconciles
 * the profile's `dsh.profile.bundles` layer list) and block startup until it
 * finishes, so the market is present on this very launch.
 *
 * @module dsh-desktop/plugin-market
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_PROFILE, appProfileDir } from './profile-setup'
import { DSH_VERSION } from './dsh-service'

/** Package name of the plugin market, as resolved by `dsh plugin add`. */
export const MARKET_PACKAGE = 'dshmarket'

/** Default install budget: first pnpm run may fetch the registry + build. */
const INSTALL_TIMEOUT_MS = 5 * 60_000

/** Result of the market bootstrap. */
export interface MarketBootstrapResult {
  /** Whether dshmarket is present after the call. */
  installed: boolean
  /** Whether the installation step ran in this call (false when already present). */
  ranInstall: boolean
  /** Non-empty when something went wrong but startup should continue. */
  error?: string
}

/**
 * Whether the profile already declares and resolves dshmarket. The profile
 * manifest lists installed bundles in `dsh.profile.bundles` (maintained by
 * `dsh plugin`), and pnpm places the package under the profile's hoisted
 * `node_modules`; checking both keeps the probe honest when the manifest is
 * stale or the install was interrupted.
 * @returns true when the package is declared and resolvable.
 */
export function isMarketInstalled(home?: string): boolean {
  const dir = appProfileDir(home)
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dsh?: { profile?: { bundles?: unknown } }
      dependencies?: Record<string, unknown>
    }
    const bundles = manifest.dsh?.profile?.bundles
    const dependencies = manifest.dependencies ?? {}
    const declared =
      (Array.isArray(bundles) && bundles.includes(MARKET_PACKAGE)) ||
      Object.prototype.hasOwnProperty.call(dependencies, MARKET_PACKAGE)
    const resolvable = existsSync(join(dir, 'node_modules', MARKET_PACKAGE, 'package.json'))
    return declared && resolvable
  } catch {
    return false
  }
}

/**
 * Install dshmarket into the app profile through the harness's own plugin
 * manager. The command is `npx --yes @deepseek-ai/dsh@<DSH_VERSION> plugin
 * --profile dsh-desktop add dshmarket` — the same pinned harness version the
 * app boots with, so no global `dsh` install is required and the CLI matches
 * the booted tree. The harness initializes the profile if needed, forwards to
 * `pnpm add dshmarket` inside the profile directory, and reconciles the
 * bundle layer list.
 * @returns the captured stderr ("" on success).
 */
export function installMarket(home?: string): Promise<string> {
  const dir = appProfileDir(home)

  // Windows resolves npx through its .cmd shim; a shell spawn is required
  // (CVE-2024-27980 hardening refuses .cmd without a shell), mirroring the
  // npx spawn in dsh-service.ts.
  const command = 'npx'
  const args = [
    '--yes',
    `@deepseek-ai/dsh@${DSH_VERSION}`,
    'plugin',
    '--profile',
    APP_PROFILE,
    'add',
    MARKET_PACKAGE
  ]

  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: dir,
      env: {
        ...process.env,
        // Let pnpm reach the registry through any proxy configured for the
        // app's environment; nothing extra to set here.
        DSH_TELEMETRY_DISABLED: '1'
      },
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdoutTail = ''
    let stderrTail = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutTail = `${stdoutTail}${chunk.toString()}`.slice(-4000)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = `${stderrTail}${chunk.toString()}`.slice(-4000)
    })

    const timer = setTimeout(() => {
      killTree(child)
      reject(
        new Error(`timed out installing ${MARKET_PACKAGE} after ${INSTALL_TIMEOUT_MS / 1000}s`)
      )
    }, INSTALL_TIMEOUT_MS)

    child.once('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`failed to spawn ${command}: ${error.message}`))
    })

    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve('')
        return
      }
      reject(
        new Error(
          `npx @deepseek-ai/dsh@${DSH_VERSION} plugin add ${MARKET_PACKAGE} exited with code ${String(code)} (signal ${String(signal)})` +
            (stderrTail !== '' ? `\n${stderrTail}` : '') +
            (stdoutTail !== '' ? `\n${stdoutTail}` : '')
        )
      )
    })
  })
}

/**
 * Terminate a spawned tree: on Windows `taskkill /T /F` kills descendants
 * (npx spawns the dsh node process, which spawns pnpm); elsewhere SIGTERM
 * then SIGKILL. Mirrors `DshService.killTree`.
 */
function killTree(child: ReturnType<typeof spawn>): void {
  const pid = child.pid
  if (pid === undefined) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        shell: false
      })
      return
    } catch {
      // Fall through to signal-based kill below.
    }
  }
  child.kill('SIGTERM')
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }, 3000).unref()
}

/**
 * Full bootstrap: check for dshmarket and install it when missing, blocking
 * until the install finishes (per project requirements the market must be
 * present for this launch).
 * @returns the bootstrap result; never throws — an install failure is
 * reported in `error` and startup continues.
 */
export async function ensureMarketInstalled(home?: string): Promise<MarketBootstrapResult> {
  if (isMarketInstalled(home)) {
    return { installed: true, ranInstall: false }
  }
  try {
    await installMarket(home)
    return { installed: isMarketInstalled(home), ranInstall: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[dsh-desktop] failed to install ${MARKET_PACKAGE}:`, error)
    return { installed: false, ranInstall: true, error: message }
  }
}
