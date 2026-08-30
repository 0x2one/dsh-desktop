/**
 * Shared update-window IPC contract (preload + main + renderer).
 *
 * @module dsh-desktop/update-api
 */

export const UPDATE_CHANNELS = {
  state: 'dsh-desktop:update:state',
  getState: 'dsh-desktop:update:get-state',
  download: 'dsh-desktop:update:download',
  installNow: 'dsh-desktop:update:install-now',
  installLater: 'dsh-desktop:update:install-later',
  dismiss: 'dsh-desktop:update:dismiss'
} as const

export type UpdatePhase = 'checking' | 'available' | 'downloading' | 'ready' | 'latest' | 'error'

export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  nextVersion?: string
  notes: string
  progress?: UpdateProgress
  error?: string
}

export interface UpdaterApi {
  onState: (callback: (state: UpdateState) => void) => () => void
  getState: () => Promise<UpdateState | null>
  download: () => void
  installNow: () => void
  installLater: () => void
  dismiss: () => void
}
