/**
 * Desktop settings section: hotkey, launch-at-login, profiles, check-for-updates.
 *
 * All actions go through `window.api.desktop` / `window.api.updater`
 * (dsh-desktop preload). Hotkey capture, new-profile creation, and update
 * checks are inlined here. Styling uses harness alias tokens so light/dark
 * themes match.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { DesktopKey } from './locales.ts'
import { renderNotes } from './notes.tsx'

/** Snapshot shape mirrored from the preload `DesktopSnapshot`. */
export interface DesktopSnapshot {
  hotkeyLabel: string
  launchAtLogin: boolean
  profiles: string[]
  currentProfile: string
  appVersion: string
}

export type UpdatePhase = 'checking' | 'available' | 'downloading' | 'ready' | 'latest' | 'error'

export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

/** Snapshot shape mirrored from the preload `UpdateState`. */
export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  nextVersion?: string
  notes: string
  progress?: UpdateProgress
  error?: string
}

export interface HotkeyKeyEvent {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  code: string
  key: string
}

export interface HotkeyCaptureState {
  accelerator: string
  label: string
  defaultAccelerator: string
  defaultLabel: string
}

export type BeginHotkeyCaptureResult =
  | ({ ok: true } & HotkeyCaptureState)
  | { ok: false; error: string }

export interface HotkeyPreview {
  accelerator: string
  label: string
}

export type SetHotkeyResult = { ok: true } | { ok: false; error: string }

export type CreateProfileResult = { ok: true; warning?: string } | { ok: false; error: string }

/** Preload bridge used by this page. */
export interface DesktopBridge {
  getSnapshot: () => Promise<DesktopSnapshot>
  beginHotkeyCapture: () => Promise<BeginHotkeyCaptureResult>
  previewHotkey: (parts: HotkeyKeyEvent) => Promise<HotkeyPreview | null>
  commitHotkey: (accelerator: string) => Promise<SetHotkeyResult>
  cancelHotkeyCapture: () => Promise<void>
  setLaunchAtLogin: (enabled: boolean) => Promise<void>
  selectProfile: (name: string) => Promise<void>
  createProfile: (name: string) => Promise<CreateProfileResult>
  checkUpdate: () => void
  onChange: (callback: (snapshot: DesktopSnapshot) => void) => () => void
}

/** Preload updater bridge (`window.api.updater`) for inline check-for-updates. */
export interface UpdaterBridge {
  onState: (callback: (state: UpdateState) => void) => () => void
  getState: () => Promise<UpdateState | null>
  download: () => void
  installNow: () => void
  installLater: () => void
  dismiss: () => void
}

export interface DesktopSectionProps {
  /** Bound translator for this plugin's dictionary. */
  t: (key: DesktopKey) => string
}

type DesktopWindowApi = {
  desktop?: DesktopBridge
  updater?: UpdaterBridge
}

function readWindowApi(): DesktopWindowApi | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { api?: DesktopWindowApi }).api
}

/** Read the desktop preload bridge when running inside dsh-desktop. */
function readDesktopBridge(): DesktopBridge | undefined {
  return readWindowApi()?.desktop
}

function readUpdaterBridge(): UpdaterBridge | undefined {
  return readWindowApi()?.updater
}

