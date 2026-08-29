/**
 * Bootstrap of the dshmarket plugin into a harness profile.
 *
 * The plugin market only appears in the desktop UI when `dshmarket` is
 * installed into the profile currently being booted. The default
 * `dsh-desktop` profile is seeded on first launch; environments created
 * from the tray also get the same install. The user's `web` profile is
 * never touched unless they create/select it through this app.
 *
 * Check whether the target profile already has dshmarket; if not, run the
 * harness's own plugin manager (`dsh plugin --profile <name> add dshmarket`,
 * which initializes the profile, forwards to pnpm, and reconciles
 * `dsh.profile.bundles`) and block until it finishes.
 *
 * @module dsh-desktop/plugin-market
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_PROFILE, profileDir } from './profile-setup'
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

function targetDir(home: string | undefined, profile: string): string {
  return home === undefined ? profileDir(profile) : profileDir(profile, home)
}

/**
 * Whether the profile already declares and resolves dshmarket. The profile
 * manifest lists installed bundles in `dsh.profile.bundles` (maintained by
 * `dsh plugin`), and pnpm places the package under the profile's hoisted
 * `node_modules`; checking both keeps the probe honest when the manifest is
 * stale or the install was interrupted.
 * @returns true when the package is declared and resolvable.
 */
export function isMarketInstalled(home?: string, profile: string = APP_PROFILE): boolean {
  const dir = targetDir(home, profile)
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
 * Install dshmarket into a harness profile through the harness's own plugin
 * manager. The command is `npx --yes @deepseek-ai/dsh@<DSH_VERSION> plugin
 * --profile <name> add dshmarket` — the same pinned harness version the app
 * boots with, so no global `dsh` install is required and the CLI matches the
 * booted tree. The harness initializes the profile if needed, forwards to
 * `pnpm add dshmarket` inside the profile directory, and reconciles the
 * bundle layer list.
 * @returns the captured stderr ("" on success).
 */
export function installMarket(home?: string, profile: string = APP_PROFILE): Promise<string> {
  const dir = targetDir(home, profile)

  // Windows resolves npx through its .cmd shim; a shell spawn is required
  // (CVE-2024-27980 hardening refuses .cmd without a shell), mirroring the
  // npx spawn in dsh-service.ts.
  const command = 'npx'
  const args = [
    '--yes',
    `@deepseek-ai/dsh@${DSH_VERSION}`,
    'plugin',
    '--profile',
    profile,
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
 * Full bootstrap: check for dshmarket in the given profile and install it
 * when missing, blocking until the install finishes.
 * @returns the bootstrap result; never throws — an install failure is
 * reported in `error` and the caller continues.
 */
export async function ensureMarketInstalled(
  home?: string,
  profile: string = APP_PROFILE
): Promise<MarketBootstrapResult> {
  if (isMarketInstalled(home, profile)) {
    return { installed: true, ranInstall: false }
  }
  try {
    await installMarket(home, profile)
    return { installed: isMarketInstalled(home, profile), ranInstall: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[dsh-desktop] failed to install ${MARKET_PACKAGE} into ${profile}:`, error)
    return { installed: false, ranInstall: true, error: message }
  }
}
