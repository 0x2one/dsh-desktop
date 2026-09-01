/**
 * Injection of the dsh-desktop cordis plugins into the app's harness profile.
 *
 * The app boots the harness on its own profile (`~/.dsh/profiles/dsh-desktop`,
 * see `profile-setup.ts`) rather than the user's `web` profile. Its Loader
 * resolves bare plugin names through Node module resolution rooted at the
 * profile directory (plus the shared `profiles/node_modules` fallback), and
 * the profile's user patch layer (`cordis.patch.yml`) is a top-level YAML
 * array of loader patch entries.
 *
 * This module installs our desktop cordis plugins without touching the
 * harness source: it copies each built plugin package into the app profile's
 * node_modules and appends an `insert` entry to the user patch layer. Both
 * steps are idempotent, and the app profile's `patchReload: live` picks the
 * new entries up without a restart.
 *
 * @module dsh-desktop/plugin-install
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import {
  APP_PROFILE,
  profileDir,
  profilePatchPath,
  resolveDshHome as resolveProfileHome
} from './profile-setup'

/** Plugin package name (matches plugins/dsh-desktop-window-controls/package.json). */
export const WINDOW_CONTROLS_PACKAGE = '@dsh-desktop/window-controls'

/** Loader entry id for the window-controls plugin. */
export const WINDOW_CONTROLS_ENTRY_ID = 'dsh-desktop-window-controls'

/** Plugin package name (matches plugins/dsh-desktop-settings/package.json). */
export const SETTINGS_PACKAGE = '@dsh-desktop/settings'

/** Loader entry id for the desktop settings plugin. */
export const SETTINGS_ENTRY_ID = 'dsh-desktop-settings'

/**
 * Env flag set only when the Electron app spawns `dsh web`. Console
 * `dsh --profile dsh-desktop` does not set it, so the loader disables these
 * entries and the client bundles never enter `__DSH_BOOT__`.
 */
export const DSH_DESKTOP_ENV = 'DSH_DESKTOP'

/** `!!js` expression: disable unless the Electron app set {@link DSH_DESKTOP_ENV}. */
const DESKTOP_ONLY_DISABLED_JS = `process.env.${DSH_DESKTOP_ENV} !== '1'`

/** One cordis plugin the desktop app injects into the harness profile. */
export interface DesktopPluginSpec {
  /** Directory name under `plugins/`. */
  rel: string
  /** npm package name copied into profile `node_modules`. */
  packageName: string
  /** Loader entry id written to `cordis.patch.yml`. */
  entryId: string
}

/** Plugins injected into every desktop profile. */
export const DESKTOP_PLUGINS: readonly DesktopPluginSpec[] = [
  {
    rel: 'dsh-desktop-window-controls',
    packageName: WINDOW_CONTROLS_PACKAGE,
    entryId: WINDOW_CONTROLS_ENTRY_ID
  },
  {
    rel: 'dsh-desktop-settings',
    packageName: SETTINGS_PACKAGE,
    entryId: SETTINGS_ENTRY_ID
  }
]

/**
 * Absolute source tree of built plugins. Resolved in order:
 * 1. `DSH_DESKTOP_PLUGINS_ROOT` (set by the main process; in development it
 *    points at the repository `plugins/` directory, in packaged builds at
 *    `resources/plugins`).
 * 2. `process.resourcesPath/plugins` for packaged apps when the env override
 *    is absent.
 * 3. The repository checkout next to the app path.
 */
function pluginsSourceRoot(): string {
  const override = process.env.DSH_DESKTOP_PLUGINS_ROOT
  if (override !== undefined && override.trim() !== '' && sourceHasAnyPlugin(override)) {
    return override
  }
  const packaged =
    process.resourcesPath !== undefined ? join(process.resourcesPath, 'plugins') : undefined
  if (packaged !== undefined && sourceHasAnyPlugin(packaged)) return packaged
  return join(process.cwd(), 'plugins')
}

/** True when `root` contains at least one desktop plugin package. */
function sourceHasAnyPlugin(root: string): boolean {
  return DESKTOP_PLUGINS.some((plugin) => existsSync(join(root, plugin.rel, 'package.json')))
}

