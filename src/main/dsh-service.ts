/**
 * Embedded DeepSeek Harness web service process.
 *
 * Spawns `npx --yes @deepseek-ai/dsh@0.1.1-rc.2 --profile dsh-desktop
 * --no-open --port 0`, waits for the readiness line (`dsh web:
 * http://127.0.0.1:<port>`), and owns the child's lifecycle (stop on quit,
 * process-tree kill on Windows).
 *
 * The app boots the harness on its own profile (`~/.dsh/profiles/dsh-desktop`,
 * prepared by `profile-setup.ts`) instead of the user's `web` profile, so the
 * two never collide while sharing the same installed dependency tree through
 * the `profiles/node_modules` fallback — the same environment as a local
 * `dsh web` run. Our own integration artifacts (the cordis window-controls
 * plugin) are injected into that app profile by the plugin installer, never
 * by modifying the harness source.
 *
 * @module dsh-desktop/dsh-service
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { app } from 'electron'
import { APP_PROFILE, prepareAppProfile } from './profile-setup'

/** Fixed harness version per project requirements. */
export const DSH_VERSION = '0.1.1-rc.2'

/** Default ready timeout: first `npx` run downloads the package. */
const READY_TIMEOUT_MS = 180_000

/** The readiness line the web-app bundle prints once the server binds. */
const READY_LINE = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/

/** Lifecycle of the embedded service process. */
export type DshServiceState = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'

/** Callbacks delivered by the service. */
export interface DshServiceEvents {
  /** The server bound and printed its URL. */
  onReady: (url: string) => void
  /** The process exited on its own (not by a requested stop). */
  onUnexpectedExit: (code: number | null, signal: NodeJS.Signals | null) => void
  /** Startup failed (spawn error, timeout, or early exit). */
  onStartFailure: (message: string) => void
}

/** Managed `dsh web` child process. */
export class DshService {
  private child: ChildProcess | undefined
  private state: DshServiceState = 'stopped'
  private readyTimer: NodeJS.Timeout | undefined
  private stderrTail = ''
  private url: string | undefined

  constructor(private readonly events: DshServiceEvents) {}

  /** Current lifecycle state. */
  getState(): DshServiceState {
    return this.state
  }

  /** The last announced URL, when the service is running. */
  getUrl(): string | undefined {
    return this.url
  }

  /**
   * Start the service and await readiness.
   * @returns the ready URL.
   * @throws {Error} on spawn failure, startup timeout, or premature exit.
   */
  async start(): Promise<string> {
    if (this.state === 'running' && this.url !== undefined) return this.url
    if (this.state === 'starting') {
      throw new Error('dsh service is already starting')
    }
    if (this.child !== undefined) {
      // A previous failed run left a child; make sure it is gone first.
      this.killTree(this.child)
      this.child = undefined
    }

    this.state = 'starting'
    this.stderrTail = ''
    this.url = undefined

    // Prepare the app profile (manifest naming the web bundles) before the
    // harness boots; the harness heals the shared profiles/node_modules
    // fallback itself on first boot, so no pnpm install is needed.
    try {
      prepareAppProfile()
    } catch (error) {
      throw new Error(`failed to prepare the dsh-desktop profile: ${String(error)}`)
    }

    // Windows resolves npx through its .cmd shim; shell spawn is required
    // (CVE-2024-27980 hardening refuses .cmd without a shell).
    const command = 'npx'
    const args = ['--yes', `@deepseek-ai/dsh@${DSH_VERSION}`, '--profile', APP_PROFILE, '--no-open', '--port', '0']
    const child = spawn(command, args, {
      cwd: app.getAppPath(),
      env: {
        ...process.env,
        // Telemetry opt-out: ANY non-empty value disables (documented switch).
        DSH_TELEMETRY_DISABLED: '1',
      },
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child

    const ready = new Promise<string>((resolve, reject) => {
      let settled = false
      const settleReady = (value: string): void => {
        if (settled) return
        settled = true
        this.clearTimer()
        this.state = 'running'
        this.url = value
        // Announce readiness exactly once; the caller reacts (plugin
        // injection, window navigation) in the onReady callback.
        this.events.onReady(value)
        resolve(value)
      }
      const settleFail = (message: string): void => {
        if (settled) return
        settled = true
        this.clearTimer()
        reject(new Error(message))
      }

      this.readyTimer = setTimeout(() => {
        settleFail(
          `timed out waiting for dsh web to become ready after ${READY_TIMEOUT_MS / 1000}s`
          + (this.stderrTail !== '' ? `\n${this.stderrTail}` : ''),
        )
      }, READY_TIMEOUT_MS)

      const stdout = createInterface({ input: child.stdout! })
      stdout.on('line', (line) => {
        const match = READY_LINE.exec(line)
        if (match === null) return
        settleReady(match[1])
      })

      const stderr = createInterface({ input: child.stderr! })
      stderr.on('line', (line) => {
        this.stderrTail = `${this.stderrTail}${line}\n`.slice(-4000)
      })

      child.once('error', (error) => {
        this.state = 'failed'
        settleFail(`failed to spawn dsh web: ${error.message}`)
      })

      child.once('exit', (code, signal) => {
        if (this.state === 'stopping') return // requested shutdown
        this.state = 'failed'
        settleFail(
          `dsh web exited before becoming ready (code ${String(code)}, signal ${String(signal)})`
          + (this.stderrTail !== '' ? `\n${this.stderrTail}` : ''),
        )
      })
    })

    try {
      return await ready
    } catch (error) {
      this.state = 'failed'
      this.events.onStartFailure(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /**
   * Stop the service, killing the whole process tree (npx parent plus the dsh
   * child). Resolves once the child has exited.
   */
  async stop(): Promise<void> {
    if (this.child === undefined || this.child.exitCode !== null) {
      this.state = 'stopped'
      return
    }
    this.state = 'stopping'
    this.clearTimer()
    const child = this.child
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve())
    })
    this.killTree(child)
    await exited
    this.child = undefined
    this.state = 'stopped'
  }

  private clearTimer(): void {
    if (this.readyTimer !== undefined) {
      clearTimeout(this.readyTimer)
      this.readyTimer = undefined
    }
  }

  /**
   * Terminate a spawned tree. On Windows, `taskkill /T /F` kills descendants
   * (npx spawns the dsh node process); elsewhere SIGTERM then SIGKILL.
   */
  private killTree(child: ChildProcess): void {
    const pid = child.pid
    if (pid === undefined) return
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
          shell: false,
        })
        return
      } catch {
        // Fall through to signal-based kill below.
      }
    }
    child.kill('SIGTERM')
    // Hard-kill shortly after if the graceful signal did not land.
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, 3000).unref()
  }
}