function formatBytes(n: number): string {
  if (n < 1024) return `${String(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function phaseKeepsPanel(phase: UpdatePhase): boolean {
  return phase === 'checking' || phase === 'available' || phase === 'downloading' || phase === 'ready'
}

function keyEventParts(event: KeyboardEvent): HotkeyKeyEvent {
  return {
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    code: event.code,
    key: event.key
  }
}

function stopBubble(event: { stopPropagation: () => void }): void {
  event.stopPropagation()
}

interface UpdatePanelProps {
  t: (key: DesktopKey) => string
  state: UpdateState
  onCollapse: () => void
}

function statusCopy(t: UpdatePanelProps['t'], state: UpdateState): string {
  switch (state.phase) {
    case 'checking':
      return t('updateChecking')
    case 'latest':
      return t('updateLatest')
    case 'available':
      return state.nextVersion !== undefined
        ? `${t('updateAvailable')} ${state.nextVersion}`
        : t('updateAvailable')
    case 'downloading':
      return t('updateDownloading')
    case 'ready':
      return t('updateReady')
    case 'error':
      return state.error !== undefined && state.error !== '' ? state.error : t('updateErrorFallback')
  }
}

/**
 * Inline update status: notes, progress, download / install actions.
 * @param props - translator, live state, collapse callback.
 */
function UpdatePanel({ t, state, onCollapse }: UpdatePanelProps): React.JSX.Element {
  const updater = readUpdaterBridge()
  const phase = state.phase
  const percent = Math.max(0, Math.min(100, state.progress?.percent ?? 0))
  const notes = state.notes.trim()
  const showNotes = phase === 'available' || phase === 'downloading' || phase === 'ready'

  const dismiss = (): void => {
    updater?.dismiss()
    onCollapse()
  }

  return (
    <div data-dsh-ds-update="">
      <p data-dsh-ds-status="">{statusCopy(t, state)}</p>
      {showNotes ? (
        notes === '' ? (
          <p data-dsh-ds-hint="">{t('updateNotesEmpty')}</p>
        ) : (
          <div data-dsh-ds-notes="">{renderNotes(state.notes) ?? t('updateNotesEmpty')}</div>
        )
      ) : null}
      {phase === 'downloading' ? (
        <>
          <div data-dsh-ds-progress="" aria-hidden="true">
            <span data-dsh-ds-progress-fill="" style={{ width: `${String(percent)}%` }} />
          </div>
          <p data-dsh-ds-hint="">
            {t('updateDownloaded')} {Math.round(percent)}%
            {state.progress !== undefined && state.progress.total > 0
              ? ` · ${formatBytes(state.progress.transferred)} / ${formatBytes(state.progress.total)}`
              : ''}
          </p>
        </>
      ) : null}
      {phase === 'available' ? (
        <div data-dsh-ds-row="">
          <button type="button" data-dsh-ds-button="" onClick={dismiss}>
            {t('updateNotNow')}
          </button>
          <button
            type="button"
            data-dsh-ds-button=""
            data-primary=""
            onClick={() => updater?.download()}
          >
            {t('updateDownload')}
          </button>
        </div>
      ) : null}
      {phase === 'ready' ? (
        <div data-dsh-ds-row="">
          <button
            type="button"
            data-dsh-ds-button=""
            onClick={() => {
              updater?.installLater()
              onCollapse()
            }}
          >
            {t('updateInstallLater')}
          </button>
          <button
            type="button"
            data-dsh-ds-button=""
            data-primary=""
            onClick={() => updater?.installNow()}
          >
            {t('updateInstallNow')}
          </button>
        </div>
      ) : null}
      {phase === 'latest' || phase === 'error' ? (
        <div data-dsh-ds-row="">
          <button type="button" data-dsh-ds-button="" data-primary="" onClick={dismiss}>
            {t('updateDismiss')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Render the Desktop settings page.
 * @param props - inject face (`t`).
 */
export function DesktopSection({ t }: DesktopSectionProps): React.JSX.Element | null {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [pending, setPending] = useState<HotkeyPreview | null>(null)
  const [hotkeyDefaults, setHotkeyDefaults] = useState<{
    accelerator: string
    label: string
  } | null>(null)
  const [hotkeyError, setHotkeyError] = useState('')
  const [creating, setCreating] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileWarning, setProfileWarning] = useState('')
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [updateOpen, setUpdateOpen] = useState(false)
  const hotkeyInputRef = useRef<HTMLInputElement>(null)
  const capturingRef = useRef(false)

  useEffect(() => {
    const api = readDesktopBridge()
    if (api === undefined) return
    void api.getSnapshot().then(setSnapshot)
    return api.onChange(setSnapshot)
  }, [])

  useEffect(() => {
    const updater = readUpdaterBridge()
    if (updater === undefined) return
    const stop = updater.onState((state) => {
      setUpdateState(state)
      if (phaseKeepsPanel(state.phase)) setUpdateOpen(true)
    })
    void updater.getState().then((state) => {
      if (state === null) return
      setUpdateState(state)
      if (phaseKeepsPanel(state.phase)) setUpdateOpen(true)
    })
    return stop
  }, [])

  useEffect(() => {
    capturingRef.current = capturing
  }, [capturing])

  useEffect(() => {
    if (capturing) hotkeyInputRef.current?.focus()
  }, [capturing])

  useEffect(() => {
    return () => {
      if (!capturingRef.current) return
      const api = readDesktopBridge()
      if (api === undefined) return
      void api.cancelHotkeyCapture()
    }
  }, [])

  const run = (work: () => Promise<void>): void => {
    if (busy || capturing) return
    setBusy(true)
    void work().finally(() => {
      setBusy(false)
    })
  }

  const api = readDesktopBridge()
  if (api === undefined) return null

  const startCapture = (): void => {
    if (busy || capturing) return
    setCapturing(true)
    setHotkeyError('')
    void (async () => {
      try {
        const state = await api.beginHotkeyCapture()
        if (!state.ok) {
          setCapturing(false)
          setPending(null)
          setHotkeyError(t('hotkeyCaptureBusy'))
          return
        }
        setHotkeyDefaults({
          accelerator: state.defaultAccelerator,
          label: state.defaultLabel
        })
        setPending({ accelerator: state.accelerator, label: state.label })
      } catch {
        setCapturing(false)
        setPending(null)
        void api.cancelHotkeyCapture()
        setHotkeyError(t('hotkeyCaptureFailed'))
      }
    })()
  }

  const stopCapture = (): void => {
    void api.cancelHotkeyCapture()
    setCapturing(false)
    setPending(null)
    setHotkeyError('')
  }

  const saveCapture = (): void => {
    if (pending === null || pending.accelerator === '') {
      setHotkeyError(t('hotkeyEmpty'))
      hotkeyInputRef.current?.focus()
      return
    }
    void (async () => {
      const result = await api.commitHotkey(pending.accelerator)
      if (!result.ok) {
        setHotkeyError(result.error)
        hotkeyInputRef.current?.focus()
        return
      }
      setCapturing(false)
      setPending(null)
      setHotkeyError('')
    })()
  }

  return (
    <div data-dsh-desktop-settings="">
      <section data-dsh-ds-group="">
        <h2 data-dsh-ds-title="">{t('hotkeyTitle')}</h2>
        <p data-dsh-ds-hint="">{capturing ? t('hotkeyCaptureHint') : t('hotkeyDescription')}</p>
        {capturing ? (
          <div data-dsh-ds-form="">
            <input
              ref={hotkeyInputRef}
              data-dsh-ds-input=""
              type="text"
              readOnly
              autoComplete="off"
              spellCheck={false}
              placeholder={t('hotkeyPlaceholder')}
              value={pending?.label ?? ''}
              aria-label={t('hotkeyTitle')}
              onKeyDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (event.repeat) return
                if (
                  event.key === 'Escape' &&
                  !event.ctrlKey &&
                  !event.altKey &&
                  !event.shiftKey &&
                  !event.metaKey
                ) {
                  stopCapture()
                  return
                }
                void api.previewHotkey(keyEventParts(event)).then((result) => {
                  if (result === null) return
                  setPending(result)
                  setHotkeyError('')
                })
              }}
            />
            {hotkeyError !== '' ? <p data-dsh-ds-error="">{hotkeyError}</p> : null}
            <div data-dsh-ds-row="">
              <button
                type="button"
                data-dsh-ds-button=""
                onClick={() => {
                  if (hotkeyDefaults === null) return
                  setPending(hotkeyDefaults)
                  setHotkeyError('')
                  hotkeyInputRef.current?.focus()
                }}
              >
                {t('hotkeyReset')}
              </button>
              <button type="button" data-dsh-ds-button="" onClick={stopCapture}>
                {t('cancel')}
              </button>
              <button type="button" data-dsh-ds-button="" data-primary="" onClick={saveCapture}>
                {t('hotkeySave')}
              </button>
            </div>
          </div>
        ) : (
          <div data-dsh-ds-row="">
            <button
              type="button"
              data-dsh-ds-value-btn=""
              disabled={busy}
              onMouseDown={stopBubble}
              onClick={(event) => {
                event.stopPropagation()
                startCapture()
              }}
            >
              {snapshot?.hotkeyLabel ?? '…'}
            </button>
            <button
              type="button"
              data-dsh-ds-button=""
              disabled={busy}
              onMouseDown={stopBubble}
              onClick={(event) => {
                event.stopPropagation()
                startCapture()
              }}
            >
              {t('hotkeyEdit')}
            </button>
          </div>
        )}
      </section>

      <section data-dsh-ds-group="">
        <h2 data-dsh-ds-title="">{t('launchTitle')}</h2>
        <div data-dsh-ds-choices="" role="radiogroup" aria-label={t('launchTitle')}>
          <button
            type="button"
            role="radio"
            aria-checked={snapshot?.launchAtLogin === true}
            data-dsh-ds-choice=""
            data-selected={snapshot?.launchAtLogin === true ? '' : undefined}
            disabled={busy || capturing || snapshot === null}
            onClick={() => {
              if (snapshot?.launchAtLogin === true) return
              run(async () => {
                await api.setLaunchAtLogin(true)
              })
            }}
          >
            {t('launchOn')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={snapshot?.launchAtLogin === false}
            data-dsh-ds-choice=""
            data-selected={snapshot?.launchAtLogin === false ? '' : undefined}
            disabled={busy || capturing || snapshot === null}
            onClick={() => {
              if (snapshot?.launchAtLogin === false) return
              run(async () => {
                await api.setLaunchAtLogin(false)
              })
            }}
          >
            {t('launchOff')}
          </button>
        </div>
      </section>

      <section data-dsh-ds-group="">
        <h2 data-dsh-ds-title="">{t('profileTitle')}</h2>
        <div data-dsh-ds-profiles="" role="radiogroup" aria-label={t('profileTitle')}>
          {(snapshot?.profiles ?? []).map((name) => {
            const selected = name === snapshot?.currentProfile
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={selected}
                data-dsh-ds-choice=""
                data-selected={selected ? '' : undefined}
                disabled={busy || capturing}
                onClick={() => {
                  if (selected) return
                  run(async () => {
                    await api.selectProfile(name)
                  })
                }}
              >
                {name}
              </button>
            )
          })}
        </div>
        {creating ? (
          <form
            data-dsh-ds-form=""
            onSubmit={(event) => {
              event.preventDefault()
              run(async () => {
                const result = await api.createProfile(profileName)
                if (!result.ok) {
                  setProfileError(result.error)
                  return
                }
                setCreating(false)
                setProfileName('')
                setProfileError('')
                setProfileWarning(result.warning ?? '')
              })
            }}
          >
            <label data-dsh-ds-label="" htmlFor="dsh-desktop-profile-name">
              {t('profileName')}
            </label>
            <input
              id="dsh-desktop-profile-name"
              data-dsh-ds-input=""
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('profilePlaceholder')}
              value={profileName}
              disabled={busy}
              autoFocus
              onChange={(event) => {
                setProfileName(event.target.value)
                setProfileError('')
              }}
            />
            <p data-dsh-ds-hint="">{t('profileHint')}</p>
            {profileError !== '' ? <p data-dsh-ds-error="">{profileError}</p> : null}
            <div data-dsh-ds-row="">
              <button
                type="button"
                data-dsh-ds-button=""
                disabled={busy}
                onClick={() => {
                  setCreating(false)
                  setProfileName('')
                  setProfileError('')
                }}
              >
                {t('cancel')}
              </button>
              <button type="submit" data-dsh-ds-button="" data-primary="" disabled={busy}>
                {t('profileSubmit')}
              </button>
            </div>
          </form>
        ) : (
          <div data-dsh-ds-row="">
            <button
              type="button"
              data-dsh-ds-button=""
              disabled={busy || capturing}
              onMouseDown={stopBubble}
              onClick={(event) => {
                event.stopPropagation()
                setCreating(true)
                setProfileError('')
                setProfileWarning('')
              }}
            >
              {t('profileCreate')}
            </button>
          </div>
        )}
        {profileWarning !== '' ? <p data-dsh-ds-warn="">{profileWarning}</p> : null}
      </section>

      <section data-dsh-ds-group="">
        <h2 data-dsh-ds-title="">{t('updateTitle')}</h2>
        <p data-dsh-ds-hint="">
          {t('updateCurrent')} {snapshot?.appVersion ?? updateState?.currentVersion ?? '…'}
        </p>
        <div data-dsh-ds-row="">
          <button
            type="button"
            data-dsh-ds-button=""
            disabled={busy || capturing || updateState?.phase === 'checking' || updateState?.phase === 'downloading'}
            onMouseDown={stopBubble}
            onClick={(event) => {
              event.stopPropagation()
              setUpdateOpen(true)
              setUpdateState((prev) => ({
                phase: 'checking',
                currentVersion: prev?.currentVersion ?? snapshot?.appVersion ?? '',
                notes: ''
              }))
              api.checkUpdate()
            }}
          >
            {t('updateAction')}
          </button>
        </div>
        {updateOpen && updateState !== null ? (
          <UpdatePanel t={t} state={updateState} onCollapse={() => setUpdateOpen(false)} />
        ) : null}
      </section>
    </div>
  )
}