/**
 * The harness home (`$DSH_HOME`, falling back to `~/.dsh`).
 * @deprecated use `resolveDshHome` from `./profile-setup` (kept as an alias
 * for the verification scripts that import this module).
 */
export function defaultDshHome(): string {
  return resolveProfileHome()
}

/** Absolute node_modules target for one plugin package. */
function pluginTargetDir(plugin: DesktopPluginSpec, home: string, profile: string): string {
  return join(profileDir(profile, home), 'node_modules', plugin.packageName)
}

/** Whether every built plugin source exists (used to skip silently in dev). */
export function pluginBuildExists(): boolean {
  const root = pluginsSourceRoot()
  return DESKTOP_PLUGINS.every((plugin) => existsSync(join(root, plugin.rel, 'package.json')))
}

/**
 * Copy one built plugin package into the profile's node_modules.
 * Recopies when the package version or the built `lib/client.js` bytes differ
 * (same version with a rebuilt bundle used to be skipped, leaving profiles
 * on a stale client that still called removed IPC).
 */
function installPluginPackage(plugin: DesktopPluginSpec, home: string, profile: string): boolean {
  const source = join(pluginsSourceRoot(), plugin.rel)
  const sourceManifest = join(source, 'package.json')
  if (!existsSync(sourceManifest)) return false

  const target = pluginTargetDir(plugin, home, profile)
  const targetManifest = join(target, 'package.json')
  const sourceVersion = readPackageVersion(sourceManifest)
  const targetVersion = existsSync(targetManifest) ? readPackageVersion(targetManifest) : undefined
  if (
    targetVersion === sourceVersion &&
    existsSync(join(target, 'lib', 'client.js')) &&
    clientBundleMatches(source, target)
  ) {
    return true
  }

  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target, { recursive: true, force: true })
  return existsSync(join(target, 'lib', 'client.js'))
}

/** True when source and target `lib/client.js` are byte-identical. */
function clientBundleMatches(source: string, target: string): boolean {
  const src = join(source, 'lib', 'client.js')
  const dst = join(target, 'lib', 'client.js')
  if (!existsSync(src) || !existsSync(dst)) return false
  try {
    return readFileSync(src).equals(readFileSync(dst))
  } catch {
    return false
  }
}

/**
 * Copy the built window-controls package into the profile's node_modules.
 * @param home - the harness home (defaults to `~/.dsh`).
 * @param profile - harness profile name (defaults to `dsh-desktop`).
 * @returns whether the plugin is present after the call.
 */
export function installWindowControlsPackage(
  home: string = defaultDshHome(),
  profile: string = APP_PROFILE
): boolean {
  const plugin = DESKTOP_PLUGINS.find((item) => item.entryId === WINDOW_CONTROLS_ENTRY_ID)
  if (plugin === undefined) return false
  return installPluginPackage(plugin, home, profile)
}

