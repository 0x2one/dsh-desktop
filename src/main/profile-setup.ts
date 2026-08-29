/**
 * Programmatic setup of the dsh-desktop harness profile.
 *
 * The app runs the harness on its own profile (`~/.dsh/profiles/dsh-desktop`)
 * instead of the user's `web` profile, so the two never collide: the app's
 * plugin injection and any future app-owned rows stay out of the user's
 * profile, while both share the same installed dependency tree through the
 * harness's `profiles/node_modules` fallback ("same environment as the local
 * dsh").
 *
 * The profile is prepared without pnpm: the harness Loader resolves bundle
 * packages through the shared `profiles/node_modules` fallback that the
 * harness heals from its own installation, so no network install is needed.
 * We only write the profile manifest naming the web bundles; the harness
 * `dsh --profile dsh-desktop` boot then heals the fallback and composes the
 * bundles exactly like the shipped `web` template.
 *
 * @module dsh-desktop/profile-setup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** The app's harness profile name (a sibling of `web` under profiles/). */
export const APP_PROFILE = 'dsh-desktop'

/** Bundle layers the profile needs, mirroring the shipped `web` template. */
export const APP_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

/** Profile patch reload lifecycle: live so injected entries hot-load. */
const PROFILE_PATCH_RELOAD = 'live'

/** The harness home (`$DSH_HOME`, falling back to `~/.dsh`). */
export function resolveDshHome(): string {
  const configured = process.env.DSH_HOME
  if (configured !== undefined && configured.trim() !== '') {
    return configured.replace(/^~(?=[\\/]|$)/, homedir())
  }
  return join(homedir(), '.dsh')
}

/** Absolute directory of a named harness profile. */
export function profileDir(name: string, home: string = resolveDshHome()): string {
  return join(home, 'profiles', name)
}

/** Absolute `cordis.patch.yml` of a named harness profile. */
export function profilePatchPath(name: string, home: string = resolveDshHome()): string {
  return join(profileDir(name, home), 'cordis.patch.yml')
}

/** Absolute directory of the app's default profile (`dsh-desktop`). */
export function appProfileDir(home: string = resolveDshHome()): string {
  return profileDir(APP_PROFILE, home)
}

/** Absolute patch file of the app's default profile. */
export function appProfilePatchPath(home: string = resolveDshHome()): string {
  return profilePatchPath(APP_PROFILE, home)
}

const PROFILE_PATCH_TEMPLATE = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`

const PROFILE_PNPM_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

/** dsh profile directory names: lowercase letter or digit, then [a-z0-9-]* */
export const PROFILE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/**
 * Normalize and validate a harness profile name.
 * @throws {Error} when the name is empty, reserved, or not a legal id.
 */
export function normalizeProfileName(raw: string): string {
  const name = raw.trim().toLowerCase()
  if (name === '') throw new Error('请输入环境名称')
  if (name === 'node_modules') throw new Error('该名称不可用')
  if (!PROFILE_NAME_PATTERN.test(name)) {
    throw new Error('名称须以小写字母或数字开头，只能包含小写字母、数字和连字符')
  }
  if (name.length > 64) throw new Error('名称过长（最多 64 个字符）')
  return name
}

function writeProfileSkeleton(dir: string, name: string): void {
  mkdirSync(dir, { recursive: true })

  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) {
    const manifest = {
      name: `dsh-profile-${name}`,
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...APP_PROFILE_BUNDLES], patchReload: PROFILE_PATCH_RELOAD } }
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
  }

  const patchPath = join(dir, 'cordis.patch.yml')
  if (!existsSync(patchPath)) writeFileSync(patchPath, PROFILE_PATCH_TEMPLATE)

  const workspacePath = join(dir, 'pnpm-workspace.yaml')
  if (!existsSync(workspacePath)) writeFileSync(workspacePath, PROFILE_PNPM_WORKSPACE)
}

/**
 * Create a new empty web-capable harness profile (same skeleton as dsh-desktop).
 * Does not overwrite an existing directory.
 * @returns the profile directory.
 */
export function createHarnessProfile(rawName: string, home: string = resolveDshHome()): string {
  const name = normalizeProfileName(rawName)
  const dir = profileDir(name, home)
  if (existsSync(dir)) throw new Error(`环境「${name}」已存在`)
  writeProfileSkeleton(dir, name)
  return dir
}

/**
 * Ensure the app profile exists with the web bundle layers. Idempotent:
 * existing files are preserved; the bundle list is only ever set on first
 * creation. Returns the profile directory.
 */
export function ensureAppProfile(home: string = resolveDshHome()): string {
  writeProfileSkeleton(appProfileDir(home), APP_PROFILE)
  return appProfileDir(home)
}

/**
 * Whether the profile manifest already lists the web bundle layers — used by
 * the launcher to detect a stale manifest (e.g. created before this module
 * existed) and repair it.
 */
export function appProfileHasWebBundles(home: string = resolveDshHome()): boolean {
  const manifestPath = join(appProfileDir(home), 'package.json')
  if (!existsSync(manifestPath)) return false
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dsh?: { profile?: { bundles?: unknown } }
    }
    const bundles = manifest.dsh?.profile?.bundles
    if (!Array.isArray(bundles)) return false
    return APP_PROFILE_BUNDLES.every((bundle) => bundles.includes(bundle))
  } catch {
    return false
  }
}

/**
 * Full profile preparation for launch: create the profile, then repair the
 * manifest if it predates this module (missing web bundles). A fresh profile
 * is created with the right bundles; an existing one that somehow lost them
 * is fixed by merging.
 */
export function prepareAppProfile(home: string = resolveDshHome()): string {
  const dir = ensureAppProfile(home)
  if (!appProfileHasWebBundles(home)) {
    const manifestPath = join(dir, 'package.json')
    let manifest: {
      dsh?: { profile?: { bundles?: string[]; patchReload?: string } }
    } = {}
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch {
      manifest = {}
    }
    const bundles = manifest.dsh?.profile?.bundles ?? []
    const merged = [...new Set([...APP_PROFILE_BUNDLES, ...bundles])]
    manifest.dsh = {
      ...manifest.dsh,
      profile: {
        ...manifest.dsh?.profile,
        bundles: merged,
        patchReload: PROFILE_PATCH_RELOAD
      }
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
  }
  return dir
}

/** Convenience: the patch path under a home (for the installer). */
export function profileDirname(home: string): string {
  return appProfileDir(home)
}
