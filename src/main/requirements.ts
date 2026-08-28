/**
 * Runtime requirement checks for dsh-desktop.
 *
 * The embedded DeepSeek Harness web service (`dsh web`) runs through
 * `npx @deepseek-ai/dsh@0.1.1-rc.2`, which requires Node.js (satisfying the
 * harness engines range) and pnpm on PATH. Before spawning the service we
 * verify both; a missing runtime is a user-facing installation prompt, not a
 * crash.
 *
 * @module dsh-desktop/requirements
 */

import { spawnSync } from 'node:child_process'

/** Minimum Node.js major that @deepseek-ai/dsh 0.1.1-rc.2 accepts. */
export const MIN_NODE_MAJOR = 22
/** Minimum Node.js minor for the 22.x line (engines: ^22.19.0 || >=24.0.0). */
export const MIN_NODE_MINOR_22 = 19

/** Result of the requirement probe. */
export interface RuntimeRequirements {
  /** Whether every required runtime is present and satisfies the version rules. */
  ok: boolean
  /** Human-readable Node.js version, e.g. `v22.19.0`. */
  nodeVersion?: string
  /** Human-readable pnpm version, e.g. `9.15.0`. */
  pnpmVersion?: string
  /** Names of the runtimes that are missing or unsatisfied (`node`, `pnpm`). */
  missing: string[]
  /** Installation guidance lines shown to the user, in the same order as `missing`. */
  guidance: string[]
}

/** Run one version probe through a shell (Windows resolves `.cmd` shims). */
function probeVersion(command: string, args: readonly string[]): string | undefined {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
    timeout: 15_000,
  })
  if (result.error !== undefined || result.status !== 0) return undefined
  return (result.stdout ?? '').trim().split(/\r?\n/)[0]?.trim() || undefined
}

/** Parse a `v22.19.0` / `22.19.0` string into [major, minor]. */
function parseVersion(version: string): { major: number; minor: number } | undefined {
  const match = /^v?(\d+)\.(\d+)/.exec(version)
  if (match === null) return undefined
  const major = Number(match[1])
  const minor = Number(match[2])
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return undefined
  return { major, minor }
}

/** Whether a parsed version satisfies the harness engines `^22.19.0 || >=24.0.0`. */
function satisfiesNodeEngines(parsed: { major: number; minor: number }): boolean {
  if (parsed.major === MIN_NODE_MAJOR) return parsed.minor >= MIN_NODE_MINOR_22
  return parsed.major >= 24
}

/**
 * Probe the runtime requirements.
 * @returns the probe result; never throws (a probe failure is a missing runtime).
 */
export function checkRuntimeRequirements(): RuntimeRequirements {
  const missing: string[] = []
  const guidance: string[] = []
  let nodeVersion: string | undefined
  let pnpmVersion: string | undefined

  const nodeRaw = probeVersion('node', ['--version'])
  if (nodeRaw === undefined) {
    missing.push('node')
    guidance.push(
      'Node.js is not installed or is not on PATH. Install Node.js 22.19+ (or 24+) from https://nodejs.org/, then restart dsh-desktop.',
    )
  } else {
    nodeVersion = nodeRaw
    const parsed = parseVersion(nodeRaw)
    if (parsed === undefined || !satisfiesNodeEngines(parsed)) {
      missing.push('node')
      guidance.push(
        `Node.js ${nodeRaw} is installed but too old for deepseek-harness. Install Node.js 22.19+ (or 24+) from https://nodejs.org/, then restart dsh-desktop.`,
      )
    }
  }

  const pnpmRaw = probeVersion('pnpm', ['--version'])
  if (pnpmRaw === undefined) {
    missing.push('pnpm')
    guidance.push(
      'pnpm is not installed or is not on PATH. Install it with `npm install -g pnpm`, then restart dsh-desktop.',
    )
  } else {
    pnpmVersion = pnpmRaw
  }

  return { ok: missing.length === 0, nodeVersion, pnpmVersion, missing, guidance }
}
