/**
 * Preferred harness profile for the desktop app.
 *
 * Profiles live under `$DSH_HOME/profiles/`. The tray lists every directory
 * there (except `node_modules`); the last selection is stored in the Electron
 * userData folder so the next launch boots the same environment.
 *
 * @module dsh-desktop/profile-pref
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { APP_PROFILE, resolveDshHome } from './profile-setup'

/** File under userData that remembers the last selected profile. */
function prefPath(): string {
  return join(app.getPath('userData'), 'profile.json')
}

/**
 * Names of harness profiles on disk.
 * `dsh-desktop` is always first (and always present in the list); other
 * directories under `profiles/` follow alphabetically. `node_modules` is skipped.
 */
export function listProfiles(home: string = resolveDshHome()): string[] {
  const names = new Set<string>([APP_PROFILE])
  const root = join(home, 'profiles')
  if (!existsSync(root)) return [APP_PROFILE]
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules') continue
      names.add(entry.name)
    }
  } catch {
    return [APP_PROFILE]
  }
  const rest = [...names].filter((name) => name !== APP_PROFILE).sort()
  return [APP_PROFILE, ...rest]
}

/**
 * The profile to boot: the saved preference when it still exists on disk,
 * otherwise `dsh-desktop`.
 */
export function loadPreferredProfile(): string {
  const available = listProfiles()
  try {
    const parsed = JSON.parse(readFileSync(prefPath(), 'utf8')) as { profile?: unknown }
    if (typeof parsed.profile === 'string' && available.includes(parsed.profile)) {
      return parsed.profile
    }
  } catch {
    // Missing or malformed file — fall through to the default.
  }
  return APP_PROFILE
}

/** Persist the selected profile for the next launch. */
export function savePreferredProfile(name: string): void {
  const path = prefPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ profile: name }, undefined, 2)}\n`)
}