/** Read the `version` field of a package manifest. */
function readPackageVersion(manifestPath: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/** YAML patch block that inserts one desktop-only loader entry. */
function pluginPatchBlock(plugin: DesktopPluginSpec): string {
  return `- insert:
    - id: ${plugin.entryId}
      name: '${plugin.packageName}'
      disabled: !!js ${DESKTOP_ONLY_DISABLED_JS}
`
}

/**
 * If an older insert block for this plugin lacks the desktop-only `disabled`
 * expression, append it. Leaves already-upgraded (or hand-edited) rows alone.
 */
function withDesktopOnlyDisabled(content: string, plugin: DesktopPluginSpec): string {
  const escapedPkg = plugin.packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const already = new RegExp(
    `-\\s*id:\\s*${plugin.entryId}\\r?\\n\\s*name:\\s*['"]${escapedPkg}['"]\\r?\\n\\s*disabled:`
  ).test(content)
  if (already) return content
  const pattern = new RegExp(
    `(-\\s*id:\\s*${plugin.entryId}\\r?\\n\\s*name:\\s*['"]${escapedPkg}['"])`
  )
  if (!pattern.test(content)) return content
  return content.replace(pattern, `$1\n      disabled: !!js ${DESKTOP_ONLY_DISABLED_JS}`)
}

/**
 * Ensure one plugin's insert entry is in the patch text. Appends when missing,
 * upgrades a legacy row that lacks `disabled`.
 */
function applyPluginPatch(content: string, plugin: DesktopPluginSpec): string {
  if (content.includes(plugin.entryId)) {
    return withDesktopOnlyDisabled(content, plugin)
  }

  const body = content.replace(/\s+$/, '')
  const templateMatch = /\n?^\s*\[\]\s*$/m.exec(body)
  const block = pluginPatchBlock(plugin)
  if (templateMatch !== null) {
    return `${body.slice(0, templateMatch.index).replace(/\s+$/, '')}\n${block}`
  }
  return `${body}\n${block}`
}

/**
 * Append desktop plugin loader entries to the app profile's user patch
 * layer (`cordis.patch.yml`). Idempotent: existing entries are left in place
 * (and upgraded with the desktop-only `disabled` expression when missing),
 * and user content is preserved. The harness template ships `[]` as the
 * (empty) array body — a `[]` that closes the document cannot coexist with a
 * following `- insert:` in one YAML stream, so a trailing `[]` is replaced
 * by the first insert block (comments before it are kept).
 * @param home - the harness home.
 * @param profile - harness profile name (defaults to `dsh-desktop`).
 * @returns true when the patch now contains every desktop plugin entry.
 */
export function ensureWindowControlsPatch(
  home: string = defaultDshHome(),
  profile: string = APP_PROFILE
): boolean {
  return ensurePluginsPatch(home, profile)
}

/**
 * Write every desktop plugin's insert entry into the profile patch layer.
 */
export function ensurePluginsPatch(
  home: string = defaultDshHome(),
  profile: string = APP_PROFILE
): boolean {
  const patchPath = profilePatchPath(profile, home)
  let content: string
  try {
    content = readFileSync(patchPath, 'utf8')
  } catch {
    content = ''
  }

  let next = content
  for (const plugin of DESKTOP_PLUGINS) {
    next = applyPluginPatch(next, plugin)
  }

  if (next !== content) {
    mkdirSync(dirname(patchPath), { recursive: true })
    writeFileSync(patchPath, next, 'utf8')
  }

  return DESKTOP_PLUGINS.every((plugin) => next.includes(plugin.entryId))
}

/**
 * Full injection: install every package and ensure the patch entries, in that
 * order (a patch entry is inert until its package is resolvable).
 * @param home - the harness home (defaults to `~/.dsh`).
 * @param profile - harness profile name (defaults to `dsh-desktop`).
 * @returns true when every plugin is installed and patched.
 */
export function ensurePluginsInstalled(
  home: string = defaultDshHome(),
  profile: string = APP_PROFILE
): boolean {
  let installed = true
  let patched = true
  for (const name of profilesToInject(home, profile)) {
    for (const plugin of DESKTOP_PLUGINS) {
      if (!installPluginPackage(plugin, home, name)) installed = false
    }
    if (!ensurePluginsPatch(home, name)) patched = false
  }
  return installed && patched
}

/**
 * The booting profile plus any sibling that already has a desktop plugin
 * copy (those copies go stale when we rebuild without bumping the package
 * version).
 */
function profilesToInject(home: string, primary: string): string[] {
  const names = new Set<string>([primary])
  const root = join(home, 'profiles')
  if (!existsSync(root)) return [...names]
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue
      const hasDesktopPlugin = DESKTOP_PLUGINS.some((plugin) =>
        existsSync(join(root, entry.name, 'node_modules', plugin.packageName, 'package.json'))
      )
      if (hasDesktopPlugin) names.add(entry.name)
    }
  } catch {
    return [...names]
  }
  return [...names]
}

/**
 * Wait until the served index page's browser boot graph contains every
 * desktop plugin. The harness's live patch reload re-scans loader entries
 * after our patch write and re-composes `__DSH_BOOT__`, but it is
 * asynchronous — polling the served page lets the window load a first paint
 * that already carries the window controls (and the settings section).
 * @param url - the dsh web base URL.
 * @param timeoutMs - poll budget (default 25s).
 * @returns true when every plugin appeared in the graph within the budget.
 */
export async function waitForPluginInGraph(url: string, timeoutMs = 25_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      const html = await response.text()
      if (DESKTOP_PLUGINS.every((plugin) => html.includes(plugin.packageName))) return true
    } catch {
      // Transient fetch errors (server still settling) — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  return false
}
