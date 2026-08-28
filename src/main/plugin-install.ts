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
 * This module installs our window-controls plugin without touching the
 * harness source: it copies the built plugin package into the app profile's
 * node_modules and appends an `insert` entry to the user patch layer. Both
 * steps are idempotent, and the app profile's `patchReload: live` picks the
 * new entry up without a restart.
 *
 * @module dsh-desktop/plugin-install
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { appProfileDir, appProfilePatchPath, resolveDshHome as resolveProfileHome } from './profile-setup'

/** Plugin package name (matches plugins/dsh-desktop-window-controls/package.json). */
export const WINDOW_CONTROLS_PACKAGE = '@dsh-desktop/window-controls'

/** Loader entry id for the window-controls plugin. */
export const WINDOW_CONTROLS_ENTRY_ID = 'dsh-desktop-window-controls'

/** Relative package path inside the built plugins tree. */
const WINDOW_CONTROLS_REL = join('dsh-desktop-window-controls')

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
  if (override !== undefined && override.trim() !== '' && existsSync(join(override, WINDOW_CONTROLS_REL))) {
    return override
  }
  const packaged = process.resourcesPath !== undefined
    ? join(process.resourcesPath, 'plugins')
    : undefined
  if (packaged !== undefined && existsSync(join(packaged, WINDOW_CONTROLS_REL))) return packaged
  return join(process.cwd(), 'plugins')
}

/**
 * The harness home (`$DSH_HOME`, falling back to `~/.dsh`).
 * @deprecated use `resolveDshHome` from `./profile-setup` (kept as an alias
 * for the verification scripts that import this module).
 */
export function defaultDshHome(): string {
  return resolveProfileHome()
}

/** Absolute node_modules target for the window-controls package. */
function pluginTargetDir(home: string): string {
  return join(appProfileDir(home), 'node_modules', WINDOW_CONTROLS_PACKAGE)
}

/** Whether the built plugin source exists (used to skip silently in dev). */
export function pluginBuildExists(): boolean {
  return existsSync(join(pluginsSourceRoot(), WINDOW_CONTROLS_REL, 'package.json'))
}

/**
 * Copy the built window-controls package into the web profile's node_modules.
 * Idempotent: an existing install with the same package version is left alone.
 * @param home - the harness home (defaults to `~/.dsh`).
 * @returns whether the plugin is present after the call.
 */
export function installWindowControlsPackage(home: string = defaultDshHome()): boolean {
  const source = join(pluginsSourceRoot(), WINDOW_CONTROLS_REL)
  const sourceManifest = join(source, 'package.json')
  if (!existsSync(sourceManifest)) return false

  const target = pluginTargetDir(home)
  const targetManifest = join(target, 'package.json')
  const sourceVersion = readPackageVersion(sourceManifest)
  const targetVersion = existsSync(targetManifest) ? readPackageVersion(targetManifest) : undefined
  if (targetVersion === sourceVersion && existsSync(join(target, 'lib', 'client.js'))) {
    return true // already installed and current
  }

  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target, { recursive: true, force: true })
  return existsSync(join(target, 'lib', 'client.js'))
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

/** YAML patch block that inserts the window-controls loader entry. */
function windowControlsPatchBlock(): string {
  return `- insert:
    - id: ${WINDOW_CONTROLS_ENTRY_ID}
      name: '${WINDOW_CONTROLS_PACKAGE}'
`
}

/**
 * Append the window-controls loader entry to the app profile's user patch
 * layer (`cordis.patch.yml`). The file is a top-level YAML array; appending a
 * top-level `- insert:` block is a valid additional element. Idempotent: an
 * existing entry (or any mention of the entry id) is left untouched, and user
 * content is preserved. The harness template ships `[]` as the (empty) array
 * body — a `[]` that closes the document cannot coexist with a following
 * `- insert:` in one YAML stream, so a trailing `[]` is replaced by the
 * insert block (comments before it are kept).
 * @param home - the harness home.
 * @returns true when the patch now contains the entry (whether just written or already present).
 */
export function ensureWindowControlsPatch(home: string = defaultDshHome()): boolean {
  const patchPath = appProfilePatchPath(home)
  let content: string
  try {
    content = readFileSync(patchPath, 'utf8')
  } catch {
    content = ''
  }

  if (content.includes(WINDOW_CONTROLS_ENTRY_ID)) return true

  // A trailing empty-array document (the harness template's `[]`), possibly
  // after comment lines, is replaced by the insert block. Anything else —
  // user rows, other inserts — is preserved and the block appended.
  const body = content.replace(/\s+$/, '')
  const templateMatch = /\n?^\s*\[\]\s*$/m.exec(body)
  const next = templateMatch !== null
    ? `${body.slice(0, templateMatch.index).replace(/\s+$/, '')}\n${windowControlsPatchBlock()}`
    : `${body}\n${windowControlsPatchBlock()}`
  mkdirSync(dirname(patchPath), { recursive: true })
  writeFileSync(patchPath, next, 'utf8')
  return true
}

/**
 * Full injection: install the package and ensure the patch entry, in that
 * order (the patch entry is inert until the package is resolvable).
 * @returns true when both steps succeeded.
 */
export function ensurePluginsInstalled(home: string = defaultDshHome()): boolean {
  const installed = installWindowControlsPackage(home)
  const patched = ensureWindowControlsPatch(home)
  return installed && patched
}

/**
 * Wait until the served index page's browser boot graph contains the
 * window-controls plugin. The harness's live patch reload re-scans loader
 * entries after our patch write and re-composes `__DSH_BOOT__`, but it is
 * asynchronous — polling the served page lets the window load a first paint
 * that already carries the window controls.
 * @param url - the dsh web base URL.
 * @param timeoutMs - poll budget (default 25s).
 * @returns true when the plugin appeared in the graph within the budget.
 */
export async function waitForPluginInGraph(url: string, timeoutMs = 25_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      const html = await response.text()
      if (html.includes(WINDOW_CONTROLS_PACKAGE)) return true
    } catch {
      // Transient fetch errors (server still settling) — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  return false
}
