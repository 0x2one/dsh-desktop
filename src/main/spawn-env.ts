/**
 * Child-process spawn helpers for packaged Electron on Windows.
 *
 * Two packaged-app traps this module exists to avoid:
 * 1. `app.getAppPath()` is `resources/app.asar`. Electron's patched `fs` reports
 *    that path as a directory, so a `statSync().isDirectory()` check still
 *    passes, but libuv cannot chdir into an asar and `spawn` fails with
 *    `spawn C:\\Windows\\system32\\cmd.exe ENOENT` when `shell: true`.
 * 2. GUI-launched processes may have a PATH that omits System32 / Node.js
 *    even when a terminal session can see them.
 *
 * @module dsh-desktop/spawn-env
 */

import { existsSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

/** True when `dir` is a real OS directory libuv can chdir into. */
function isSpawnSafeDirectory(dir: string): boolean {
  if (dir === '' || dir.includes('.asar')) return false
  try {
    return statSync(dir).isDirectory()
  } catch {
    return false
  }
}

/**
 * Working directory for `spawn`. Never returns an asar path.
 */
export function spawnWorkingDirectory(): string {
  const candidates: string[] = []
  if (app.isPackaged) {
    candidates.push(process.resourcesPath)
  } else {
    const appPath = app.getAppPath()
    if (!appPath.includes('.asar')) candidates.push(appPath)
  }
  try {
    candidates.push(app.getPath('userData'), app.getPath('temp'), app.getPath('home'))
  } catch {
    // `app.getPath` throws if called before `ready`; callers run after that.
  }
  candidates.push(process.cwd(), tmpdir(), homedir())

  for (const dir of candidates) {
    if (isSpawnSafeDirectory(dir)) return dir
  }
  return tmpdir()
}

function pathEnvKey(env: NodeJS.ProcessEnv): 'PATH' | 'Path' {
  if (process.platform !== 'win32') return 'PATH'
  if (Object.prototype.hasOwnProperty.call(env, 'Path')) return 'Path'
  if (Object.prototype.hasOwnProperty.call(env, 'PATH')) return 'PATH'
  return 'Path'
}

/** Directories a Windows GUI process often lacks on PATH. */
function windowsPathExtras(): string[] {
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows'
  const extras = [
    join(systemRoot, 'System32'),
    systemRoot,
    join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs'),
    join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs'),
    join(process.env.APPDATA || '', 'npm'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs')
  ]
  return extras.filter((dir) => dir !== '' && existsSync(dir))
}

/**
 * Environment for spawned Node/npx children: inherit the app env, then make
 * sure Windows can find `cmd.exe` and a typical Node.js install.
 */
export function spawnEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  if (process.platform !== 'win32') return env

  const systemRoot = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows'
  env.SystemRoot = systemRoot
  env.SYSTEMROOT = systemRoot
  const comspec = env.ComSpec || env.COMSPEC || join(systemRoot, 'System32', 'cmd.exe')
  env.ComSpec = comspec
  env.COMSPEC = comspec

  const key = pathEnvKey(env)
  const current = env[key] ?? ''
  const parts = [...windowsPathExtras(), ...current.split(';').filter((p) => p !== '')]
  env[key] = [...new Set(parts)].join(';')
  return env
}

/** `cmd.exe` path for `spawn({ shell })` so Node does not search PATH for it. */
export function spawnShell(): boolean | string {
  if (process.platform !== 'win32') return false
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows'
  const comspec = process.env.ComSpec || process.env.COMSPEC || join(systemRoot, 'System32', 'cmd.exe')
  return existsSync(comspec) ? comspec : true
}
